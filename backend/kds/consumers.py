from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone
import json
import logging

from .models import KDSSession
from .services import KDSOrderService, KDSZoneService

logger = logging.getLogger(__name__)


class KDSConsumer(AsyncWebsocketConsumer):
    """Simplified WebSocket consumer for Kitchen Display System"""

    def sanitize_group_name(self, zone_id):
        """Sanitize zone ID to create a valid Django Channels group name"""
        return ''.join(c if c.isalnum() or c in '-_.' else '_' for c in zone_id)

    async def connect(self):
        """Handle WebSocket connection"""
        try:
            # Extract zone info from URL
            self.zone_id = self.scope['url_route']['kwargs'].get('zone_id')

            if not self.zone_id:
                logger.error("No zone_id provided in WebSocket connection")
                await self.close()
                return

            # Generate terminal ID for this session
            query_string = self.scope.get('query_string', b'').decode()
            if 'terminal_id=' in query_string:
                self.terminal_id = query_string.split('terminal_id=')[-1].split('&')[0]
            else:
                user_agent = dict(self.scope.get('headers', {})).get(b'user-agent', b'').decode()
                client_ip = dict(self.scope.get('headers', {})).get(b'x-forwarded-for', b'').decode().split(',')[0]
                session_hash = hash(f"{user_agent}{client_ip}")
                self.terminal_id = f"{self.zone_id}_terminal_{abs(session_hash) % 1000000}"

            # Create sanitized group name
            sanitized_zone_id = self.sanitize_group_name(self.zone_id)
            self.group_name = f'kds_zone_{sanitized_zone_id}'

            # Join group
            await self.channel_layer.group_add(self.group_name, self.channel_name)
            await self.accept()

            # Create session and send initial data
            await self.create_session()
            await self.send_initial_data()

            logger.info(f"KDS WebSocket connected: zone={self.zone_id}, terminal={self.terminal_id}")

        except Exception as e:
            logger.error(f"Error connecting WebSocket: {e}")
            await self.close()

    async def disconnect(self, close_code):
        """Handle WebSocket disconnection"""
        try:
            # Leave group
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

            # Update session as inactive
            await self.update_session_inactive()

            logger.info(f"KDS WebSocket disconnected: zone={self.zone_id}, code={close_code}")

        except Exception as e:
            logger.error(f"Error disconnecting WebSocket: {e}")

    async def receive(self, text_data):
        """Handle messages from WebSocket"""
        try:
            data = json.loads(text_data)
            action = data.get('action')

            logger.debug(f"Received WebSocket action: {action} for zone {self.zone_id}")

            if action == 'update_item_status':
                await self.handle_update_item_status(data)
            elif action == 'complete_order':
                await self.handle_complete_order(data)
            elif action == 'mark_priority':
                await self.handle_mark_priority(data)
            elif action == 'add_note':
                await self.handle_add_note(data)
            elif action == 'ping':
                await self.handle_ping()
            elif action == 'refresh_data':
                await self.send_initial_data()
            else:
                await self.send_error(f"Unknown action: {action}")

        except json.JSONDecodeError:
            await self.send_error("Invalid JSON format")
        except Exception as e:
            logger.error(f"Error processing WebSocket message: {e}")
            await self.send_error(f"Error processing request: {str(e)}")

    async def handle_update_item_status(self, data):
        """Handle item status update"""
        try:
            item_id = data.get('item_id')
            new_status = data.get('status')

            if not item_id or not new_status:
                await self.send_error("Missing item_id or status")
                return

            success = await database_sync_to_async(
                KDSOrderService.transition_item_status
            )(item_id, new_status)

            if success:
                await self.update_session_activity()
                await self.send_success("Item status updated successfully")
            else:
                await self.send_error("Failed to update item status")

        except Exception as e:
            logger.error(f"Error updating item status: {e}")
            await self.send_error(f"Error updating item status: {str(e)}")

    async def handle_complete_order(self, data):
        """Handle QC order completion"""
        try:
            order_id = data.get('order_id')

            if not order_id:
                await self.send_error("Missing order_id")
                return

            success = await database_sync_to_async(
                KDSOrderService.complete_order_from_qc
            )(order_id)

            if success:
                await self.update_session_activity()
                await self.send_success("Order completed successfully")
            else:
                await self.send_error("Failed to complete order")

        except Exception as e:
            logger.error(f"Error completing order: {e}")
            await self.send_error(f"Error completing order: {str(e)}")

    async def handle_mark_priority(self, data):
        """Handle item priority marking"""
        try:
            item_id = data.get('item_id')
            is_priority = data.get('is_priority', True)

            if not item_id:
                await self.send_error("Missing item_id")
                return

            success = await database_sync_to_async(
                KDSOrderService.mark_item_priority
            )(item_id, is_priority)

            if success:
                await self.update_session_activity()
                await self.send_success("Item priority updated successfully")
            else:
                await self.send_error("Failed to update item priority")

        except Exception as e:
            logger.error(f"Error marking priority: {e}")
            await self.send_error(f"Error marking priority: {str(e)}")

    async def handle_add_note(self, data):
        """Handle adding note to item"""
        try:
            item_id = data.get('item_id')
            note = data.get('note', '')

            if not item_id:
                await self.send_error("Missing item_id")
                return

            success = await database_sync_to_async(
                KDSOrderService.add_item_note
            )(item_id, note)

            if success:
                await self.update_session_activity()
                await self.send_success("Note added successfully")
            else:
                await self.send_error("Failed to add note")

        except Exception as e:
            logger.error(f"Error adding note: {e}")
            await self.send_error(f"Error adding note: {str(e)}")

    async def handle_ping(self):
        """Handle ping to keep connection alive"""
        await self.update_session_activity()
        await self.send(text_data=json.dumps({
            'type': 'pong',
            'timestamp': timezone.now().isoformat()
        }))

    async def send_initial_data(self):
        """Send initial zone data"""
        try:
            zone_data = await self.get_zone_data()

            await self.send(text_data=json.dumps({
                'type': 'initial_data',
                'data': zone_data
            }))

            logger.debug(f"Sent initial data to zone {self.zone_id}: {len(zone_data.get('orders', []))} orders")

        except Exception as e:
            logger.error(f"Error sending initial data: {e}")
            await self.send_error(f"Error loading initial data: {str(e)}")

    async def send_success(self, message):
        """Send success message"""
        await self.send(text_data=json.dumps({
            'type': 'success',
            'message': message
        }))

    async def send_error(self, message):
        """Send error message"""
        await self.send(text_data=json.dumps({
            'type': 'error',
            'message': message
        }))

    @database_sync_to_async
    def get_zone_data(self):
        """Get data for this zone"""
        try:
            zone = KDSZoneService.get_zone(self.zone_id)
            if not zone:
                logger.error(f"Zone {self.zone_id} not found")
                return {
                    'zone_id': self.zone_id,
                    'zone_type': 'unknown',
                    'orders': [],
                    'error': f'Zone {self.zone_id} not found'
                }

            orders = zone.get_orders()
            logger.info(f"Zone {self.zone_id} returning {len(orders)} orders: {[o.get('order_number') for o in orders]}")

            return {
                'zone_id': self.zone_id,
                'zone_type': zone.zone_type,
                'is_qc_station': zone.zone_type == 'qc',
                'orders': orders,
                'terminal_id': self.terminal_id,
            }

        except Exception as e:
            logger.error(f"Error getting zone data for {self.zone_id}: {e}")
            return {
                'zone_id': self.zone_id,
                'zone_type': 'unknown',
                'orders': [],
                'error': str(e)
            }

    @database_sync_to_async
    def create_session(self):
        """Create or update KDS session"""
        try:
            session, created = KDSSession.objects.get_or_create(
                zone_id=self.zone_id,
                terminal_id=self.terminal_id,
                defaults={'is_active': True}
            )
            if not created:
                session.is_active = True
                session.save()
            return session
        except Exception as e:
            logger.error(f"Error creating session: {e}")
            return None

    @database_sync_to_async
    def update_session_activity(self):
        """Update session last activity"""
        try:
            session = KDSSession.objects.get(
                zone_id=self.zone_id,
                terminal_id=self.terminal_id
            )
            session.update_activity()
        except KDSSession.DoesNotExist:
            logger.warning(f"Session not found for zone {self.zone_id}, terminal {self.terminal_id}")
        except Exception as e:
            logger.error(f"Error updating session activity: {e}")

    @database_sync_to_async
    def update_session_inactive(self):
        """Mark session as inactive"""
        try:
            session = KDSSession.objects.get(
                zone_id=self.zone_id,
                terminal_id=self.terminal_id
            )
            session.is_active = False
            session.save()
        except KDSSession.DoesNotExist:
            pass
        except Exception as e:
            logger.error(f"Error updating session inactive: {e}")

    # Event handlers for group messages
    async def kds_notification(self, event):
        """Handle KDS notifications from the event system"""
        try:
            message_type = event['message_type']
            data = event['data']

            logger.debug(f"Received notification: {message_type} for zone {self.zone_id}")

            # Handle different notification types
            if message_type in ['order_created', 'order_status_changed', 'item_status_changed',
                               'item_priority_changed', 'item_note_changed', 'refresh_data']:
                # For all these events, refresh the zone data
                await self.send_zone_data_update()
            elif message_type == 'order_completed':
                # Special handling for order completion
                await self.send_zone_data_update()
                await self.send(text_data=json.dumps({
                    'type': 'order_completed',
                    'data': data
                }))
            else:
                # Forward other notifications as-is
                await self.send(text_data=json.dumps({
                    'type': message_type,
                    'data': data
                }))

        except Exception as e:
            logger.error(f"Error handling notification: {e}")

    async def send_zone_data_update(self):
        """Send updated zone data"""
        try:
            zone_data = await self.get_zone_data()

            await self.send(text_data=json.dumps({
                'type': 'zone_data_updated',
                'data': zone_data
            }))

        except Exception as e:
            logger.error(f"Error sending zone data update: {e}")