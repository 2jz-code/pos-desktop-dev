from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone
import json
import uuid
import re

from .models import KDSSession, KDSOrderItem, KDSAlert
from .services import KDSService


class KDSConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for Kitchen Display System
    Handles real-time updates for kitchen workflows
    """

    def sanitize_group_name(self, zone_id):
        """
        Sanitize zone ID to create a valid Django Channels group name.
        Group names must contain only ASCII alphanumerics, hyphens, underscores, or periods.
        """
        # Replace any non-alphanumeric characters with underscores
        sanitized = re.sub(r'[^a-zA-Z0-9\-_.]', '_', zone_id)
        # Remove consecutive underscores
        sanitized = re.sub(r'_+', '_', sanitized)
        # Remove leading/trailing underscores
        sanitized = sanitized.strip('_')
        return sanitized

    async def connect(self):
        """
        Handle WebSocket connection
        """
        # Extract zone and terminal info from URL or query params
        self.zone_printer_id = self.scope['url_route']['kwargs'].get('zone_id')
        self.terminal_id = self.scope.get('query_string', b'').decode().split('terminal_id=')[-1] or str(uuid.uuid4())

        if not self.zone_printer_id:
            await self.close()
            return

        # Create KDS group name for this zone (sanitized for Channels)
        sanitized_zone_id = self.sanitize_group_name(self.zone_printer_id)
        self.kds_group_name = f'kds_zone_{sanitized_zone_id}'

        # Join KDS group
        await self.channel_layer.group_add(
            self.kds_group_name,
            self.channel_name
        )

        # Accept WebSocket connection
        await self.accept()

        # Create or update KDS session
        await self.create_kds_session()

        # Send initial data
        await self.send_initial_data()

    async def disconnect(self, close_code):
        """
        Handle WebSocket disconnection
        """
        # Leave KDS group
        await self.channel_layer.group_discard(
            self.kds_group_name,
            self.channel_name
        )

        # Update session as inactive
        await self.update_session_inactive()

    async def receive(self, text_data):
        """
        Handle messages from WebSocket
        """
        try:
            data = json.loads(text_data)
            action = data.get('action')

            if action == 'update_item_status':
                await self.handle_update_item_status(data)
            elif action == 'ping':
                await self.handle_ping()
            elif action == 'mark_priority':
                await self.handle_mark_priority(data)
            elif action == 'add_kitchen_note':
                await self.handle_add_kitchen_note(data)
            else:
                await self.send_error(f"Unknown action: {action}")

        except json.JSONDecodeError:
            await self.send_error("Invalid JSON format")
        except Exception as e:
            await self.send_error(f"Error processing request: {str(e)}")

    async def handle_update_item_status(self, data):
        """
        Update KDS item status (received -> preparing -> ready -> completed)
        """
        kds_item_id = data.get('kds_item_id')
        new_status = data.get('status')

        if not kds_item_id or not new_status:
            await self.send_error("Missing kds_item_id or status")
            return

        try:
            # Update item status using service
            updated_item = await database_sync_to_async(
                KDSService.update_item_status
            )(kds_item_id, new_status)

            if updated_item:
                # Broadcast update to all terminals in this zone
                await self.channel_layer.group_send(
                    self.kds_group_name,
                    {
                        'type': 'kds_item_updated',
                        'item_data': await self.serialize_kds_item(updated_item)
                    }
                )

                # Update session activity
                await self.update_session_activity()
            else:
                await self.send_error("Failed to update item status")

        except Exception as e:
            await self.send_error(f"Error updating item status: {str(e)}")

    async def handle_ping(self):
        """
        Handle ping to keep connection alive and update session activity
        """
        await self.update_session_activity()
        await self.send(text_data=json.dumps({
            'type': 'pong',
            'timestamp': timezone.now().isoformat()
        }))

    async def handle_mark_priority(self, data):
        """
        Mark item as priority
        """
        kds_item_id = data.get('kds_item_id')
        is_priority = data.get('is_priority', True)

        try:
            updated_item = await database_sync_to_async(
                KDSService.mark_item_priority
            )(kds_item_id, is_priority)

            if updated_item:
                # Broadcast update to all terminals in this zone
                await self.channel_layer.group_send(
                    self.kds_group_name,
                    {
                        'type': 'kds_item_updated',
                        'item_data': await self.serialize_kds_item(updated_item)
                    }
                )
            else:
                await self.send_error("Failed to mark item priority")

        except Exception as e:
            await self.send_error(f"Error marking priority: {str(e)}")

    async def handle_add_kitchen_note(self, data):
        """
        Add kitchen note to item
        """
        kds_item_id = data.get('kds_item_id')
        note = data.get('note', '')

        try:
            updated_item = await database_sync_to_async(
                KDSService.add_kitchen_note
            )(kds_item_id, note)

            if updated_item:
                # Broadcast update to all terminals in this zone
                await self.channel_layer.group_send(
                    self.kds_group_name,
                    {
                        'type': 'kds_item_updated',
                        'item_data': await self.serialize_kds_item(updated_item)
                    }
                )
            else:
                await self.send_error("Failed to add kitchen note")

        except Exception as e:
            await self.send_error(f"Error adding note: {str(e)}")

    # Group message handlers
    async def kds_item_updated(self, event):
        """
        Send KDS item update to WebSocket
        """
        await self.send(text_data=json.dumps({
            'type': 'item_updated',
            'data': event['item_data']
        }))

    async def kds_new_order(self, event):
        """
        Send new order notification to WebSocket
        """
        await self.send(text_data=json.dumps({
            'type': 'new_order',
            'data': event['order_data']
        }))

    async def kds_alert(self, event):
        """
        Send alert to WebSocket
        """
        await self.send(text_data=json.dumps({
            'type': 'alert',
            'data': event['alert_data']
        }))

    # Helper methods
    async def send_initial_data(self):
        """
        Send initial KDS data when client connects
        """
        try:
            # Determine if this is a QC station
            is_qc_station = await database_sync_to_async(
                KDSService.is_qc_zone
            )(self.zone_printer_id)

            # Get all active items for this zone
            items = await database_sync_to_async(
                KDSService.get_zone_items
            )(self.zone_printer_id, is_qc_station=is_qc_station)

            # Get active alerts for this zone
            alerts = await database_sync_to_async(
                KDSService.get_zone_alerts
            )(self.zone_printer_id)

            await self.send(text_data=json.dumps({
                'type': 'initial_data',
                'data': {
                    'items': [await self.serialize_kds_item(item) for item in items],
                    'alerts': [await self.serialize_alert(alert) for alert in alerts],
                    'zone_id': self.zone_printer_id,
                    'terminal_id': self.terminal_id,
                    'is_qc_station': is_qc_station
                }
            }))

        except Exception as e:
            await self.send_error(f"Error loading initial data: {str(e)}")

    async def send_error(self, message):
        """
        Send error message to WebSocket
        """
        await self.send(text_data=json.dumps({
            'type': 'error',
            'message': message
        }))

    @database_sync_to_async
    def create_kds_session(self):
        """
        Create or update KDS session
        """
        session, created = KDSSession.objects.get_or_create(
            zone_printer_id=self.zone_printer_id,
            terminal_id=self.terminal_id,
            defaults={'is_active': True}
        )
        if not created:
            session.is_active = True
            session.save()
        return session

    @database_sync_to_async
    def update_session_activity(self):
        """
        Update session last activity
        """
        try:
            session = KDSSession.objects.get(
                zone_printer_id=self.zone_printer_id,
                terminal_id=self.terminal_id
            )
            session.update_activity()
        except KDSSession.DoesNotExist:
            pass

    @database_sync_to_async
    def update_session_inactive(self):
        """
        Mark session as inactive
        """
        try:
            session = KDSSession.objects.get(
                zone_printer_id=self.zone_printer_id,
                terminal_id=self.terminal_id
            )
            session.is_active = False
            session.save()
        except KDSSession.DoesNotExist:
            pass

    @database_sync_to_async
    def serialize_kds_item(self, kds_item):
        """
        Serialize KDS item for WebSocket transmission
        """
        return {
            'id': str(kds_item.id),
            'order_number': kds_item.order_item.order.order_number,
            'customer_name': kds_item.order_item.order.customer_display_name,
            'order_type': kds_item.order_item.order.order_type,
            'status': kds_item.kds_status,
            'is_priority': kds_item.is_priority,
            'kitchen_notes': kds_item.kitchen_notes,
            'estimated_prep_time': kds_item.estimated_prep_time,
            'received_at': kds_item.received_at.isoformat(),
            'prep_time_minutes': kds_item.prep_time_minutes,
            'total_time_minutes': kds_item.total_time_minutes,
            'is_overdue': kds_item.is_overdue,
            # Order addition fields
            'is_addition': kds_item.is_addition,
            'is_reappeared_completed': kds_item.is_reappeared_completed,
            'original_completion_time': kds_item.original_completion_time.isoformat() if kds_item.original_completion_time else None,
            'order_item': {
                'id': str(kds_item.order_item.id),
                'product_name': getattr(kds_item.order_item, 'product_name', 'Custom Item'),
                'quantity': kds_item.order_item.quantity,
                'special_instructions': kds_item.order_item.special_instructions or '',
                'modifiers': kds_item.order_item.modifier_snapshot or []
            }
        }

    @database_sync_to_async
    def serialize_alert(self, alert):
        """
        Serialize alert for WebSocket transmission
        """
        return {
            'id': str(alert.id),
            'type': alert.alert_type,
            'priority': alert.priority,
            'title': alert.title,
            'message': alert.message,
            'is_active': alert.is_active,
            'created_at': alert.created_at.isoformat()
        }