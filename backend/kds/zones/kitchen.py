from typing import List, Dict, Any
from .base import BaseKDSZone
from ..models import KDSOrder, KDSOrderStatus


class KitchenZone(BaseKDSZone):
    """Kitchen zone that prepares specific items"""

    def get_orders(self) -> List[Dict[str, Any]]:
        """Get orders that have items assigned to this kitchen zone"""
        self._log_debug(f"Getting orders for kitchen zone {self.zone_id}")

        try:
            # Debug: Check all items for this zone first
            from ..models import KDSOrderItem
            all_zone_items = KDSOrderItem.objects.filter(assigned_zone=self.zone_id).select_related('kds_order', 'kds_order__order').order_by('-id')
            self._log_info(f"DEBUG: Found {all_zone_items.count()} total items for zone {self.zone_id}")
            for item in all_zone_items:
                self._log_info(f"DEBUG: Item {item.id} - Order {item.kds_order.order.order_number} - Status: {item.status} - KDS Order Created: {item.kds_order.created_at}")

            # Debug: Check specifically for PENDING items
            pending_items = all_zone_items.filter(status='pending')
            self._log_info(f"DEBUG: Found {pending_items.count()} PENDING items for zone {self.zone_id}")
            for item in pending_items:
                self._log_info(f"DEBUG: PENDING Item {item.id} - Order {item.kds_order.order.order_number}")

            # Get orders that have items assigned to this zone and are not completed
            # Filter by items that are not COMPLETED for kitchen zones
            orders = KDSOrder.objects.filter(
                items__assigned_zone=self.zone_id,
                items__status__in=[KDSOrderStatus.PENDING, KDSOrderStatus.IN_PROGRESS, KDSOrderStatus.READY]
            ).distinct().prefetch_related(
                'items',
                'items__order_item',
                'items__order_item__product',
                'order'
            ).order_by('-is_priority', 'created_at')

            self._log_info(f"Kitchen zone {self.zone_id} found {len(orders)} raw orders")
            for order in orders:
                zone_items = [item for item in order.items.all() if item.assigned_zone == self.zone_id]
                active_items = [item for item in zone_items if item.status in [KDSOrderStatus.PENDING, KDSOrderStatus.IN_PROGRESS, KDSOrderStatus.READY]]
                self._log_info(f"Raw order: {order.order.order_number}, zone items: {len(zone_items)}, active items: {len(active_items)}")

            formatted_orders = []
            for order in orders:
                try:
                    formatted_order = self.format_order_data(order)
                    if formatted_order:  # Only include if it has active items for this zone
                        formatted_orders.append(formatted_order)
                        self._log_info(f"Formatted order {order.order.order_number} for zone {self.zone_id}")
                    else:
                        self._log_info(f"Order {order.order.order_number} has no active items for zone {self.zone_id}")
                except Exception as e:
                    self._log_error(f"Error formatting order {order.id}: {e}")

            self._log_info(f"Kitchen zone {self.zone_id} returning {len(formatted_orders)} formatted orders")
            return formatted_orders

        except Exception as e:
            self._log_error(f"Error getting orders: {e}")
            return []

    def can_handle_item(self, order_item) -> bool:
        """Check if item's category matches this zone"""
        try:
            category_ids = self.get_category_ids()

            # Catch-all zone handles items without specific categories
            if self.is_catch_all_zone():
                return True

            # Check if item has a product with a category
            if hasattr(order_item, 'product') and order_item.product and order_item.product.category:
                return order_item.product.category.id in category_ids

            # Custom items go to catch-all zones
            return self.is_catch_all_zone()

        except Exception as e:
            self._log_error(f"Error checking if item can be handled: {e}")
            return False

    def format_order_data(self, kds_order) -> Dict[str, Any]:
        """Format order data for kitchen zone view"""
        try:
            # Get only items assigned to this zone that are not completed
            zone_items = [item for item in kds_order.items.all()
                         if item.assigned_zone == self.zone_id
                         and item.status in [KDSOrderStatus.PENDING, KDSOrderStatus.IN_PROGRESS, KDSOrderStatus.READY]]

            if not zone_items:
                return None  # This order has no active items for this zone

            # Calculate overall status for this order in this zone based only on active items
            overall_status = self._calculate_zone_order_status(zone_items)

            order_data = self._format_base_order_data(kds_order)
            order_data.update({
                'items': [self._format_item_data(item) for item in zone_items],
                'overall_status': overall_status,
                'zone_id': self.zone_id,
                'item_count': len(zone_items),
            })

            self._log_debug(f"Formatted order {kds_order.order.order_number} for zone {self.zone_id}: {len(zone_items)} active items, status: {overall_status}")
            zone_items_str = [f"Item {item.id} ({item.status})" for item in zone_items]
            order_data_items_str = [f"Item {item['id']} ({item['status']})" for item in order_data['items']]
            print(f"🎯 Zone {self.zone_id} formatted order {kds_order.order.order_number}:")
            print(f"   - Zone items: {zone_items_str}")
            print(f"   - Overall status: {overall_status}")
            print(f"   - Order data items: {order_data_items_str}")
            return order_data

        except Exception as e:
            self._log_error(f"Error formatting order data: {e}")
            return None

    def _calculate_zone_order_status(self, zone_items) -> str:
        """Calculate the overall status of an order for this specific zone"""
        if not zone_items:
            return KDSOrderStatus.PENDING

        statuses = [item.status for item in zone_items]

        # All items completed
        if all(status == KDSOrderStatus.COMPLETED for status in statuses):
            return KDSOrderStatus.COMPLETED

        # All items ready
        if all(status in [KDSOrderStatus.READY, KDSOrderStatus.COMPLETED] for status in statuses):
            return KDSOrderStatus.READY

        # Any items in progress
        if any(status == KDSOrderStatus.IN_PROGRESS for status in statuses):
            return KDSOrderStatus.IN_PROGRESS

        # Default to pending
        return KDSOrderStatus.PENDING

    def get_item_counts_by_status(self) -> Dict[str, int]:
        """Get count of items by status for this zone"""
        try:
            from django.db.models import Count
            from ..models import KDSOrderItem

            counts = KDSOrderItem.objects.filter(
                assigned_zone=self.zone_id,
                kds_order__status__in=[KDSOrderStatus.PENDING, KDSOrderStatus.IN_PROGRESS, KDSOrderStatus.READY]
            ).values('status').annotate(count=Count('id'))

            result = {status.value: 0 for status in KDSOrderStatus}
            for count_data in counts:
                result[count_data['status']] = count_data['count']

            return result

        except Exception as e:
            self._log_error(f"Error getting item counts: {e}")
            return {status.value: 0 for status in KDSOrderStatus}