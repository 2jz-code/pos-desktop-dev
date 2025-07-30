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
        elif message_type == "update_item":
            await self.update_item(payload)
        elif message_type == "remove_item":
            await self.remove_item(payload)
        elif message_type == "apply_discount":
            await self.apply_discount(payload)
        elif message_type == "apply_discount_code":
            await self.apply_discount_code(payload)
        elif message_type == "remove_discount":
            await self.remove_discount(payload)
        elif message_type == "clear_cart":
            await self.clear_cart(payload)

        await self.send_full_order_state()

    async def add_item(self, payload):
        product_id = payload.get("product_id")
        quantity = payload.get("quantity", 1)
        force_add = payload.get("force_add", False)
        selected_modifiers = payload.get("selected_modifiers", [])

        if force_add:
            # Force add: bypass all validation and add directly
            try:
                order = await sync_to_async(Order.objects.get)(id=self.order_id)
                product = await sync_to_async(Product.objects.get)(id=product_id)

                logging.info(
                    f"OrderConsumer: FORCE OVERRIDE - Adding {product.name} despite stock validation failure"
                )

                # Add the item without stock validation using OrderService
                await sync_to_async(OrderService.add_item_to_order)(
                    order=order, 
                    product=product, 
                    quantity=quantity, 
                    selected_modifiers=selected_modifiers,
                    notes=payload.get("notes", ""),
                    force_add=True
                )
                logging.info(
                    f"OrderConsumer: Successfully force-added {quantity} of {product.name}"
                )

            except Exception as e:
                logging.error(
                    f"OrderConsumer: Error during force add {product_id}: {e}"
                )
                await self.send(
                    text_data=json.dumps(
                        {
                            "type": "error",
                            "message": "Failed to add item even with override",
                            "error_type": "general",
                        }
                    )
                )
                return
        else:
            # Normal add: use validation
            try:
                order = await sync_to_async(Order.objects.get)(id=self.order_id)
                product = await sync_to_async(Product.objects.get)(id=product_id)
                await sync_to_async(OrderService.add_item_to_order)(
                    order=order, product=product, quantity=quantity, selected_modifiers=selected_modifiers
                )
                logging.info(
                    f"OrderConsumer: Successfully added {quantity} of {product.name} to order {self.order_id}"
                )
            except ValueError as e:
                # Stock validation or other business logic error
                logging.warning(f"OrderConsumer: Failed to add item {product_id}: {e}")

                # Send error with option to override
                await self.send(
                    text_data=json.dumps(
                        {
                            "type": "stock_error",
                            "message": str(e),
                            "error_type": "stock_validation",
                            "product_id": product_id,
                            "can_override": True,
                        }
                    )
                )
                return  # Don't send order state update if item addition failed
            except Exception as e:
                # Unexpected error
                logging.error(
                    f"OrderConsumer: Unexpected error adding item {product_id}: {e}"
                )
                await self.send(
                    text_data=json.dumps(
                        {
                            "type": "error",
                            "message": "An unexpected error occurred while adding the item",
                            "error_type": "general",
                        }
                    )
                )
                return

    async def update_item_quantity(self, payload):
        item_id = payload.get("item_id")
        new_quantity = payload.get("quantity")
        force_update = payload.get("force_update", False)

        if new_quantity > 0:
            try:
                item = await sync_to_async(OrderItem.objects.get)(id=item_id)
                current_quantity = item.quantity

                # Smart conversion: If increasing quantity on an item with modifiers,
                # create new individual items instead of just incrementing quantity
                if new_quantity > current_quantity:
                    has_modifiers = await sync_to_async(
                        lambda: item.selected_modifiers_snapshot.exists()
                    )()
                    
                    if has_modifiers:
                        # Create new individual items for the additional quantity
                        additional_quantity = new_quantity - current_quantity
                        product = await sync_to_async(lambda: item.product)()
                        order = await sync_to_async(lambda: item.order)()
                        
                        # Check stock for the additional items
                        if not force_update:
                            from inventory.services import InventoryService
                            from settings.config import app_settings

                            default_location = await sync_to_async(
                                app_settings.get_default_location
                            )()

                            stock_available = await sync_to_async(
                                InventoryService.check_stock_availability
                            )(product, default_location, additional_quantity)

                            if not stock_available:
                                # Same stock validation logic as before
                                product_with_type = await sync_to_async(
                                    lambda: Product.objects.select_related("product_type").get(
                                        id=product.id
                                    )
                                )()
                                product_type_name = product_with_type.product_type.name.lower()

                                if product_type_name != "menu":
                                    await self.send(
                                        text_data=json.dumps(
                                            {
                                                "type": "stock_error",
                                                "message": f"Not enough stock to add {additional_quantity} more {product.name}",
                                                "error_type": "stock_validation",
                                                "item_id": item_id,
                                                "current_quantity": current_quantity,
                                                "requested_quantity": new_quantity,
                                                "can_override": True,
                                                "action_type": "quantity_update",
                                            }
                                        )
                                    )
                                    return
                        
                        # Get the original item's modifiers to clone them
                        # We need to reconstruct the modifier format by finding option_ids from the snapshot
                        original_modifiers = []
                        
                        # Get the product's modifier sets to find option_ids
                        product_with_modifiers = await sync_to_async(
                            lambda: Product.objects.prefetch_related(
                                'product_modifier_sets__modifier_set__options'
                            ).get(id=product.id)
                        )()
                        
                        # Get the saved modifier snapshots
                        modifier_snapshots = await sync_to_async(
                            lambda: list(item.selected_modifiers_snapshot.all())
                        )()
                        
                        # Convert snapshots back to option_id format
                        for snapshot in modifier_snapshots:
                            # Find the matching option by name in the product's modifier sets
                            for product_modifier_set in product_with_modifiers.product_modifier_sets.all():
                                modifier_set = product_modifier_set.modifier_set
                                if modifier_set.name == snapshot.modifier_set_name:
                                    for option in modifier_set.options.all():
                                        if option.name == snapshot.option_name:
                                            original_modifiers.append({
                                                'option_id': option.id,
                                                'quantity': snapshot.quantity
                                            })
                                            break
                                    break
                        
                        # Create new individual items (cloning the original modifiers)
                        for i in range(additional_quantity):
                            await sync_to_async(OrderService.add_item_to_order)(
                                order=order,
                                product=product,
                                quantity=1,
                                selected_modifiers=original_modifiers,  # Clone original modifiers
                                notes=item.notes  # Also clone the notes
                            )
                        
                        # Recalculate totals
                        await sync_to_async(OrderService.recalculate_order_totals)(order)
                        
                        product_name = await sync_to_async(lambda: product.name)()
                        logging.info(
                            f"OrderConsumer: Smart conversion - Added {additional_quantity} new {product_name} items for customization"
                        )
                        
                        # Send updated order state and return
                        await self.send_full_order_state()
                        return

                # Regular quantity update logic for items without modifiers
                # If increasing quantity, check stock for the additional amount
                if new_quantity > current_quantity and not force_update:
                    additional_quantity = new_quantity - current_quantity

                    # Import here to avoid circular imports
                    from inventory.services import InventoryService
                    from settings.config import app_settings

                    default_location = await sync_to_async(
                        app_settings.get_default_location
                    )()

                    # Get the product with relations loaded
                    product = await sync_to_async(lambda: item.product)()

                    # Check if there's enough stock for the additional quantity
                    stock_available = await sync_to_async(
                        InventoryService.check_stock_availability
                    )(product, default_location, additional_quantity)

                    if not stock_available:
                        # Check if this is a regular product (strict validation) or menu item
                        # We need to access the product_type with proper async handling
                        product_with_type = await sync_to_async(
                            lambda: Product.objects.select_related("product_type").get(
                                id=product.id
                            )
                        )()
                        product_type_name = product_with_type.product_type.name.lower()

                        if product_type_name != "menu":
                            # Regular product - strict validation, send error
                            logging.warning(
                                f"OrderConsumer: Insufficient stock to increase {product.name} quantity from {current_quantity} to {new_quantity}"
                            )

                            await self.send(
                                text_data=json.dumps(
                                    {
                                        "type": "stock_error",
                                        "message": f"Not enough stock to increase {product.name} to {new_quantity} units",
                                        "error_type": "stock_validation",
                                        "item_id": item_id,
                                        "current_quantity": current_quantity,
                                        "requested_quantity": new_quantity,
                                        "can_override": True,
                                        "action_type": "quantity_update",
                                    }
                                )
                            )
                            return  # Don't update quantity if validation fails

                # Update the quantity (either decreasing, or increasing with validation passed/forced)
                item.quantity = new_quantity
                await sync_to_async(item.save)()
                order_obj = await sync_to_async(lambda i: i.order)(item)
                await sync_to_async(OrderService.recalculate_order_totals)(order_obj)

                if force_update:
                    product_name = await sync_to_async(lambda: item.product.name)()
                    logging.info(
                        f"OrderConsumer: FORCE OVERRIDE - Updated {product_name} quantity to {new_quantity}"
                    )
                else:
                    product_name = await sync_to_async(lambda: item.product.name)()
                    logging.info(
                        f"OrderConsumer: Updated {product_name} quantity from {current_quantity} to {new_quantity}"
                    )
                
                # Send updated order state
                await self.send_full_order_state()

            except Exception as e:
                logging.error(
                    f"OrderConsumer: Error updating item quantity {item_id}: {e}"
                )
                await self.send(
                    text_data=json.dumps(
                        {
                            "type": "error",
                            "message": "Failed to update item quantity",
                            "error_type": "general",
                        }
                    )
                )
                return
        else:
            await self.remove_item({"item_id": item_id})

    async def update_item(self, payload):
        item_id = payload.get("item_id")
        selected_modifiers = payload.get("selected_modifiers", [])
        notes = payload.get("notes", "")
        quantity = payload.get("quantity", 1)

        try:
            item = await sync_to_async(OrderItem.objects.get)(id=item_id)
            product = await sync_to_async(lambda: item.product)()
            order = await sync_to_async(lambda: item.order)()

            # Remove the old item
            await sync_to_async(item.delete)()

            # Add new item with updated modifiers
            await sync_to_async(OrderService.add_item_to_order)(
                order=order,
                product=product,
                quantity=quantity,
                selected_modifiers=selected_modifiers,
                notes=notes
            )

            logging.info(f"OrderConsumer: Successfully updated item {item_id}")

        except Exception as e:
            logging.error(f"OrderConsumer: Error updating item {item_id}: {e}")
            await self.send(
                text_data=json.dumps(
                    {
                        "type": "error",
                        "message": "Failed to update item",
                        "error_type": "general",
                    }
                )
            )
            return

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

    async def apply_discount_code(self, payload):
        code = payload.get("code")
        if not code:
            logging.warning(
                "OrderConsumer: 'code' not provided in apply_discount_code payload"
            )
            return
        order = await sync_to_async(Order.objects.get)(id=self.order_id)
        try:
            await sync_to_async(OrderService.apply_discount_to_order_by_code)(
                order=order, code=code
            )
            logging.info(
                f"OrderConsumer: Applied discount with code {code} to order {self.order_id}"
            )
        except Exception as e:
            logging.error(f"OrderConsumer: Error applying discount code {code}: {e}")

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
