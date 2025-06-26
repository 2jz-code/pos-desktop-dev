from decimal import Decimal
from django.db import transaction
from .models import Order, OrderItem, OrderDiscount
from products.models import Product
from users.models import User

# This should point to your actual discount service file
from discounts.services import DiscountService
from discounts.models import Discount


class OrderService:

    VALID_STATUS_TRANSITIONS = {
        Order.OrderStatus.PENDING: [
            Order.OrderStatus.PENDING,
            Order.OrderStatus.HOLD,
            Order.OrderStatus.COMPLETED,
            Order.OrderStatus.CANCELLED,
            Order.OrderStatus.VOID,
        ],
        Order.OrderStatus.HOLD: [
            Order.OrderStatus.PENDING,
            Order.OrderStatus.COMPLETED,
            Order.OrderStatus.CANCELLED,
            Order.OrderStatus.VOID,
        ],
        Order.OrderStatus.COMPLETED: [],
        Order.OrderStatus.CANCELLED: [],
        Order.OrderStatus.VOID: [],
    }

    @staticmethod
    @transaction.atomic
    def create_new_order(
        cashier: User, customer: User = None, order_type: str = Order.OrderType.POS
    ) -> Order:
        """
        Creates a new, empty order.
        """
        order = Order.objects.create(
            order_type=order_type, cashier=cashier, customer=customer
        )
        return order

    @staticmethod
    @transaction.atomic
    def create_order(order_type: str, cashier: User, customer: User = None) -> Order:
        """
        Creates a new, empty order.
        Compatibility method for existing tests and code.
        """
        return OrderService.create_new_order(cashier, customer, order_type)

    @staticmethod
    @transaction.atomic
    def add_item_to_order(
        order: Order, product: Product, quantity: int, notes: str = ""
    ) -> OrderItem:
        """
        Adds a product as an item to an order. If an item with the same
        product and notes exists, it increments its quantity. Otherwise, it
        creates a new item. Also recalculates order totals.
        Validates stock availability before adding items.
        """
        if order.status not in [Order.OrderStatus.PENDING, Order.OrderStatus.HOLD]:
            raise ValueError(
                "Cannot add items to an order that is not Pending or on Hold."
            )

        # Check stock availability before adding item
        from inventory.services import InventoryService
        from settings.config import app_settings

        try:
            default_location = app_settings.get_default_location()

            # Calculate total quantity needed (existing + new)
            order_item = OrderItem.objects.filter(
                order=order, product=product, notes=notes
            ).first()

            total_quantity_needed = quantity
            if order_item:
                total_quantity_needed += order_item.quantity

            # Check if this is a menu item - different validation rules
            if product.product_type.name.lower() == "menu":
                # Menu items: allow cook-to-order, just log ingredient status
                if hasattr(product, "recipe") and product.recipe:
                    InventoryService.check_recipe_availability(
                        product, default_location, total_quantity_needed
                    )
                # Always allow menu items regardless of stock
            else:
                # Regular products: strict stock validation
                if not InventoryService.check_stock_availability(
                    product, default_location, total_quantity_needed
                ):
                    current_stock = InventoryService.get_stock_level(
                        product, default_location
                    )
                    raise ValueError(
                        f"Insufficient stock for {product.name}. "
                        f"Requested: {total_quantity_needed}, Available: {current_stock}"
                    )
        except ValueError as e:
            # Re-raise ValueError (stock validation errors)
            raise e
        except Exception as e:
            # Log other errors but don't block the sale
            print(f"Stock check warning for {product.name}: {e}")

        # Add the item to the order
        if order_item:
            order_item.quantity += quantity
            order_item.save(update_fields=["quantity"])
        else:
            order_item = OrderItem.objects.create(
                order=order,
                product=product,
                quantity=quantity,
                price_at_sale=product.price,
                notes=notes,
            )

        OrderService.recalculate_order_totals(order)
        return order_item

    @staticmethod
    @transaction.atomic
    def update_order_status(order: Order, new_status: str) -> Order:
        """
        Updates the status of an order, checking for valid transitions.
        """
        if new_status not in Order.OrderStatus.values:
            raise ValueError(f"'{new_status}' is not a valid order status.")

        if new_status not in OrderService.VALID_STATUS_TRANSITIONS.get(
            order.status, []
        ):
            raise ValueError(
                f"Cannot transition order from {order.status} to {new_status}."
            )

        order.status = new_status
        order.save(update_fields=["status", "updated_at"])
        return order

    @staticmethod
    @transaction.atomic
    def complete_order(order: Order, payment_data: dict) -> Order:
        """
        Finalizes an order.
        - Calls the payment service to handle payment.
        - Updates order status to COMPLETED.
        - Triggers inventory deduction.
        """
        if order.status not in [Order.OrderStatus.PENDING, Order.OrderStatus.HOLD]:
            raise ValueError("Only PENDING or HOLD orders can be completed.")

        order.payment_status = Order.PaymentStatus.PAID
        order.status = Order.OrderStatus.COMPLETED
        order.save(update_fields=["status", "payment_status", "updated_at"])

        return order

    @staticmethod
    @transaction.atomic
    def reorder(source_order_id: str, user: User) -> Order:
        """
        Creates a new PENDING order by duplicating the items from a previous order.
        - The new order is assigned to the provided user.
        - Items are added using their current price, not the price at the time of the original sale.
        - The new order is left in a PENDING state, ready for checkout.
        """
        try:
            source_order = Order.objects.prefetch_related("items__product").get(
                id=source_order_id, customer=user
            )
        except Order.DoesNotExist:
            raise ValueError(
                "Original order not found or you do not have permission to reorder it."
            )

        # Create a new order for the user
        new_order = Order.objects.create(
            customer=user,
            order_type=source_order.order_type,
            # Copy other relevant fields if necessary, e.g., location
        )

        # Copy items from the source order to the new one
        for item in source_order.items.all():
            OrderItem.objects.create(
                order=new_order,
                product=item.product,
                quantity=item.quantity,
                price_at_sale=item.product.price,  # Use current price
                notes=item.notes,
            )

        # Recalculate totals for the new order
        OrderService.recalculate_order_totals(new_order)

        return new_order

    @staticmethod
    def void_order(order: Order) -> Order:
        """Sets an order's status to VOID after checking transition validity."""
        return OrderService.update_order_status(order, Order.OrderStatus.VOID)

    @staticmethod
    def cancel_order(order: Order) -> Order:
        """Sets an order's status to CANCELLED after checking transition validity."""
        return OrderService.update_order_status(order, Order.OrderStatus.CANCELLED)

    @staticmethod
    def resume_order(order: Order) -> Order:
        """Sets an order's status to PENDING after checking transition validity."""
        return OrderService.update_order_status(order, Order.OrderStatus.PENDING)

    @staticmethod
    @transaction.atomic
    def apply_discount_to_order_by_id(order: Order, discount_id: int):
        """
        Applies a discount to an order by DELEGATING to the DiscountService.
        """
        try:
            discount = Discount.objects.get(id=discount_id)
            DiscountService.apply_discount_to_order(order, discount)
        except Discount.DoesNotExist:
            raise ValueError("Discount not found.")
        except Exception as e:
            raise e

    @staticmethod
    @transaction.atomic
    def remove_discount_from_order_by_id(order: Order, discount_id: int):
        """
        Removes a discount from an order by its ID, delegating to the DiscountService.
        """
        try:
            discount = Discount.objects.get(id=discount_id)
            DiscountService.remove_discount_from_order(order, discount)
        except Discount.DoesNotExist:
            raise ValueError("Discount to remove not found on this order.")
        except Exception as e:
            raise e

    @staticmethod
    @transaction.atomic
    def recalculate_order_totals(order: Order):
        """
        Recalculates all financial fields for an order, ensuring calculations
        are performed in the correct sequence.
        """
        # Import app_settings locally to ensure we always get the fresh configuration
        # This avoids Python's module-level import caching that could cause stale config
        from settings.config import app_settings

        # Re-fetch the full order context to ensure data is fresh
        order = Order.objects.prefetch_related(
            "items__product__taxes", "applied_discounts__discount"
        ).get(id=order.id)

        # 1. Calculate the pre-discount subtotal from all items
        order.subtotal = sum(item.total_price for item in order.items.all())

        # 2. Recalculate the value of all applied discounts based on the fresh subtotal
        total_discount_amount = Decimal("0.00")
        from discounts.factories import DiscountStrategyFactory

        if order.applied_discounts.exists():
            for order_discount in order.applied_discounts.all():
                strategy = DiscountStrategyFactory.get_strategy(order_discount.discount)
                calculated_amount = strategy.apply(order, order_discount.discount)
                if calculated_amount != order_discount.amount:
                    order_discount.amount = calculated_amount
                    order_discount.save()
                total_discount_amount += calculated_amount
        order.total_discounts_amount = total_discount_amount

        # 3. Determine the base for tax and surcharge calculations (subtotal AFTER discounts)
        post_discount_subtotal = order.subtotal - order.total_discounts_amount

        # 4. Calculate tax based on the discounted price of each item
        tax_total = Decimal("0.00")
        if order.subtotal > 0:
            proportional_discount_rate = order.total_discounts_amount / order.subtotal
            for item in order.items.all():
                discounted_item_price = item.total_price * (
                    Decimal("1.0") - proportional_discount_rate
                )

                product_taxes = item.product.taxes.all()
                if product_taxes:
                    for tax in product_taxes:
                        tax_total += discounted_item_price * (
                            tax.rate / Decimal("100.0")
                        )
                else:
                    # Use the fresh configuration for tax rate
                    tax_total += discounted_item_price * app_settings.tax_rate

        order.tax_total = tax_total.quantize(Decimal("0.01"))

        # 5. Calculate surcharges on the post-discount subtotal
        # Use the fresh configuration for surcharge percentage
        surcharges_total = post_discount_subtotal * app_settings.surcharge_percentage
        order.surcharges_total = surcharges_total.quantize(Decimal("0.01"))

        # 6. Calculate the final grand total
        order.grand_total = (
            post_discount_subtotal + order.tax_total + order.surcharges_total
        )

        order.save(
            update_fields=[
                "subtotal",
                "total_discounts_amount",
                "tax_total",
                "surcharges_total",
                "grand_total",
                "updated_at",
            ]
        )

    @staticmethod
    @transaction.atomic
    def clear_order_items(order: Order):
        """
        Deletes all items from an order and recalculates its totals.
        """
        order.items.all().delete()
        OrderService.recalculate_order_totals(order)

    @staticmethod
    @transaction.atomic
    def mark_as_fully_paid(order: Order):
        """
        Marks an order as fully paid and handles related business logic.
        This method is called when a payment is completed.
        """
        # The order status updates are already handled in PaymentService._update_payment_status
        # This method can be extended in the future for additional business logic
        # like inventory updates, notifications, etc.
        pass

    @staticmethod
    @transaction.atomic
    def update_payment_status(order: Order, new_payment_status: str):
        """
        Updates the payment status of an order.
        This method ensures payment status changes go through the service layer.
        """
        if order.payment_status != new_payment_status:
            order.payment_status = new_payment_status
            order.save(update_fields=["payment_status", "updated_at"])

    @staticmethod
    @transaction.atomic
    def recalculate_in_progress_orders():
        """
        Recalculates totals for all in-progress orders when configuration changes.
        This ensures tax rates and surcharges are applied consistently across all orders.
        """
        # Import app_settings locally to ensure we always get the fresh configuration
        from settings.config import app_settings

        in_progress_orders = Order.objects.filter(
            status__in=[Order.OrderStatus.PENDING, Order.OrderStatus.HOLD]
        )

        count = 0
        for order in in_progress_orders:
            old_grand_total = order.grand_total
            OrderService.recalculate_order_totals(order)
            new_grand_total = order.grand_total

            if old_grand_total != new_grand_total:
                count += 1
                print(
                    f"Order #{order.id}: Grand total updated from ${old_grand_total} to ${new_grand_total}"
                )

        print(f"Recalculated {count} in-progress orders due to configuration change")
        return count


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

        guest_id = request.session.get(GuestSessionService.GUEST_SESSION_KEY)
        if not guest_id:
            # Generate a unique guest ID
            import uuid

            guest_id = f"guest_{uuid.uuid4().hex[:12]}"
            request.session[GuestSessionService.GUEST_SESSION_KEY] = guest_id
            request.session.modified = True

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
            from .models import Order

            return Order.objects.get(
                guest_id=guest_id, status=Order.OrderStatus.PENDING
            )
        except Order.DoesNotExist:
            return None

    @staticmethod
    def create_guest_order(request, order_type="WEB"):
        """
        Create a new guest order for the session, with improved duplicate prevention.
        Returns existing pending order if one exists for the session.
        """
        from .models import Order

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
        order = Order.objects.create(
            guest_id=guest_id, order_type=order_type, status=Order.OrderStatus.PENDING
        )

        # Store order ID in session for quick access
        request.session[GuestSessionService.GUEST_ORDER_KEY] = str(order.id)
        request.session.modified = True

        return order

    @staticmethod
    def update_guest_contact_info(order, email=None, phone=None):
        """
        Update guest contact information for an order.
        """
        if email:
            order.guest_email = email
        if phone:
            order.guest_phone = phone
        order.save(update_fields=["guest_email", "guest_phone"])
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
                from .models import Order

                order = Order.objects.get(id=order_id, guest_id=guest_id)
                if order.status == Order.OrderStatus.PENDING:
                    # This prevents the order from being reused in future sessions
                    order.status = Order.OrderStatus.COMPLETED
                    order.save(update_fields=["status"])
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
        from .models import Order

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
        from django.db import transaction

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
        Find all guest orders associated with an email address.
        Useful for account creation or order lookup.
        """
        from .models import Order

        return Order.objects.filter(
            guest_email=email, customer__isnull=True  # Only guest orders
        ).order_by("-created_at")
