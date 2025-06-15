from decimal import Decimal
from django.db import transaction
from .models import Order, OrderItem, OrderDiscount
from products.models import Product
from users.models import User

# This should point to your actual discount service file
from discounts.services import DiscountService
from discounts.models import Discount
from settings.models import GlobalSettings


class OrderService:

    VALID_STATUS_TRANSITIONS = {
        Order.OrderStatus.PENDING: [
            Order.OrderStatus.PENDING,
            Order.OrderStatus.HOLD,
            Order.OrderStatus.COMPLETED,
            Order.OrderStatus.CANCELLED,
            Order.OrderStatus.VOID,
        ],
        Order.OrderStatus.HOLD: [
            Order.OrderStatus.PENDING,
            Order.OrderStatus.COMPLETED,
            Order.OrderStatus.CANCELLED,
            Order.OrderStatus.VOID,
        ],
        Order.OrderStatus.COMPLETED: [],
        Order.OrderStatus.CANCELLED: [],
        Order.OrderStatus.VOID: [],
    }

    @staticmethod
    @transaction.atomic
    def create_new_order(
        cashier: User, customer: User = None, order_type: str = Order.OrderType.POS
    ) -> Order:
        """
        Creates a new, empty order.
        """
        order = Order.objects.create(
            order_type=order_type, cashier=cashier, customer=customer
        )
        return order

    @staticmethod
    @transaction.atomic
    def add_item_to_order(
        order: Order, product: Product, quantity: int, notes: str = ""
    ) -> OrderItem:
        """
        Adds a product as an item to an order. If an item with the same
        product and notes exists, it increments its quantity. Otherwise, it
        creates a new item. Also recalculates order totals.
        """
        if order.status not in [Order.OrderStatus.PENDING, Order.OrderStatus.HOLD]:
            raise ValueError(
                "Cannot add items to an order that is not Pending or on Hold."
            )

        order_item = OrderItem.objects.filter(
            order=order, product=product, notes=notes
        ).first()

        if order_item:
            order_item.quantity += quantity
            order_item.save(update_fields=["quantity"])
        else:
            order_item = OrderItem.objects.create(
                order=order,
                product=product,
                quantity=quantity,
                price_at_sale=product.price,
                notes=notes,
            )

        OrderService.recalculate_order_totals(order)
        return order_item

    @staticmethod
    @transaction.atomic
    def update_order_status(order: Order, new_status: str) -> Order:
        """
        Updates the status of an order, checking for valid transitions.
        """
        if new_status not in Order.OrderStatus.values:
            raise ValueError(f"'{new_status}' is not a valid order status.")

        if new_status not in OrderService.VALID_STATUS_TRANSITIONS.get(
            order.status, []
        ):
            raise ValueError(
                f"Cannot transition order from {order.status} to {new_status}."
            )

        order.status = new_status
        order.save(update_fields=["status", "updated_at"])
        return order

    @staticmethod
    @transaction.atomic
    def complete_order(order: Order, payment_data: dict) -> Order:
        """
        Finalizes an order.
        - Calls the payment service to handle payment.
        - Updates order status to COMPLETED.
        - Triggers inventory deduction.
        """
        if order.status not in [Order.OrderStatus.PENDING, Order.OrderStatus.HOLD]:
            raise ValueError("Only PENDING or HOLD orders can be completed.")

        order.payment_status = Order.PaymentStatus.PAID
        order.status = Order.OrderStatus.COMPLETED
        order.save(update_fields=["status", "payment_status", "updated_at"])

        return order

    @staticmethod
    def void_order(order: Order) -> Order:
        """Sets an order's status to VOID after checking transition validity."""
        return OrderService.update_order_status(order, Order.OrderStatus.VOID)

    @staticmethod
    def cancel_order(order: Order) -> Order:
        """Sets an order's status to CANCELLED after checking transition validity."""
        return OrderService.update_order_status(order, Order.OrderStatus.CANCELLED)

    @staticmethod
    def resume_order(order: Order) -> Order:
        """Sets an order's status to PENDING after checking transition validity."""
        return OrderService.update_order_status(order, Order.OrderStatus.PENDING)

    @staticmethod
    @transaction.atomic
    def apply_discount_to_order_by_id(order: Order, discount_id: int):
        """
        Applies a discount to an order by DELEGATING to the DiscountService.
        """
        try:
            discount = Discount.objects.get(id=discount_id)
            DiscountService.apply_discount_to_order(order, discount)
        except Discount.DoesNotExist:
            raise ValueError("Discount not found.")
        except Exception as e:
            raise e

    @staticmethod
    @transaction.atomic
    def remove_discount_from_order_by_id(order: Order, discount_id: int):
        """
        Removes a discount from an order by its ID, delegating to the DiscountService.
        """
        try:
            discount = Discount.objects.get(id=discount_id)
            DiscountService.remove_discount_from_order(order, discount)
        except Discount.DoesNotExist:
            raise ValueError("Discount to remove not found on this order.")
        except Exception as e:
            raise e

    @staticmethod
    @transaction.atomic
    def recalculate_order_totals(order: Order):
        """
        Recalculates all financial fields for an order, ensuring calculations
        are performed in the correct sequence.
        """
        try:
            settings = GlobalSettings.objects.get()
        except GlobalSettings.DoesNotExist:
            raise Exception("GlobalSettings are not configured in the admin.")

        # Re-fetch the full order context to ensure data is fresh
        order = Order.objects.prefetch_related(
            "items__product__taxes", "applied_discounts__discount"
        ).get(id=order.id)

        # 1. Calculate the pre-discount subtotal from all items
        order.subtotal = sum(item.total_price for item in order.items.all())

        # 2. Recalculate the value of all applied discounts based on the fresh subtotal
        total_discount_amount = Decimal("0.00")
        from discounts.factories import DiscountStrategyFactory

        if order.applied_discounts.exists():
            for order_discount in order.applied_discounts.all():
                strategy = DiscountStrategyFactory.get_strategy(order_discount.discount)
                calculated_amount = strategy.apply(order, order_discount.discount)
                if calculated_amount != order_discount.amount:
                    order_discount.amount = calculated_amount
                    order_discount.save()
                total_discount_amount += calculated_amount
        order.total_discounts_amount = total_discount_amount

        # 3. Determine the base for tax and surcharge calculations (subtotal AFTER discounts)
        post_discount_subtotal = order.subtotal - order.total_discounts_amount

        # 4. Calculate tax based on the discounted price of each item
        tax_total = Decimal("0.00")
        if order.subtotal > 0:
            proportional_discount_rate = order.total_discounts_amount / order.subtotal
            for item in order.items.all():
                discounted_item_price = item.total_price * (
                    Decimal("1.0") - proportional_discount_rate
                )

                product_taxes = item.product.taxes.all()
                if product_taxes:
                    for tax in product_taxes:
                        tax_total += discounted_item_price * (
                            tax.rate / Decimal("100.0")
                        )
                else:
                    tax_total += discounted_item_price * settings.tax_rate

        order.tax_total = tax_total.quantize(Decimal("0.01"))

        # 5. Calculate surcharges on the post-discount subtotal
        surcharges_total = post_discount_subtotal * settings.surcharge_percentage
        order.surcharges_total = surcharges_total.quantize(Decimal("0.01"))

        # 6. Calculate the final grand total
        order.grand_total = (
            post_discount_subtotal + order.tax_total + order.surcharges_total
        )

        order.save(
            update_fields=[
                "subtotal",
                "total_discounts_amount",
                "tax_total",
                "surcharges_total",
                "grand_total",
                "updated_at",
            ]
        )

    @staticmethod
    @transaction.atomic
    def clear_order_items(order: Order):
        """
        Deletes all items from an order and recalculates its totals.
        """
        order.items.all().delete()
        OrderService.recalculate_order_totals(order)
