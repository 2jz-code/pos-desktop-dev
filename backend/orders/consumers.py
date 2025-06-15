# desktop-combined/backend/orders/consumers.py
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async
from .models import Order, OrderItem, Product
from .services import OrderService
from .serializers import OrderSerializer
from uuid import UUID


# ... (convert_uuids_to_str function remains the same) ...
def convert_uuids_to_str(data):
    if isinstance(data, dict):
        return {k: convert_uuids_to_str(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [convert_uuids_to_str(elem) for elem in data]
    elif isinstance(data, UUID):
        return str(data)
    return data


class OrderConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        print("OrderConsumer: Attempting to connect...")
        self.order_id = self.scope["url_route"]["kwargs"]["order_id"]
        self.order_group_name = f"order_{self.order_id}"

        try:
            self.order = await sync_to_async(Order.objects.get)(id=self.order_id)
            print(f"OrderConsumer: Found order {self.order.id}")
        except Order.DoesNotExist:
            print(
                f"OrderConsumer: Order {self.order_id} does not exist. Closing connection."
            )
            await self.close()
            return

        await self.channel_layer.group_add(self.order_group_name, self.channel_name)
        print(f"OrderConsumer: Joined group {self.order_group_name}")
        await self.accept()

        await self.send_full_order_state()
        print("OrderConsumer: Connection established and initial state sent.")

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
        # NEW: Handle clear_cart message
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
        """
        Handles the 'apply_discount' event from the client.
        """
        discount_id = payload.get("discount_id")
        if not discount_id:
            print("OrderConsumer: 'discount_id' not provided in apply_discount payload")
            return

        order = await sync_to_async(Order.objects.get)(id=self.order_id)

        try:
            await sync_to_async(OrderService.apply_discount_to_order_by_id)(
                order=order, discount_id=discount_id
            )
            print(
                f"OrderConsumer: Applied discount {discount_id} to order {self.order_id}"
            )
        except Exception as e:
            # Optionally, send an error message back to the client
            print(f"OrderConsumer: Error applying discount {discount_id}: {e}")

    async def remove_discount(self, payload):
        """
        Handles the 'remove_discount' event from the client.
        """
        discount_id = payload.get("discount_id")
        if not discount_id:
            print(
                "OrderConsumer: 'discount_id' not provided in remove_discount payload"
            )
            return

        order = await sync_to_async(Order.objects.get)(id=self.order_id)
        try:
            await sync_to_async(OrderService.remove_discount_from_order_by_id)(
                order=order, discount_id=discount_id
            )
            print(
                f"OrderConsumer: Removed discount {discount_id} from order {self.order_id}"
            )
        except Exception as e:
            print(f"OrderConsumer: Error removing discount {discount_id}: {e}")

    # NEW: Clear cart method
    async def clear_cart(self, payload):
        order_id_from_payload = payload.get("order_id")
        if str(order_id_from_payload) != str(self.order_id):
            print(
                f"Clear cart request mismatch: expected {self.order_id}, got {order_id_from_payload}"
            )
            return  # Don't clear if order ID doesn't match consumer's context

        order = await sync_to_async(Order.objects.get)(id=self.order_id)
        await sync_to_async(OrderService.clear_order_items)(
            order
        )  # Assuming this service method exists

    # ... (rest of the consumer, send_full_order_state, cart_update, get_order_instance, serialize_order)
    async def send_full_order_state(self):
        order = await self.get_order_instance()
        serialized_order_data = await self.serialize_order(order)
        final_payload = convert_uuids_to_str(serialized_order_data)
        print(
            f"OrderConsumer: Sending initial state: {json.dumps(final_payload, indent=2)}"
        )
        await self.channel_layer.group_send(
            self.order_group_name, {"type": "cart_update", "payload": final_payload}
        )

    async def cart_update(self, event):
        payload = event["payload"]
        await self.send(
            text_data=json.dumps({"type": "cart_update", "payload": payload})
        )

    @sync_to_async
    def get_order_instance(self):
        return Order.objects.prefetch_related(
            "items__product", "applied_discounts__discount"
        ).get(id=self.order_id)

    @sync_to_async
    def serialize_order(self, order):
        return OrderSerializer(order).data
