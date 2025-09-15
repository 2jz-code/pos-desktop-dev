from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import json

from orders.models import Order, OrderItem
from orders.signals import payment_completed
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
        # For web/app orders, always create KDS items on payment
        # For POS orders, only create if none exist (manual send backup)
        if order.order_type in ['WEB', 'APP']:
            # Web orders must wait for payment
            zone_assignments = get_zone_assignments_for_order(order)
            if zone_assignments:
                kds_items = KDSService.create_kds_items_for_order(order, zone_assignments)

                # Broadcast new order to relevant KDS zones
                for kds_item in kds_items:
                    broadcast_new_order_to_zone(kds_item)

        elif order.order_type == 'POS':
            # POS backup: only create if no KDS items exist (manual send wasn't used)
            existing_items = KDSOrderItem.objects.filter(order_item__order=order)

            if not existing_items.exists():
                zone_assignments = get_zone_assignments_for_order(order)
                if zone_assignments:
                    kds_items = KDSService.create_kds_items_for_order(order, zone_assignments)

                    # Broadcast new order to relevant KDS zones
                    for kds_item in kds_items:
                        broadcast_new_order_to_zone(kds_item)

    except Exception as e:
        print(f"Error creating KDS items on payment: {e}")


@receiver(post_save, sender=KDSOrderItem)
def broadcast_kds_item_update(sender, instance, created, **kwargs):
    """
    Broadcast KDS item updates to WebSocket connections
    """
    try:
        if channel_layer:
            zone_group_name = f'kds_zone_{instance.zone_printer_id}'

            # Serialize the KDS item data
            item_data = serialize_kds_item_for_broadcast(instance)

            if created:
                # New KDS item created
                async_to_sync(channel_layer.group_send)(
                    zone_group_name,
                    {
                        'type': 'kds_new_order',
                        'order_data': item_data
                    }
                )
            else:
                # KDS item updated
                async_to_sync(channel_layer.group_send)(
                    zone_group_name,
                    {
                        'type': 'kds_item_updated',
                        'item_data': item_data
                    }
                )

    except Exception as e:
        print(f"Error broadcasting KDS item update: {e}")


def get_zone_assignments_for_order(order):
    """
    Determine zone assignments for order items
    This is where you'd implement your business logic for routing items to zones

    Returns: dict mapping order_item_id to zone_printer_id
    """
    zone_assignments = {}

    try:
        for order_item in order.items.all():
            # Simple logic: assign based on product category or type
            # You can customize this based on your kitchen setup

            zone_id = None

            # Example logic - customize based on your needs
            if hasattr(order_item, 'product') and order_item.product:
                product = order_item.product

                # Map product categories to zones
                if hasattr(product, 'category') and product.category:
                    category_name = product.category.name.lower()

                    if 'grill' in category_name or 'burger' in category_name:
                        zone_id = 'grill_station'
                    elif 'salad' in category_name or 'cold' in category_name:
                        zone_id = 'cold_station'
                    elif 'fry' in category_name or 'fried' in category_name:
                        zone_id = 'fryer_station'
                    elif 'drink' in category_name or 'beverage' in category_name:
                        zone_id = 'drink_station'
                    else:
                        zone_id = 'main_kitchen'  # Default zone
                else:
                    zone_id = 'main_kitchen'  # Default for products without category
            else:
                # Custom items go to main kitchen
                zone_id = 'main_kitchen'

            if zone_id:
                zone_assignments[str(order_item.id)] = zone_id

    except Exception as e:
        print(f"Error determining zone assignments: {e}")

    return zone_assignments


def broadcast_new_order_to_zone(kds_item):
    """
    Broadcast new order to specific zone
    """
    try:
        if channel_layer:
            zone_group_name = f'kds_zone_{kds_item.zone_printer_id}'

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
                'product_name': getattr(kds_item.order_item, 'product_name', 'Custom Item'),
                'quantity': kds_item.order_item.quantity,
                'special_instructions': getattr(kds_item.order_item, 'special_instructions', '') or '',
                'modifiers': getattr(kds_item.order_item, 'modifier_snapshot', []) or []
            }
        }
    except Exception as e:
        print(f"Error serializing KDS item: {e}")
        return {}