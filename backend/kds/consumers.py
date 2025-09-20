from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone
import json
import logging

from .models import KDSSession
from .services import KDSOrderService, KDSZoneService
from .services.history_service import KDSHistoryService

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
            elif action == 'get_history':
                await self.handle_get_history(data)
            elif action == 'search_history':
                await self.handle_search_history(data)
            elif action == 'get_order_timeline':
                await self.handle_get_order_timeline(data)
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
                self._transition_item_status_by_id
            )(item_id, new_status)

            if success:
                await self.update_session_activity()
                await self.send_success("Item status updated successfully")
            else:
                await self.send_error("Failed to update item status")

        except Exception as e:
            logger.error(f"Error updating item status: {e}")
            await self.send_error(f"Error updating item status: {str(e)}")

    def _transition_item_status_by_id(self, item_id, new_status):
        """Helper method to transition item status by ID"""
        try:
            from .models import KDSOrderItem
            kds_item = KDSOrderItem.objects.get(id=item_id)
            return KDSOrderService.transition_item_status(kds_item, new_status)
        except KDSOrderItem.DoesNotExist:
            logger.error(f"KDS item {item_id} not found")
            return False
        except Exception as e:
            logger.error(f"Error transitioning item status: {e}")
            return False

    async def handle_complete_order(self, data):
        """Handle QC order completion"""
        try:
            order_id = data.get('order_id')

            if not order_id:
                await self.send_error("Missing order_id")
                return

            success = await database_sync_to_async(
                self._complete_order_by_id
            )(order_id)

            if success:
                await self.update_session_activity()
                await self.send_success("Order completed successfully")
            else:
                await self.send_error("Failed to complete order")

        except Exception as e:
            logger.error(f"Error completing order: {e}")
            await self.send_error(f"Error completing order: {str(e)}")

    def _complete_order_by_id(self, order_id):
        """Helper method to complete order by ID"""
        try:
            from .models import KDSOrder
            kds_order = KDSOrder.objects.get(id=order_id)
            return KDSOrderService.complete_order_from_qc(kds_order.id)
        except KDSOrder.DoesNotExist:
            logger.error(f"KDS order {order_id} not found")
            return False
        except Exception as e:
            logger.error(f"Error completing order: {e}")
            return False

    async def handle_mark_priority(self, data):
        """Handle item priority marking"""
        try:
            item_id = data.get('item_id')
            is_priority = data.get('is_priority', True)

            if not item_id:
                await self.send_error("Missing item_id")
                return

            success = await database_sync_to_async(
                self._mark_item_priority_by_id
            )(item_id, is_priority)

            if success:
                await self.update_session_activity()
                await self.send_success("Item priority updated successfully")
            else:
                await self.send_error("Failed to update item priority")

        except Exception as e:
            logger.error(f"Error marking priority: {e}")
            await self.send_error(f"Error marking priority: {str(e)}")

    def _mark_item_priority_by_id(self, item_id, is_priority):
        """Helper method to mark item priority by ID"""
        try:
            from .models import KDSOrderItem
            kds_item = KDSOrderItem.objects.get(id=item_id)
            return KDSOrderService.mark_item_priority(kds_item.id, is_priority)
        except KDSOrderItem.DoesNotExist:
            logger.error(f"KDS item {item_id} not found")
            return False
        except Exception as e:
            logger.error(f"Error marking item priority: {e}")
            return False

    async def handle_add_note(self, data):
        """Handle adding note to item"""
        try:
            item_id = data.get('item_id')
            note = data.get('note', '')

            if not item_id:
                await self.send_error("Missing item_id")
                return

            success = await database_sync_to_async(
                self._add_item_note_by_id
            )(item_id, note)

            if success:
                await self.update_session_activity()
                await self.send_success("Note added successfully")
            else:
                await self.send_error("Failed to add note")

        except Exception as e:
            logger.error(f"Error adding note: {e}")
            await self.send_error(f"Error adding note: {str(e)}")

    def _add_item_note_by_id(self, item_id, note):
        """Helper method to add note to item by ID"""
        try:
            from .models import KDSOrderItem
            kds_item = KDSOrderItem.objects.get(id=item_id)
            return KDSOrderService.add_item_note(kds_item.id, note)
        except KDSOrderItem.DoesNotExist:
            logger.error(f"KDS item {item_id} not found")
            return False
        except Exception as e:
            logger.error(f"Error adding note to item: {e}")
            return False

    async def handle_ping(self):
        """Handle ping to keep connection alive"""
        await self.update_session_activity()
        await self.send(text_data=json.dumps({
            'type': 'pong',
            'timestamp': timezone.now().isoformat()
        }))

    async def handle_get_history(self, data):
        """Handle getting paginated history for this zone"""
        try:
            page = data.get('page', 1)
            page_size = data.get('page_size', 50)
            date_from_str = data.get('date_from')
            date_to_str = data.get('date_to')

            # Parse date filters
            date_from, date_to = await database_sync_to_async(
                KDSHistoryService.parse_date_filters
            )(date_from_str, date_to_str)

            # Get history data
            history_data = await database_sync_to_async(
                KDSHistoryService.get_zone_history
            )(
                zone_id=self.zone_id,
                page=page,
                page_size=page_size,
                date_from=date_from,
                date_to=date_to
            )

            await self.update_session_activity()
            await self.send(text_data=json.dumps({
                'type': 'history_data',
                'data': history_data
            }))

            logger.debug(f"Sent history data to zone {self.zone_id}: page {page}, {len(history_data.get('orders', []))} orders")

        except Exception as e:
            logger.error(f"Error getting history: {e}")
            await self.send_error(f"Error loading history: {str(e)}")

    async def handle_search_history(self, data):
        """Handle searching history across zones or within current zone"""
        try:
            search_term = data.get('search_term', '').strip()
            page = data.get('page', 1)
            page_size = data.get('page_size', 50)
            date_from_str = data.get('date_from')
            date_to_str = data.get('date_to')
            search_all_zones = data.get('search_all_zones', False)

            if not search_term or len(search_term) < 2:
                await self.send_error("Search term must be at least 2 characters")
                return

            # Parse date filters
            date_from, date_to = await database_sync_to_async(
                KDSHistoryService.parse_date_filters
            )(date_from_str, date_to_str)

            # Choose search method based on scope
            if search_all_zones:
                search_data = await database_sync_to_async(
                    KDSHistoryService.search_all_zones
                )(
                    search_term=search_term,
                    page=page,
                    page_size=page_size,
                    date_from=date_from,
                    date_to=date_to
                )
            else:
                search_data = await database_sync_to_async(
                    KDSHistoryService.get_zone_history
                )(
                    zone_id=self.zone_id,
                    page=page,
                    page_size=page_size,
                    date_from=date_from,
                    date_to=date_to,
                    search_term=search_term
                )

            await self.update_session_activity()
            await self.send(text_data=json.dumps({
                'type': 'search_results',
                'data': search_data
            }))

            logger.debug(f"Sent search results to zone {self.zone_id}: '{search_term}', {len(search_data.get('orders', []))} results")

        except Exception as e:
            logger.error(f"Error searching history: {e}")
            await self.send_error(f"Error searching history: {str(e)}")

    async def handle_get_order_timeline(self, data):
        """Handle getting detailed timeline for a specific order"""
        try:
            order_id = data.get('order_id')

            if not order_id:
                await self.send_error("Missing order_id")
                return

            timeline_data = await database_sync_to_async(
                KDSHistoryService.get_order_timeline
            )(order_id)

            await self.update_session_activity()
            await self.send(text_data=json.dumps({
                'type': 'order_timeline',
                'data': timeline_data
            }))

            logger.debug(f"Sent timeline data for order {order_id} to zone {self.zone_id}")

        except Exception as e:
            logger.error(f"Error getting order timeline: {e}")
            await self.send_error(f"Error loading order timeline: {str(e)}")

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

    @database_sync_to_async
    def _order_has_items_in_zone(self, order_id):
        """Check if an order has items assigned to this zone"""
        try:
            from .models import KDSOrderItem
            return KDSOrderItem.objects.filter(
                kds_order__id=order_id,
                assigned_zone=self.zone_id
            ).exists()
        except Exception as e:
            logger.error(f"Error checking if order {order_id} has items in zone {self.zone_id}: {e}")
            return False

    # Event handlers for group messages
    async def kds_notification(self, event):
        """Handle KDS notifications from the event system"""
        try:
            message_type = event['message_type']
            data = event['data']

            print(f"🔔 Zone {self.zone_id} received notification: {message_type}")
            print(f"🔔 Data: {data}")

            # Handle different notification types
            if message_type == 'refresh_data':
                # Always refresh for explicit refresh requests
                print(f"🔄 Zone {self.zone_id}: Refreshing for explicit refresh request")
                await self.send_zone_data_update()
            elif message_type == 'order_created':
                # Always refresh for new orders
                print(f"🔄 Zone {self.zone_id}: Refreshing for order creation")
                await self.send_zone_data_update()
            elif message_type == 'order_status_changed':
                # Only refresh if this order has items in this zone
                order_id = data.get('order_id')
                has_items_in_zone = await self._order_has_items_in_zone(order_id)
                if has_items_in_zone:
                    print(f"✅ Zone {self.zone_id}: Order {data.get('order_number')} has items in this zone, refreshing")
                    await self.send_zone_data_update()
                else:
                    print(f"❌ Zone {self.zone_id}: Order {data.get('order_number')} has no items in this zone, ignoring")
            elif message_type in ['item_status_changed', 'item_priority_changed', 'item_note_changed']:
                # Only refresh if the item belongs to this zone
                item_zone_id = data.get('zone_id')
                print(f"🎯 Zone {self.zone_id}: Item belongs to zone {item_zone_id}")
                if item_zone_id == self.zone_id:
                    print(f"✅ Zone {self.zone_id}: Item {data.get('item_id')} belongs to this zone, refreshing data")
                    await self.send_zone_data_update()
                else:
                    print(f"❌ Zone {self.zone_id}: Item {data.get('item_id')} belongs to zone {item_zone_id}, ignoring")
            elif message_type == 'order_completed':
                # Special handling for order completion
                print(f"🔄 Zone {self.zone_id}: Refreshing for order completion")
                await self.send_zone_data_update()
                await self.send(text_data=json.dumps({
                    'type': 'order_completed',
                    'data': data
                }))
            else:
                # Forward other notifications as-is
                print(f"📤 Zone {self.zone_id}: Forwarding notification: {message_type}")
                await self.send(text_data=json.dumps({
                    'type': message_type,
                    'data': data
                }))

        except Exception as e:
            logger.error(f"Error handling notification: {e}")
            print(f"❌ Zone {self.zone_id}: Error handling notification: {e}")

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