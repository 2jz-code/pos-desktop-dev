import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async
from decimal import Decimal
from uuid import UUID

logger = logging.getLogger(__name__)


class GlobalPOSConsumer(AsyncWebsocketConsumer):
    """
    Global WebSocket consumer for system-wide POS notifications.
    Handles web order notifications and can be extended for other event types.
    """

    async def connect(self):
        """
        Called when the WebSocket connection is opened.
        Authenticate the terminal and join appropriate groups.
        """
        # Extract tenant from scope (set by middleware)
        self.tenant = self.scope.get('tenant')

        if not self.tenant:
            logger.warning("GlobalPOSConsumer: No tenant in scope. Closing connection.")
            await self.close(code=4003)  # Forbidden
            return

        query_string = self.scope.get("query_string", b"").decode()

        # Correctly parse the query string into a dictionary
        try:
            # This handles cases where a param might not have a value, e.g. 'foo&bar=baz'
            query_params = dict(
                param.split("=", 1) for param in query_string.split("&") if "=" in param
            )
        except ValueError:
            logger.warning(f"Invalid query string format: {query_string}")
            await self.close(code=4000)
            return

        device_id = query_params.get("device_id")

        if not device_id:
            logger.warning("Connection rejected: No device_id provided in query string")
            await self.close(code=4000)
            return

        # Validate device belongs to this tenant
        try:
            from terminals.models import TerminalRegistration
            terminal = await sync_to_async(TerminalRegistration.objects.get)(
                device_id=device_id,
                tenant=self.tenant
            )
            logger.info(f"GlobalPOSConsumer: Validated terminal {device_id} belongs to tenant {self.tenant.slug}")
        except TerminalRegistration.DoesNotExist:
            logger.warning(f"GlobalPOSConsumer: Terminal {device_id} does not exist for tenant {self.tenant.slug}. Closing connection.")
            await self.close(code=4004)  # Not found
            return

        # Store device_id for this connection
        self.device_id = device_id
        # Use tenant-scoped channel group
        self.terminal_group = f"tenant_{self.tenant.id}_terminal_{device_id}"

        # Join tenant-specific terminal group
        await self.channel_layer.group_add(self.terminal_group, self.channel_name)

        # Accept the connection
        await self.accept()

        logger.info(f"Terminal {device_id} connected to tenant {self.tenant.slug} notifications")

        # Send connection confirmation
        await self.send(
            text_data=json.dumps(
                {
                    "type": "connection_established",
                    "device_id": device_id,
                    "tenant": self.tenant.slug,
                    "timestamp": self.get_timestamp(),
                    "message": "Connected to global notification system",
                }
            )
        )

    async def disconnect(self, close_code):
        """
        Called when the WebSocket connection is closed.
        """
        if hasattr(self, "terminal_group"):
            await self.channel_layer.group_discard(
                self.terminal_group, self.channel_name
            )
            logger.info(
                f"Terminal {self.device_id} disconnected from global notifications"
            )

    async def receive(self, text_data):
        """
        Called when a message is received from the WebSocket.
        Handle client-side events like acknowledgments.
        """
        try:
            data = json.loads(text_data)
            message_type = data.get("type")

            if message_type == "ping":
                await self.send(
                    text_data=json.dumps(
                        {"type": "pong", "timestamp": self.get_timestamp()}
                    )
                )
            elif message_type == "notification_acknowledged":
                # Handle notification acknowledgment
                notification_id = data.get("notification_id")
                logger.info(
                    f"Terminal {self.device_id} acknowledged notification {notification_id}"
                )
            else:
                logger.warning(
                    f"Unknown message type from terminal {self.device_id}: {message_type}"
                )

        except json.JSONDecodeError:
            logger.error(f"Invalid JSON received from terminal {self.device_id}")
        except Exception as e:
            logger.error(
                f"Error processing message from terminal {self.device_id}: {e}"
            )

    # WebSocket event handlers (called by channel layer)

    async def web_order_notification(self, event):
        """
        Handle web order notification events.
        Called when a web order is ready for notification.
        """
        try:
            data = event["data"]

            # Send notification to the connected terminal
            await self.send(
                text_data=json.dumps(
                    {"type": "web_order_notification", "data": data}
                )
            )

            logger.info(f"Web order notification sent to terminal {self.device_id}")

        except Exception as e:
            logger.error(
                f"Error sending web order notification to terminal {self.device_id}: {e}"
            )

    async def system_notification(self, event):
        """
        Handle general system notifications.
        Can be extended for other types of system-wide events.
        """
        try:
            data = event["data"]

            # Send notification to the connected terminal
            await self.send(
                text_data=json.dumps({"type": "system_notification", "data": data})
            )

            logger.info(f"System notification sent to terminal {self.device_id}")

        except Exception as e:
            logger.error(
                f"Error sending system notification to terminal {self.device_id}: {e}"
            )

    def get_timestamp(self):
        """
        Get current timestamp in ISO format.
        """
        from datetime import datetime

        return datetime.now().isoformat()
