from django.db import transaction
from .models import InventoryStock, Location
from products.models import Product
from decimal import Decimal


class InventoryService:

    @staticmethod
    @transaction.atomic
    def add_stock(product: Product, location: Location, quantity):
        """
        Adds a specified quantity of a product to a specific inventory location.
        If stock for the product at the location does not exist, it will be created.
        """
        stock, created = InventoryStock.objects.get_or_create(
            product=product, location=location, defaults={"quantity": Decimal("0.0")}
        )
        stock.quantity += Decimal(str(quantity))
        stock.save()
        return stock

    @staticmethod
    @transaction.atomic
    def decrement_stock(product: Product, location: Location, quantity):
        """
        Decrements a specified quantity of a product from a specific inventory location.
        Raises ValueError if sufficient stock is not available.
        """
        stock = InventoryStock.objects.select_for_update().get(
            product=product, location=location
        )

        quantity_decimal = Decimal(str(quantity))
        if stock.quantity < quantity_decimal:
            raise ValueError(
                f"Insufficient stock for {product.name} at {location.name}. Required: {quantity_decimal}, Available: {stock.quantity}"
            )

        stock.quantity -= quantity_decimal
        stock.save()
        return stock

    @staticmethod
    @transaction.atomic
    def transfer_stock(
        product: Product, from_location: Location, to_location: Location, quantity
    ):
        """
        Transfers a specified quantity of a product from one location to another.
        """
        if from_location == to_location:
            raise ValueError("Source and destination locations cannot be the same.")

        quantity_decimal = Decimal(str(quantity))

        # Decrement from the source location
        source_stock = InventoryService.decrement_stock(
            product, from_location, quantity_decimal
        )

        # Add to the destination location
        destination_stock = InventoryService.add_stock(
            product, to_location, quantity_decimal
        )

        return source_stock, destination_stock
