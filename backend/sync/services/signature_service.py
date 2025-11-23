"""
Device signature service for HMAC-based payload authentication.

Provides utilities for generating, rotating, and validating HMAC-SHA256
signatures used to authenticate offline payloads from terminals.
"""
import secrets
import hmac
import hashlib
import json
from typing import Optional, Tuple
from django.utils import timezone
from terminals.models import TerminalRegistration


class SignatureService:
    """
    Service for managing device signing secrets and validating signatures.

    Security Model:
    - Each terminal has a unique signing secret
    - Secrets stored in database (TODO: Encrypt at rest in Phase 2)
    - Payloads include HMAC-SHA256 signature
    - Signature prevents tampering and validates device identity
    """

    # Signature algorithm
    ALGORITHM = 'sha256'

    # Secret length (bytes)
    SECRET_LENGTH = 32  # 256 bits

    @staticmethod
    def generate_signing_secret() -> str:
        """
        Generate a new cryptographically secure signing secret.

        Returns:
            str: Hex-encoded secret (64 characters)

        Example:
            >>> secret = SignatureService.generate_signing_secret()
            >>> len(secret)
            64
        """
        return secrets.token_hex(SignatureService.SECRET_LENGTH)

    @staticmethod
    def rotate_signing_secret(terminal: TerminalRegistration) -> Tuple[str, str]:
        """
        Rotate terminal's signing secret.

        For zero-downtime rotation, the terminal should:
        1. Receive new secret via secure channel
        2. Validate with both old and new secrets for 24h
        3. Switch to new secret exclusively after transition period

        Args:
            terminal: TerminalRegistration instance

        Returns:
            Tuple[str, str]: (old_secret, new_secret)

        Note:
            - Old secret is returned for transition period validation
            - Caller should encrypt secrets before storage
        """
        old_secret = terminal.signing_secret
        new_secret = SignatureService.generate_signing_secret()

        terminal.signing_secret = new_secret
        terminal.save(update_fields=['signing_secret'])

        return old_secret, new_secret

    @staticmethod
    def compute_signature(payload: dict, nonce: str, secret: str) -> str:
        """
        Compute HMAC-SHA256 signature for payload.

        Signature Algorithm:
            signature = HMAC-SHA256(secret, JSON(payload) + nonce)

        Args:
            payload: Dictionary to sign
            nonce: Random nonce (prevents replay attacks)
            secret: Hex-encoded signing secret

        Returns:
            str: Hex-encoded signature

        Example:
            >>> payload = {"operation_id": "123", "data": {...}}
            >>> nonce = "abc123"
            >>> secret = "a1b2c3..."
            >>> sig = SignatureService.compute_signature(payload, nonce, secret)
        """
        # Serialize payload to canonical JSON
        payload_json = json.dumps(payload, sort_keys=True, separators=(',', ':'))

        # Create message: payload + nonce
        message = payload_json + nonce

        # Compute HMAC
        signature = hmac.new(
            key=bytes.fromhex(secret),
            msg=message.encode('utf-8'),
            digestmod=hashlib.sha256
        ).hexdigest()

        return signature

    @staticmethod
    def validate_signature(
        payload: dict,
        nonce: str,
        signature: str,
        secret: str,
        old_secret: Optional[str] = None
    ) -> bool:
        """
        Validate HMAC signature for payload.

        Args:
            payload: Dictionary that was signed
            nonce: Nonce from payload
            signature: Signature to validate
            secret: Current signing secret
            old_secret: Optional old secret (for rotation transition period)

        Returns:
            bool: True if signature is valid

        Security:
            - Uses constant-time comparison to prevent timing attacks
            - Validates against both current and old secret during rotation
        """
        try:
            # Compute expected signature with current secret
            expected_signature = SignatureService.compute_signature(payload, nonce, secret)

            # Constant-time comparison
            is_valid = hmac.compare_digest(signature, expected_signature)

            # If not valid and old secret provided, try with old secret
            if not is_valid and old_secret:
                expected_signature_old = SignatureService.compute_signature(payload, nonce, old_secret)
                is_valid = hmac.compare_digest(signature, expected_signature_old)

            return is_valid

        except (ValueError, TypeError, AttributeError):
            # Handle malformed signatures, invalid secrets, etc.
            return False

    @staticmethod
    def generate_nonce() -> str:
        """
        Generate a cryptographically secure nonce for one-time use.

        Returns:
            str: Hex-encoded nonce (32 characters)

        Usage:
            Terminal includes this nonce in payload and signature.
            Backend validates nonce hasn't been used before (prevents replay).
        """
        return secrets.token_hex(16)  # 128 bits

    @staticmethod
    def validate_nonce_freshness(nonce: str, created_at: str, max_age_seconds: int = 300, clock_drift_tolerance: int = 2) -> bool:
        """
        Validate that nonce timestamp is recent (prevents replay attacks).

        Args:
            nonce: Nonce from payload
            created_at: ISO8601 timestamp from payload
            max_age_seconds: Maximum allowed age (default: 5 minutes)
            clock_drift_tolerance: Tolerance for clock drift in seconds (default: 2 seconds)

        Returns:
            bool: True if nonce is fresh

        Note:
            Backend should also track used nonces in Redis/DB to prevent reuse.

            Clock drift tolerance allows for small differences between client and server clocks.
            This is necessary because system clocks may drift slightly (±1-2 seconds) even
            when synchronized via NTP.
        """
        try:
            from dateutil import parser
            payload_time = parser.isoparse(created_at)
            now = timezone.now()
            age = (now - payload_time).total_seconds()

            # Check if payload is within acceptable time window
            # Allow small clock drift tolerance for timestamps slightly in the future
            if age < -clock_drift_tolerance:
                # Payload from future beyond tolerance (clock drift or tampering)
                return False

            if age > max_age_seconds:
                # Payload too old
                return False

            return True

        except (ValueError, TypeError, AttributeError):
            return False


class NonceStore:
    """
    Redis-backed nonce storage for replay attack prevention.

    Nonces are stored with TTL = max payload age (e.g., 5 minutes).
    If nonce already exists in store, payload is rejected as replay attack.
    """

    @staticmethod
    def is_nonce_used(nonce: str) -> bool:
        """
        Check if nonce has been used before.

        Args:
            nonce: Nonce to check

        Returns:
            bool: True if nonce has been used

        TODO: Implement Redis backend for production
        Currently using database fallback (slower but functional)
        """
        from django.core.cache import cache
        key = f"nonce:{nonce}"
        return cache.get(key) is not None

    @staticmethod
    def mark_nonce_used(nonce: str, ttl_seconds: int = 300):
        """
        Mark nonce as used with expiration.

        Args:
            nonce: Nonce to mark as used
            ttl_seconds: Time-to-live in seconds (default: 5 minutes)

        Note:
            Nonces automatically expire after TTL.
            Old nonces are garbage collected by Redis/cache backend.
        """
        from django.core.cache import cache
        key = f"nonce:{nonce}"
        cache.set(key, True, timeout=ttl_seconds)
