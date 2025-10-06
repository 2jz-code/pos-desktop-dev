import secrets
import string
import logging
from django.utils import timezone
from datetime import timedelta
from django.core.exceptions import ValidationError
from .models import TerminalPairingCode, TerminalRegistration

logger = logging.getLogger(__name__)


class TerminalPairingService:
    """RFC 8628 device authorization flow"""

    CODE_EXPIRY_MINUTES = 15
    POLLING_INTERVAL = 5

    @staticmethod
    def generate_device_code():
        """128-char cryptographically secure code"""
        chars = string.ascii_letters + string.digits
        return ''.join(secrets.choice(chars) for _ in range(128))

    @staticmethod
    def generate_user_code():
        """8-char human-readable: ABCD-1234"""
        letters = ''.join(secrets.choice(string.ascii_uppercase) for _ in range(4))
        digits = ''.join(secrets.choice(string.digits) for _ in range(4))
        return f"{letters}-{digits}"

    @staticmethod
    def initiate_pairing(device_fingerprint, ip_address=None):
        """
        Step 1: Terminal requests pairing codes.

        Returns: TerminalPairingCode
        """
        device_code = TerminalPairingService.generate_device_code()
        user_code = TerminalPairingService.generate_user_code()

        # Ensure uniqueness (rare collision)
        while TerminalPairingCode.objects.filter(user_code=user_code).exists():
            user_code = TerminalPairingService.generate_user_code()

        pairing = TerminalPairingCode.objects.create(
            device_code=device_code,
            user_code=user_code,
            device_fingerprint=device_fingerprint,
            expires_at=timezone.now() + timedelta(
                minutes=TerminalPairingService.CODE_EXPIRY_MINUTES
            ),
            interval=TerminalPairingService.POLLING_INTERVAL,
            status='pending',
            ip_address=ip_address
        )

        logger.info(f"Pairing initiated: {user_code} from {ip_address}")
        return pairing

    @staticmethod
    def poll_for_token(device_code):
        """
        Step 2: Terminal polls for approval.

        Returns: ('status', data)
        - ('pending', None)
        - ('expired', None)
        - ('denied', None)
        - ('approved', tokens_dict)
        """
        try:
            pairing = TerminalPairingCode.objects.select_related(
                'tenant', 'location'
            ).get(device_code=device_code)
        except TerminalPairingCode.DoesNotExist:
            raise ValidationError("Invalid device code")

        # Check expiration
        if timezone.now() > pairing.expires_at:
            if pairing.status != 'expired':
                pairing.status = 'expired'
                pairing.save()
            return ('expired', None)

        # Check status
        if pairing.status == 'denied':
            return ('denied', None)

        if pairing.status == 'pending':
            return ('pending', None)

        if pairing.status == 'consumed':
            raise ValidationError("Code already used")

        # Status = approved → Return terminal info (NO JWT tokens - those are for user login only)
        if pairing.status == 'approved':
            terminal = TerminalPairingService._get_or_create_terminal(pairing)
            pairing.mark_consumed()

            return ('approved', {
                'device_id': terminal.device_id,
                'tenant_id': str(terminal.tenant.id),
                'tenant_slug': terminal.tenant.slug,
                'location_id': terminal.store_location.id if terminal.store_location else None,
                'location_name': terminal.store_location.name if terminal.store_location else None,
            })

        return ('pending', None)

    @staticmethod
    def _get_or_create_terminal(pairing):
        """Create or update terminal registration"""
        existing = TerminalRegistration.all_objects.filter(
            device_fingerprint=pairing.device_fingerprint
        ).first()

        if existing:
            # Re-pairing: update location/tenant
            existing.store_location = pairing.location
            existing.tenant = pairing.tenant
            existing.pairing_code = pairing
            existing.nickname = pairing.nickname or existing.nickname
            existing.last_authenticated_at = timezone.now()
            existing.is_active = True
            existing.is_locked = False
            existing.save(update_fields=[
                'store_location', 'tenant', 'pairing_code', 'nickname',
                'last_authenticated_at', 'is_active', 'is_locked'
            ])
            return existing
        else:
            # New terminal
            device_id = f"TERMINAL-{timezone.now().strftime('%Y%m%d%H%M%S')}"
            return TerminalRegistration.objects.create(
                device_id=device_id,
                tenant=pairing.tenant,
                store_location=pairing.location,
                nickname=pairing.nickname or f"Terminal {timezone.now():%m/%d %H:%M}",
                device_fingerprint=pairing.device_fingerprint,
                pairing_code=pairing,
                is_active=True,
                last_authenticated_at=timezone.now()
            )

    @staticmethod
    def _generate_tokens(terminal):
        """Generate JWT for terminal service account"""
        from users.services import UserService
        from users.models import User

        # Get or create service account
        username = f"terminal_{terminal.device_id}"
        user, _ = User.all_objects.get_or_create(
            username=username,
            tenant=terminal.tenant,
            defaults={
                'role': 'cashier',
                'is_active': True,
                'email': f"{username}@system.ajeen.local",
                'first_name': 'Terminal',
                'last_name': terminal.nickname,
            }
        )

        return UserService.generate_tokens_for_user(user)

    @staticmethod
    def approve_pairing(user_code, admin_user, location, nickname=''):
        """
        Step 3: Admin approves pairing.

        Validates:
        - Code exists and pending
        - Not expired
        - Location belongs to admin's tenant
        """
        try:
            pairing = TerminalPairingCode.objects.get(
                user_code=user_code.upper(),
                status='pending'
            )
        except TerminalPairingCode.DoesNotExist:
            raise ValidationError("Invalid or already used code")

        if timezone.now() > pairing.expires_at:
            pairing.status = 'expired'
            pairing.save()
            raise ValidationError("Code expired")

        # Validate location belongs to admin's tenant
        if location.tenant != admin_user.tenant:
            raise ValidationError("Location does not belong to your organization")

        pairing.mark_approved(admin_user, admin_user.tenant, location, nickname)

        logger.info(
            f"Pairing approved: {user_code} by {admin_user.username} "
            f"for {admin_user.tenant.slug}"
        )

        return pairing

    @staticmethod
    def deny_pairing(user_code, admin_user):
        """Admin denies pairing"""
        try:
            pairing = TerminalPairingCode.objects.get(
                user_code=user_code.upper(),
                status='pending'
            )
        except TerminalPairingCode.DoesNotExist:
            raise ValidationError("Invalid code")

        pairing.status = 'denied'
        pairing.created_by = admin_user
        pairing.save()

        logger.info(f"Pairing denied: {user_code} by {admin_user.username}")
        return pairing
