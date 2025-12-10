from django.db import transaction
from django.utils import timezone
import logging

from orders.models import Order

logger = logging.getLogger(__name__)


class KitchenService:
    """Service for kitchen-related operations - receipts, grouping, printing."""

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
        grouped_items = KitchenService.group_items_for_kitchen(items_with_product)

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
                    modifiers_text = KitchenService._format_modifiers_for_kitchen(item)
                    price_text = f"${item.price_at_sale:.2f}" if len(items) > 1 else ""
                    receipt_lines.append(f"├─ #{item.item_sequence}: {modifiers_text} {price_text}".strip())

                    if item.kitchen_notes:
                        receipt_lines.append(f"   Note: {item.kitchen_notes}")
            else:
                # Single item
                item = items[0]
                modifiers_text = KitchenService._format_modifiers_for_kitchen(item)
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
    def mark_items_sent_to_kitchen(order_id):
        """
        Mark all items in an order as sent to kitchen (sets kitchen_printed_at timestamp).
        Only updates items that haven't been marked yet.
        """
        order = Order.objects.get(id=order_id)
        items_to_update = order.items.filter(kitchen_printed_at__isnull=True)

        now = timezone.now()
        updated_count = items_to_update.update(kitchen_printed_at=now)

        return updated_count
