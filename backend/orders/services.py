from decimal import Decimal
from django.db import transaction
from .models import Order, OrderItem, OrderDiscount, OrderItemModifier
from products.models import Product, ModifierOption
from users.models import User
from discounts.services import DiscountService
from discounts.models import Discount
from products.services import ModifierValidationService
from core_backend.infrastructure.cache_utils import cache_session_data, cache_static_data
import hashlib
import logging
import time

logger = logging.getLogger(__name__)

class OrderService:
    
    @staticmethod
    @cache_static_data(timeout=3600*4)  # 4 hours - tax calculations don't change often
    def get_tax_calculation_matrix():
        """Cache tax calculations for common price ranges"""
        from settings.config import app_settings
        
        # Pre-calculate tax amounts for common price ranges
        tax_rate = app_settings.tax_rate
        price_ranges = [1, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200]
        
        tax_matrix = {}
        for price in price_ranges:
            price_decimal = Decimal(str(price))
            tax_amount = price_decimal * Decimal(str(tax_rate))
            tax_matrix[price] = {
                'tax_amount': float(tax_amount.quantize(Decimal("0.01"))),
                'total_with_tax': float((price_decimal + tax_amount).quantize(Decimal("0.01")))
            }
        
        return {
            'tax_rate': float(tax_rate),
            'matrix': tax_matrix,
            'last_updated': str(app_settings.tax_rate)  # Use as cache key
        }
    
    @staticmethod
    @cache_session_data(timeout=300)  # 5 minutes for active order calculations
    def get_cached_order_totals(order_items_hash, discounts_hash, tax_rate_hash):
        """
        Cache order calculation patterns during active editing.
        This caches the calculation logic, not specific order data.
        """
        # This would be called with a hash of order composition
        # to cache calculations for similar order patterns
        cache_key = f"order_calc_{order_items_hash}_{discounts_hash}_{tax_rate_hash}"
        
        # Return calculation patterns that can be reused
        return {
            'calculation_cached': True,
            'cache_key': cache_key,
            'patterns': {
                'tax_calculation_available': True,
                'discount_calculation_available': True
            }
        }
    
    @staticmethod
    def calculate_order_hash(order):
        """Generate a hash for order composition to enable calculation caching"""
        try:
            # Create a hash based on order composition, not specific values
            order_composition = []
            
            for item in order.items.all():
                item_data = f"{item.product_id}:{item.quantity}:{len(item.modifiers.all())}"
                order_composition.append(item_data)
            
            # Add discount info
            discount_data = "|".join([str(d.discount_id) for d in order.applied_discounts.all()])
            
            # Create hash
            composition_string = "|".join(sorted(order_composition)) + f"|{discount_data}"
            return hashlib.md5(composition_string.encode()).hexdigest()[:12]
            
        except Exception:
            # If hashing fails, return a default
            return "no_cache"

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
        order: Order, product: Product, quantity: int, selected_modifiers: list = None, notes: str = "", force_add: bool = False
    ) -> OrderItem:
        if order.status not in [Order.OrderStatus.PENDING, Order.OrderStatus.HOLD]:
            raise ValueError(
                "Cannot add items to an order that is not Pending or on Hold."
            )

        selected_modifiers = selected_modifiers or []
        logger.debug(f"add_item_to_order called with product_id: {product.id}, modifier_count: {len(selected_modifiers)}")

        # Skip validation if force_add is True
        if not force_add:
            # Check max quantity per item limit from ProductType
            pt = product.product_type
            if pt and pt.max_quantity_per_item:
                from django.db.models import Sum
                # Get current quantity of this specific product in the order
                current_quantity = OrderItem.objects.filter(
                    order=order,
                    product=product
                ).aggregate(total=Sum('quantity'))['total'] or 0

                total_after_add = current_quantity + quantity
                if total_after_add > pt.max_quantity_per_item:
                    raise ValueError(
                        f"Cannot add {quantity} of '{product.name}'. "
                        f"Maximum {pt.max_quantity_per_item} per order. "
                        f"Currently have {current_quantity} in order."
                    )
            option_ids = [mod.get('option_id') for mod in selected_modifiers if mod.get('option_id')]
            ModifierValidationService.validate_product_selection(product, option_ids)
            
            # Stock validation - check if product is available
            from inventory.services import InventoryService
            from settings.config import app_settings
            
            # Only validate stock for products that track inventory
            if product.track_inventory:
                try:
                    default_location = app_settings.get_default_location()
                    from django.conf import settings as dj_settings

                    # When policy is enabled, use policy-aware stock checking with cumulative enforcement
                    if getattr(dj_settings, 'USE_PRODUCT_TYPE_POLICY', False):
                        pt = product.product_type
                        behavior = getattr(pt, 'inventory_behavior', 'QUANTITY')
                        enforcement = getattr(pt, 'stock_enforcement', 'BLOCK')

                        # NONE behavior: always allow (no stock validation)
                        if behavior == 'NONE':
                            pass  # Skip all stock validation
                        # IGNORE enforcement: always allow (regardless of stock)
                        elif enforcement == 'IGNORE':
                            pass  # Skip all stock validation
                        # WARN enforcement: always allow (could add warning logging here)
                        elif enforcement == 'WARN':
                            pass  # Skip stock validation, item will be added
                        # BLOCK enforcement: enforce stock limits
                        elif enforcement == 'BLOCK':
                            from django.db.models import Sum
                            # How many of this product are already reserved in this order?
                            reserved = OrderItem.objects.filter(order=order, product=product).aggregate(total=Sum('quantity'))['total'] or 0
                            stock_level = InventoryService.get_stock_level(product, default_location)
                            # Work with Decimal for consistency
                            available_to_add = Decimal(str(stock_level)) - Decimal(str(reserved))
                            if Decimal(str(quantity)) > available_to_add:
                                if available_to_add <= 0:
                                    raise ValueError(f"'{product.name}' is out of stock. No items available.")
                                else:
                                    raise ValueError(f"'{product.name}' has low stock. Only {available_to_add} items available, but {quantity} requested.")
                    else:
                        # Legacy: check only the requested chunk against stock
                        is_available = InventoryService.check_stock_availability(product, default_location, quantity)
                        if not is_available:
                            stock_level = InventoryService.get_stock_level(product, default_location)
                            if stock_level <= 0:
                                raise ValueError(f"'{product.name}' is out of stock. No items available.")
                            else:
                                raise ValueError(f"'{product.name}' has low stock. Only {stock_level} items available, but {quantity} requested.")
                    
                except AttributeError:
                    # If InventoryService methods don't exist, fall back to basic stock level check
                    from inventory.models import InventoryStock
                    try:
                        default_location = app_settings.get_default_location()
                        stock = InventoryStock.objects.get(product=product, location=default_location)
                        if stock.quantity < quantity:
                            if stock.quantity <= 0:
                                raise ValueError(f"'{product.name}' is out of stock. No items available.")
                            else:
                                raise ValueError(f"'{product.name}' has low stock. Only {stock.quantity} items available, but {quantity} requested.")
                    except InventoryStock.DoesNotExist:
                        # No stock record exists - treat as out of stock
                        raise ValueError(f"'{product.name}' is out of stock. No stock record found.")

        # Calculate price with modifiers
        modifier_price_delta = Decimal('0.00')
        for modifier_data in selected_modifiers:
            option_id = modifier_data.get('option_id')
            mod_quantity = modifier_data.get('quantity', 1)
            if option_id:
                try:
                    modifier_option = ModifierOption.objects.get(id=option_id)
                    modifier_price_delta += modifier_option.price_delta * mod_quantity
                except ModifierOption.DoesNotExist:
                    continue

        final_price_at_sale = Decimal(str(product.price)) + modifier_price_delta

        # Enhanced item creation logic for individual variations
        variation_group = product.name.lower().replace(' ', '_').replace('-', '_')
        
        # For items with modifiers, create individual entries for each quantity
        if selected_modifiers and len(selected_modifiers) > 0:
            # Find the next sequence number for this product in this order
            existing_count = OrderItem.objects.filter(
                order=order, 
                product=product
            ).count()
            
            # Create individual items for each quantity requested
            created_items = []
            for i in range(quantity):
                individual_item = OrderItem.objects.create(
                    order=order,
                    product=product,
                    quantity=1,  # Always 1 for modified items
                    price_at_sale=final_price_at_sale,
                    notes=notes,
                    item_sequence=existing_count + i + 1,
                    variation_group=variation_group,
                )
                created_items.append(individual_item)
            
            # Return the first created item for backwards compatibility
            order_item = created_items[0] if created_items else None
        else:
            # For items without modifiers, check if we can merge with existing
            existing_item = OrderItem.objects.filter(
                order=order, 
                product=product, 
                notes=notes,
                selected_modifiers_snapshot__isnull=True
            ).first()
            
            if existing_item:
                # Update existing item quantity
                existing_item.quantity += quantity
                existing_item.save()
                order_item = existing_item
            else:
                # Create new item without modifiers
                existing_count = OrderItem.objects.filter(
                    order=order, 
                    product=product
                ).count()
                
                order_item = OrderItem.objects.create(
                    order=order,
                    product=product,
                    quantity=quantity,
                    price_at_sale=final_price_at_sale,
                    notes=notes,
                    item_sequence=existing_count + 1,
                    variation_group=variation_group,
                )

        # Create snapshot records for the selected modifiers
        # Handle both individual items (with modifiers) and regular items
        items_to_add_modifiers = []
        if selected_modifiers and len(selected_modifiers) > 0:
            # For items with modifiers, add to all created individual items
            if 'created_items' in locals():
                items_to_add_modifiers = created_items
            else:
                items_to_add_modifiers = [order_item] if order_item else []
        else:
            # For items without modifiers, just add to the single item
            items_to_add_modifiers = [order_item] if order_item else []
        
        # Create modifiers for each item that needs them
        for item in items_to_add_modifiers:
            for modifier_data in selected_modifiers:
                option_id = modifier_data.get('option_id')
                mod_quantity = modifier_data.get('quantity', 1)
                logger.debug(f"Processing modifier - option_id: {option_id}, quantity: {mod_quantity}")
                if option_id:
                    try:
                        modifier_option = ModifierOption.objects.select_related('modifier_set').get(id=option_id)
                        logger.debug(f"Found modifier option_id: {modifier_option.id}")
                        created_modifier = OrderItemModifier.objects.create(
                            order_item=item,
                            modifier_set_name=modifier_option.modifier_set.name,
                            option_name=modifier_option.name,
                            price_at_sale=modifier_option.price_delta,
                            quantity=mod_quantity
                        )
                        logger.debug(f"Created OrderItemModifier: {created_modifier}")
                    except ModifierOption.DoesNotExist:
                        logger.warning(f"ModifierOption with id {option_id} not found")
                        continue

        OrderService.recalculate_order_totals(order)
        return order_item

    @staticmethod
    @transaction.atomic
    def add_custom_item_to_order(
        order: Order, name: str, price: Decimal, quantity: int = 1, notes: str = ""
    ) -> OrderItem:
        """
        Add a custom item (no product reference) to an order.
        Used for miscellaneous charges that aren't in the product catalog.
        """
        if order.status not in [Order.OrderStatus.PENDING, Order.OrderStatus.HOLD]:
            raise ValueError(
                "Cannot add items to an order that is not Pending or on Hold."
            )

        if not name:
            raise ValueError("Custom item name is required")

        if price <= 0:
            raise ValueError("Custom item price must be greater than 0")

        # Create the custom item
        order_item = OrderItem.objects.create(
            order=order,
            product=None,  # No product reference for custom items
            custom_name=name,
            custom_price=price,
            quantity=quantity,
            price_at_sale=price,  # Use the custom price as price_at_sale
            notes=notes,
            item_sequence=1,  # Custom items don't need sequence tracking
        )

        OrderService.recalculate_order_totals(order)
        return order_item

    @staticmethod
    def group_items_for_kitchen(order_items):
        """
        Group order items by variation_group for kitchen display
        Returns dict with group_name -> list of items
        """
        grouped = {}
        # FIX: This method expects order_items to already have select_related('product')
        # applied by the caller to prevent N+1 queries
        for item in order_items:
            if item.product:
                group_key = item.variation_group or item.product.name.lower().replace(' ', '_')
            else:
                # Custom items get their own group
                group_key = f"custom_{item.custom_name.lower().replace(' ', '_')}"
            if group_key not in grouped:
                grouped[group_key] = []
            grouped[group_key].append(item)
        
        # Sort items within each group by sequence
        for group_items in grouped.values():
            group_items.sort(key=lambda x: x.item_sequence)
        
        return grouped

    @staticmethod
    def format_kitchen_receipt(order):
        """
        Generate kitchen-optimized receipt format
        """
        # FIX: Add select_related to prevent N+1 queries when accessing item.product.name
        items_with_product = order.items.select_related('product').all()
        grouped_items = OrderService.group_items_for_kitchen(items_with_product)
        
        receipt_lines = []
        receipt_lines.append(f"ORDER #{order.order_number}")
        if hasattr(order, 'table_number') and order.table_number:
            receipt_lines.append(f"Table {order.table_number}")
        receipt_lines.append("=" * 32)
        receipt_lines.append("")
        
        for group_name, items in grouped_items.items():
            # Access pre-fetched product name (no additional query needed)
            # Handle both product items and custom items
            first_item = items[0]
            if first_item.product:
                product_name = first_item.product.name.upper()
            else:
                product_name = (first_item.custom_name or 'CUSTOM ITEM').upper()
            
            if len(items) > 1:
                # Multiple variations
                receipt_lines.append(f"{len(items)}x {product_name}")
                for item in items:
                    modifiers_text = OrderService._format_modifiers_for_kitchen(item)
                    price_text = f"${item.price_at_sale:.2f}" if len(items) > 1 else ""
                    receipt_lines.append(f"├─ #{item.item_sequence}: {modifiers_text} {price_text}".strip())
                    
                    if item.kitchen_notes:
                        receipt_lines.append(f"   Note: {item.kitchen_notes}")
            else:
                # Single item
                item = items[0]
                modifiers_text = OrderService._format_modifiers_for_kitchen(item)
                if modifiers_text != "Standard":
                    receipt_lines.append(f"1x {product_name}")
                    receipt_lines.append(f"└─ {modifiers_text}")
                else:
                    receipt_lines.append(f"1x {product_name}")
                
                if item.kitchen_notes:
                    receipt_lines.append(f"   Note: {item.kitchen_notes}")
            
            receipt_lines.append("")  # Blank line between groups
        
        receipt_lines.append("=" * 32)
        return '\n'.join(receipt_lines)

    @staticmethod
    def _format_modifiers_for_kitchen(item):
        """Format modifiers in kitchen-friendly way"""
        if not hasattr(item, 'selected_modifiers_snapshot') or not item.selected_modifiers_snapshot.exists():
            return "Standard"
        
        modifiers = []
        for mod in item.selected_modifiers_snapshot.all():
            mod_text = mod.option_name
            if mod.quantity > 1:
                mod_text += f" ({mod.quantity}x)"
            modifiers.append(mod_text)
        
        return ", ".join(modifiers) if modifiers else "Standard"

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
        - Updates order surcharges_total from payment data.
        - Triggers inventory deduction.
        """
        if order.status not in [Order.OrderStatus.PENDING, Order.OrderStatus.HOLD]:
            raise ValueError("Only PENDING or HOLD orders can be completed.")

        # Update order surcharges from payment data
        if hasattr(order, 'payment_details') and order.payment_details:
            order.surcharges_total = order.payment_details.total_surcharges

        order.payment_status = Order.PaymentStatus.PAID
        order.status = Order.OrderStatus.COMPLETED
        order.save(update_fields=["status", "payment_status", "surcharges_total", "updated_at"])

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
        # FIX: Access already pre-fetched product data (no additional queries needed)
        for item in source_order.items.all():
            OrderItem.objects.create(
                order=new_order,
                product=item.product,
                quantity=item.quantity,
                price_at_sale=item.product.price,  # Use current price from pre-fetched data
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
    def hold_order(order: Order) -> Order:
        """Sets an order's status to HOLD after checking transition validity."""
        return OrderService.update_order_status(order, Order.OrderStatus.HOLD)

    @staticmethod
    @transaction.atomic
    def update_customer_info(order: Order, data: dict) -> Order:
        """
        Updates an order with customer information.
        If the user is a guest, it populates the guest fields.
        If the user is authenticated, it ensures their primary details are stored
        for the order record, but does not modify the User model itself.
        """
        if order.customer:
            # For authenticated users, prioritize form data over profile data
            # This allows users to modify their info for this specific order
            order.guest_first_name = (
                data.get("guest_first_name") or order.customer.first_name
            )
            order.guest_last_name = (
                data.get("guest_last_name") or order.customer.last_name
            )
            order.guest_email = data.get("guest_email") or order.customer.email
            order.guest_phone = data.get("guest_phone") or getattr(
                order.customer, "phone_number", ""
            )
        else:
            # For guest users, directly update the guest fields
            order.guest_first_name = data.get("guest_first_name")
            order.guest_last_name = data.get("guest_last_name")
            order.guest_email = data.get("guest_email")
            order.guest_phone = data.get("guest_phone")

        order.save()
        return order


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
    def apply_discount_to_order_by_code(order: Order, code: str):
        """
        Applies a discount to an order by its code, delegating to the DiscountService.
        """
        try:
            discount = Discount.objects.get(code__iexact=code)
            DiscountService.apply_discount_to_order(order, discount)
        except Discount.DoesNotExist:
            raise ValueError("Invalid discount code.")
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
        Surcharges are excluded from cart totals and only calculated during payment.
        """
        start_time = time.monotonic()

        # Import app_settings locally to ensure we always get the fresh configuration
        # This avoids Python's module-level import caching that could cause stale config
        from settings.config import app_settings

        # Re-fetch the full order context to ensure data is fresh
        # FIX: Add select_related for product to prevent N+1 queries when accessing item.product.price
        original_order_reference = order
        order = Order.objects.prefetch_related(
            "items__product__taxes", "applied_discounts__discount"
        ).select_related().get(id=order.id)
        setattr(original_order_reference, "_recalculated_order_instance", order)

        # Pre-fetch items with related data to prevent N+1 queries
        # Note: Some items may not have products (custom items), so we use nullable relations
        items_queryset = order.items.select_related("product", "product__product_type").prefetch_related("product__taxes").all()
        items = list(items_queryset)
        item_count = len(items)

        # 1. Calculate the pre-discount subtotal from all items
        # FIX: Use pre-fetched items to prevent additional queries
        order.subtotal = sum(item.total_price for item in items)

        # 2. Recalculate the value of all applied discounts based on the fresh subtotal
        total_discount_amount = Decimal("0.00")
        from discounts.factories import DiscountStrategyFactory

        applied_discounts = list(order.applied_discounts.all())
        if applied_discounts:
            for order_discount in applied_discounts:
                strategy = DiscountStrategyFactory.get_strategy(order_discount.discount)
                calculated_amount = strategy.apply(order, order_discount.discount)
                if calculated_amount != order_discount.amount:
                    order_discount.amount = calculated_amount
                    order_discount.save()
                total_discount_amount += calculated_amount
        order.total_discounts_amount = total_discount_amount

        # 3. Determine the base for tax calculations (subtotal AFTER discounts)
        post_discount_subtotal = order.subtotal - order.total_discounts_amount

        # 4. Surcharges are NOT calculated here - only during payment processing
        # Keep surcharges_total at 0 for cart operations
        order.surcharges_total = Decimal("0.00")

        # 5. Calculate tax based on the discounted price of each item (without surcharges)
        tax_total = Decimal("0.00")
        if order.subtotal > 0:
            proportional_discount_rate = order.total_discounts_amount / order.subtotal
            # FIX: Use pre-fetched items to prevent N+1 queries when accessing item.product.taxes
            for item in items:
                discounted_item_price = item.total_price * (
                    Decimal("1.0") - proportional_discount_rate
                )

                if item.product:
                    # Check if product type has tax_inclusive flag set
                    product_type = item.product.product_type
                    if product_type and product_type.tax_inclusive:
                        # Tax is already included in the product price, don't calculate additional tax
                        continue

                    # Access pre-fetched taxes to prevent additional queries
                    product_taxes = item.product.taxes.all()
                    if product_taxes:
                        # Use product-specific taxes if defined
                        for tax in product_taxes:
                            tax_total += discounted_item_price * (
                                tax.rate / Decimal("100.0")
                            )
                    else:
                        # Feature-flagged: consider product type default taxes
                        from django.conf import settings as dj_settings
                        if getattr(dj_settings, 'USE_PRODUCT_TYPE_POLICY', False):
                            try:
                                from products.policies import ProductTypePolicy
                                type_taxes = list(ProductTypePolicy.get_applicable_taxes(item.product))
                            except Exception:
                                type_taxes = []
                            if type_taxes:
                                for tax in type_taxes:
                                    tax_total += discounted_item_price * (
                                        tax.rate / Decimal("100.0")
                                    )
                            else:
                                tax_total += discounted_item_price * Decimal(str(app_settings.tax_rate))
                        else:
                            # Legacy: use global tax rate
                            tax_total += discounted_item_price * Decimal(str(app_settings.tax_rate))
                else:
                    # Custom items use the default tax rate from settings
                    tax_total += discounted_item_price * Decimal(str(app_settings.tax_rate))

        order.tax_total = tax_total.quantize(Decimal("0.01"))

        # 6. Calculate the final grand total (WITHOUT surcharges for cart view)
        # Surcharges will be calculated separately during payment processing
        order.grand_total = post_discount_subtotal + order.tax_total

        order.save(
            update_fields=[
                "subtotal",
                "total_discounts_amount",
                "surcharges_total",
                "tax_total",
                "grand_total",
                "updated_at",
            ]
        )

        elapsed_ms = (time.monotonic() - start_time) * 1000
        discount_count = len(applied_discounts)
        logger.info(
            "OrderService.recalculate_order_totals order_id=%s items=%d discounts=%d elapsed_ms=%.2f",
            order.id,
            item_count,
            discount_count,
            elapsed_ms,
        )

        return order

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
    def update_item_quantity(order_item: 'OrderItem', new_quantity: int):
        """
        Updates the quantity of an existing order item with policy-aware stock validation.

        Args:
            order_item: The OrderItem to update
            new_quantity: The new quantity (must be > 0)

        Raises:
            ValueError: If stock validation fails or quantity is invalid
        """
        if new_quantity <= 0:
            raise ValueError("Quantity must be greater than 0")

        current_quantity = order_item.quantity
        if new_quantity == current_quantity:
            return  # No change needed

        # Only validate stock if increasing quantity and product tracks inventory
        if new_quantity > current_quantity and order_item.product and order_item.product.track_inventory:
            additional_quantity = new_quantity - current_quantity

            try:
                from inventory.services import InventoryService
                from settings.config import app_settings
                from django.conf import settings as dj_settings

                default_location = app_settings.get_default_location()

                # When policy is enabled, use policy-aware stock checking with cumulative enforcement
                if getattr(dj_settings, 'USE_PRODUCT_TYPE_POLICY', False):
                    pt = order_item.product.product_type
                    behavior = getattr(pt, 'inventory_behavior', 'QUANTITY')
                    enforcement = getattr(pt, 'stock_enforcement', 'BLOCK')

                    # NONE behavior: always allow (no stock validation)
                    if behavior == 'NONE':
                        pass  # Skip all stock validation
                    # IGNORE enforcement: always allow (regardless of stock)
                    elif enforcement == 'IGNORE':
                        pass  # Skip all stock validation
                    # WARN enforcement: always allow (could add warning logging here)
                    elif enforcement == 'WARN':
                        pass  # Skip stock validation, item will be updated
                    # BLOCK enforcement: enforce stock limits with cumulative checking
                    elif enforcement == 'BLOCK':
                        from django.db.models import Sum
                        # How many of this product are already reserved in this order?
                        reserved = OrderItem.objects.filter(
                            order=order_item.order,
                            product=order_item.product
                        ).aggregate(total=Sum('quantity'))['total'] or 0

                        stock_level = InventoryService.get_stock_level(order_item.product, default_location)
                        # Work with Decimal for consistency
                        available_to_add = Decimal(str(stock_level)) - Decimal(str(reserved))

                        if Decimal(str(additional_quantity)) > available_to_add:
                            if available_to_add <= 0:
                                raise ValueError(f"'{order_item.product.name}' is out of stock. No items available.")
                            else:
                                raise ValueError(f"'{order_item.product.name}' has low stock. Only {available_to_add} items available to add.")
                else:
                    # Legacy: check only the additional quantity against stock
                    is_available = InventoryService.check_stock_availability(
                        order_item.product, default_location, additional_quantity
                    )
                    if not is_available:
                        stock_level = InventoryService.get_stock_level(order_item.product, default_location)
                        if stock_level <= 0:
                            raise ValueError(f"'{order_item.product.name}' is out of stock. No items available.")
                        else:
                            raise ValueError(f"'{order_item.product.name}' has low stock. Only {stock_level} items available.")

            except AttributeError:
                # If InventoryService methods don't exist, fall back to basic check
                logger.warning(f"InventoryService methods not available for stock validation")

        # Update the quantity
        order_item.quantity = new_quantity
        order_item.save()

        # Recalculate order totals
        OrderService.recalculate_order_totals(order_item.order)

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
                logger.info(f"Order #{order.id}: Grand total updated due to configuration change")

        logger.info(f"Recalculated {count} in-progress orders due to configuration change")
        return count

    @staticmethod
    @transaction.atomic
    def mark_items_sent_to_kitchen(order_id):
        """
        Mark all items in an order as sent to kitchen (sets kitchen_printed_at timestamp).
        Only updates items that haven't been marked yet.
        """
        from django.utils import timezone
        
        order = Order.objects.get(id=order_id)
        items_to_update = order.items.filter(kitchen_printed_at__isnull=True)
        
        now = timezone.now()
        updated_count = items_to_update.update(kitchen_printed_at=now)
        
        return updated_count


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
        Retrieves all non-completed guest orders associated with a given email address.
        This is useful for allowing users to claim their past orders after creating an account.
        """
        return Order.objects.filter(
            guest_email__iexact=email,
            customer__isnull=True,
            status=Order.OrderStatus.PENDING,
        )


class WebOrderNotificationService:
    """
    Singleton service for handling web order notifications, including sound alerts and auto-printing.
    This service is designed to be called from a signal when a web order is completed.
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def handle_web_order_completion(self, order):
        """
        Main handler for web order completion. This is the primary entry point.
        It checks global settings and then orchestrates notifications and printing.
        """
        from settings.config import app_settings

        config = app_settings.get_web_order_config()
        if not config.get("notifications_enabled"):
            return

        # Determine the target store location for the notification.
        target_location = self._determine_target_location(order)
        if not target_location:
            logger.warning(f"Could not determine target location for web order {order.id}. No notification sent.")
            return

        # Broadcast a real-time notification to all terminals at the target location.
        self._broadcast_notification(order, target_location)

        # Trigger auto-printing jobs if enabled in settings.
        self._trigger_auto_printing(order, target_location, config)

    def _determine_target_location(self, order):
        """Determine which StoreLocation should handle this web order."""
        from settings.config import app_settings

        # For now, all web orders are routed to the default store location.
        # Future logic could inspect the order (e.g., for a specific pickup location)
        # to route it to a different StoreLocation.
        return app_settings.get_default_store_location()

    def _broadcast_notification(self, order, target_location):
        """Broadcast web order notification to terminals at the target location."""
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        channel_layer = get_channel_layer()
        if not channel_layer:
            logger.warning("Channel layer not available. Cannot send web order notification.")
            return

        # The group name is based on the primary key of the StoreLocation.
        group_name = f"location_{target_location.id}_notifications"

        # Prepare a serializable payload with essential order details.
        # Ensure all values are simple types (str, int, bool).
        payload = {
            "type": "web_order_notification",
            "order_data": {
                "id": str(order.id),
                "order_number": order.order_number,
                "customer_name": (
                    order.customer.get_full_name()
                    if order.customer
                    else f"{order.guest_first_name} {order.guest_last_name}".strip()
                ),
                "total": str(order.grand_total),
                "item_count": order.items.count(),
                "created_at": order.created_at.isoformat(),
            },
        }

        logger.debug(f"Broadcasting to group: {group_name}")
        async_to_sync(channel_layer.group_send)(group_name, payload)

    def _trigger_auto_printing(self, order, target_location, config):
        """
        Sends auto-print jobs to terminals at the target location.
        The actual printing is handled by the frontend, which listens for these events.
        """
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        if not config.get("auto_print_receipt") and not config.get(
            "auto_print_kitchen"
        ):
            return

        channel_layer = get_channel_layer()
        if not channel_layer:
            logger.warning("Channel layer not available. Cannot send auto-print jobs.")
            return

        group_name = f"location_{target_location.id}_printing"
        logger.debug(f"Sending print jobs to group: {group_name}")

        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "auto_print_job",
                "order_id": str(order.id),
                "print_receipt": config.get("auto_print_receipt", False),
                "print_kitchen": config.get("auto_print_kitchen", False),
            },
        )


# Create a single, globally accessible instance of the service.
web_order_notification_service = WebOrderNotificationService()
