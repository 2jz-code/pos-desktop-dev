from typing import List, Dict, Any
from .base import BaseKDSZone
from ..models import KDSOrder, KDSOrderStatus


class QCZone(BaseKDSZone):
    """QC zone that observes all kitchen orders for completion"""

    def get_orders(self) -> List[Dict[str, Any]]:
        """Get all orders that QC needs to monitor"""
        self._log_debug(f"Getting orders for QC zone {self.zone_id}")

        try:
            # QC sees all orders that have started preparation (any status except completed)
            orders = KDSOrder.objects.filter(
                status__in=[KDSOrderStatus.PENDING, KDSOrderStatus.IN_PROGRESS, KDSOrderStatus.READY]
            ).prefetch_related(
                'items',
                'items__order_item',
                'items__order_item__product',
                'order'
            ).order_by('-is_priority', 'created_at')

            formatted_orders = []
            for order in orders:
                try:
                    formatted_order = self.format_order_data(order)
                    if formatted_order:
                        formatted_orders.append(formatted_order)
                except Exception as e:
                    self._log_error(f"Error formatting order {order.id}: {e}")

            # Sort by completion readiness, then by time
            formatted_orders.sort(key=lambda x: (not x.get('can_complete', False), x.get('created_at', '')))

            self._log_debug(f"Found {len(formatted_orders)} orders for QC zone {self.zone_id}")
            return formatted_orders

        except Exception as e:
            self._log_error(f"Error getting orders for QC: {e}")
            return []

    def can_handle_item(self, order_item) -> bool:
        """QC doesn't handle items directly, just observes"""
        return False

    def format_order_data(self, kds_order) -> Dict[str, Any]:
        """Format order data for QC zone view"""
        try:
            # QC sees all items across all kitchen zones
            all_items = list(kds_order.items.all())

            if not all_items:
                return None  # No items to show

            # Check kitchen item readiness
            kitchen_items = [item for item in all_items if self._is_kitchen_item(item)]
            all_kitchen_items_ready = all(item.status in [KDSOrderStatus.READY, KDSOrderStatus.COMPLETED] for item in kitchen_items)
            any_items_preparing = any(item.status == KDSOrderStatus.IN_PROGRESS for item in kitchen_items)

            # Check if order has started (not all items are pending)
            has_started_items = any(item.status in [KDSOrderStatus.IN_PROGRESS, KDSOrderStatus.READY, KDSOrderStatus.COMPLETED] for item in kitchen_items)

            # Only show orders that have started
            if not has_started_items:
                return None

            order_data = self._format_base_order_data(kds_order)
            order_data.update({
                'can_complete': all_kitchen_items_ready and kds_order.status == KDSOrderStatus.READY,
                'all_kitchen_items_ready': all_kitchen_items_ready,
                'any_items_preparing': any_items_preparing,
                'kitchen_zones': self._group_items_by_zone(kitchen_items),
                'total_kitchen_items': len(kitchen_items),
                'qc_status': 'ready_for_completion' if all_kitchen_items_ready else 'waiting_for_kitchen',
                'zone_id': self.zone_id,
            })

            return order_data

        except Exception as e:
            self._log_error(f"Error formatting QC order data: {e}")
            return None

    def _is_kitchen_item(self, item) -> bool:
        """Check if an item belongs to a kitchen zone"""
        # All items are kitchen items since we don't create QC-specific items
        return True

    def _group_items_by_zone(self, items) -> Dict[str, List[Dict[str, Any]]]:
        """Group items by their assigned kitchen zones"""
        zones = {}

        for item in items:
            zone = item.assigned_zone
            if zone not in zones:
                zones[zone] = []
            zones[zone].append(self._format_item_data(item))

        return zones

    def get_completion_summary(self) -> Dict[str, int]:
        """Get summary of orders ready for completion"""
        try:
            orders = KDSOrder.objects.filter(
                status__in=[KDSOrderStatus.IN_PROGRESS, KDSOrderStatus.READY]
            ).prefetch_related('items')

            ready_count = 0
            waiting_count = 0

            for order in orders:
                kitchen_items = list(order.items.all())
                all_ready = all(item.status in [KDSOrderStatus.READY, KDSOrderStatus.COMPLETED] for item in kitchen_items)

                if all_ready:
                    ready_count += 1
                else:
                    waiting_count += 1

            return {
                'ready_for_completion': ready_count,
                'waiting_for_kitchen': waiting_count,
                'total_active': ready_count + waiting_count,
            }

        except Exception as e:
            self._log_error(f"Error getting completion summary: {e}")
            return {
                'ready_for_completion': 0,
                'waiting_for_kitchen': 0,
                'total_active': 0,
            }