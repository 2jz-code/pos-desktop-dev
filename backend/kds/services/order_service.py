from typing import Dict, List, Optional, Any
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
            logger.info(f"📋 Creating KDS order for {order.order_number}")
            print(f"📋 Creating KDS order for {order.order_number}")

            # Check if KDS order already exists
            if hasattr(order, 'kds_order') and order.kds_order:
                logger.warning(f"KDS order already exists for {order.order_number}")
                print(f"KDS order already exists for {order.order_number}")
                return order.kds_order

            # Get all assigned zones
            all_zones = list(set().union(*zone_assignments.values())) if zone_assignments else []
            print(f"All zones: {all_zones}")

            # Create single KDS order
            kds_order = KDSOrder.objects.create(
                order=order,
                assigned_kitchen_zones=all_zones,
                status=KDSOrderStatus.PENDING
            )
            print(f"✅ Created KDSOrder {kds_order.id}")

            # Create items with zone assignments
            items_created = 0
            for order_item in order.items.all():
                zones = zone_assignments.get(str(order_item.id), [])
                print(f"Order item {order_item.id} ({order_item.product.name if order_item.product else 'Custom'}) assigned to zones: {zones}")

                for zone in zones:
                    # Only create items for kitchen zones
                    from .zone_service import KDSZoneService
                    try:
                        zone_instance = KDSZoneService.get_zone(zone)
                        if zone_instance.zone_type == 'kitchen':
                            kds_item = KDSOrderItem.objects.create(
                                kds_order=kds_order,
                                order_item=order_item,
                                assigned_zone=zone,
                                status=KDSOrderStatus.PENDING
                            )
                            items_created += 1
                            print(f"✅ Created KDSOrderItem {kds_item.id} for zone {zone}")
                        else:
                            print(f"⏭️ Skipping QC zone {zone}")
                    except Exception as e:
                        logger.warning(f"Could not determine zone type for {zone}: {e}")
                        print(f"⚠️ Could not determine zone type for {zone}: {e}, defaulting to kitchen")
                        # Default to kitchen for backward compatibility
                        kds_item = KDSOrderItem.objects.create(
                            kds_order=kds_order,
                            order_item=order_item,
                            assigned_zone=zone,
                            status=KDSOrderStatus.PENDING
                        )
                        items_created += 1
                        print(f"✅ Created KDSOrderItem {kds_item.id} for zone {zone} (fallback)")

            logger.info(f"Created KDS order {kds_order.id} with {items_created} items for {order.order_number}")
            print(f"✅ Created KDS order {kds_order.id} with {items_created} items for {order.order_number}")

            # Publish event
            print(f"📢 Publishing order_created event for KDS order {kds_order.id}")
            from ..events.publishers import KDSEventPublisher
            KDSEventPublisher.order_created(kds_order)
            print(f"✅ Published order_created event")

            return kds_order

        except Exception as e:
            logger.error(f"Error creating KDS order for {order.order_number}: {e}")
            print(f"❌ Error creating KDS order for {order.order_number}: {e}")
            import traceback
            print(f"Traceback: {traceback.format_exc()}")
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
                # NOTE: We don't change the main order status here
                # Main order stays as-is (COMPLETED after payment)
                # KDS order completion only indicates kitchen workflow is done

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
            elif new_status == KDSOrderStatus.READY:
                kds_item.completed_at = now  # Mark as completed when ready (for kitchen zones)
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

            # Any items in progress -> order in progress (only if no items are ready/completed)
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

    @classmethod
    def manual_send_to_kitchen(cls, order: Order) -> Dict[str, Any]:
        """Handle manual send to kitchen from POS (follows existing patterns)"""
        try:
            logger.info(f"Manual send to kitchen for order {order.order_number}")
            print(f"📋 Manual send to kitchen for order {order.order_number}")

            # Check if KDS order already exists
            if hasattr(order, 'kds_order') and order.kds_order:
                logger.info(f"KDS order already exists for {order.order_number}, checking for new items")
                print(f"KDS order already exists for {order.order_number}, checking for new items")

                # Handle adding new items to existing KDS order
                return cls._add_new_items_to_existing_kds_order(order, order.kds_order)

            # Get zone assignments using existing logic
            zone_assignments = cls.get_zone_assignments_for_order(order)
            print(f"Zone assignments: {zone_assignments}")

            if not zone_assignments:
                logger.warning(f"No zone assignments found for order {order.order_number}")
                print(f"⚠️ No zone assignments found for order {order.order_number}")
                return {
                    'success': False,
                    'message': f'No kitchen zones configured for items in order {order.order_number}',
                    'items_created': 0
                }

            # Create KDS order using existing method
            kds_order = cls.create_from_order(order, zone_assignments)

            if kds_order:
                logger.info(f"✅ Successfully created KDS order {kds_order.id} for manual send")
                print(f"✅ Successfully created KDS order {kds_order.id} for manual send")

                return {
                    'success': True,
                    'message': f'Successfully sent order {order.order_number} to kitchen',
                    'items_created': kds_order.items.count(),
                    'kds_order_id': str(kds_order.id)
                }
            else:
                logger.error(f"❌ Failed to create KDS order for manual send")
                print(f"❌ Failed to create KDS order for manual send")
                return {
                    'success': False,
                    'message': f'Failed to create KDS order for {order.order_number}',
                    'items_created': 0
                }

        except Exception as e:
            logger.error(f"Error in manual send to kitchen for {order.order_number}: {e}")
            print(f"❌ Error in manual send to kitchen for {order.order_number}: {e}")
            import traceback
            print(f"Traceback: {traceback.format_exc()}")

            return {
                'success': False,
                'message': f'Error sending order to kitchen: {str(e)}',
                'items_created': 0
            }

    @classmethod
    def _add_new_items_to_existing_kds_order(cls, order: Order, kds_order) -> Dict[str, Any]:
        """Add new items to an existing KDS order"""
        try:
            logger.info(f"Adding new items to existing KDS order {kds_order.id}")
            print(f"📋 Adding new items to existing KDS order {kds_order.id}")

            # Get all order items that DON'T have KDS items yet
            existing_kds_item_order_ids = set(
                kds_order.items.values_list('order_item_id', flat=True)
            )

            new_order_items = [
                item for item in order.items.all()
                if item.id not in existing_kds_item_order_ids
            ]

            print(f"Found {len(new_order_items)} new items to add to KDS")
            logger.info(f"Found {len(new_order_items)} new items to add to KDS")

            if not new_order_items:
                # No new items, but might have quantity changes - still send refresh
                print(f"🔄 No new items, but sending refresh for potential quantity changes")

                # Send refresh notification for quantity changes
                from django.db import transaction
                from ..events.publishers import KDSEventPublisher

                def send_refresh_notification():
                    print(f"🔄 About to send KDS refresh notification for quantity changes...")
                    try:
                        KDSEventPublisher.global_data_refresh_requested()
                        print(f"✅ Sent KDS refresh for quantity/order changes")
                    except Exception as e:
                        print(f"❌ Failed to send KDS refresh: {e}")

                print(f"🔄 Checking transaction state...")
                if transaction.get_connection().in_atomic_block:
                    print(f"🔄 In atomic block, scheduling refresh for commit")
                    transaction.on_commit(send_refresh_notification)
                else:
                    print(f"🔄 Not in atomic block, sending refresh immediately")
                    send_refresh_notification()

                return {
                    'success': True,
                    'message': f'No new items to add to KDS for order {order.order_number}',
                    'items_created': 0,
                    'kds_order_id': str(kds_order.id)
                }

            # Get zone assignments for new items only
            zone_assignments = {}
            from .zone_service import KDSZoneService
            zones = KDSZoneService.get_all_zones()

            for order_item in new_order_items:
                assigned_zones = []
                for zone_id, zone in zones.items():
                    if zone.can_handle_item(order_item):
                        assigned_zones.append(zone_id)

                if assigned_zones:
                    zone_assignments[str(order_item.id)] = assigned_zones

            print(f"Zone assignments for new items: {zone_assignments}")

            if not zone_assignments:
                return {
                    'success': False,
                    'message': f'No kitchen zones configured for new items in order {order.order_number}',
                    'items_created': 0,
                    'kds_order_id': str(kds_order.id)
                }

            # Create KDS items for new order items
            items_created = 0
            for order_item in new_order_items:
                zones = zone_assignments.get(str(order_item.id), [])

                for zone in zones:
                    # Only create items for kitchen zones
                    try:
                        zone_instance = KDSZoneService.get_zone(zone)
                        if zone_instance and zone_instance.zone_type == 'kitchen':
                            KDSOrderItem.objects.create(
                                kds_order=kds_order,
                                order_item=order_item,
                                assigned_zone=zone,
                                status=KDSOrderStatus.PENDING
                            )
                            items_created += 1
                            print(f"✅ Created KDS item for new order item {order_item.id} in zone {zone}")
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
                        print(f"✅ Created KDS item for new order item {order_item.id} in zone {zone} (fallback)")

            logger.info(f"Created {items_created} new KDS items for order {order.order_number}")
            print(f"✅ Created {items_created} new KDS items for order {order.order_number}")

            # If new items were added to a completed order, reactivate it
            if items_created > 0 and kds_order.status == KDSOrderStatus.COMPLETED:
                kds_order.status = KDSOrderStatus.IN_PROGRESS
                kds_order.save()
                print(f"🔄 Reactivated completed order {order.order_number} due to new items")
                logger.info(f"Reactivated KDS order {kds_order.id} from COMPLETED to IN_PROGRESS")

            # Publish refresh event after transaction commits (for new items OR quantity changes)
            from django.db import transaction
            from ..events.publishers import KDSEventPublisher

            def send_refresh_notification():
                print(f"🔄 About to send KDS refresh notification...")
                try:
                    KDSEventPublisher.global_data_refresh_requested()
                    if items_created > 0:
                        print(f"✅ Sent KDS refresh for {items_created} new items")
                    else:
                        print(f"✅ Sent KDS refresh for quantity/order changes")
                except Exception as e:
                    print(f"❌ Failed to send KDS refresh: {e}")

            print(f"🔄 Checking transaction state...")
            if transaction.get_connection().in_atomic_block:
                print(f"🔄 In atomic block, scheduling refresh for commit")
                transaction.on_commit(send_refresh_notification)
            else:
                print(f"🔄 Not in atomic block, sending refresh immediately")
                send_refresh_notification()

            return {
                'success': True,
                'message': f'Successfully added {items_created} new items to kitchen for order {order.order_number}',
                'items_created': items_created,
                'kds_order_id': str(kds_order.id)
            }

        except Exception as e:
            logger.error(f"Error adding new items to KDS order: {e}")
            print(f"❌ Error adding new items to KDS order: {e}")
            import traceback
            print(f"Traceback: {traceback.format_exc()}")

            return {
                'success': False,
                'message': f'Error adding new items to kitchen: {str(e)}',
                'items_created': 0,
                'kds_order_id': str(kds_order.id) if kds_order else None
            }