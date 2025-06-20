from django.db import transaction
from .models import InventoryStock, Location, Recipe
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
        try:
            stock = InventoryStock.objects.select_for_update().get(
                product=product, location=location
            )
        except InventoryStock.DoesNotExist:
            raise ValueError(
                f"No stock record found for {product.name} at {location.name}"
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

    @staticmethod
    def check_stock_availability(product: Product, location: Location, required_quantity):
        """
        Check if sufficient stock exists for a product at a location.
        Handles both regular products and menu items with recipes.
        
        For menu items: Only checks if ingredients are available (can cook to order)
        For regular products: Enforces strict stock levels
        """
        required_quantity = Decimal(str(required_quantity))
        
        # Check if this is a menu item with a recipe
        if hasattr(product, 'recipe') and product.recipe:
            return InventoryService.check_recipe_availability(product, location, required_quantity)
        elif product.product_type.name.lower() == 'menu':
            # Menu item without recipe - assume can always be made to order
            return True
        else:
            # Regular product - check direct stock strictly
            try:
                stock = InventoryStock.objects.get(product=product, location=location)
                return stock.quantity >= required_quantity
            except InventoryStock.DoesNotExist:
                return False

    @staticmethod
    def check_recipe_availability(menu_item: Product, location: Location, quantity):
        """
        Check if recipe ingredients are available for a menu item.
        For restaurant operations: allows cook-to-order even with low ingredient stock.
        Only blocks if critical ingredients are completely unavailable.
        """
        try:
            recipe = menu_item.recipe
            quantity = Decimal(str(quantity))
            
            missing_ingredients = []
            
            for recipe_item in recipe.recipeitem_set.all():
                total_needed = recipe_item.quantity * quantity
                
                # For ingredients, check if they're regular products (strict) or can be made
                if recipe_item.product.product_type.name.lower() == 'menu':
                    # Ingredient is also a menu item - assume it can be made
                    continue
                else:
                    # Regular ingredient - check actual stock
                    try:
                        stock = InventoryStock.objects.get(
                            product=recipe_item.product, 
                            location=location
                        )
                        if stock.quantity < total_needed:
                            missing_ingredients.append(f"{recipe_item.product.name}")
                    except InventoryStock.DoesNotExist:
                        missing_ingredients.append(f"{recipe_item.product.name}")
            
            # For menu items, allow cook-to-order even with some missing ingredients
            # Only log warnings for tracking purposes
            if missing_ingredients:
                print(f"Warning: Menu item '{menu_item.name}' has low/missing ingredients: {', '.join(missing_ingredients)}. Allowing cook-to-order.")
            
            return True  # Always allow menu items (cook to order)
            
        except Recipe.DoesNotExist:
            # Menu item has no recipe - assume can be made to order
            return True

    @staticmethod
    @transaction.atomic
    def deduct_recipe_ingredients(menu_item: Product, quantity, location: Location):
        """
        Deduct ingredients for a recipe-based menu item.
        For restaurant operations: handles cook-to-order scenarios gracefully.
        """
        try:
            recipe = menu_item.recipe
            quantity = Decimal(str(quantity))
            
            for recipe_item in recipe.recipeitem_set.all():
                total_needed = recipe_item.quantity * quantity
                
                try:
                    # Try to deduct the ingredient
                    InventoryService.decrement_stock(recipe_item.product, location, total_needed)
                except ValueError as e:
                    # Ingredient insufficient - log but don't block (cook to order)
                    print(f"Cook-to-order: Used more {recipe_item.product.name} than in stock for {menu_item.name}. {e}")
                    
                    # Set stock to 0 if it exists, or create a negative stock record for tracking
                    try:
                        stock = InventoryStock.objects.get(
                            product=recipe_item.product, location=location
                        )
                        used_from_stock = stock.quantity
                        stock.quantity = Decimal('0')
                        stock.save()
                        print(f"Used {used_from_stock} from stock, prepared {total_needed - used_from_stock} fresh")
                    except InventoryStock.DoesNotExist:
                        # No stock record - create one with 0 (all prepared fresh)
                        InventoryStock.objects.create(
                            product=recipe_item.product,
                            location=location,
                            quantity=Decimal('0')
                        )
                        print(f"Prepared {total_needed} {recipe_item.product.name} fresh for {menu_item.name}")
                        
        except Recipe.DoesNotExist:
            # Menu item has no recipe - no deduction needed for cook-to-order items
            print(f"Menu item {menu_item.name} has no recipe - prepared fresh to order")

    @staticmethod
    @transaction.atomic
    def process_order_completion(order):
        """
        Process inventory deduction for a completed order.
        Handles both regular products and menu items with recipes.
        """
        from settings.config import app_settings
        
        default_location = app_settings.get_default_location()
        
        for item in order.items.all():
            try:
                if hasattr(item.product, 'recipe') and item.product.recipe:
                    # Handle menu items with recipes
                    InventoryService.deduct_recipe_ingredients(
                        item.product, item.quantity, default_location
                    )
                else:
                    # Handle regular products
                    InventoryService.decrement_stock(
                        item.product, default_location, item.quantity
                    )
            except ValueError as e:
                # Log inventory deduction failures but don't block order completion
                print(f"Inventory deduction warning for order {order.id}: {e}")

    @staticmethod
    def get_stock_level(product: Product, location: Location) -> Decimal:
        """
        Get the current stock level for a product at a location.
        Returns 0 if no stock record exists.
        """
        try:
            stock = InventoryStock.objects.get(product=product, location=location)
            return stock.quantity
        except InventoryStock.DoesNotExist:
            return Decimal("0.0")

    @staticmethod
    def get_available_stock(product: Product, location: Location) -> Decimal:
        """
        Get available stock excluding reserved quantities.
        Currently returns total stock - can be extended to handle reserved stock later.
        """
        return InventoryService.get_stock_level(product, location)
