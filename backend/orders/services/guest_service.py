from django.db import transaction
from django.utils import timezone
import logging
import uuid

from orders.models import Order

logger = logging.getLogger(__name__)


class GuestSessionService:
    """
    Service for managing guest user sessions and orders.
    Handles guest identification, order management, and conversion to authenticated users.
    """

    GUEST_SESSION_KEY = "guest_id"
    GUEST_ORDER_KEY = "guest_order_id"

    @staticmethod
    def get_or_create_guest_id(request):
        """
        Get or create a unique guest identifier for the session.
        Returns a guest_id that persists for the session.
        """
        if not request.session.session_key:
            request.session.create()
            logger.info(f"[GuestSessionService] Created new session: {request.session.session_key}")

        guest_id = request.session.get(GuestSessionService.GUEST_SESSION_KEY)
        if not guest_id:
            # Generate a unique guest ID
            guest_id = f"guest_{uuid.uuid4().hex[:12]}"
            request.session[GuestSessionService.GUEST_SESSION_KEY] = guest_id
            request.session.modified = True
            request.session.save()  # EXPLICITLY SAVE SESSION
            logger.info(f"[GuestSessionService] Created NEW guest_id: {guest_id}, stored in session: {request.session.session_key}")
            logger.info(f"[GuestSessionService] Session keys after storing guest_id: {list(request.session.keys())}")
            logger.info(f"[GuestSessionService] Session saved to cache")
        else:
            logger.info(f"[GuestSessionService] Retrieved EXISTING guest_id: {guest_id} from session: {request.session.session_key}")

        return guest_id

    @staticmethod
    def get_guest_order(request):
        """
        Get the current pending guest order for this session.
        Returns None if no pending order exists.
        """
        guest_id = request.session.get(GuestSessionService.GUEST_SESSION_KEY)
        if not guest_id:
            return None

        try:
            return Order.objects.get(
                guest_id=guest_id, status=Order.OrderStatus.PENDING
            )
        except Order.DoesNotExist:
            return None

    @staticmethod
    def create_guest_order(request, order_type="WEB", store_location=None):
        """
        Create a new guest order for the session, with improved duplicate prevention.
        Returns existing pending order if one exists for the session.

        Args:
            request: The HTTP request object
            order_type: Type of order (default: "WEB")
            store_location: StoreLocation for the order (REQUIRED for new orders)
        """
        guest_id = GuestSessionService.get_or_create_guest_id(request)

        # First, check if there's already a pending order for this guest
        existing_order = GuestSessionService.get_guest_order(request)
        if existing_order:
            # Update the session with the existing order ID if not already set
            if not request.session.get(GuestSessionService.GUEST_ORDER_KEY):
                request.session[GuestSessionService.GUEST_ORDER_KEY] = str(
                    existing_order.id
                )
                request.session.modified = True
            return existing_order

        # Double-check with guest_id to prevent race conditions
        try:
            existing_by_guest_id = Order.objects.get(
                guest_id=guest_id, status=Order.OrderStatus.PENDING
            )
            # Update session with found order
            request.session[GuestSessionService.GUEST_ORDER_KEY] = str(
                existing_by_guest_id.id
            )
            request.session.modified = True
            return existing_by_guest_id
        except Order.DoesNotExist:
            pass
        except Order.MultipleObjectsReturned:
            # If multiple pending orders exist, use the most recent one
            existing_by_guest_id = (
                Order.objects.filter(
                    guest_id=guest_id, status=Order.OrderStatus.PENDING
                )
                .order_by("-created_at")
                .first()
            )

            # Clean up duplicate orders by canceling older ones
            older_orders = Order.objects.filter(
                guest_id=guest_id, status=Order.OrderStatus.PENDING
            ).exclude(id=existing_by_guest_id.id)

            for old_order in older_orders:
                old_order.status = Order.OrderStatus.CANCELLED
                old_order.save(update_fields=["status"])

            # Update session with the kept order
            request.session[GuestSessionService.GUEST_ORDER_KEY] = str(
                existing_by_guest_id.id
            )
            request.session.modified = True
            return existing_by_guest_id

        # Create new order only if none exists
        if store_location is None:
            raise ValueError("store_location parameter is required for creating guest orders")

        order = Order.objects.create(
            guest_id=guest_id,
            order_type=order_type,
            status=Order.OrderStatus.PENDING,
            tenant=request.tenant,
            store_location=store_location
        )

        # Store order ID in session for quick access
        request.session[GuestSessionService.GUEST_ORDER_KEY] = str(order.id)
        request.session.modified = True

        return order

    @staticmethod
    def update_guest_contact_info(
        order, first_name=None, last_name=None, email=None, phone=None
    ):
        """
        Update guest contact information for an order.
        """
        update_fields = []

        if first_name is not None:
            order.guest_first_name = first_name
            update_fields.append("guest_first_name")
        if last_name is not None:
            order.guest_last_name = last_name
            update_fields.append("guest_last_name")
        if email is not None:
            order.guest_email = email
            update_fields.append("guest_email")
        if phone is not None:
            order.guest_phone = phone
            update_fields.append("guest_phone")

        if update_fields:
            order.save(update_fields=update_fields)
        return order

    @staticmethod
    def convert_guest_to_user(guest_order, user):
        """
        Convert a guest order to an authenticated user order.
        This links the order to the user and clears guest fields.
        """
        guest_order.customer = user
        guest_order.guest_id = None  # Clear guest ID since now it's a user order
        guest_order.save(update_fields=["customer", "guest_id"])

        # Also convert any related payments
        if hasattr(guest_order, "payment_details") and guest_order.payment_details:
            payment = guest_order.payment_details
            payment.guest_session_key = None  # Clear guest session
            payment.save(update_fields=["guest_session_key"])

        return guest_order

    @staticmethod
    def clear_guest_session(request):
        """
        Clear guest session data. Used after order completion or conversion.
        Enhanced to handle cleanup better.
        """
        guest_id = request.session.get(GuestSessionService.GUEST_SESSION_KEY)
        order_id = request.session.get(GuestSessionService.GUEST_ORDER_KEY)

        # Mark any pending orders as completed in session cleanup
        if guest_id and order_id:
            try:
                order = Order.objects.get(id=order_id, guest_id=guest_id)
                if order.status == Order.OrderStatus.PENDING:
                    # This prevents the order from being reused in future sessions
                    order.status = Order.OrderStatus.COMPLETED
                    order.completed_at = timezone.now()
                    order.save(update_fields=["status", "completed_at"])
            except Order.DoesNotExist:
                pass

        # Clear session data
        if GuestSessionService.GUEST_SESSION_KEY in request.session:
            del request.session[GuestSessionService.GUEST_SESSION_KEY]
        if GuestSessionService.GUEST_ORDER_KEY in request.session:
            del request.session[GuestSessionService.GUEST_ORDER_KEY]
        request.session.modified = True

    @staticmethod
    def cleanup_completed_guest_orders():
        """
        Utility method to clean up old completed guest orders.
        Can be called via management command or periodic task.
        """
        from datetime import datetime, timedelta

        # Mark old pending guest orders as cancelled (older than 24 hours)
        cutoff_time = datetime.now() - timedelta(hours=24)
        old_orders = Order.objects.filter(
            guest_id__isnull=False,
            status=Order.OrderStatus.PENDING,
            created_at__lt=cutoff_time,
        )

        count = old_orders.update(status=Order.OrderStatus.CANCELLED)
        return count


class GuestConversionService:
    """
    Service for converting guest orders to authenticated user accounts.
    """

    @staticmethod
    def create_account_from_guest_order(
        order, username, password, first_name="", last_name=""
    ):
        """
        Create a new user account using information from a guest order.
        Links the order to the new user account.
        """
        from django.contrib.auth import get_user_model

        User = get_user_model()

        with transaction.atomic():
            # Create new user
            user = User.objects.create_user(
                username=username,
                email=order.guest_email,
                password=password,
                first_name=first_name,
                last_name=last_name,
            )

            # Convert the guest order to user order
            converted_order = GuestSessionService.convert_guest_to_user(order, user)

            return user, converted_order

    @staticmethod
    def link_guest_order_to_existing_user(order, user):
        """
        Link a guest order to an existing authenticated user.
        Used when a guest logs in after creating an order.
        """
        return GuestSessionService.convert_guest_to_user(order, user)

    @staticmethod
    def get_guest_orders_by_email(email):
        """
        Retrieves all non-completed guest orders associated with a given email address.
        This is useful for allowing users to claim their past orders after creating an account.
        """
        return Order.objects.filter(
            guest_email__iexact=email,
            customer__isnull=True,
            status=Order.OrderStatus.PENDING,
        )
