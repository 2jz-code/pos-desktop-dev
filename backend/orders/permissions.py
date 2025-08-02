from rest_framework import permissions


class IsAuthenticatedOrGuestOrder(permissions.BasePermission):
    """
    Custom permission that allows:
    - Authenticated users to access their own orders
    - Guest users to access orders associated with their session
    - Staff users to access any order
    """

    def has_permission(self, request, view):
        # Allow all users to create orders (including guests)
        if view.action == "create":
            return True

        # For other actions, check if user is authenticated or has a valid session
        return bool(request.user and request.user.is_authenticated) or bool(
            request.session.session_key
        )

    def has_object_permission(self, request, view, obj):
        # POS staff users (cashier, manager, owner, admin) can access any order
        if request.user and request.user.is_authenticated and request.user.is_pos_staff:
            return True

        # Get the order object (handle both Order and OrderItem)
        if hasattr(obj, "order"):  # This is an OrderItem
            order = obj.order
        else:  # This is an Order
            order = obj

        # Authenticated users can access their own orders
        if request.user and request.user.is_authenticated:
            return order.customer == request.user

        # Guest users can access orders with their session guest_id
        if hasattr(request, "session") and request.session.session_key:
            from .services import GuestSessionService

            guest_id = request.session.get(GuestSessionService.GUEST_SESSION_KEY)
            return order.guest_id == guest_id

        return False


class IsGuestOrAuthenticated(permissions.BasePermission):
    """
    Simple permission that allows both authenticated users and users with sessions (guests).
    """

    def has_permission(self, request, view):
        # Allow if user is authenticated OR if session exists
        return bool(request.user and request.user.is_authenticated) or bool(
            hasattr(request, "session") and request.session.session_key
        )
