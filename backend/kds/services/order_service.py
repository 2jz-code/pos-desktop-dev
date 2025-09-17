from typing import Dict, List, Optional
from django.db import transaction
from django.utils import timezone
import logging

from ..models import KDSOrder, KDSOrderItem, KDSOrderStatus
from orders.models import Order

logger = logging.getLogger(__name__)


class KDSOrderService:
    """Centralized business logic for KDS orders"""

    @classmethod
    @transaction.atomic
    def create_from_order(cls, order: Order, zone_assignments: Dict[str, List[str]]) -> Optional[KDSOrder]:
        """Create KDS order from regular order"""
        try:
            logger.info(f"Creating KDS order for {order.order_number}")

            # Check if KDS order already exists
            if hasattr(order, 'kds_order') and order.kds_order:
                logger.warning(f"KDS order already exists for {order.order_number}")
                return order.kds_order

            # Get all assigned zones
            all_zones = list(set().union(*zone_assignments.values())) if zone_assignments else []

            # Create single KDS order
            kds_order = KDSOrder.objects.create(
                order=order,
                assigned_kitchen_zones=all_zones,
                status=KDSOrderStatus.PENDING
            )

            # Create items with zone assignments
            items_created = 0
            for order_item in order.items.all():
                zones = zone_assignments.get(str(order_item.id), [])
                for zone in zones:
                    # Only create items for kitchen zones
                    from .zone_service import KDSZoneService
                    try:
                        zone_instance = KDSZoneService.get_zone(zone)
                        if zone_instance.zone_type == 'kitchen':
                            KDSOrderItem.objects.create(
                                kds_order=kds_order,
                                order_item=order_item,
                                assigned_zone=zone,
                                status=KDSOrderStatus.PENDING
                            )
                            items_created += 1
                    except Exception as e:
                        logger.warning(f"Could not determine zone type for {zone}: {e}")
                        # Default to kitchen for backward compatibility
                        KDSOrderItem.objects.create(
                            kds_order=kds_order,
                            order_item=order_item,
                            assigned_zone=zone,
                            status=KDSOrderStatus.PENDING
                        )
                        items_created += 1

            logger.info(f"Created KDS order {kds_order.id} with {items_created} items for {order.order_number}")

            # Publish event
            from ..events.publishers import KDSEventPublisher
            KDSEventPublisher.order_created(kds_order)

            return kds_order

        except Exception as e:
            logger.error(f"Error creating KDS order for {order.order_number}: {e}")
            return None

    @classmethod
    @transaction.atomic
    def transition_order_status(cls, kds_order: KDSOrder, new_status: str) -> bool:
        """Handle order status transitions with proper validation"""
        try:
            logger.info(f"Transitioning order {kds_order.order.order_number} from {kds_order.status} to {new_status}")

            valid_transitions = {
                KDSOrderStatus.PENDING: [KDSOrderStatus.IN_PROGRESS, KDSOrderStatus.COMPLETED],
                KDSOrderStatus.IN_PROGRESS: [KDSOrderStatus.READY, KDSOrderStatus.COMPLETED],
                KDSOrderStatus.READY: [KDSOrderStatus.COMPLETED],
            }

            if new_status not in valid_transitions.get(kds_order.status, []):
                logger.warning(f"Invalid transition from {kds_order.status} to {new_status}")
                return False

            old_status = kds_order.status
            kds_order.status = new_status

            # Set timestamps
            now = timezone.now()
            if new_status == KDSOrderStatus.IN_PROGRESS:
                kds_order.started_at = now
            elif new_status == KDSOrderStatus.READY:
                kds_order.ready_at = now
            elif new_status == KDSOrderStatus.COMPLETED:
                kds_order.completed_at = now
                # Mark underlying order as completed
                kds_order.order.status = 'completed'
                kds_order.order.save(update_fields=['status'])

            kds_order.save()

            # Update all items to match order status if completing
            if new_status == KDSOrderStatus.COMPLETED:
                cls._complete_all_items(kds_order)

            # Publish status change event
            from ..events.publishers import KDSEventPublisher
            KDSEventPublisher.order_status_changed(kds_order, old_status, new_status)

            logger.info(f"Successfully transitioned order {kds_order.order.order_number} to {new_status}")
            return True

        except Exception as e:
            logger.error(f"Error transitioning order status: {e}")
            return False

    @classmethod
    @transaction.atomic
    def transition_item_status(cls, kds_item: KDSOrderItem, new_status: str) -> bool:
        """Handle individual item status transitions"""
        try:
            logger.info(f"Transitioning item {kds_item.id} from {kds_item.status} to {new_status}")

            valid_transitions = {
                KDSOrderStatus.PENDING: [KDSOrderStatus.IN_PROGRESS, KDSOrderStatus.COMPLETED],
                KDSOrderStatus.IN_PROGRESS: [KDSOrderStatus.READY, KDSOrderStatus.COMPLETED],
                KDSOrderStatus.READY: [KDSOrderStatus.COMPLETED],
            }

            if new_status not in valid_transitions.get(kds_item.status, []):
                logger.warning(f"Invalid item transition from {kds_item.status} to {new_status}")
                return False

            old_status = kds_item.status
            kds_item.status = new_status

            # Set timestamps
            now = timezone.now()
            if new_status == KDSOrderStatus.IN_PROGRESS:
                kds_item.started_at = now
                # Also transition order if it's still pending
                if kds_item.kds_order.status == KDSOrderStatus.PENDING:
                    cls.transition_order_status(kds_item.kds_order, KDSOrderStatus.IN_PROGRESS)
            elif new_status == KDSOrderStatus.COMPLETED:
                kds_item.completed_at = now

            kds_item.save()

            # Check if order should be transitioned based on item statuses
            cls._check_and_update_order_status(kds_item.kds_order)

            # Publish item change event
            from ..events.publishers import KDSEventPublisher
            KDSEventPublisher.item_status_changed(kds_item, old_status, new_status)

            logger.info(f"Successfully transitioned item {kds_item.id} to {new_status}")
            return True

        except Exception as e:
            logger.error(f"Error transitioning item status: {e}")
            return False

    @classmethod
    def complete_order_from_qc(cls, kds_order_id: str) -> bool:
        """QC completes an order - marks entire order as completed"""
        try:
            kds_order = KDSOrder.objects.get(id=kds_order_id)
            logger.info(f"QC completing order {kds_order.order.order_number}")

            # Transition to completed status
            success = cls.transition_order_status(kds_order, KDSOrderStatus.COMPLETED)

            if success:
                logger.info(f"QC successfully completed order {kds_order.order.order_number}")
            else:
                logger.error(f"QC failed to complete order {kds_order.order.order_number}")

            return success

        except KDSOrder.DoesNotExist:
            logger.error(f"KDS order {kds_order_id} not found for QC completion")
            return False
        except Exception as e:
            logger.error(f"Error completing order from QC: {e}")
            return False

    @classmethod
    def mark_item_priority(cls, kds_item_id: str, is_priority: bool = True) -> bool:
        """Mark item as priority"""
        try:
            kds_item = KDSOrderItem.objects.get(id=kds_item_id)
            kds_item.is_priority = is_priority
            kds_item.save(update_fields=['is_priority'])

            # Also mark the order as priority if any item is priority
            if is_priority and not kds_item.kds_order.is_priority:
                kds_item.kds_order.is_priority = True
                kds_item.kds_order.save(update_fields=['is_priority'])

            # Publish priority change event
            from ..events.publishers import KDSEventPublisher
            KDSEventPublisher.item_priority_changed(kds_item, is_priority)

            return True

        except KDSOrderItem.DoesNotExist:
            logger.error(f"KDS item {kds_item_id} not found")
            return False
        except Exception as e:
            logger.error(f"Error marking item priority: {e}")
            return False

    @classmethod
    def add_item_note(cls, kds_item_id: str, note: str) -> bool:
        """Add note to item"""
        try:
            kds_item = KDSOrderItem.objects.get(id=kds_item_id)
            kds_item.notes = note
            kds_item.save(update_fields=['notes'])

            # Publish note change event
            from ..events.publishers import KDSEventPublisher
            KDSEventPublisher.item_note_changed(kds_item, note)

            return True

        except KDSOrderItem.DoesNotExist:
            logger.error(f"KDS item {kds_item_id} not found")
            return False
        except Exception as e:
            logger.error(f"Error adding item note: {e}")
            return False

    @classmethod
    def _complete_all_items(cls, kds_order: KDSOrder):
        """Mark all items as completed when order is completed"""
        now = timezone.now()
        kds_order.items.exclude(status=KDSOrderStatus.COMPLETED).update(
            status=KDSOrderStatus.COMPLETED,
            completed_at=now
        )

    @classmethod
    def _check_and_update_order_status(cls, kds_order: KDSOrder):
        """Check if order status should be updated based on item statuses"""
        try:
            items = list(kds_order.items.all())
            if not items:
                return

            item_statuses = [item.status for item in items]

            # All items completed -> order ready (QC will complete it)
            if all(status == KDSOrderStatus.COMPLETED for status in item_statuses):
                if kds_order.status != KDSOrderStatus.READY:
                    cls.transition_order_status(kds_order, KDSOrderStatus.READY)

            # Any items ready or completed -> order ready
            elif any(status in [KDSOrderStatus.READY, KDSOrderStatus.COMPLETED] for status in item_statuses):
                if kds_order.status not in [KDSOrderStatus.READY, KDSOrderStatus.COMPLETED]:
                    cls.transition_order_status(kds_order, KDSOrderStatus.READY)

            # Any items in progress -> order in progress
            elif any(status == KDSOrderStatus.IN_PROGRESS for status in item_statuses):
                if kds_order.status == KDSOrderStatus.PENDING:
                    cls.transition_order_status(kds_order, KDSOrderStatus.IN_PROGRESS)

        except Exception as e:
            logger.error(f"Error checking order status: {e}")

    @classmethod
    def get_zone_assignments_for_order(cls, order: Order) -> Dict[str, List[str]]:
        """Determine zone assignments for order items based on printer configuration"""
        zone_assignments = {}

        try:
            logger.info(f"Getting zone assignments for order {order.order_number}")

            from .zone_service import KDSZoneService
            zones = KDSZoneService.get_all_zones()

            for order_item in order.items.all():
                assigned_zones = []

                for zone_id, zone in zones.items():
                    if zone.can_handle_item(order_item):
                        assigned_zones.append(zone_id)

                if assigned_zones:
                    zone_assignments[str(order_item.id)] = assigned_zones
                    logger.debug(f"Assigned item {order_item.id} to zones {assigned_zones}")

            logger.info(f"Zone assignments for {order.order_number}: {zone_assignments}")
            return zone_assignments

        except Exception as e:
            logger.error(f"Error getting zone assignments for order {order.order_number}: {e}")
            return {}