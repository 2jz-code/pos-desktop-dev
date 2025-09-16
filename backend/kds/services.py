from django.utils import timezone
from django.db import transaction
from django.db.models import Q, Count, Avg, F
from datetime import datetime, date

from .models import KDSOrderItem, KDSSession, KitchenMetrics, KDSAlert
from orders.models import OrderItem, Order


class KDSService:
    """
    Service layer for Kitchen Display System operations
    """

    @staticmethod
    def update_item_status(kds_item_id, new_status):
        """
        Update KDS item status and track timing
        """
        try:
            with transaction.atomic():
                kds_item = KDSOrderItem.objects.select_related('order_item__order').get(
                    id=kds_item_id
                )

                old_status = kds_item.kds_status
                kds_item.kds_status = new_status

                # Update timing based on status transition
                current_time = timezone.now()

                if new_status == 'preparing' and old_status == 'received':
                    kds_item.started_preparing_at = current_time
                elif new_status == 'ready' and old_status == 'preparing':
                    kds_item.ready_at = current_time
                elif new_status == 'completed' and old_status == 'ready':
                    kds_item.completed_at = current_time
                elif new_status == 'held':
                    kds_item.held_at = current_time

                kds_item.save()

                # Update metrics
                KDSService._update_metrics_for_item(kds_item)

                # Check for alerts (e.g., overdue items)
                KDSService._check_and_create_alerts(kds_item)

                return kds_item

        except KDSOrderItem.DoesNotExist:
            return None
        except Exception as e:
            print(f"Error updating KDS item status: {e}")
            return None

    @staticmethod
    def mark_item_priority(kds_item_id, is_priority):
        """
        Mark item as priority or remove priority
        """
        try:
            kds_item = KDSOrderItem.objects.get(id=kds_item_id)
            kds_item.is_priority = is_priority
            kds_item.save()
            return kds_item
        except KDSOrderItem.DoesNotExist:
            return None

    @staticmethod
    def add_kitchen_note(kds_item_id, note):
        """
        Add kitchen note to item
        """
        try:
            kds_item = KDSOrderItem.objects.get(id=kds_item_id)
            kds_item.kitchen_notes = note
            kds_item.save()
            return kds_item
        except KDSOrderItem.DoesNotExist:
            return None

    @staticmethod
    def get_zone_items(zone_printer_id, statuses=None, is_qc_station=False):
        """
        Get all KDS items for a specific zone
        Auto-removes ready items for regular stations, keeps them for QC
        """
        print(f"[KDS Service] get_zone_items: Starting for zone {zone_printer_id}, is_qc_station={is_qc_station}")
        try:
            queryset = KDSOrderItem.objects.select_related(
                'order_item__order'
            ).filter(
                zone_printer_id=zone_printer_id
            )

            if is_qc_station:
                # QC station sees ready items (from kitchen) but not completed ones
                queryset = queryset.exclude(kds_status='completed')
                print("[KDS Service] get_zone_items: QC station - excluding completed items")
            else:
                # Regular kitchen stations don't see ready or completed items
                queryset = queryset.exclude(kds_status__in=['ready', 'completed'])
                print("[KDS Service] get_zone_items: Regular station - excluding ready and completed items")

            queryset = queryset.order_by('is_priority', 'received_at')

            if statuses:
                queryset = queryset.filter(kds_status__in=statuses)
                print(f"[KDS Service] get_zone_items: Filtering by statuses: {statuses}")

            items = list(queryset)
            print(f"[KDS Service] get_zone_items: Found {len(items)} items")
            return items
        except Exception as e:
            print(f"[KDS Service] get_zone_items: ERROR - {e}")
            import traceback
            print(f"[KDS Service] get_zone_items: TRACEBACK - {traceback.format_exc()}")
            return []

    @staticmethod
    def is_qc_zone(zone_printer_id):
        """
        Check if a zone is marked as QC in the printer configuration
        Sync version - use is_qc_zone_async for async contexts
        """
        try:
            from settings.models import PrinterConfiguration

            config = PrinterConfiguration.objects.first()
            if not config or not config.kitchen_zones:
                return False

            # Find the zone and check its is_qc_zone flag
            for zone in config.kitchen_zones:
                if zone.get('name') == zone_printer_id or zone.get('printer_name') == zone_printer_id:
                    return zone.get('is_qc_zone', False)

            return False
        except Exception as e:
            print(f"Error checking QC zone: {e}")
            return False

    @staticmethod
    async def is_qc_zone_async(zone_printer_id):
        """
        Async version of is_qc_zone for use in WebSocket consumers
        """
        try:
            print(f"[KDS Service] is_qc_zone_async: Starting for zone {zone_printer_id}")
            from settings.models import PrinterConfiguration
            from asgiref.sync import sync_to_async

            # Create an async version of the database query
            print("[KDS Service] is_qc_zone_async: Getting printer configuration...")
            get_config = sync_to_async(PrinterConfiguration.objects.first)
            config = await get_config()
            print(f"[KDS Service] is_qc_zone_async: Config retrieved, has kitchen_zones: {bool(config and config.kitchen_zones)}")

            if not config or not config.kitchen_zones:
                print("[KDS Service] is_qc_zone_async: No config or kitchen zones, returning False")
                return False

            # Find the zone and check its is_qc_zone flag
            print(f"[KDS Service] is_qc_zone_async: Searching through {len(config.kitchen_zones)} zones")
            for i, zone in enumerate(config.kitchen_zones):
                print(f"[KDS Service] is_qc_zone_async: Zone {i}: name={zone.get('name')}, printer_name={zone.get('printer_name')}, is_qc_zone={zone.get('is_qc_zone')}")
                if zone.get('name') == zone_printer_id or zone.get('printer_name') == zone_printer_id:
                    result = zone.get('is_qc_zone', False)
                    print(f"[KDS Service] is_qc_zone_async: Found matching zone, returning {result}")
                    return result

            print("[KDS Service] is_qc_zone_async: No matching zone found, returning False")
            return False
        except Exception as e:
            print(f"[KDS Service] is_qc_zone_async: ERROR - {e}")
            import traceback
            print(f"[KDS Service] is_qc_zone_async: TRACEBACK - {traceback.format_exc()}")
            return False

    @staticmethod
    def get_zone_alerts(zone_printer_id):
        """
        Get active alerts for a specific zone
        """
        print(f"[KDS Service] get_zone_alerts: Starting for zone {zone_printer_id}")
        try:
            queryset = KDSAlert.objects.filter(
                zone_printer_id=zone_printer_id,
                is_active=True
            ).order_by('-priority', '-created_at')

            alerts = list(queryset)
            print(f"[KDS Service] get_zone_alerts: Found {len(alerts)} alerts")
            return alerts
        except Exception as e:
            print(f"[KDS Service] get_zone_alerts: ERROR - {e}")
            import traceback
            print(f"[KDS Service] get_zone_alerts: TRACEBACK - {traceback.format_exc()}")
            return []

    @staticmethod
    def create_kds_items_for_order(order, zone_assignments):
        """
        Create KDS items when an order is placed or manually sent to kitchen
        Handles order additions by bringing back completed items for context
        zone_assignments: dict mapping order_item_id to zone_printer_id
        """
        kds_items = []

        try:
            with transaction.atomic():
                # Get current active KDS items to avoid duplicates
                existing_kds_items = set(
                    KDSOrderItem.objects.filter(
                        order_item__order=order
                    ).values_list('order_item_id', flat=True)
                )

                # Check if this is a true order addition:
                # - Has existing KDS items that are beyond "received" status (in progress/completed)
                # - AND has new items that need to be added
                existing_active_kds_items = KDSOrderItem.objects.filter(
                    order_item__order=order,
                    kds_status__in=['preparing', 'ready', 'completed']
                ).exists()

                new_items_exist = any(
                    order_item.id not in existing_kds_items
                    for order_item in order.items.all()
                )

                is_order_addition = existing_active_kds_items and new_items_exist

                print(f"[KDS Service] create_kds_items_for_order: existing_active_kds_items={existing_active_kds_items}, new_items_exist={new_items_exist}, is_order_addition={is_order_addition}")

                if is_order_addition:
                    # This is an order addition - bring back existing items for context
                    print("[KDS Service] create_kds_items_for_order: Handling as order addition - bringing back existing items for context")
                    kds_items.extend(KDSService._handle_order_addition(order, zone_assignments))
                else:
                    # Regular order creation - just create KDS items for items that don't have them
                    print("[KDS Service] create_kds_items_for_order: Regular creation - creating KDS items for new items only")
                    for order_item in order.items.all():
                        # Skip items that already have active KDS items
                        if order_item.id in existing_kds_items:
                            print(f"[KDS Service] create_kds_items_for_order: Skipping item {order_item.id} - already has KDS items")
                            continue

                        assigned_zones = zone_assignments.get(str(order_item.id))
                        if assigned_zones:
                            # Handle both single zone (string) and multiple zones (list)
                            if isinstance(assigned_zones, str):
                                assigned_zones = [assigned_zones]

                            # Create KDS item for each assigned zone
                            for zone_id in assigned_zones:
                                kds_item = KDSOrderItem.objects.create(
                                    order_item=order_item,
                                    zone_printer_id=zone_id,
                                    kds_status='received'
                                )
                                kds_items.append(kds_item)

        except Exception as e:
            print(f"Error creating KDS items: {e}")

        return kds_items

    @staticmethod
    def _handle_order_addition(order, zone_assignments):
        """
        Handle adding items to an existing order with zone-aware reappearing
        Only brings back completed items to zones that are getting new items (+ QC always gets context)
        """
        kds_items = []

        try:
            # Get all existing KDS items for this order (any status)
            existing_kds_items = KDSOrderItem.objects.filter(
                order_item__order=order
            )

            # Create a set of order item IDs that already have KDS items
            existing_order_item_ids = set(existing_kds_items.values_list('order_item_id', flat=True))

            # Determine which zones are getting new items
            new_item_zones = set()
            for order_item in order.items.all():
                if order_item.id not in existing_order_item_ids:
                    assigned_zones = zone_assignments.get(str(order_item.id))
                    if assigned_zones:
                        # Handle both single zone (string) and multiple zones (list)
                        if isinstance(assigned_zones, str):
                            assigned_zones = [assigned_zones]
                        for zone_id in assigned_zones:
                            new_item_zones.add(zone_id)

            # For existing items, determine what to do based on zone logic
            # Note: This gets complex because items can be in multiple zones
            for existing_kds_item in existing_kds_items:
                # The existing KDS item is already assigned to a specific zone
                zone_id = existing_kds_item.zone_printer_id

                # Check if this specific zone is getting new items
                zone_getting_new_items = zone_id in new_item_zones

                # Use sync version - this method should only be called from sync contexts
                is_qc_zone = KDSService.is_qc_zone(zone_id)

                # Reappear completed items if:
                # 1. This zone is getting new items (needs context), OR
                # 2. This is a QC zone (always gets full context)
                if (existing_kds_item.kds_status in ['ready', 'completed'] and
                    (zone_getting_new_items or is_qc_zone)):

                    # Determine appropriate status for reappeared item
                    reappear_status = existing_kds_item.kds_status
                    if existing_kds_item.kds_status == 'ready' and not is_qc_zone:
                        # For regular stations, ready items were completed, so show as completed
                        reappear_status = 'completed'

                        reappeared_item = KDSOrderItem.objects.create(
                            order_item=existing_kds_item.order_item,
                            zone_printer_id=zone_id,
                            kds_status=reappear_status,
                            is_reappeared_completed=True,
                            original_completion_time=existing_kds_item.completed_at or existing_kds_item.ready_at,
                            received_at=existing_kds_item.received_at,
                            started_preparing_at=existing_kds_item.started_preparing_at,
                            ready_at=existing_kds_item.ready_at,
                            completed_at=existing_kds_item.completed_at,
                            kitchen_notes=existing_kds_item.kitchen_notes
                        )
                        kds_items.append(reappeared_item)
                    # else: Items still in progress or zones not affected - leave them as-is

            # Add new items that don't have KDS items yet
            for order_item in order.items.all():
                if order_item.id not in existing_order_item_ids:
                    assigned_zones = zone_assignments.get(str(order_item.id))
                    if assigned_zones:
                        # Handle both single zone (string) and multiple zones (list)
                        if isinstance(assigned_zones, str):
                            assigned_zones = [assigned_zones]

                        # Create KDS item for each assigned zone
                        for zone_id in assigned_zones:
                            new_item = KDSOrderItem.objects.create(
                                order_item=order_item,
                                zone_printer_id=zone_id,
                                kds_status='received',
                                is_addition=True
                            )
                            kds_items.append(new_item)

        except Exception as e:
            print(f"Error handling order addition: {e}")

        return kds_items

    @staticmethod
    def manual_send_to_kitchen(order):
        """
        Manually send POS order to kitchen (used by cashiers)
        Handles both new orders and order additions
        """
        try:
            print(f"[KDS Service] manual_send_to_kitchen: *** MANUAL SEND TRIGGERED *** for order {order.order_number}")
            from .signals import get_zone_assignments_for_order

            # Check if KDS items already exist
            from .models import KDSOrderItem
            existing_items = KDSOrderItem.objects.filter(order_item__order=order)
            print(f"[KDS Service] manual_send_to_kitchen: Found {existing_items.count()} existing KDS items")

            zone_assignments = get_zone_assignments_for_order(order)
            print(f"[KDS Service] manual_send_to_kitchen: Zone assignments: {zone_assignments}")

            if zone_assignments:
                kds_items = KDSService.create_kds_items_for_order(order, zone_assignments)
                print(f"[KDS Service] manual_send_to_kitchen: Created {len(kds_items)} KDS items")

                # Note: Broadcasting handled automatically by post_save signal

                return {
                    'success': True,
                    'message': f'Order {order.order_number} sent to kitchen',
                    'items_created': len(kds_items),
                    'kds_items': kds_items
                }
            else:
                print("[KDS Service] manual_send_to_kitchen: No zone assignments found")
                return {
                    'success': False,
                    'message': 'No zone assignments found for order items'
                }

        except Exception as e:
            print(f"[KDS Service] manual_send_to_kitchen: ERROR - {e}")
            import traceback
            print(f"[KDS Service] manual_send_to_kitchen: TRACEBACK - {traceback.format_exc()}")
            return {
                'success': False,
                'message': f'Error sending to kitchen: {str(e)}'
            }

    @staticmethod
    def get_zone_performance_today(zone_printer_id):
        """
        Get today's performance metrics for a zone
        """
        today = date.today()

        items_today = KDSOrderItem.objects.filter(
            zone_printer_id=zone_printer_id,
            received_at__date=today
        )

        performance = {
            'total_items': items_today.count(),
            'completed_items': items_today.filter(kds_status='completed').count(),
            'in_progress': items_today.exclude(kds_status__in=['completed', 'held']).count(),
            'overdue_items': sum(1 for item in items_today if item.is_overdue),
            'average_prep_time': None
        }

        # Calculate average prep time for completed items
        completed_items = items_today.filter(
            kds_status='completed',
            started_preparing_at__isnull=False,
            ready_at__isnull=False
        )

        if completed_items.exists():
            prep_times = []
            for item in completed_items:
                if item.prep_time_minutes:
                    prep_times.append(item.prep_time_minutes)

            if prep_times:
                performance['average_prep_time'] = sum(prep_times) / len(prep_times)

        return performance

    @staticmethod
    def _update_metrics_for_item(kds_item):
        """
        Update metrics when item status changes
        """
        try:
            today = date.today()
            current_hour = timezone.now().hour

            # Determine shift based on hour
            if 5 <= current_hour < 12:
                shift = 'morning'
            elif 12 <= current_hour < 18:
                shift = 'afternoon'
            elif 18 <= current_hour < 23:
                shift = 'evening'
            else:
                shift = 'overnight'

            metrics, created = KitchenMetrics.objects.get_or_create(
                zone_printer_id=kds_item.zone_printer_id,
                date=today,
                shift=shift,
                defaults={
                    'total_items': 0,
                    'completed_items': 0,
                    'items_on_time': 0,
                    'overdue_items': 0
                }
            )

            # Update metrics based on status change
            if kds_item.kds_status == 'completed':
                metrics.completed_items += 1

                # Check if item was completed on time
                if not kds_item.is_overdue:
                    metrics.items_on_time += 1
                else:
                    metrics.overdue_items += 1

                # Update average prep time
                if kds_item.prep_time_minutes:
                    if metrics.average_prep_time:
                        # Running average calculation
                        total_time = metrics.average_prep_time * (metrics.completed_items - 1)
                        metrics.average_prep_time = (total_time + kds_item.prep_time_minutes) / metrics.completed_items
                    else:
                        metrics.average_prep_time = kds_item.prep_time_minutes

            # Update total items if this is a new item
            if kds_item.kds_status == 'received' and kds_item.received_at.date() == today:
                metrics.total_items += 1

            metrics.save()

        except Exception as e:
            print(f"Error updating metrics: {e}")

    @staticmethod
    def _check_and_create_alerts(kds_item):
        """
        Check for overdue items and create alerts
        """
        try:
            if kds_item.is_overdue and kds_item.kds_status not in ['ready', 'completed']:
                # Check if alert already exists for this item
                existing_alert = KDSAlert.objects.filter(
                    zone_printer_id=kds_item.zone_printer_id,
                    order_item=kds_item.order_item,
                    alert_type='overdue',
                    is_active=True
                ).first()

                if not existing_alert:
                    KDSAlert.objects.create(
                        zone_printer_id=kds_item.zone_printer_id,
                        alert_type='overdue',
                        priority='high',
                        title=f"Overdue Item: {kds_item.order_item.order.order_number}",
                        message=f"Item has been preparing for {kds_item.total_time_minutes} minutes",
                        order_item=kds_item.order_item
                    )
            else:
                # Resolve any existing overdue alerts for this item
                KDSAlert.objects.filter(
                    zone_printer_id=kds_item.zone_printer_id,
                    order_item=kds_item.order_item,
                    alert_type='overdue',
                    is_active=True
                ).update(is_active=False, resolved_at=timezone.now())

        except Exception as e:
            print(f"Error checking alerts: {e}")

    @staticmethod
    def get_active_sessions():
        """
        Get all active KDS sessions
        """
        return KDSSession.objects.filter(is_active=True)

    @staticmethod
    def cleanup_old_sessions(hours=24):
        """
        Clean up old inactive sessions
        """
        cutoff_time = timezone.now() - timezone.timedelta(hours=hours)
        return KDSSession.objects.filter(
            last_activity__lt=cutoff_time
        ).delete()

    @staticmethod
    def get_zone_summary(zone_printer_id):
        """
        Get summary data for a zone
        """
        items = KDSService.get_zone_items(zone_printer_id)
        alerts = KDSService.get_zone_alerts(zone_printer_id)
        performance = KDSService.get_zone_performance_today(zone_printer_id)

        summary = {
            'zone_id': zone_printer_id,
            'items_by_status': {
                'received': items.filter(kds_status='received').count(),
                'preparing': items.filter(kds_status='preparing').count(),
                'ready': items.filter(kds_status='ready').count(),
                'held': items.filter(kds_status='held').count(),
            },
            'priority_items': items.filter(is_priority=True).count(),
            'overdue_items': sum(1 for item in items if item.is_overdue),
            'active_alerts': alerts.count(),
            'performance': performance
        }

        return summary