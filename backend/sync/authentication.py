"""
Device signature authentication for offline sync endpoints.

Validates HMAC-SHA256 signatures from terminals to prevent tampering
and verify device identity.
"""
from rest_framework import authentication, exceptions
from terminals.models import TerminalRegistration
from .services import SignatureService, NonceStore


class DeviceSignatureAuthentication(authentication.BaseAuthentication):
    """
    Authenticate terminals via HMAC signature validation.

    Expected Request Headers:
        X-Device-ID: Terminal UUID
        X-Device-Signature: HMAC-SHA256 signature
        X-Device-Nonce: One-time nonce

    Expected Request Body:
        {
            "operation_id": "uuid",
            "device_id": "uuid",
            "nonce": "string",
            "created_at": "iso8601",
            ... payload data ...
        }

    Security Checks:
        1. Terminal exists and is active
        2. Signature is valid (HMAC matches)
        3. Nonce hasn't been used (replay attack prevention)
        4. Timestamp is recent (clock drift tolerance)

    Usage:
        from sync.permissions import IsAuthenticatedTerminal

        class OfflineOrderIngestView(APIView):
            authentication_classes = [DeviceSignatureAuthentication]
            permission_classes = [IsAuthenticatedTerminal]  # NOT IsAuthenticated!

            def post(self, request):
                # request.user is None (terminals are devices, not users)
                # request.auth is the TerminalRegistration
                terminal = request.auth
                ...
    """

    def authenticate(self, request):
        """
        Authenticate the request and return (user, auth) tuple.

        Returns:
            Tuple[User, TerminalRegistration]: User associated with terminal + terminal instance

        Raises:
            AuthenticationFailed: If signature invalid, nonce reused, etc.
        """
        # Extract headers
        device_id = request.headers.get('X-Device-ID')
        signature = request.headers.get('X-Device-Signature')
        nonce = request.headers.get('X-Device-Nonce')

        if not all([device_id, signature, nonce]):
            raise exceptions.AuthenticationFailed(
                'Missing required headers: X-Device-ID, X-Device-Signature, X-Device-Nonce'
            )

        # Get terminal
        # NOTE: Terminals currently send device_id (human-readable string like "TERMINAL-...")
        # in the X-Device-ID header. We try device_fingerprint first for future flexibility,
        # but currently always fall back to device_id lookup.
        # If you update the client to send device_fingerprint, the first lookup will succeed.
        terminal = None
        if device_id:
            terminal = TerminalRegistration.objects.filter(device_fingerprint=device_id, is_active=True).first()

        if not terminal and device_id:
            terminal = TerminalRegistration.objects.filter(device_id=device_id, is_active=True).first()

        if not terminal:
            raise exceptions.AuthenticationFailed('Invalid or inactive terminal')

        # Check if terminal is locked
        if terminal.is_locked:
            raise exceptions.AuthenticationFailed('Terminal is locked')

        # Validate signing secret exists
        if not terminal.signing_secret:
            raise exceptions.AuthenticationFailed('Terminal signing secret not configured')

        # Get payload from request body
        try:
            payload = request.data
        except Exception:
            raise exceptions.AuthenticationFailed('Invalid request body')

        # Validate payload structure
        if not isinstance(payload, dict):
            raise exceptions.AuthenticationFailed('Payload must be JSON object')

        # Extract required fields
        payload_nonce = payload.get('nonce')
        payload_device_id = payload.get('device_id')
        created_at = payload.get('created_at')

        if not all([payload_nonce, payload_device_id, created_at]):
            raise exceptions.AuthenticationFailed(
                'Payload missing required fields: nonce, device_id, created_at'
            )

        # Validate nonce matches header
        if payload_nonce != nonce:
            raise exceptions.AuthenticationFailed('Nonce mismatch between header and payload')

        # Validate device_id matches
        if str(payload_device_id) != str(device_id):
            raise exceptions.AuthenticationFailed('Device ID mismatch')

        # Check nonce hasn't been used (replay attack)
        if NonceStore.is_nonce_used(nonce):
            raise exceptions.AuthenticationFailed('Nonce already used (replay attack detected)')

        # Validate timestamp freshness (5 minute window)
        if not SignatureService.validate_nonce_freshness(nonce, created_at, max_age_seconds=300):
            # Log detailed timestamp information for debugging
            import logging
            logger = logging.getLogger(__name__)
            from django.utils import timezone
            now = timezone.now()
            logger.error(
                f"[DeviceAuth] Timestamp validation failed - "
                f"device_id={device_id}, "
                f"payload_created_at={created_at}, "
                f"server_now={now.isoformat()}, "
                f"nonce={nonce[:8]}..."
            )
            raise exceptions.AuthenticationFailed(
                'Payload timestamp too old or invalid (check terminal clock)'
            )

        # Validate signature
        is_valid = SignatureService.validate_signature(
            payload=payload,
            nonce=nonce,
            signature=signature,
            secret=terminal.signing_secret
        )

        if not is_valid:
            # Log failed authentication attempt
            terminal.authentication_failures += 1
            terminal.save(update_fields=['authentication_failures'])

            # Lock terminal after multiple failures
            if terminal.authentication_failures >= 5:
                terminal.is_locked = True
                terminal.authentication_failures = 0  # Reset counter for next unlock
                terminal.save(update_fields=['is_locked', 'authentication_failures'])
                raise exceptions.AuthenticationFailed(
                    'Terminal locked due to repeated authentication failures'
                )

            raise exceptions.AuthenticationFailed('Invalid signature')

        # Mark nonce as used
        NonceStore.mark_nonce_used(nonce, ttl_seconds=300)

        # Reset authentication failure counter on successful auth
        if terminal.authentication_failures > 0:
            terminal.authentication_failures = 0
            terminal.save(update_fields=['authentication_failures'])

        # Update last authenticated timestamp
        from django.utils import timezone
        terminal.last_authenticated_at = timezone.now()
        terminal.save(update_fields=['last_authenticated_at'])

        # Return (user, auth) tuple
        # IMPORTANT: request.user is intentionally None for terminal authentication
        # Terminals are devices, not users. Views MUST use IsAuthenticatedTerminal
        # permission (not IsAuthenticated) to properly validate terminal access.
        # The actual terminal object is available via request.auth
        return (None, terminal)

    def authenticate_header(self, request):
        """
        Return authentication scheme for WWW-Authenticate header.

        Used when authentication fails to indicate proper authentication method.
        """
        return 'DeviceSignature realm="Offline Sync API"'
