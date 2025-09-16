from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import json

from orders.models import Order, OrderItem
from payments.signals import payment_completed
from .models import KDSOrderItem
from .services import KDSService


# Channel layer for WebSocket broadcasting
channel_layer = get_channel_layer()


@receiver(payment_completed)
def create_kds_items_on_payment(sender, order, **kwargs):
    """
    Create KDS items when payment is completed
    - For web/app orders: creates KDS items after payment (required)
    - For POS orders: backup/fallback if manual send wasn't used
    """
    try:
        print(f"[KDS Signals] create_kds_items_on_payment: *** SIGNAL RECEIVED *** for order {order.order_number}, type: {order.order_type}")
        print(f"[KDS Signals] create_kds_items_on_payment: Sender: {sender}, kwargs: {kwargs}")

        # For web/app orders, always create KDS items on payment
        # For POS orders, only create if none exist (manual send backup)
        if order.order_type in ['WEB', 'APP']:
            print("[KDS Signals] create_kds_items_on_payment: Web/App order - creating KDS items")
            # Web orders must wait for payment
            zone_assignments = get_zone_assignments_for_order(order)
            print(f"[KDS Signals] create_kds_items_on_payment: Zone assignments: {zone_assignments}")

            if zone_assignments:
                print("[KDS Signals] create_kds_items_on_payment: Creating KDS items...")
                kds_items = KDSService.create_kds_items_for_order(order, zone_assignments)
                print(f"[KDS Signals] create_kds_items_on_payment: Created {len(kds_items)} KDS items")

                # Note: Broadcasting handled automatically by post_save signal

        elif order.order_type == 'POS':
            print("[KDS Signals] create_kds_items_on_payment: POS order - checking if backup needed")
            # POS backup: only create if no KDS items exist (manual send wasn't used)
            existing_items = KDSOrderItem.objects.filter(order_item__order=order)

            if not existing_items.exists():
                print("[KDS Signals] create_kds_items_on_payment: No existing items - creating as backup")
                zone_assignments = get_zone_assignments_for_order(order)
                if zone_assignments:
                    kds_items = KDSService.create_kds_items_for_order(order, zone_assignments)

                    # Note: Broadcasting handled automatically by post_save signal
            else:
                print(f"[KDS Signals] create_kds_items_on_payment: Found {existing_items.count()} existing items - skipping backup")

        print(f"[KDS Signals] create_kds_items_on_payment: Completed for order {order.order_number}")

    except Exception as e:
        print(f"[KDS Signals] create_kds_items_on_payment: ERROR - {e}")
        import traceback
        print(f"[KDS Signals] create_kds_items_on_payment: TRACEBACK - {traceback.format_exc()}")


@receiver(post_save, sender=KDSOrderItem)
def broadcast_kds_item_update(sender, instance, created, **kwargs):
    """
    Broadcast KDS item updates to WebSocket connections
    """
    try:
        print(f"[KDS Signals] broadcast_kds_item_update: Starting for item {instance.id}, created={created}")

        if channel_layer:
            # Sanitize zone name for WebSocket group (only ASCII alphanumerics, hyphens, underscores, periods)
            sanitized_zone_name = ''.join(c if c.isalnum() or c in '-_.' else '_' for c in instance.zone_printer_id)
            zone_group_name = f'kds_zone_{sanitized_zone_name}'
            print(f"[KDS Signals] broadcast_kds_item_update: Broadcasting to group {zone_group_name}")

            # Serialize the KDS item data
            print("[KDS Signals] broadcast_kds_item_update: Serializing item data...")
            item_data = serialize_kds_item_for_broadcast(instance)

            if created:
                # New KDS item created
                print("[KDS Signals] broadcast_kds_item_update: Sending new order message")
                async_to_sync(channel_layer.group_send)(
                    zone_group_name,
                    {
                        'type': 'kds_new_order',
                        'order_data': item_data
                    }
                )
            else:
                # KDS item updated
                print("[KDS Signals] broadcast_kds_item_update: Sending item updated message")
                async_to_sync(channel_layer.group_send)(
                    zone_group_name,
                    {
                        'type': 'kds_item_updated',
                        'item_data': item_data
                    }
                )

            print(f"[KDS Signals] broadcast_kds_item_update: Successfully broadcasted for item {instance.id}")
        else:
            print("[KDS Signals] broadcast_kds_item_update: No channel layer available")

    except Exception as e:
        print(f"[KDS Signals] broadcast_kds_item_update: ERROR - {e}")
        import traceback
        print(f"[KDS Signals] broadcast_kds_item_update: TRACEBACK - {traceback.format_exc()}")


def get_zone_assignments_for_order(order):
    """
    Determine zone assignments for order items based on printer configuration
    Uses the same category-based mapping that's configured for receipt printing

    Returns: dict mapping order_item_id to zone_printer_id
    """
    zone_assignments = {}

    try:
        print(f"[KDS Signals] get_zone_assignments_for_order: Starting for order {order.order_number}")

        # Get the printer configuration with kitchen zones
        from settings.models import PrinterConfiguration
        config = PrinterConfiguration.objects.first()

        if not config or not config.kitchen_zones:
            print("[KDS Signals] get_zone_assignments_for_order: No printer configuration or kitchen zones found")
            return zone_assignments

        print(f"[KDS Signals] get_zone_assignments_for_order: Found {len(config.kitchen_zones)} kitchen zones")

        for order_item in order.items.all():
            zone_id = None
            category_id = None

            # Get the category ID for this order item
            if hasattr(order_item, 'product') and order_item.product and order_item.product.category:
                category_id = order_item.product.category.id
                print(f"[KDS Signals] get_zone_assignments_for_order: Item {order_item.id} ({order_item.product.name}) has category ID: {category_id}")
            else:
                print(f"[KDS Signals] get_zone_assignments_for_order: Item {order_item.id} has no category or is custom item")

            # Find ALL zones that should handle this category
            # Items can go to multiple zones: specific kitchen zone + QC zones
            assigned_zones = []

            for zone in config.kitchen_zones:
                zone_name = zone.get('name')
                zone_category_ids = zone.get('categories', [])  # Use 'categories' field from your config
                is_qc_zone = zone.get('is_qc_zone', False)

                print(f"[KDS Signals] get_zone_assignments_for_order: Checking zone '{zone_name}' with category_ids: {zone_category_ids}, is_qc_zone: {is_qc_zone}")

                if is_qc_zone:
                    # QC zones always get all items for full order context
                    assigned_zones.append(zone_name)
                    print(f"[KDS Signals] get_zone_assignments_for_order: Assigning to QC zone '{zone_name}' for full context")
                elif category_id and category_id in zone_category_ids:
                    # Kitchen zones get only their category items
                    assigned_zones.append(zone_name)
                    print(f"[KDS Signals] get_zone_assignments_for_order: Found matching kitchen zone '{zone_name}' for category {category_id}")
                elif not zone_category_ids and not any(z for z in assigned_zones if not config.kitchen_zones[next(i for i, zz in enumerate(config.kitchen_zones) if zz.get('name') == z)].get('is_qc_zone', False)):
                    # If no specific kitchen zone found and this is a catch-all kitchen zone
                    assigned_zones.append(zone_name)
                    print(f"[KDS Signals] get_zone_assignments_for_order: Assigning to catch-all kitchen zone '{zone_name}'")

            # If no zones were found, assign to the first non-QC zone as fallback
            if not assigned_zones:
                for zone in config.kitchen_zones:
                    if not zone.get('is_qc_zone', False):
                        assigned_zones.append(zone.get('name'))
                        print(f"[KDS Signals] get_zone_assignments_for_order: No category match, using fallback zone '{zone.get('name')}'")
                        break

            # Store all assigned zones for this item
            if assigned_zones:
                zone_assignments[str(order_item.id)] = assigned_zones
                print(f"[KDS Signals] get_zone_assignments_for_order: Assigned item {order_item.id} to zones {assigned_zones}")

        print(f"[KDS Signals] get_zone_assignments_for_order: Final assignments: {zone_assignments}")

    except Exception as e:
        print(f"[KDS Signals] get_zone_assignments_for_order: ERROR - {e}")
        import traceback
        print(f"[KDS Signals] get_zone_assignments_for_order: TRACEBACK - {traceback.format_exc()}")

    return zone_assignments


def broadcast_new_order_to_zone(kds_item):
    """
    Broadcast new order to specific zone
    """
    try:
        if channel_layer:
            # Sanitize zone name for WebSocket group (only ASCII alphanumerics, hyphens, underscores, periods)
            sanitized_zone_name = ''.join(c if c.isalnum() or c in '-_.' else '_' for c in kds_item.zone_printer_id)
            zone_group_name = f'kds_zone_{sanitized_zone_name}'

            # Serialize the order data
            order_data = serialize_kds_item_for_broadcast(kds_item)

            async_to_sync(channel_layer.group_send)(
                zone_group_name,
                {
                    'type': 'kds_new_order',
                    'order_data': order_data
                }
            )

    except Exception as e:
        print(f"Error broadcasting new order to zone: {e}")


def serialize_kds_item_for_broadcast(kds_item):
    """
    Serialize KDS item for WebSocket broadcast
    """
    try:
        return {
            'id': str(kds_item.id),
            'order_number': kds_item.order_item.order.order_number,
            'customer_name': kds_item.order_item.order.customer_display_name,
            'order_type': kds_item.order_item.order.order_type,
            'status': kds_item.kds_status,
            'is_priority': kds_item.is_priority,
            'kitchen_notes': kds_item.kitchen_notes,
            'estimated_prep_time': kds_item.estimated_prep_time,
            'received_at': kds_item.received_at.isoformat() if kds_item.received_at else None,
            'prep_time_minutes': kds_item.prep_time_minutes,
            'total_time_minutes': kds_item.total_time_minutes,
            'is_overdue': kds_item.is_overdue,
            'zone_id': kds_item.zone_printer_id,
            # Order addition fields
            'is_addition': kds_item.is_addition,
            'is_reappeared_completed': kds_item.is_reappeared_completed,
            'original_completion_time': kds_item.original_completion_time.isoformat() if kds_item.original_completion_time else None,
            'order_item': {
                'id': str(kds_item.order_item.id),
                'product_name': kds_item.order_item.product.name if kds_item.order_item.product else 'Custom Item',
                'quantity': kds_item.order_item.quantity,
                'special_instructions': getattr(kds_item.order_item, 'notes', '') or '',
                'modifiers': [
                    {
                        'modifier_set_name': mod.modifier_set_name,
                        'option_name': mod.option_name,
                        'price_at_sale': str(mod.price_at_sale)
                    }
                    for mod in kds_item.order_item.selected_modifiers_snapshot.all()
                ] if hasattr(kds_item.order_item, 'selected_modifiers_snapshot') else []
            }
        }
    except Exception as e:
        print(f"Error serializing KDS item: {e}")
        return {}