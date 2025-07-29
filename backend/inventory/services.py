from django.db import transaction
from .models import InventoryStock, Location, Recipe
from products.models import Product
from decimal import Decimal
from core_backend.cache_utils import cache_dynamic_data, cache_static_data


class InventoryService:
    
    @staticmethod
    @cache_dynamic_data(timeout=300)  # 5 minutes - balance freshness vs performance
    def get_stock_levels_by_location(location_id):
        """Cache stock levels for POS availability checks"""
        return dict(InventoryStock.objects.filter(
            location_id=location_id
        ).values_list('product_id', 'quantity'))
    
    @staticmethod
    @cache_static_data(timeout=3600*6)  # 6 hours - recipes don't change often
    def get_recipe_ingredients_map():
        """Cache recipe-to-ingredients mapping for menu items"""
        recipes = {}
        for recipe in Recipe.objects.prefetch_related('recipeitem_set__product'):
            recipes[recipe.product_id] = [
                {
                    'product_id': item.product_id, 
                    'quantity': float(item.quantity),
                    'product_name': item.product.name,
                    'product_type': item.product.product_type.name if item.product.product_type else 'unknown'
                }
                for item in recipe.recipeitem_set.all()
            ]
        return recipes
    
    @staticmethod
    @cache_dynamic_data(timeout=900)  # 15 minutes - availability changes moderately
    def get_inventory_availability_status(location_id=None):
        """Cache product availability status for POS display"""
        from settings.config import app_settings
        
        if not location_id:
            location_id = app_settings.get_default_location().id
        
        # Get current stock levels
        stock_levels = InventoryService.get_stock_levels_by_location(location_id)
        recipe_map = InventoryService.get_recipe_ingredients_map()
        
        availability = {}
        
        # Check all products from products service
        from products.services import ProductService
        products = ProductService.get_cached_active_products_list()
        
        for product in products:
            product_id = product.id if hasattr(product, 'id') else product['id']
            product_type = product.product_type.name.lower() if hasattr(product, 'product_type') else product.get('product_type', 'unknown').lower()
            
            if product_type == 'menu':
                # Menu item - check if can be made (recipe availability)
                if product_id in recipe_map:
                    can_make = True  # Assume can cook to order for restaurant
                    missing_ingredients = []
                    
                    for ingredient in recipe_map[product_id]:
                        ingredient_stock = stock_levels.get(ingredient['product_id'], 0)
                        if ingredient_stock < ingredient['quantity']:
                            missing_ingredients.append(ingredient['product_name'])
                    
                    availability[product_id] = {
                        'status': 'available' if can_make else 'out_of_stock',
                        'stock_level': 'menu_item',
                        'can_make': can_make,
                        'missing_ingredients': missing_ingredients
                    }
                else:
                    # Menu item without recipe - assume available
                    availability[product_id] = {
                        'status': 'available',
                        'stock_level': 'menu_item',
                        'can_make': True,
                        'missing_ingredients': []
                    }
            else:
                # Regular product - check direct stock
                stock_level = stock_levels.get(product_id, 0)
                if stock_level > 10:
                    status = 'in_stock'
                elif stock_level > 0:
                    status = 'low_stock'
                else:
                    status = 'out_of_stock'
                
                availability[product_id] = {
                    'status': status,
                    'stock_level': float(stock_level),
                    'can_make': False,
                    'missing_ingredients': []
                }
        
        return availability

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
        
        # Track previous quantity for notification logic
        previous_quantity = stock.quantity
        stock.quantity += Decimal(str(quantity))
        
        # Check if stock crossed back above threshold (reset notification flag)
        threshold = stock.effective_low_stock_threshold
        if (previous_quantity <= threshold and 
            stock.quantity > threshold and 
            stock.low_stock_notified):
            stock.low_stock_notified = False
        
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

        # Track previous quantity for notification logic
        previous_quantity = stock.quantity
        stock.quantity -= quantity_decimal
        
        # Check if stock crossed below threshold (send notification)
        threshold = stock.effective_low_stock_threshold
        if (previous_quantity > threshold and 
            stock.quantity <= threshold and 
            not stock.low_stock_notified):
            InventoryService._send_low_stock_notification(stock)
        
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

    @staticmethod
    def _send_low_stock_notification(stock: InventoryStock):
        """
        Send low stock notification to users with owner role.
        """
        from users.models import User
        from notifications.services import email_service
        import logging
        
        logger = logging.getLogger(__name__)
        
        # Get all owners with valid email addresses
        owners = User.objects.filter(
            role='OWNER', 
            email__isnull=False, 
            email__gt=''
        ).values_list('email', flat=True)
        
        if not owners:
            logger.warning("No owner users with valid emails found for low stock notification")
            return
        
        # Send individual emails to each owner
        for owner_email in owners:
            try:
                email_service.send_low_stock_alert(
                    owner_email, 
                    stock.product, 
                    stock.quantity,
                    stock.location,
                    stock.effective_low_stock_threshold
                )
            except Exception as e:
                logger.error(f"Failed to send low stock alert to {owner_email}: {e}")
                # Continue sending to other owners even if one fails
        
        # Mark as notified
        stock.low_stock_notified = True

    @staticmethod
    def send_daily_low_stock_summary():
        """
        Daily sweep to catch any items below threshold that haven't been notified.
        This runs in addition to individual item notifications.
        Returns the count of items that were included in the notification.
        """
        from users.models import User
        from notifications.services import email_service
        import logging
        
        logger = logging.getLogger(__name__)
        
        # Find all items below threshold that haven't been notified
        low_stock_items = InventoryStock.objects.filter(
            low_stock_notified=False
        ).select_related('product', 'location')
        
        # Filter to only items actually below their threshold
        items_to_notify = []
        for item in low_stock_items:
            if item.quantity <= item.effective_low_stock_threshold:
                items_to_notify.append(item)
        
        if not items_to_notify:
            logger.info("Daily low stock sweep: No missed items found")
            return 0
        
        # Get all owners with valid email addresses
        owners = User.objects.filter(
            role='OWNER', 
            email__isnull=False, 
            email__gt=''
        ).values_list('email', flat=True)
        
        if not owners:
            logger.warning("No owner users with valid emails found for daily low stock sweep")
            return 0
        
        # Send daily summary to each owner
        for owner_email in owners:
            try:
                email_service.send_daily_low_stock_summary(owner_email, items_to_notify)
            except Exception as e:
                logger.error(f"Failed to send daily low stock summary to {owner_email}: {e}")
        
        # Mark all items as notified
        for item in items_to_notify:
            item.low_stock_notified = True
            item.save(update_fields=['low_stock_notified'])
        
        logger.info(f"Daily low stock summary sent for {len(items_to_notify)} missed items to {len(owners)} owners")
        return len(items_to_notify)
