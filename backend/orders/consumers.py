import json
import logging
from decimal import Decimal  # 1. Import Decimal
from uuid import UUID
from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async

from .models import Order, OrderItem, Product
from .services import OrderService
from .serializers import OrderSerializer

# No longer need DjangoJSONEncoder if we pre-process the data
# from django.core.serializers.json import DjangoJSONEncoder


def convert_complex_types_to_str(data):
    """
    Recursively converts UUID and Decimal objects in a data structure to strings.
    """
    if isinstance(data, dict):
        return {k: convert_complex_types_to_str(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [convert_complex_types_to_str(elem) for elem in data]
    elif isinstance(data, UUID):
        return str(data)
    elif isinstance(data, Decimal):  # 2. Handle Decimal conversion
        return str(data)
    return data


class OrderConsumer(AsyncWebsocketConsumer):
    # ... (connect, disconnect, receive, and all the action methods remain the same) ...
    async def connect(self):
        logging.info("OrderConsumer: Attempting to connect...")
        self.order_id = self.scope["url_route"]["kwargs"]["order_id"]
        self.order_group_name = f"order_{self.order_id}"

        try:
            self.order = await sync_to_async(Order.objects.get)(id=self.order_id)
            logging.info(f"OrderConsumer: Found order {self.order.id}")
        except Order.DoesNotExist:
            logging.warning(
                f"OrderConsumer: Order {self.order_id} does not exist. Closing connection."
            )
            await self.close()
            return

        await self.channel_layer.group_add(self.order_group_name, self.channel_name)
        logging.info(f"OrderConsumer: Joined group {self.order_group_name}")
        await self.accept()

        await self.send_full_order_state()
        logging.info("OrderConsumer: Connection established and initial state sent.")

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.order_group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        message_type = data.get("type")
        payload = data.get("payload", {})

        if message_type == "add_item":
            await self.add_item(payload)
        elif message_type == "update_item_quantity":
            await self.update_item_quantity(payload)
        elif message_type == "remove_item":
            await self.remove_item(payload)
        elif message_type == "apply_discount":
            await self.apply_discount(payload)
        elif message_type == "remove_discount":
            await self.remove_discount(payload)
        elif message_type == "clear_cart":
            await self.clear_cart(payload)

        await self.send_full_order_state()

    async def add_item(self, payload):
        product_id = payload.get("product_id")
        quantity = payload.get("quantity", 1)
        order = await sync_to_async(Order.objects.get)(id=self.order_id)
        product = await sync_to_async(Product.objects.get)(id=product_id)
        await sync_to_async(OrderService.add_item_to_order)(
            order=order, product=product, quantity=quantity
        )

    async def update_item_quantity(self, payload):
        item_id = payload.get("item_id")
        quantity = payload.get("quantity")
        if quantity > 0:
            item = await sync_to_async(OrderItem.objects.get)(id=item_id)
            item.quantity = quantity
            await sync_to_async(item.save)()
            order_obj = await sync_to_async(lambda i: i.order)(item)
            await sync_to_async(OrderService.recalculate_order_totals)(order_obj)
        else:
            await self.remove_item({"item_id": item_id})

    async def remove_item(self, payload):
        item_id = payload.get("item_id")
        item = await sync_to_async(OrderItem.objects.get)(id=item_id)
        order = await sync_to_async(lambda i: i.order)(item)
        await sync_to_async(item.delete)()
        await sync_to_async(OrderService.recalculate_order_totals)(order)

    async def apply_discount(self, payload):
        discount_id = payload.get("discount_id")
        if not discount_id:
            logging.warning(
                "OrderConsumer: 'discount_id' not provided in apply_discount payload"
            )
            return
        order = await sync_to_async(Order.objects.get)(id=self.order_id)
        try:
            await sync_to_async(OrderService.apply_discount_to_order_by_id)(
                order=order, discount_id=discount_id
            )
            logging.info(
                f"OrderConsumer: Applied discount {discount_id} to order {self.order_id}"
            )
        except Exception as e:
            logging.error(f"OrderConsumer: Error applying discount {discount_id}: {e}")

    async def remove_discount(self, payload):
        discount_id = payload.get("discount_id")
        if not discount_id:
            logging.warning(
                "OrderConsumer: 'discount_id' not provided in remove_discount payload"
            )
            return
        order = await sync_to_async(Order.objects.get)(id=self.order_id)
        try:
            await sync_to_async(OrderService.remove_discount_from_order_by_id)(
                order=order, discount_id=discount_id
            )
            logging.info(
                f"OrderConsumer: Removed discount {discount_id} from order {self.order_id}"
            )
        except Exception as e:
            logging.error(f"OrderConsumer: Error removing discount {discount_id}: {e}")

    async def clear_cart(self, payload):
        order_id_from_payload = payload.get("order_id")
        if str(order_id_from_payload) != str(self.order_id):
            logging.warning(
                f"Clear cart request mismatch: expected {self.order_id}, got {order_id_from_payload}"
            )
            return
        order = await sync_to_async(Order.objects.get)(id=self.order_id)
        await sync_to_async(OrderService.clear_order_items)(order)

    async def send_full_order_state(self):
        """
        Fetches, serializes, and cleans the order data before sending it.
        """
        order = await self.get_order_instance()
        serialized_order_data = await self.serialize_order(order)

        # 3. Convert all complex types (UUID, Decimal) to strings in one go.
        final_payload = convert_complex_types_to_str(serialized_order_data)

        # This payload is now "safe" for any serializer (json, msgpack, etc.)
        logging.info(
            f"OrderConsumer: Sending initial state: {json.dumps(final_payload, indent=2)}"
        )

        await self.channel_layer.group_send(
            self.order_group_name, {"type": "cart_update", "payload": final_payload}
        )

    async def cart_update(self, event):
        """
        Handles the 'cart_update' event from the channel layer and sends it to the client.
        """
        payload = event["payload"]
        # 4. No special encoder needed here anymore because the payload is already clean.
        await self.send(
            text_data=json.dumps({"type": "cart_update", "payload": payload})
        )

    async def configuration_update(self, event):
        """
        Handles configuration change notifications and refreshes the order state.
        This is triggered when tax rates or surcharge percentages change.
        The updated order state will contain the fresh totals calculated with new rates.
        """
        # Only send the updated order state - this contains all the fresh data
        # including totals calculated with the new tax rates and surcharges
        await self.send_full_order_state()

        # Log for debugging purposes
        logging.info(
            f"OrderConsumer: Sent updated order state due to configuration change for order {self.order_id}"
        )

    @sync_to_async
    def get_order_instance(self):
        return Order.objects.prefetch_related(
            "items__product", "applied_discounts__discount"
        ).get(id=self.order_id)

    @sync_to_async
    def serialize_order(self, order):
        return OrderSerializer(order).data
