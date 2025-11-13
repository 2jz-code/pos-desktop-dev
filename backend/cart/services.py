"""
Cart service layer for managing shopping cart operations.

This service handles:
- Cart creation and retrieval (guest and authenticated users)
- Adding/updating/removing items
- Converting cart to order (snapshot creation)
- Cart lifecycle management (abandonment, merging)
"""

from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from typing import Optional, Dict, Any
import logging

from .models import Cart, CartItem, CartItemModifier
from orders.models import Order, OrderItem, OrderItemModifier
from products.models import Product, ModifierOption
from customers.models import Customer

logger = logging.getLogger(__name__)


class CartService:
    """Service for managing cart operations."""

    @staticmethod
    def get_or_create_cart(
        customer: Optional[Customer] = None,
        session_id: Optional[str] = None,
        tenant=None
    ) -> Cart:
        """
        Get or create a cart for a user or guest session.

        Args:
            customer: Authenticated customer (optional)
            session_id: Guest session ID (optional)
            tenant: Tenant instance (REQUIRED)

        Returns:
            Cart instance

        Raises:
            ValueError: If neither customer nor session_id provided, or tenant missing
        """
        if not tenant:
            raise ValueError("Tenant is required to create a cart")

        if not customer and not session_id:
            raise ValueError("Either customer or session_id must be provided")

        # Try to find existing cart
        if customer:
            cart = Cart.objects.filter(
                tenant=tenant,
                customer=customer
            ).first()
        else:
            cart = Cart.objects.filter(
                tenant=tenant,
                session_id=session_id
            ).first()

        # Create new cart if none exists
        if not cart:
            cart = Cart.objects.create(
                tenant=tenant,
                customer=customer,
                session_id=session_id if not customer else ''
            )
            logger.info(f"Created new cart {cart.id} for {'customer' if customer else 'guest'}")

        return cart

    @staticmethod
    @transaction.atomic
    def add_item_to_cart(
        cart: Cart,
        product: Product,
        quantity: int = 1,
        selected_modifiers: Optional[list] = None,
        notes: str = ""
    ) -> CartItem:
        """
        Add an item to the cart.

        For items with modifiers: Always creates a new CartItem (quantity=1) per item
        For items without modifiers: Merges with existing CartItem if found

        Args:
            cart: Cart instance
            product: Product to add
            quantity: Quantity to add (default: 1)
            selected_modifiers: List of modifier dicts with 'option_id' and 'quantity'
            notes: Customer notes

        Returns:
            CartItem instance (the first created if multiple)
        """
        selected_modifiers = selected_modifiers or []

        # If item has modifiers, create individual entries for each quantity
        if selected_modifiers:
            created_items = []
            for _ in range(quantity):
                cart_item = CartItem.objects.create(
                    tenant=cart.tenant,
                    cart=cart,
                    product=product,
                    quantity=1,  # Always 1 for items with modifiers
                    notes=notes
                )

                # Add modifiers to this item
                for modifier_data in selected_modifiers:
                    option_id = modifier_data.get('option_id')
                    mod_quantity = modifier_data.get('quantity', 1)

                    if option_id:
                        try:
                            modifier_option = ModifierOption.objects.get(id=option_id)
                            CartItemModifier.objects.create(
                                tenant=cart.tenant,
                                cart_item=cart_item,
                                modifier_option=modifier_option,
                                quantity=mod_quantity
                            )
                        except ModifierOption.DoesNotExist:
                            logger.warning(f"ModifierOption {option_id} not found")
                            continue

                created_items.append(cart_item)

            cart.touch()
            return created_items[0] if created_items else None

        else:
            # No modifiers - try to merge with existing item
            existing_item = CartItem.objects.filter(
                cart=cart,
                product=product,
                notes=notes
            ).first()

            if existing_item:
                # Merge quantity
                existing_item.quantity += quantity
                existing_item.save()
                return existing_item
            else:
                # Create new item
                cart_item = CartItem.objects.create(
                    tenant=cart.tenant,
                    cart=cart,
                    product=product,
                    quantity=quantity,
                    notes=notes
                )
                cart.touch()
                return cart_item

    @staticmethod
    @transaction.atomic
    def update_item_quantity(cart_item: CartItem, new_quantity: int):
        """
        Update the quantity of a cart item.

        Args:
            cart_item: CartItem to update
            new_quantity: New quantity (must be > 0)

        Raises:
            ValueError: If quantity is invalid
        """
        if new_quantity <= 0:
            raise ValueError("Quantity must be greater than 0")

        cart_item.quantity = new_quantity
        cart_item.save()

    @staticmethod
    @transaction.atomic
    def remove_item_from_cart(cart_item: CartItem):
        """
        Remove an item from the cart.

        Args:
            cart_item: CartItem to remove
        """
        cart_item.delete()

    @staticmethod
    @transaction.atomic
    def clear_cart(cart: Cart):
        """
        Remove all items from the cart.

        Args:
            cart: Cart to clear
        """
        cart.items.all().delete()
        cart.touch()

    @staticmethod
    @transaction.atomic
    def set_cart_location(cart: Cart, store_location):
        """
        Set the store location for a cart (checkout step 1).

        Args:
            cart: Cart instance
            store_location: StoreLocation instance

        Returns:
            Updated cart instance
        """
        cart.store_location = store_location
        cart.save(update_fields=['store_location', 'updated_at'])
        logger.info(f"Cart {cart.id} location set to {store_location.name}")
        return cart

    @staticmethod
    @transaction.atomic
    def convert_to_order(cart: Cart, cashier=None) -> Order:
        """
        Convert a Cart to an Order (atomic transaction).

        This is the CRITICAL METHOD that converts the mutable cart
        into an immutable order with snapshot prices.

        Lifecycle:
        1. Validate cart has location set
        2. Clean up any existing PENDING orders for this guest (if applicable)
        3. Create Order with current cart totals
        4. Create OrderItems with SNAPSHOT prices (frozen at checkout)
        5. Create OrderItemModifiers with SNAPSHOT data (strings, not FK references)
        6. Delete the cart
        7. Return the created order

        Args:
            cart: Cart to convert
            cashier: User creating the order (for POS orders, optional for web)

        Returns:
            Order instance

        Raises:
            ValueError: If cart is invalid or missing required data
        """
        logger.info(f"[CartService.convert_to_order] Starting conversion for cart {cart.id}")
        logger.info(f"[CartService.convert_to_order] Cart details - Tenant: {cart.tenant.slug}, Location: {cart.store_location}, Guest: {cart.is_guest_cart}, Session: {cart.session_id[:8] if cart.session_id else 'None'}...")

        # Validation
        if not cart.store_location:
            logger.error(f"[CartService.convert_to_order] Cart {cart.id} has no location set")
            raise ValueError("Cart must have a location set before converting to order")

        if cart.items.count() == 0:
            logger.error(f"[CartService.convert_to_order] Cart {cart.id} is empty")
            raise ValueError("Cannot convert empty cart to order")

        # Clean up existing PENDING orders for this guest to avoid constraint violation
        # (Guest may have abandoned a previous checkout attempt)
        if cart.is_guest_cart and cart.session_id:
            logger.info(f"[CartService.convert_to_order] Checking for existing PENDING orders for guest {cart.session_id[:8]}...")
            existing_pending = Order.objects.filter(
                tenant=cart.tenant,
                guest_id=cart.session_id,
                status=Order.OrderStatus.PENDING
            )
            pending_count = existing_pending.count()
            if pending_count > 0:
                logger.warning(
                    f"[CartService.convert_to_order] Deleting {pending_count} existing PENDING order(s) "
                    f"for guest {cart.session_id[:8]}... to avoid constraint violation"
                )
                # Log IDs before deletion for debugging
                existing_ids = list(existing_pending.values_list('id', flat=True))
                logger.info(f"[CartService.convert_to_order] Deleting order IDs: {existing_ids}")
                existing_pending.delete()
                logger.info(f"[CartService.convert_to_order] Successfully deleted {pending_count} PENDING orders")
            else:
                logger.info(f"[CartService.convert_to_order] No existing PENDING orders found for guest")

        # Use OrderCalculator to get final totals
        logger.info(f"[CartService.convert_to_order] Calculating order totals using OrderCalculator")
        from orders.calculators import OrderCalculator
        calculator = OrderCalculator(cart)
        totals = calculator.calculate_totals()
        logger.info(f"[CartService.convert_to_order] Totals calculated - Subtotal: {totals['subtotal']}, Tax: {totals['tax_total']}, Grand Total: {totals['grand_total']}")

        # Create Order
        logger.info(f"[CartService.convert_to_order] Creating Order object...")
        logger.info(f"[CartService.convert_to_order] Order params - Tenant: {cart.tenant.slug}, Location: {cart.store_location.name}, Guest ID: {cart.session_id if cart.is_guest_cart else None}")

        try:
            order = Order.objects.create(
                tenant=cart.tenant,
                store_location=cart.store_location,
                customer=cart.customer,
                cashier=cashier,
                order_type=Order.OrderType.WEB,
                status=Order.OrderStatus.PENDING,
                payment_status=Order.PaymentStatus.UNPAID,  # Fixed: Order.PaymentStatus doesn't have PENDING
                # Financial snapshots (frozen at checkout)
                subtotal=totals['subtotal'],
                tax_total=totals['tax_total'],
                grand_total=totals['grand_total'],
                total_discounts_amount=totals['discount_total'],
                # Guest info (if applicable) - Transfer from cart
                guest_id=cart.session_id if cart.is_guest_cart else None,
                guest_first_name=cart.guest_first_name,
                guest_last_name=cart.guest_last_name,
                guest_email=cart.guest_email,
                guest_phone=cart.guest_phone,
            )
            logger.info(f"[CartService.convert_to_order] Order created successfully - ID: {order.id}, Number: {order.order_number}")
        except Exception as e:
            logger.error(f"[CartService.convert_to_order] Failed to create Order: {type(e).__name__}: {e}", exc_info=True)
            raise

        # Convert CartItems to OrderItems (with snapshot prices)
        logger.info(f"[CartService.convert_to_order] Converting {cart.items.count()} cart items to order items")
        for cart_item in cart.items.all():
            # Calculate snapshot price (base + modifiers)
            base_price = cart_item.get_base_price()
            modifiers_total = cart_item.get_modifiers_total()
            price_at_sale = base_price + modifiers_total

            # Create OrderItem with snapshot
            order_item = OrderItem.objects.create(
                tenant=cart.tenant,
                order=order,
                product=cart_item.product,
                quantity=cart_item.quantity,
                price_at_sale=price_at_sale,  # ← SNAPSHOT: Frozen price
                notes=cart_item.notes
            )

            # Convert CartItemModifiers to OrderItemModifiers (with snapshot strings)
            modifier_count = cart_item.modifiers.count()
            if modifier_count > 0:
                logger.debug(f"[CartService.convert_to_order] Converting {modifier_count} modifiers for item {order_item.id}")
                for cart_modifier in cart_item.modifiers.all():
                    OrderItemModifier.objects.create(
                        tenant=cart.tenant,
                        order_item=order_item,
                        # SNAPSHOT: Store strings, not FK references
                        modifier_set_name=cart_modifier.modifier_option.modifier_set.name,
                        option_name=cart_modifier.modifier_option.name,
                        price_at_sale=cart_modifier.modifier_option.price_delta,
                        quantity=cart_modifier.quantity
                    )

        logger.info(f"[CartService.convert_to_order] All cart items converted successfully")

        # Delete the cart (it's been converted)
        cart_id_for_logging = cart.id  # Save for logging since cart will be deleted
        logger.info(f"[CartService.convert_to_order] Deleting cart {cart_id_for_logging}")
        cart.delete()

        logger.info(f"[CartService.convert_to_order] ✅ Conversion complete! Cart {cart_id_for_logging} → Order {order.id} (#{order.order_number})")
        return order

    @staticmethod
    def merge_carts(source_cart: Cart, target_cart: Cart):
        """
        Merge source cart into target cart (guest → authenticated user conversion).

        Args:
            source_cart: Guest cart to merge from
            target_cart: Authenticated user cart to merge into
        """
        source_cart.merge_into(target_cart)
        logger.info(f"Merged cart {source_cart.id} into {target_cart.id}")

    @staticmethod
    def cleanup_abandoned_carts(hours: int = 24) -> int:
        """
        Delete abandoned carts older than specified hours.

        Args:
            hours: Number of hours of inactivity before cart is considered abandoned

        Returns:
            Number of carts deleted
        """
        threshold = timezone.now() - timezone.timedelta(hours=hours)
        abandoned_carts = Cart.objects.filter(last_activity__lt=threshold)
        count = abandoned_carts.count()
        abandoned_carts.delete()

        logger.info(f"Cleaned up {count} abandoned carts (older than {hours} hours)")
        return count
