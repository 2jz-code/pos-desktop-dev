"""
Permissions for offline sync endpoints.

These permissions are used to control access to sync endpoints that
are authenticated via device signatures rather than user credentials.
"""
from rest_framework.permissions import BasePermission
from terminals.models import TerminalRegistration


class IsAuthenticatedTerminal(BasePermission):
    """
    Allow access if request.auth is a valid TerminalRegistration.

    ⚠️ CRITICAL: All sync endpoints MUST use this permission, NOT IsAuthenticated!
    DeviceSignatureAuthentication intentionally sets request.user=None because
    terminals are devices, not users. IsAuthenticated will reject all requests.

    This permission validates terminal authentication by checking request.auth
    instead of request.user.

    Usage:
        class OfflineOrderIngestView(APIView):
            authentication_classes = [DeviceSignatureAuthentication]
            permission_classes = [IsAuthenticatedTerminal]  # NOT IsAuthenticated!

            def post(self, request):
                terminal = request.auth  # TerminalRegistration instance
                # request.user is None - do not use it!
                ...

    Security:
        - request.auth must be a TerminalRegistration instance
        - Terminal must be active (is_active=True)
        - Terminal must not be locked (is_locked=False)

    Why not IsAuthenticated?
        - IsAuthenticated checks request.user, which is None for terminals
        - Terminals authenticate via HMAC signatures, not user credentials
        - Terminal identity/authorization is in request.auth, not request.user
    """

    def has_permission(self, request, view):
        """
        Check if request has valid terminal authentication.

        Args:
            request: DRF request object
            view: View being accessed

        Returns:
            bool: True if authenticated as valid terminal
        """
        return (
            request.auth is not None and
            isinstance(request.auth, TerminalRegistration) and
            request.auth.is_active and
            not request.auth.is_locked
        )

    def get_message(self):
        """
        Return custom error message for permission denied.

        Returns:
            str: Error message shown to client
        """
        return 'Valid terminal authentication required'
