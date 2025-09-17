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
        print(f"[KDS] WebSocket connect started for zone: {self.scope['url_route']['kwargs'].get('zone_id')}")

        # Extract zone and terminal info from URL or query params
        self.zone_printer_id = self.scope['url_route']['kwargs'].get('zone_id')

        # Generate a consistent terminal ID based on session or create a persistent one
        query_string = self.scope.get('query_string', b'').decode()
        if 'terminal_id=' in query_string:
            self.terminal_id = query_string.split('terminal_id=')[-1].split('&')[0]
        else:
            # Create a browser-session-specific terminal ID
            # Use the zone + a hash of user agent and IP for consistency within a session
            user_agent = dict(self.scope.get('headers', {})).get(b'user-agent', b'').decode()
            client_ip = dict(self.scope.get('headers', {})).get(b'x-forwarded-for', b'').decode().split(',')[0]
            session_hash = hash(f"{user_agent}{client_ip}")
            self.terminal_id = f"{self.zone_printer_id}_terminal_{abs(session_hash) % 1000000}"

        print(f"[KDS] Zone ID: {self.zone_printer_id}, Terminal ID: {self.terminal_id}")

        if not self.zone_printer_id:
            print("[KDS] No zone_printer_id provided, closing connection")
            await self.close()
            return

        # Create KDS group name for this zone (sanitized for Channels)
        sanitized_zone_id = self.sanitize_group_name(self.zone_printer_id)
        self.kds_group_name = f'kds_zone_{sanitized_zone_id}'

        print(f"[KDS] Joining group: {self.kds_group_name}")

        # Join KDS group
        await self.channel_layer.group_add(
            self.kds_group_name,
            self.channel_name
        )

        # Accept WebSocket connection
        await self.accept()
        print("[KDS] WebSocket connection accepted")

        # Create or update KDS session
        print("[KDS] Creating KDS session...")
        await self.create_kds_session()

        # Send initial data
        print("[KDS] Sending initial data...")
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
            elif action == 'complete_order_qc':
                await self.handle_complete_order_qc(data)
            elif action == 'ping':
                await self.handle_ping()
            elif action == 'mark_priority':
                await self.handle_mark_priority(data)
            elif action == 'add_kitchen_note':
                await self.handle_add_kitchen_note(data)
            elif action == 'add_qc_note':
                await self.handle_add_qc_note(data)
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

                # If this is a kitchen zone, notify QC zones of any status change
                if await KDSService.get_zone_type_async(self.zone_printer_id) == 'kitchen':
                    await self.notify_qc_zones_kitchen_item_changed(updated_item)

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

    async def handle_complete_order_qc(self, data):
        """
        Complete an order from QC - simplified workflow
        """
        order_id = data.get('order_id')
        notes = data.get('notes', None)

        try:
            completed_order = await database_sync_to_async(
                KDSService.complete_order_qc
            )(order_id, notes)

            if completed_order:
                # Get fresh QC zone data and broadcast to all QC terminals
                qc_zone_data = await database_sync_to_async(
                    KDSService.get_qc_zone_data
                )(self.zone_printer_id)

                await self.channel_layer.group_send(
                    self.kds_group_name,
                    {
                        'type': 'qc_data_updated',
                        'zone_data': qc_zone_data
                    }
                )

                # Notify kitchen zones that order was completed
                # Extract the order from the result dict
                order = completed_order.get('order') if isinstance(completed_order, dict) else completed_order
                await self.notify_kitchen_zones_order_completed(order)

            else:
                await self.send_error("Failed to complete order")

        except Exception as e:
            await self.send_error(f"Error completing order: {str(e)}")

    async def handle_add_qc_note(self, data):
        """
        Add QC note to order
        """
        qc_view_id = data.get('qc_view_id')
        note = data.get('note', '')

        try:
            updated_qc_view = await database_sync_to_async(
                KDSService.update_qc_status
            )(qc_view_id, None, note)  # Status unchanged, just note

            if updated_qc_view:
                # Get fresh QC zone data and broadcast
                qc_zone_data = await database_sync_to_async(
                    KDSService.get_qc_zone_data
                )(self.zone_printer_id)

                await self.channel_layer.group_send(
                    self.kds_group_name,
                    {
                        'type': 'qc_data_updated',
                        'zone_data': qc_zone_data
                    }
                )
            else:
                await self.send_error("Failed to add QC note")

        except Exception as e:
            await self.send_error(f"Error adding QC note: {str(e)}")

    async def notify_kitchen_zones_order_completed(self, order):
        """
        Notify all kitchen zones that an order has been completed by QC
        """
        try:
            print(f"[KDS] Notifying kitchen zones of order completion: {order.order_number}")
            from settings.models import PrinterConfiguration

            config = await database_sync_to_async(
                PrinterConfiguration.objects.first
            )()

            if config and config.kitchen_zones:
                kitchen_zones_notified = 0
                for zone in config.kitchen_zones:
                    zone_name = zone.get('name', '')
                    if zone_name and await KDSService.get_zone_type_async(zone_name) == 'kitchen':
                        # Send completion notification to kitchen zone
                        sanitized_zone_id = self.sanitize_group_name(zone_name)
                        kitchen_group_name = f'kds_zone_{sanitized_zone_id}'

                        print(f"[KDS] Sending completion notification to kitchen zone: {zone_name}")

                        await self.channel_layer.group_send(
                            kitchen_group_name,
                            {
                                'type': 'order_completed_by_qc',
                                'order_data': {
                                    'order_id': str(order.id),
                                    'order_number': order.order_number
                                }
                            }
                        )
                        kitchen_zones_notified += 1

                print(f"[KDS] Notified {kitchen_zones_notified} kitchen zones of order completion")
            else:
                print("[KDS] No printer configuration or kitchen zones found for completion notification")

        except Exception as e:
            print(f"Error notifying kitchen zones of completion: {e}")

    async def notify_qc_zones_kitchen_item_changed(self, updated_item):
        """
        Notify all QC zones when any kitchen item status changes
        """
        try:
            print(f"[KDS] Notifying QC zones of kitchen item change: {updated_item.id} -> {updated_item.kds_status}")
            from settings.models import PrinterConfiguration

            config = await database_sync_to_async(
                PrinterConfiguration.objects.first
            )()

            if config and config.kitchen_zones:
                qc_zones_notified = 0
                for zone in config.kitchen_zones:
                    zone_name = zone.get('name', '')
                    if zone_name and await KDSService.get_zone_type_async(zone_name) == 'qc':
                        # Send updated QC data to QC zone
                        sanitized_zone_id = self.sanitize_group_name(zone_name)
                        qc_group_name = f'kds_zone_{sanitized_zone_id}'

                        print(f"[KDS] Sending QC update to zone: {zone_name} (group: {qc_group_name})")

                        # Get fresh QC zone data
                        qc_zone_data = await database_sync_to_async(
                            KDSService.get_qc_zone_data
                        )(zone_name)

                        print(f"[KDS] QC zone {zone_name} data: {len(qc_zone_data)} orders")

                        await self.channel_layer.group_send(
                            qc_group_name,
                            {
                                'type': 'qc_data_updated',
                                'zone_data': qc_zone_data
                            }
                        )
                        qc_zones_notified += 1

                print(f"[KDS] Notified {qc_zones_notified} QC zones of kitchen item change")
            else:
                print("[KDS] No printer configuration or kitchen zones found")

        except Exception as e:
            print(f"Error notifying QC zones of kitchen item ready: {e}")

    async def broadcast_to_all_zones(self, message_type, data):
        """
        Broadcast a message to all KDS zones
        """
        try:
            from settings.models import PrinterConfiguration

            config = await database_sync_to_async(
                PrinterConfiguration.objects.first
            )()

            if config and config.kitchen_zones:
                for zone in config.kitchen_zones:
                    zone_name = zone.get('name', '')
                    if zone_name:
                        sanitized_zone_id = self.sanitize_group_name(zone_name)
                        group_name = f'kds_zone_{sanitized_zone_id}'

                        await self.channel_layer.group_send(
                            group_name,
                            {
                                'type': message_type,
                                **data
                            }
                        )

        except Exception as e:
            print(f"Error broadcasting to all zones: {e}")

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

    async def zone_data_updated(self, event):
        """
        Send updated zone data to WebSocket (for kitchen zones)
        """
        await self.send(text_data=json.dumps({
            'type': 'zone_data_updated',
            'data': {
                'zone_data': event['zone_data']
            }
        }))

    async def kds_alert(self, event):
        """
        Send alert to WebSocket
        """
        await self.send(text_data=json.dumps({
            'type': 'alert',
            'data': event['alert_data']
        }))

    async def qc_data_updated(self, event):
        """
        Send QC zone data update to WebSocket
        """
        zone_data = event['zone_data']
        print(f"[KDS] Sending QC data update to client: {len(zone_data)} orders for zone {self.zone_printer_id}")

        await self.send(text_data=json.dumps({
            'type': 'qc_data_updated',
            'data': {
                'zone_data': zone_data
            }
        }))

    async def order_completed_by_qc(self, event):
        """
        Send order completion notification to kitchen zones and refresh data
        """
        order_data = event['order_data']
        print(f"[KDS] Received order completion notification for zone {self.zone_printer_id}: {order_data['order_number']}")

        # Refresh kitchen zone data after order completion
        zone_type = await KDSService.get_zone_type_async(self.zone_printer_id)

        if zone_type == 'kitchen':
            print(f"[KDS] Refreshing kitchen zone data for {self.zone_printer_id} after order completion")
            # Get fresh kitchen zone data
            kitchen_zone_data = await database_sync_to_async(
                KDSService.get_kitchen_zone_data
            )(self.zone_printer_id)

            print(f"[KDS] Sending kitchen data refresh: {len(kitchen_zone_data)} orders")

            await self.send(text_data=json.dumps({
                'type': 'kitchen_data_updated',
                'data': {
                    'zone_data': kitchen_zone_data,
                    'completed_order': order_data
                }
            }))
        else:
            # For non-kitchen zones, just send the completion notification
            await self.send(text_data=json.dumps({
                'type': 'order_completed_by_qc',
                'data': order_data
            }))

    # Helper methods
    async def send_initial_data(self):
        """
        Send initial KDS data when client connects
        """
        try:
            print(f"[KDS] send_initial_data: Starting for zone {self.zone_printer_id}")

            # Get zone type (kitchen or qc)
            print("[KDS] send_initial_data: Getting zone type...")
            zone_type = await KDSService.get_zone_type_async(self.zone_printer_id)
            print(f"[KDS] send_initial_data: zone_type = {zone_type}")

            # Get zone-specific data
            if zone_type == 'qc':
                print("[KDS] send_initial_data: Getting QC zone data...")
                zone_data = await database_sync_to_async(
                    KDSService.get_qc_zone_data
                )(self.zone_printer_id)
                print(f"[KDS] send_initial_data: Found {len(zone_data)} QC orders")
            else:
                print("[KDS] send_initial_data: Getting kitchen zone data...")
                zone_data = await database_sync_to_async(
                    KDSService.get_kitchen_zone_data
                )(self.zone_printer_id)
                print(f"[KDS] send_initial_data: Found {len(zone_data)} kitchen items")

            # Get active alerts for this zone
            print("[KDS] send_initial_data: Getting zone alerts...")
            alerts = await database_sync_to_async(
                KDSService.get_zone_alerts
            )(self.zone_printer_id)
            print(f"[KDS] send_initial_data: Found {len(alerts)} alerts")

            # Serialize alerts
            print("[KDS] send_initial_data: Serializing alerts...")
            serialized_alerts = []
            for i, alert in enumerate(alerts):
                print(f"[KDS] send_initial_data: Serializing alert {i+1}/{len(alerts)}")
                serialized_alert = await self.serialize_alert(alert)
                serialized_alerts.append(serialized_alert)

            print("[KDS] send_initial_data: Sending data to client...")
            await self.send(text_data=json.dumps({
                'type': 'initial_data',
                'data': {
                    'zone_data': zone_data,  # Pre-serialized data from service
                    'alerts': serialized_alerts,
                    'zone_id': self.zone_printer_id,
                    'terminal_id': self.terminal_id,
                    'zone_type': zone_type,
                    'is_qc_station': zone_type == 'qc'
                }
            }))
            print("[KDS] send_initial_data: Successfully sent initial data")

        except Exception as e:
            print(f"[KDS] send_initial_data: ERROR - {str(e)}")
            import traceback
            print(f"[KDS] send_initial_data: TRACEBACK - {traceback.format_exc()}")
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
        try:
            print(f"[KDS Consumer] serialize_kds_item: Starting for item {kds_item.id}")

            # Access related objects that might trigger sync calls
            order_item = kds_item.order_item
            order = order_item.order

            print(f"[KDS Consumer] serialize_kds_item: Got order {order.order_number}")

            result = {
                'id': str(kds_item.id),
                'order_number': order.order_number,
                'customer_name': order.customer_display_name,
                'order_type': order.order_type,
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
                    'id': str(order_item.id),
                    'product_name': order_item.product.name if order_item.product else 'Custom Item',
                    'quantity': order_item.quantity,
                    'special_instructions': getattr(order_item, 'notes', '') or '',
                    'modifiers': [
                        {
                            'modifier_set_name': mod.modifier_set_name,
                            'option_name': mod.option_name,
                            'price_at_sale': str(mod.price_at_sale)
                        }
                        for mod in order_item.selected_modifiers_snapshot.all()
                    ] if hasattr(order_item, 'selected_modifiers_snapshot') else []
                }
            }

            print(f"[KDS Consumer] serialize_kds_item: Successfully serialized item {kds_item.id}")
            return result

        except Exception as e:
            print(f"[KDS Consumer] serialize_kds_item: ERROR - {e}")
            import traceback
            print(f"[KDS Consumer] serialize_kds_item: TRACEBACK - {traceback.format_exc()}")
            raise

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