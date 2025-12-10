from decimal import Decimal
from django.db import transaction
from django.db.models import F, Sum
import logging

from orders.models import Order, OrderItem, OrderItemModifier
from products.models import Product, ModifierOption
from products.services import ModifierValidationService

logger = logging.getLogger(__name__)


class OrderItemService:
    """Service for managing order items - adding, updating, removing."""

    @staticmethod
    @transaction.atomic
    def add_item_to_order(
        order: Order, product: Product, quantity: int, selected_modifiers: list = None, notes: str = "", force_add: bool = False
    ) -> OrderItem:
        """
        Add a product item to an order with modifiers and validation.

        Args:
            order: Order instance
            product: Product to add
            quantity: Quantity to add
            selected_modifiers: List of modifier dicts with option_id and quantity
            notes: Optional notes for the item
            force_add: Skip validation (used for migrations/imports)

        Returns:
            OrderItem: The created or updated order item
        """
        from orders.services.calculation_service import OrderCalculationService

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

            # Only validate stock for products that track inventory
            if product.track_inventory:
                try:
                    # Get inventory location from order's store location
                    inventory_location = order.store_location.default_inventory_location
                    if not inventory_location:
                        raise ValueError(f"No default inventory location configured for store location '{order.store_location.name}'")

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
                            # How many of this product are already reserved in this order?
                            reserved = OrderItem.objects.filter(order=order, product=product).aggregate(total=Sum('quantity'))['total'] or 0
                            stock_level = InventoryService.get_stock_level(product, inventory_location)
                            # Work with Decimal for consistency
                            available_to_add = Decimal(str(stock_level)) - Decimal(str(reserved))
                            if Decimal(str(quantity)) > available_to_add:
                                if available_to_add <= 0:
                                    raise ValueError(f"'{product.name}' is out of stock. No items available.")
                                else:
                                    raise ValueError(f"'{product.name}' has low stock. Only {available_to_add} items available, but {quantity} requested.")
                    else:
                        # Legacy: check only the requested chunk against stock
                        is_available = InventoryService.check_stock_availability(product, inventory_location, quantity)
                        if not is_available:
                            stock_level = InventoryService.get_stock_level(product, inventory_location)
                            if stock_level <= 0:
                                raise ValueError(f"'{product.name}' is out of stock. No items available.")
                            else:
                                raise ValueError(f"'{product.name}' has low stock. Only {stock_level} items available, but {quantity} requested.")

                except AttributeError:
                    # If InventoryService methods don't exist, fall back to basic stock level check
                    from inventory.models import InventoryStock
                    try:
                        inventory_location = order.store_location.default_inventory_location
                        if not inventory_location:
                            raise ValueError(f"No default inventory location configured for store location '{order.store_location.name}'")
                        stock = InventoryStock.objects.get(product=product, location=inventory_location)
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
                    tenant=order.tenant
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
                # CRITICAL FIX: Use atomic F() expression to prevent race condition
                # This prevents lost updates when multiple requests try to add items simultaneously
                OrderItem.objects.filter(id=existing_item.id).update(
                    quantity=F('quantity') + quantity
                )
                existing_item.refresh_from_db()
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
                    tenant=order.tenant
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
                            quantity=mod_quantity,
                            tenant=order.tenant
                        )
                        logger.debug(f"Created OrderItemModifier: {created_modifier}")
                    except ModifierOption.DoesNotExist:
                        logger.warning(f"ModifierOption with id {option_id} not found")
                        continue

        OrderCalculationService.recalculate_order_totals(order)
        return order_item

    @staticmethod
    @transaction.atomic
    def add_custom_item_to_order(
        order: Order, name: str, price: Decimal, quantity: int = 1, notes: str = "", tax_exempt: bool = False, applied_by=None
    ) -> OrderItem:
        """
        Add a custom item (no product reference) to an order.
        Used for miscellaneous charges that aren't in the product catalog.

        Args:
            order: The order to add the item to
            name: Name of the custom item
            price: Price of the custom item
            quantity: Quantity to add (default: 1)
            notes: Optional notes for the item
            tax_exempt: If True, creates a TAX_EXEMPT adjustment for this item
        """
        from orders.services.calculation_service import OrderCalculationService
        from orders.models import OrderAdjustment

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
            tenant=order.tenant
        )

        # If tax exempt, create an item-level TAX_EXEMPT adjustment
        if tax_exempt:
            OrderAdjustment.objects.create(
                tenant=order.tenant,
                order=order,
                order_item=order_item,
                adjustment_type=OrderAdjustment.AdjustmentType.TAX_EXEMPT,
                amount=Decimal('0.00'),  # Amount is 0 since it's just a flag
                reason="Custom item marked as tax exempt",
                applied_by=applied_by or order.cashier,  # Use provided user or fallback to cashier
                approved_by=None,
            )

        OrderCalculationService.recalculate_order_totals(order)
        return order_item

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
        from orders.services.calculation_service import OrderCalculationService

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
                from django.conf import settings as dj_settings

                # Get inventory location from order's store location
                inventory_location = order_item.order.store_location.default_inventory_location
                if not inventory_location:
                    raise ValueError(f"No default inventory location configured for store location '{order_item.order.store_location.name}'")

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
                        # How many of this product are already reserved in this order?
                        reserved = OrderItem.objects.filter(
                            order=order_item.order,
                            product=order_item.product
                        ).aggregate(total=Sum('quantity'))['total'] or 0

                        stock_level = InventoryService.get_stock_level(order_item.product, inventory_location)
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
                        order_item.product, inventory_location, additional_quantity
                    )
                    if not is_available:
                        stock_level = InventoryService.get_stock_level(order_item.product, inventory_location)
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
        OrderCalculationService.recalculate_order_totals(order_item.order)

    @staticmethod
    @transaction.atomic
    def clear_order_items(order: Order):
        """
        Deletes all items from an order and recalculates its totals.
        Also clears all adjustments (one-off discounts, price overrides).
        """
        from orders.services.calculation_service import OrderCalculationService

        order.items.all().delete()
        # Clear all adjustments (one-off discounts and price overrides)
        # Note: Item-level adjustments (price overrides) cascade delete with items,
        # but order-level adjustments (one-off discounts) need explicit deletion
        order.adjustments.all().delete()
        OrderCalculationService.recalculate_order_totals(order)
