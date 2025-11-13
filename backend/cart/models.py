import uuid
from django.db import models
from django.utils import timezone
from decimal import Decimal
from products.models import Product, ModifierOption
from customers.models import Customer
from tenant.managers import TenantManager


class Cart(models.Model):
    """
    Ephemeral shopping cart for building orders.
    Mutable, lightweight, no location required until checkout.

    Lifecycle:
    1. Created on first "Add to Cart" (no location needed)
    2. Modified as user shops (add/remove/update items)
    3. Location selected at checkout (Step 1 of checkout flow)
    4. User can change location freely during checkout
    5. Converted to Order when payment is processed (atomic transaction)
    6. Deleted after successful order creation

    Key Design:
    - store_location is NULLABLE (set during checkout, not shopping)
    - NO financial totals stored (calculated dynamically)
    - Prices are dynamic (base product prices, no location adjustments yet)
    - Tax calculated only when location is set

    Financial Calculations (DRY Architecture):
    - Cart calculates: subtotal, discounts, tax → grand_total (FOOD ONLY)
    - Surcharge preview: Call POST /api/payments/calculate-surcharge/ (existing endpoint)
    - Tips: Stored as user input (not calculated)
    - Final total: grand_total + surcharge + tip (calculated client-side)

    This matches the split payment architecture:
    - Cart/Order.grand_total = food cost (no payment fees)
    - PaymentTransaction.surcharge = calculated per payment method
    - PaymentTransaction.tip = customer's tip
    - Payment.total_collected = sum of all transactions
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='carts'
    )

    # Location is OPTIONAL until checkout
    store_location = models.ForeignKey(
        'settings.StoreLocation',
        on_delete=models.PROTECT,
        related_name='carts',
        null=True,
        blank=True,
        help_text='Store location selected at checkout. Nullable during shopping phase.'
    )

    # User identification (one will be set)
    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='carts',
        help_text='Authenticated customer (null for guests)'
    )
    session_id = models.CharField(
        max_length=100,
        blank=True,
        db_index=True,
        help_text='Session identifier for guest users'
    )

    # Guest customer information (for checkout)
    guest_first_name = models.CharField(max_length=100, blank=True, default='')
    guest_last_name = models.CharField(max_length=100, blank=True, default='')
    guest_email = models.EmailField(blank=True, default='')
    guest_phone = models.CharField(max_length=20, blank=True, default='')

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_activity = models.DateTimeField(
        default=timezone.now,
        help_text='Last time cart was modified (for abandonment tracking)'
    )

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['tenant', 'customer']),
            models.Index(fields=['tenant', 'session_id']),
            models.Index(fields=['tenant', 'store_location']),
            models.Index(fields=['tenant', 'last_activity']),
        ]
        constraints = [
            # One active cart per authenticated user per tenant
            models.UniqueConstraint(
                fields=['tenant', 'customer'],
                condition=models.Q(customer__isnull=False),
                name='unique_customer_cart_per_tenant'
            ),
            # One active cart per guest session per tenant
            models.UniqueConstraint(
                fields=['tenant', 'session_id'],
                condition=models.Q(session_id__isnull=False) & ~models.Q(session_id=''),
                name='unique_guest_cart_per_tenant'
            ),
        ]

    def __str__(self):
        if self.customer:
            return f"Cart for {self.customer.email}"
        return f"Guest Cart ({self.session_id[:8]}...)"

    @property
    def is_guest_cart(self):
        """Returns True if this is a guest cart."""
        return not self.customer and bool(self.session_id)

    @property
    def item_count(self):
        """Total number of items in cart (sum of quantities)."""
        from orders.calculators import OrderCalculator
        calculator = OrderCalculator(self)
        totals = calculator.calculate_totals()
        return totals['item_count']

    def calculate_subtotal(self):
        """
        Calculate subtotal from all cart items.
        Uses base product prices (no location-specific pricing yet).

        Delegates to OrderCalculator (DRY principle).
        """
        from orders.calculators import OrderCalculator
        calculator = OrderCalculator(self)
        return calculator.calculate_subtotal()

    def calculate_tax(self):
        """
        Calculate tax based on location's tax rate.
        Returns 0 if no location selected yet.

        Delegates to OrderCalculator (DRY principle).
        """
        from orders.calculators import OrderCalculator
        calculator = OrderCalculator(self)
        return calculator.calculate_tax()

    def calculate_grand_total(self):
        """
        Calculate grand total (subtotal + tax).
        Tax is 0 if no location selected.

        Delegates to OrderCalculator (DRY principle).
        """
        from orders.calculators import OrderCalculator
        calculator = OrderCalculator(self)
        return calculator.calculate_grand_total()

    def get_totals(self):
        """
        Get all calculated totals for this cart (FOOD COST ONLY).

        Returns dict with subtotal, tax, and grand_total.

        IMPORTANT: This does NOT include tips or surcharges.
        To preview final payment amount:
        1. Call this method to get grand_total (food cost + tax)
        2. Call POST /api/payments/calculate-surcharge/ with {"amount": grand_total}
        3. Add customer's tip (if any) to get final amount_to_collect

        Example flow:
            cart_totals = cart.get_totals()  # {'grand_total': 100.00}
            surcharge = call_api('/api/payments/calculate-surcharge/', {'amount': 100.00})  # {'surcharge': 3.24}
            tip = 15.00  # Customer-entered tip
            final_total = cart_totals['grand_total'] + surcharge['surcharge'] + tip  # 118.24

        This matches your split payment architecture:
        - Order.grand_total = subtotal - discounts + tax (FOOD ONLY)
        - PaymentTransaction.surcharge = calculated per payment method
        - PaymentTransaction.tip = customer's tip
        - Payment.total_collected = sum(all transactions)

        Delegates to OrderCalculator (DRY principle).
        """
        from orders.calculators import OrderCalculator
        calculator = OrderCalculator(self)
        return calculator.calculate_totals()

    def touch(self):
        """Update last_activity timestamp."""
        self.last_activity = timezone.now()
        self.save(update_fields=['last_activity', 'updated_at'])

    def is_abandoned(self, hours=24):
        """Check if cart has been inactive for specified hours."""
        threshold = timezone.now() - timezone.timedelta(hours=hours)
        return self.last_activity < threshold

    def merge_into(self, target_cart):
        """
        Merge this cart's items into another cart (guest → user conversion).
        Deletes this cart after merge.
        """
        for item in self.items.all():
            existing_item = target_cart.items.filter(product=item.product).first()
            if existing_item:
                existing_item.quantity += item.quantity
                existing_item.save()
            else:
                item.cart = target_cart
                item.save()

        self.delete()


class CartItem(models.Model):
    """
    Individual item in a cart.
    NO price snapshot - prices calculated dynamically.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='cart_items'
    )
    cart = models.ForeignKey(
        Cart,
        on_delete=models.CASCADE,
        related_name='items'
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='cart_items'
    )
    quantity = models.PositiveIntegerField(default=1)
    notes = models.TextField(
        blank=True,
        help_text="Customer notes (e.g., 'no onions')"
    )

    added_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['added_at']
        indexes = [
            models.Index(fields=['tenant', 'cart']),
            models.Index(fields=['tenant', 'product']),
        ]
        constraints = [
            # One entry per product per cart
            # (Different modifier combinations will be same CartItem with multiple CartItemModifiers)
            models.UniqueConstraint(
                fields=['tenant', 'cart', 'product'],
                name='unique_product_per_cart'
            ),
        ]

    def __str__(self):
        return f"{self.quantity}x {self.product.name}"

    def get_base_price(self):
        """
        Get base price for this product.

        Future: Check ProductLocationPrice if cart.store_location is set.
        For now: Returns product.price
        """
        # TODO: Add location-specific pricing lookup when ProductLocationPrice model is created
        # if self.cart.store_location:
        #     location_price = ProductLocationPrice.objects.filter(
        #         product=self.product,
        #         store_location=self.cart.store_location
        #     ).first()
        #     if location_price:
        #         return location_price.price_override

        return self.product.price

    def get_modifiers_total(self):
        """Calculate total price from all modifiers."""
        return sum(
            mod.modifier_option.price_delta * mod.quantity
            for mod in self.modifiers.all()
        )

    def get_item_price(self):
        """Get price for one item (base + modifiers)."""
        return self.get_base_price() + self.get_modifiers_total()

    def get_total_price(self):
        """Get total price for this cart item (item_price * quantity)."""
        return self.get_item_price() * self.quantity

    def save(self, *args, **kwargs):
        """Touch cart on save."""
        super().save(*args, **kwargs)
        self.cart.touch()

    def delete(self, *args, **kwargs):
        """Touch cart on delete."""
        cart = self.cart
        super().delete(*args, **kwargs)
        cart.touch()


class CartItemModifier(models.Model):
    """
    Modifier selections for a cart item.
    References live ModifierOption (no snapshot).

    Converted to OrderItemModifier (snapshot) when cart becomes order.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        'tenant.Tenant',
        on_delete=models.CASCADE,
        related_name='cart_item_modifiers'
    )
    cart_item = models.ForeignKey(
        CartItem,
        on_delete=models.CASCADE,
        related_name='modifiers'
    )
    modifier_option = models.ForeignKey(
        ModifierOption,
        on_delete=models.CASCADE,
        related_name='cart_item_modifiers',
        help_text='Live reference to modifier option (no snapshot)'
    )
    quantity = models.PositiveIntegerField(
        default=1,
        help_text='Quantity of this modifier (e.g., "extra cheese" = 2)'
    )

    added_at = models.DateTimeField(auto_now_add=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        indexes = [
            models.Index(fields=['tenant', 'cart_item']),
            models.Index(fields=['tenant', 'modifier_option']),
        ]
        constraints = [
            # One entry per modifier option per cart item
            models.UniqueConstraint(
                fields=['tenant', 'cart_item', 'modifier_option'],
                name='unique_modifier_per_cart_item'
            ),
        ]

    def __str__(self):
        qty_str = f" ({self.quantity}x)" if self.quantity > 1 else ""
        return f"{self.modifier_option.modifier_set.name}: {self.modifier_option.name}{qty_str}"

    @property
    def total_price(self):
        """Total price for this modifier (price_delta * quantity)."""
        return self.modifier_option.price_delta * self.quantity
