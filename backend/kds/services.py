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
    def get_zone_type(zone_printer_id):
        """
        Get the zone type ('kitchen' or 'qc') for a given zone
        Returns 'kitchen' by default for backward compatibility
        """
        try:
            from settings.models import PrinterConfiguration

            config = PrinterConfiguration.objects.first()
            if not config or not config.kitchen_zones:
                return 'kitchen'

            # Find the zone and check its zone_type
            for zone in config.kitchen_zones:
                if zone.get('name') == zone_printer_id or zone.get('printer_name') == zone_printer_id:
                    # Check new zone_type field first, fallback to is_qc_zone for backward compatibility
                    zone_type = zone.get('zone_type')
                    if zone_type in ['kitchen', 'qc']:
                        return zone_type
                    # Backward compatibility: if is_qc_zone is True, return 'qc'
                    return 'qc' if zone.get('is_qc_zone', False) else 'kitchen'

            return 'kitchen'
        except Exception as e:
            print(f"Error getting zone type: {e}")
            return 'kitchen'

    @staticmethod
    def is_qc_zone(zone_printer_id):
        """
        Check if a zone is marked as QC in the printer configuration
        Sync version - use is_qc_zone_async for async contexts
        """
        return KDSService.get_zone_type(zone_printer_id) == 'qc'

    @staticmethod
    async def get_zone_type_async(zone_printer_id):
        """
        Async version of get_zone_type for use in WebSocket consumers
        Returns 'kitchen' by default for backward compatibility
        """
        try:
            from settings.models import PrinterConfiguration
            from asgiref.sync import sync_to_async

            # Create an async version of the database query
            get_config = sync_to_async(PrinterConfiguration.objects.first)
            config = await get_config()

            if not config or not config.kitchen_zones:
                return 'kitchen'

            # Find the zone and check its zone_type
            for zone in config.kitchen_zones:
                if zone.get('name') == zone_printer_id or zone.get('printer_name') == zone_printer_id:
                    # Check new zone_type field first, fallback to is_qc_zone for backward compatibility
                    zone_type = zone.get('zone_type')
                    if zone_type in ['kitchen', 'qc']:
                        return zone_type
                    # Backward compatibility: if is_qc_zone is True, return 'qc'
                    return 'qc' if zone.get('is_qc_zone', False) else 'kitchen'

            return 'kitchen'
        except Exception as e:
            print(f"Error getting zone type async: {e}")
            return 'kitchen'

    @staticmethod
    async def is_qc_zone_async(zone_printer_id):
        """
        Async version of is_qc_zone for use in WebSocket consumers
        """
        zone_type = await KDSService.get_zone_type_async(zone_printer_id)
        return zone_type == 'qc'

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

                            # Create KDS item for each assigned zone (kitchen zones only)
                            for zone_id in assigned_zones:
                                # Skip QC zones - they observe kitchen items, don't create duplicates
                                if KDSService.get_zone_type(zone_id) == 'kitchen':
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

                # Skip QC zones entirely in reappearing logic - they observe kitchen items directly
                if is_qc_zone:
                    continue

                # Reappear completed items for kitchen zones if this zone is getting new items
                if (existing_kds_item.kds_status in ['ready', 'completed'] and
                    zone_getting_new_items):

                    # Determine appropriate status for reappeared item
                    reappear_status = existing_kds_item.kds_status
                    if existing_kds_item.kds_status == 'ready':
                        # For kitchen stations, ready items were completed, so show as completed
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

                        # Create KDS item for each assigned zone (kitchen zones only)
                        for zone_id in assigned_zones:
                            # Skip QC zones - they observe kitchen items, don't create duplicates
                            if KDSService.get_zone_type(zone_id) == 'kitchen':
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
                # Also ensure QC zones are immediately notified
                if kds_items:
                    print("[KDS Service] manual_send_to_kitchen: Ensuring QC zones see manually sent order")
                    from .signals import notify_all_qc_zones_new_order
                    notify_all_qc_zones_new_order(order)

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

    @staticmethod
    def get_kitchen_zone_data(zone_printer_id):
        """
        Get data for kitchen zones - order cards with items for this zone
        """
        # Ensure this is a kitchen zone
        if KDSService.get_zone_type(zone_printer_id) != 'kitchen':
            return []

        items = KDSService.get_zone_items(zone_printer_id)
        print(f"[KDS Service] get_kitchen_zone_data: Found {len(items)} items for zone {zone_printer_id}")

        # Group items by order
        orders_dict = {}
        for item in items:
            order_id = str(item.order_item.order.id)
            if order_id not in orders_dict:
                orders_dict[order_id] = {
                    'id': order_id,
                    'order_number': item.order_item.order.order_number,
                    'customer_name': item.order_item.order.customer_display_name,
                    'order_type': item.order_item.order.order_type,
                    'created_at': item.order_item.order.created_at.isoformat(),
                    'items': [],
                    'overall_status': 'received',  # Will be calculated
                    'earliest_received_at': item.received_at,
                }

            # Add item details for this zone
            orders_dict[order_id]['items'].append({
                'id': str(item.id),
                'product_name': item.order_item.product.name if item.order_item.product else (item.order_item.custom_name or 'Custom Item'),
                'quantity': item.order_item.quantity,
                'status': item.kds_status,
                'special_instructions': item.order_item.notes or '',
                'kitchen_notes': item.kitchen_notes or '',
                'is_priority': item.is_priority,
                'is_overdue': item.is_overdue,
                'estimated_prep_time': item.estimated_prep_time,
                'received_at': item.received_at.isoformat() if item.received_at else None,
                'started_preparing_at': item.started_preparing_at.isoformat() if item.started_preparing_at else None,
                'ready_at': item.ready_at.isoformat() if item.ready_at else None,
            })

            # Track earliest received time
            if item.received_at and (not orders_dict[order_id]['earliest_received_at'] or
                                   item.received_at < orders_dict[order_id]['earliest_received_at']):
                orders_dict[order_id]['earliest_received_at'] = item.received_at

        # Calculate overall status for each order based on items in this zone
        for order_data in orders_dict.values():
            items = order_data['items']
            if all(item['status'] == 'ready' for item in items):
                order_data['overall_status'] = 'ready'
            elif any(item['status'] == 'preparing' for item in items):
                order_data['overall_status'] = 'preparing'
            else:
                order_data['overall_status'] = 'received'

            # Convert earliest_received_at to ISO string
            if order_data['earliest_received_at']:
                order_data['earliest_received_at'] = order_data['earliest_received_at'].isoformat()

        return list(orders_dict.values())

    @staticmethod
    def get_qc_zone_data(zone_printer_id):
        """
        Get data for QC zones - observes kitchen items without duplication
        QC zones watch kitchen zone items directly and can complete orders when all items are ready
        """
        # Ensure this is a QC zone
        if KDSService.get_zone_type(zone_printer_id) != 'qc':
            return []

        # Get all orders that have KDS items in kitchen zones only
        from orders.models import Order

        # Find orders with kitchen zone items
        orders_with_kitchen_items = Order.objects.filter(
            items__kds_items__isnull=False
        ).distinct().select_related().prefetch_related('items__kds_items')

        qc_data = []

        for order in orders_with_kitchen_items:
            # Skip completed orders
            if order.status == 'completed':
                continue

            # Get all KDS items for this order from kitchen zones only
            all_kds_items = KDSOrderItem.objects.filter(order_item__order=order)

            # Filter to only kitchen zones (exclude QC zones entirely)
            kitchen_items = []
            kitchen_zones = {}

            for item in all_kds_items:
                if KDSService.get_zone_type(item.zone_printer_id) == 'kitchen':
                    kitchen_items.append(item)

                    zone_name = item.zone_printer_id
                    if zone_name not in kitchen_zones:
                        kitchen_zones[zone_name] = []

                    kitchen_zones[zone_name].append({
                        'id': str(item.id),
                        'product_name': item.order_item.product.name if item.order_item.product else (item.order_item.custom_name or 'Custom Item'),
                        'quantity': item.order_item.quantity,
                        'status': item.kds_status,
                        'special_instructions': item.order_item.notes or '',
                        'is_priority': item.is_priority,
                        'is_overdue': item.is_overdue,
                        'received_at': item.received_at.isoformat() if item.received_at else None,
                        'ready_at': item.ready_at.isoformat() if item.ready_at else None,
                    })

            if not kitchen_items:
                continue  # No kitchen items for this order

            # Check kitchen item readiness
            all_kitchen_items_ready = all(item.kds_status in ['ready', 'completed'] for item in kitchen_items)
            any_items_preparing = any(item.kds_status == 'preparing' for item in kitchen_items)

            # QC workflow logic:
            # - Show ALL orders including newly received ones (QC needs full visibility)
            # - Prioritize orders that are ready for completion
            has_any_items = len(kitchen_items) > 0

            if has_any_items:
                order_data = {
                    'id': str(order.id),
                    'order_number': order.order_number,
                    'customer_name': order.customer_display_name,
                    'order_type': order.order_type,
                    'created_at': order.created_at.isoformat(),
                    'all_kitchen_items_ready': all_kitchen_items_ready,
                    'any_items_preparing': any_items_preparing,
                    'kitchen_zones': kitchen_zones,
                    'total_kitchen_items': len(kitchen_items),
                    'can_complete': all_kitchen_items_ready,
                    'qc_status': 'ready_for_completion' if all_kitchen_items_ready else 'waiting_for_kitchen',
                    'earliest_received': min((item.received_at for item in kitchen_items if item.received_at), default=None),
                }

                if order_data['earliest_received']:
                    order_data['earliest_received'] = order_data['earliest_received'].isoformat()

                qc_data.append(order_data)

        # Sort by completion readiness, then by time
        qc_data.sort(key=lambda x: (not x['can_complete'], x['earliest_received'] or ''))

        return qc_data

    @staticmethod
    def complete_order_qc(order_id, notes=None):
        """
        Complete an order from QC - transitions kitchen items from ready to completed
        """
        try:
            with transaction.atomic():
                from orders.models import Order

                order = Order.objects.get(id=order_id)

                # Mark all kitchen zone items as completed (regardless of current status)
                # When QC completes an order, all items are considered done
                kitchen_items = KDSOrderItem.objects.filter(
                    order_item__order=order
                ).exclude(kds_status='completed')

                completion_time = timezone.now()
                updated_items = []

                for item in kitchen_items:
                    if KDSService.get_zone_type(item.zone_printer_id) == 'kitchen':
                        print(f"[KDS Service] complete_order_qc: Marking item {item.id} as completed (was {item.kds_status})")
                        item.kds_status = 'completed'
                        item.completed_at = completion_time
                        item.save()
                        updated_items.append(item)

                        # Update metrics for each completed item
                        KDSService._update_metrics_for_item(item)

                print(f"[KDS Service] complete_order_qc: Marked {len(updated_items)} items as completed for order {order.order_number}")

                # Mark the entire order as completed
                order.status = 'completed'
                order.save(update_fields=['status'])

                # Optional: Update QC views with completion notes
                if notes:
                    from .models import QCOrderView
                    qc_views = QCOrderView.objects.filter(order=order)
                    for qc_view in qc_views:
                        qc_view.qc_notes = notes
                        qc_view.qc_status = 'completed'
                        qc_view.qc_completed_at = completion_time
                        qc_view.save()

                return {
                    'order': order,
                    'completed_items': updated_items,
                    'notes': notes
                }
        except Exception as e:
            print(f"Error completing order in QC: {e}")
            return None

    @staticmethod
    def create_or_update_qc_views_for_order(order):
        """
        Create or update QC views when an order is created or items are added
        """
        from .models import QCOrderView
        from settings.models import PrinterConfiguration

        try:
            # Get all QC zones
            config = PrinterConfiguration.objects.first()
            if not config or not config.kitchen_zones:
                return

            qc_zones = [
                zone for zone in config.kitchen_zones
                if KDSService.get_zone_type(zone.get('name', '')) == 'qc'
            ]

            # Create QC views for each QC zone
            for qc_zone in qc_zones:
                zone_name = qc_zone.get('name', '')
                if not zone_name:
                    continue

                qc_view, created = QCOrderView.objects.get_or_create(
                    order=order,
                    qc_zone_printer_id=zone_name,
                    defaults={
                        'qc_status': 'pending'
                    }
                )

                # Update status based on kitchen readiness
                qc_view.update_qc_status()

        except Exception as e:
            print(f"Error creating/updating QC views: {e}")