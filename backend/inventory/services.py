from django.db import transaction
from .models import InventoryStock, Location, Recipe, StockHistoryEntry
from products.models import Product
from decimal import Decimal
from core_backend.infrastructure.cache_utils import cache_dynamic_data, cache_static_data
import logging
import uuid

logger = logging.getLogger(__name__)


class InventoryService:
    
    @staticmethod
    def _log_stock_operation(
        product: Product,
        location: Location,
        operation_type: str,
        quantity_change: Decimal,
        previous_quantity: Decimal,
        new_quantity: Decimal,
        user=None,
        reason_config=None,
        detailed_reason: str = "",
        reason: str = "",  # Legacy for backward compatibility
        notes: str = "",
        reference_id: str = "",
        ip_address: str = None,
        user_agent: str = ""
    ):
        """
        Helper method to log stock operations to StockHistoryEntry.
        """
        from tenant.managers import get_current_tenant

        try:
            tenant = get_current_tenant()
            StockHistoryEntry.objects.create(
                tenant=tenant,
                product=product,
                location=location,
                user=user,
                operation_type=operation_type,
                quantity_change=quantity_change,
                previous_quantity=previous_quantity,
                new_quantity=new_quantity,
                reason_config=reason_config,
                detailed_reason=detailed_reason,
                reason=reason,  # Legacy field for backward compatibility
                notes=notes,
                reference_id=reference_id,
                ip_address=ip_address,
                user_agent=user_agent,
            )
        except Exception as e:
            # Log the error but don't fail the stock operation
            logger.error(f"Failed to log stock operation for {product.name} at {location.name}: {e}")
    
    @staticmethod
    @cache_dynamic_data(timeout=300)  # 5 minutes - balance freshness vs performance
    def get_stock_levels_by_location(location_id):
        """Cache stock levels for POS availability checks (tenant-scoped via TenantManager)"""
        return dict(InventoryStock.objects.filter(
            location_id=location_id
        ).values_list('product_id', 'quantity'))
    
    @staticmethod
    @cache_static_data(timeout=3600*6)  # 6 hours - recipes don't change often
    def get_recipe_ingredients_map():
        """Cache recipe-to-ingredients mapping for menu items (tenant-scoped via TenantManager)"""
        recipes = {}
        # FIX: Use menu_item field (Recipe model uses menu_item, not product)
        for recipe in Recipe.objects.prefetch_related(
            'recipeitem_set__product__product_type'
        ).select_related('menu_item'):
            recipes[recipe.menu_item_id] = [
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
        """Cache product availability status for POS display (tenant-scoped via TenantManager)"""
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
    def add_stock(
        product: Product,
        location: Location,
        quantity,
        user=None,
        reason_config=None,
        detailed_reason="",
        reason="",  # Legacy for backward compatibility
        legacy_reason="",  # Alternative legacy field name
        reference_id="",
        skip_logging=False
    ):
        """
        Adds a specified quantity of a product to a specific inventory location.
        If stock for the product at the location does not exist, it will be created.
        """
        # Validate quantity is positive
        try:
            quantity_value = float(quantity)
        except (ValueError, TypeError):
            raise ValueError(f"Invalid quantity format: {quantity}")

        if quantity_value < 0:
            raise ValueError("Cannot add negative stock quantity. Use decrement_stock() instead.")

        from tenant.managers import get_current_tenant

        tenant = get_current_tenant()
        stock, created = InventoryStock.objects.get_or_create(
            product=product, location=location, defaults={"tenant": tenant, "quantity": Decimal("0.0")}
        )

        # Track previous quantity for notification logic and history
        previous_quantity = stock.quantity
        quantity_decimal = Decimal(str(quantity))

        # CRITICAL FIX: Use atomic F() expression to prevent race condition
        # This prevents lost updates when multiple workers add stock simultaneously
        from django.db.models import F

        # Check if stock crossed back above threshold (reset notification flag)
        threshold = stock.effective_low_stock_threshold
        if (previous_quantity <= threshold and
            (previous_quantity + quantity_decimal) > threshold and
            stock.low_stock_notified):
            # Update quantity atomically AND reset notification flag
            InventoryStock.objects.filter(id=stock.id).update(
                quantity=F('quantity') + quantity_decimal,
                low_stock_notified=False
            )
        else:
            # Just update quantity atomically
            InventoryStock.objects.filter(id=stock.id).update(
                quantity=F('quantity') + quantity_decimal
            )

        # Refresh to get the new quantity value
        stock.refresh_from_db()
        
        # Log the stock operation (unless skipped for transfers)
        if not skip_logging:
            operation_type = 'CREATED' if created else 'ADJUSTED_ADD'
            
            # Handle legacy reason fallback
            legacy_reason_final = reason or legacy_reason
            
            InventoryService._log_stock_operation(
                product=product,
                location=location,
                operation_type=operation_type,
                quantity_change=quantity_decimal,
                previous_quantity=previous_quantity,
                new_quantity=stock.quantity,
                user=user,
                reason_config=reason_config,
                detailed_reason=detailed_reason,
                reason=legacy_reason_final,  # Legacy field for backward compatibility
                reference_id=reference_id
            )
        
        return stock

    @staticmethod
    @transaction.atomic
    def decrement_stock(
        product: Product, 
        location: Location, 
        quantity, 
        user=None, 
        reason_config=None, 
        detailed_reason="",
        reason="",  # Legacy for backward compatibility
        legacy_reason="",  # Alternative legacy field name
        reference_id="", 
        skip_logging=False
    ):
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

        # Track previous quantity for notification logic and history
        previous_quantity = stock.quantity
        stock.quantity -= quantity_decimal
        
        # Check if stock crossed below threshold (send notification)
        threshold = stock.effective_low_stock_threshold
        if (previous_quantity > threshold and 
            stock.quantity <= threshold and 
            not stock.low_stock_notified):
            InventoryService._send_low_stock_notification(stock)
        
        stock.save()
        
        # Log the stock operation (unless skipped for transfers)
        if not skip_logging:
            # Handle legacy reason fallback
            legacy_reason_final = reason or legacy_reason
            
            InventoryService._log_stock_operation(
                product=product,
                location=location,
                operation_type='ADJUSTED_SUBTRACT',
                quantity_change=-quantity_decimal,  # Negative for subtraction
                previous_quantity=previous_quantity,
                new_quantity=stock.quantity,
                user=user,
                reason_config=reason_config,
                detailed_reason=detailed_reason,
                reason=legacy_reason_final,  # Legacy field for backward compatibility
                reference_id=reference_id
            )
        
        return stock

    @staticmethod
    @transaction.atomic
    def transfer_stock(
        product: Product,
        from_location: Location,
        to_location: Location,
        quantity,
        user=None,
        reason_config=None,
        detailed_reason="",
        reason="",  # Legacy for backward compatibility
        legacy_reason="",  # Alternative legacy field name
        notes="",
        reference_id=None  # Optional reference ID for bulk operations
    ):
        """
        Transfers a specified quantity of a product from one location to another.
        """
        if from_location == to_location:
            raise ValueError("Source and destination locations cannot be the same.")

        quantity_decimal = Decimal(str(quantity))

        # Use provided reference_id or generate a unique one for linking operations
        transfer_ref = reference_id if reference_id else f"transfer_{uuid.uuid4().hex[:12]}"

        # Get current stock levels for logging
        try:
            from_stock = InventoryStock.objects.get(product=product, location=from_location)
            from_previous_qty = from_stock.quantity
        except InventoryStock.DoesNotExist:
            raise ValueError(f"No stock found for {product.name} at {from_location.name}")

        try:
            to_stock = InventoryStock.objects.get(product=product, location=to_location)
            to_previous_qty = to_stock.quantity
        except InventoryStock.DoesNotExist:
            to_previous_qty = Decimal('0.0')

        # Handle legacy reason fallback
        legacy_reason_final = reason or legacy_reason
        
        # Decrement from the source location (skip logging to avoid duplicate records)
        source_stock = InventoryService.decrement_stock(
            product, 
            from_location, 
            quantity_decimal, 
            user=user, 
            reason_config=reason_config,
            detailed_reason=detailed_reason,
            legacy_reason=legacy_reason_final, 
            reference_id=transfer_ref, 
            skip_logging=True
        )

        # Add to the destination location (skip logging to avoid duplicate records)
        destination_stock = InventoryService.add_stock(
            product, 
            to_location, 
            quantity_decimal, 
            user=user, 
            reason_config=reason_config,
            detailed_reason=detailed_reason,
            legacy_reason=legacy_reason_final, 
            reference_id=transfer_ref, 
            skip_logging=True
        )

        # Log the transfer operations with proper types
        InventoryService._log_stock_operation(
            product=product,
            location=from_location,
            operation_type='TRANSFER_FROM',
            quantity_change=-quantity_decimal,
            previous_quantity=from_previous_qty,
            new_quantity=source_stock.quantity,
            user=user,
            reason_config=reason_config,
            detailed_reason=detailed_reason,
            reason=legacy_reason_final,
            notes=notes,
            reference_id=transfer_ref
        )
        
        InventoryService._log_stock_operation(
            product=product,
            location=to_location,
            operation_type='TRANSFER_TO',
            quantity_change=quantity_decimal,
            previous_quantity=to_previous_qty,
            new_quantity=destination_stock.quantity,
            user=user,
            reason_config=reason_config,
            detailed_reason=detailed_reason,
            reason=legacy_reason_final,
            notes=notes,
            reference_id=transfer_ref
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
        
        from django.conf import settings
        # Feature-flagged policy path
        if getattr(settings, 'USE_PRODUCT_TYPE_POLICY', False):
            pt = product.product_type
            behavior = getattr(pt, 'inventory_behavior', 'QUANTITY')

            # RECIPE behavior
            if behavior == 'RECIPE':
                if hasattr(product, 'recipe') and product.recipe:
                    return InventoryService.check_recipe_availability(product, location, required_quantity)
                # No recipe configured: obey enforcement
                enforcement = getattr(pt, 'stock_enforcement', 'BLOCK')
                if enforcement in ('IGNORE', 'WARN') or getattr(pt, 'allow_negative_stock', False):
                    return True
                return False

            # NONE behavior: always available
            if behavior == 'NONE':
                return True

            # QUANTITY behavior: strict stock check
            try:
                stock = InventoryStock.objects.get(product=product, location=location)
                return stock.quantity >= required_quantity
            except InventoryStock.DoesNotExist:
                return False

        # Legacy path (pre-policy):
        if hasattr(product, 'recipe') and product.recipe:
            return InventoryService.check_recipe_availability(product, location, required_quantity)
        elif product.product_type.name.lower() == 'menu':
            return True
        else:
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
                logger.warning(f"Menu item_id {menu_item.id} has low/missing ingredients: {len(missing_ingredients)} items. Allowing cook-to-order.")
            
            return True  # Always allow menu items (cook to order)
            
        except Recipe.DoesNotExist:
            # Menu item has no recipe - assume can be made to order
            return True

    @staticmethod
    @transaction.atomic
    def deduct_recipe_ingredients(menu_item: Product, quantity, location: Location, reason_config=None, reference_id=None):
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
                    InventoryService.decrement_stock(
                        recipe_item.product, 
                        location, 
                        total_needed,
                        reason_config=reason_config,
                        detailed_reason=f"Recipe ingredient for {menu_item.name}",
                        legacy_reason="Recipe ingredient deduction",
                        reference_id=str(reference_id) if reference_id else None
                    )
                except ValueError as e:
                    # Ingredient insufficient - log but don't block (cook to order)
                    logger.info(f"Cook-to-order: Used more than in stock for product_id {recipe_item.product.id}. {e}")
                    
                    # Set stock to 0 if it exists, or create a negative stock record for tracking
                    try:
                        stock = InventoryStock.objects.get(
                            product=recipe_item.product, location=location
                        )
                        used_from_stock = stock.quantity
                        
                        # Log the deduction of what was available
                        if used_from_stock > 0:
                            InventoryService._log_stock_operation(
                                recipe_item.product,
                                location,
                                "DECREMENT",
                                -used_from_stock,
                                used_from_stock,
                                Decimal('0'),
                                reason_config=reason_config,
                                detailed_reason=f"Recipe ingredient for {menu_item.name} (partial from stock)",
                                reason="Recipe ingredient deduction",
                                reference_id=str(reference_id) if reference_id else None
                            )
                        
                        stock.quantity = Decimal('0')
                        stock.save()
                        logger.info(f"Used {used_from_stock} from stock, prepared {total_needed - used_from_stock} fresh")
                    except InventoryStock.DoesNotExist:
                        # No stock record - create one with 0 (all prepared fresh)
                        from tenant.managers import get_current_tenant

                        tenant = get_current_tenant()
                        InventoryStock.objects.create(
                            tenant=tenant,
                            product=recipe_item.product,
                            location=location,
                            quantity=Decimal('0')
                        )
                        logger.info(f"Prepared {total_needed} units fresh for product_id {recipe_item.product.id}")
                        
        except Recipe.DoesNotExist:
            # Menu item has no recipe - no deduction needed for cook-to-order items
            logger.info(f"Menu item_id {menu_item.id} has no recipe - prepared fresh to order")

    @staticmethod
    @transaction.atomic
    def process_order_completion(order):
        """
        Process inventory deduction for a completed order.
        Handles both regular products and menu items with recipes.
        """
        from settings.config import app_settings
        from settings.models import StockActionReasonConfig
        
        default_location = app_settings.get_default_location()
        
        # Get global system reason for order deductions (tenant=NULL)
        try:
            order_deduction_reason = StockActionReasonConfig.objects.get(
                name="System Order Deduction",
                is_system_reason=True,
                is_active=True,
                tenant__isnull=True
            )
        except StockActionReasonConfig.DoesNotExist:
            # Fallback to any system reason
            order_deduction_reason = StockActionReasonConfig.objects.filter(
                category="SYSTEM",
                is_active=True
            ).first()
            
            if not order_deduction_reason:
                logger.error("No active system reason configuration found for order deductions")
                # Create a temporary fallback reason
                order_deduction_reason = None
        
        for item in order.items.all():
            try:
                if hasattr(item.product, 'recipe') and item.product.recipe:
                    # Handle menu items with recipes
                    InventoryService.deduct_recipe_ingredients(
                        item.product, item.quantity, default_location, order_deduction_reason, order.id
                    )
                else:
                    # Handle regular products
                    InventoryService.decrement_stock(
                        item.product, 
                        default_location, 
                        item.quantity,
                        reason_config=order_deduction_reason,
                        detailed_reason=f"Order #{order.order_number or order.id} completed",
                        legacy_reason="Order completion",
                        reference_id=f"order_{order.id}"
                    )
            except ValueError as e:
                # Log inventory deduction failures but don't block order completion
                logger.warning(f"Inventory deduction warning for order {order.id}: {e}")

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
                logger.error(f"Failed to send low stock alert: {type(e).__name__}")
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
        # FIX: Add select_related for product__product_type to prevent N+1 queries
        low_stock_items = InventoryStock.objects.filter(
            low_stock_notified=False
        ).select_related('product', 'location', 'product__product_type')
        
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
                logger.error(f"Failed to send daily low stock summary: {type(e).__name__}")
        
        # Mark all items as notified
        for item in items_to_notify:
            item.low_stock_notified = True
            item.save(update_fields=['low_stock_notified'])
        
        logger.info(f"Daily low stock summary sent for {len(items_to_notify)} missed items to {len(owners)} owners")
        return len(items_to_notify)
    
    # ========== NEW METHODS FOR VIEW LOGIC CONSOLIDATION ==========
    
    @staticmethod
    def apply_stock_filters(queryset, filters: dict) -> 'QuerySet':
        """Apply filtering logic to an already-optimized queryset"""
        from django.db import models
        from django.db.models import Q, F, Case, When, Value
        from django.utils import timezone
        from datetime import timedelta
        from settings.config import app_settings
        
        # Location filtering
        location_id = filters.get("location")
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        
        # Search filtering
        search_query = filters.get("search")
        if search_query:
            queryset = queryset.filter(
                Q(product__name__icontains=search_query)
                | Q(product__barcode__icontains=search_query)
            )
        
        # Low stock filtering with effective thresholds
        # Uses 3-tier hierarchy: InventoryStock → inventory.Location → StoreLocation (fallback: 10)
        is_low_stock = filters.get("is_low_stock")
        if is_low_stock and is_low_stock.lower() == "true":
            from django.db import models
            queryset = queryset.filter(
                quantity__lte=Case(
                    # Tier 1: Individual stock threshold
                    When(low_stock_threshold__isnull=False, then=F("low_stock_threshold")),
                    # Tier 2: Storage location threshold
                    When(location__low_stock_threshold__isnull=False, then=F("location__low_stock_threshold")),
                    # Tier 3: Store location threshold (via storage location)
                    When(location__store_location__low_stock_threshold__isnull=False,
                         then=F("location__store_location__low_stock_threshold")),
                    # Fallback: Hardcoded default
                    default=Value(10, output_field=models.IntegerField()),
                )
            )
        
        # Expiring soon filtering - simplified since SerializerOptimizedMixin handles relationships
        # Uses 3-tier hierarchy: InventoryStock → inventory.Location → StoreLocation (handled by model property)
        is_expiring_soon = filters.get("is_expiring_soon")
        if is_expiring_soon and is_expiring_soon.lower() == "true":
            today = timezone.now().date()

            # For simplicity and database portability, use a conservative approach
            # Filter broadly first, then let the serializer's is_expiring_soon property handle exact logic
            max_possible_threshold = 90  # Conservative maximum threshold
            queryset = queryset.filter(
                expiration_date__isnull=False,
                expiration_date__lte=today + timedelta(days=max_possible_threshold)
            )

            # The exact expiring logic will be handled by the model's is_expiring_soon property
            # which uses the 3-tier hierarchy via effective_expiration_threshold
        
        return queryset
    
    @staticmethod
    def search_inventory_by_barcode(barcode: str, location_id: int = None) -> dict:
        """Extract barcode lookup logic from barcode_stock_lookup view"""
        from products.models import Product
        from settings.config import app_settings
        
        try:
            product = Product.objects.get(barcode=barcode, is_active=True)
            
            if location_id:
                try:
                    location = Location.objects.get(id=location_id)
                except Location.DoesNotExist:
                    location = app_settings.get_default_location()
            else:
                location = app_settings.get_default_location()
            
            stock_level = InventoryService.get_stock_level(product, location)
            
            return {
                "success": True,
                "barcode": barcode,
                "product": {
                    "id": product.id,
                    "name": product.name,
                    "barcode": product.barcode,
                    "track_inventory": product.track_inventory,
                },
                "stock": {
                    "location": location.name,
                    "location_id": location.id,
                    "quantity": stock_level,
                    "is_available": stock_level > 0,
                },
            }
            
        except Product.DoesNotExist:
            return {
                "success": False,
                "error": "Product with this barcode not found",
                "barcode": barcode
            }
    
    @staticmethod
    @transaction.atomic
    def perform_barcode_stock_adjustment(barcode: str, quantity: float, adjustment_type: str = "add", location_id: int = None, user=None, reason: str = "") -> dict:
        """Extract barcode stock adjustment logic from barcode_stock_adjustment view"""
        from products.models import Product
        from settings.config import app_settings
        
        # Validate inputs
        if not quantity:
            return {"success": False, "error": "Quantity is required"}
        
        try:
            quantity = float(quantity)
        except (ValueError, TypeError):
            return {"success": False, "error": "Invalid quantity format"}
        
        # Adjust quantity based on type
        if adjustment_type == "subtract":
            quantity = -quantity
        
        try:
            product = Product.objects.get(barcode=barcode, is_active=True)
            
            if not product.track_inventory:
                return {"success": False, "error": "This product does not track inventory"}
            
            if location_id:
                try:
                    location = Location.objects.get(id=location_id)
                except Location.DoesNotExist:
                    location = app_settings.get_default_location()
            else:
                location = app_settings.get_default_location()
            
            # Perform stock adjustment using existing service methods
            if quantity > 0:
                InventoryService.add_stock(product, location, quantity, user=user, reason=reason)
            else:
                InventoryService.decrement_stock(product, location, abs(quantity), user=user, reason=reason)
            
            # Get updated stock level
            new_stock_level = InventoryService.get_stock_level(product, location)
            
            return {
                "success": True,
                "message": "Stock adjusted successfully",
                "product": {
                    "id": product.id,
                    "name": product.name,
                    "barcode": product.barcode,
                },
                "adjustment": {
                    "quantity": quantity,
                    "type": adjustment_type
                },
                "stock": {
                    "location": location.name,
                    "location_id": location.id,
                    "quantity": new_stock_level,
                },
            }
            
        except Product.DoesNotExist:
            return {"success": False, "error": "Product with this barcode not found"}
        except ValueError as e:
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def check_bulk_stock_availability(product_ids: list, location_id: int = None) -> dict:
        """Extract bulk stock checking logic from BulkStockCheckView"""
        from products.models import Product
        from settings.config import app_settings
        
        if not product_ids:
            return {"error": "product_ids required"}
        
        if location_id:
            try:
                location = Location.objects.get(id=location_id)
            except Location.DoesNotExist:
                location = app_settings.get_default_location()
        else:
            location = app_settings.get_default_location()
        
        results = []
        
        for product_id in product_ids:
            try:
                product = Product.objects.get(id=product_id)
                stock_level = InventoryService.get_stock_level(product, location)
                
                # Check if item is available (considering recipes)
                is_available = InventoryService.check_stock_availability(
                    product, location, 1
                )
                
                results.append({
                    "product_id": product_id,
                    "product_name": product.name,
                    "stock_level": stock_level,
                    "is_available": is_available,
                    "has_recipe": hasattr(product, "recipe") and product.recipe is not None,
                })
                
            except Product.DoesNotExist:
                results.append({
                    "product_id": product_id,
                    "error": "Product not found"
                })
        
        return {
            "location": location.name,
            "location_id": location.id,
            "products": results
        }
    
    @staticmethod
    def get_inventory_dashboard_data() -> dict:
        """Extract dashboard aggregation logic from InventoryDashboardView"""
        from django.db.models import Sum, F, Case, When, Value, Q
        from django.utils import timezone
        from datetime import timedelta
        
        try:
            # Get all stock records across all locations
            # FIX: Add product__product_type to prevent N+1 queries in reporting
            all_stock_records = InventoryStock.objects.select_related(
                "product", "location", "product__product_type"
            ).filter(archived_at__isnull=True)
            
            # Aggregate total quantities per product across all locations
            product_totals = all_stock_records.values("product").annotate(
                total_quantity=Sum("quantity"),
                product_name=F("product__name"),
                product_price=F("product__price"),
                product_id=F("product__id"),
            )
            
            total_products = product_totals.count()
            
            # Calculate low stock count based on aggregated quantities
            low_stock_count = 0
            out_of_stock_count = 0
            low_stock_products = []
            
            for product_data in product_totals:
                total_qty = product_data["total_quantity"] or 0
                
                # Get the most restrictive low stock threshold for this product
                product_stocks = all_stock_records.filter(
                    product_id=product_data["product_id"]
                )
                min_threshold = min(
                    stock.effective_low_stock_threshold for stock in product_stocks
                )
                
                if total_qty == 0:
                    out_of_stock_count += 1
                elif total_qty <= min_threshold:
                    low_stock_count += 1
                    low_stock_products.append({
                        "product_id": product_data["product_id"],
                        "product_name": product_data["product_name"],
                        "quantity": total_qty,
                        "price": product_data["product_price"],
                        "low_stock_threshold": min_threshold,
                    })
            
            # Calculate expiring soon items across all locations
            today = timezone.now().date()
            expiring_soon_items = []
            
            for stock in all_stock_records.filter(expiration_date__isnull=False):
                threshold_date = today + timedelta(
                    days=stock.effective_expiration_threshold
                )
                if stock.expiration_date <= threshold_date:
                    expiring_soon_items.append({
                        "product_id": stock.product.id,
                        "product_name": stock.product.name,
                        "quantity": stock.quantity,
                        "price": stock.product.price,
                        "expiration_date": stock.expiration_date,
                        "expiration_threshold": stock.effective_expiration_threshold,
                        "location": stock.location.name,
                    })
            
            expiring_soon_count = len(expiring_soon_items)
            
            # Calculate total inventory value across all locations
            total_value = sum(
                (product_data["total_quantity"] or 0)
                * (product_data["product_price"] or 0)
                for product_data in product_totals
            )
            
            return {
                "scope": "All Locations",
                "summary": {
                    "total_products": total_products,
                    "low_stock_count": low_stock_count,
                    "out_of_stock_count": out_of_stock_count,
                    "expiring_soon_count": expiring_soon_count,
                    "total_value": total_value,
                },
                "low_stock_items": low_stock_products[:10],
                "expiring_soon_items": expiring_soon_items[:10],
            }
            
        except Exception as e:
            return {"error": f"Dashboard data error: {str(e)}"}
    
    @staticmethod
    @transaction.atomic
    def perform_quick_stock_adjustment(product_id: int, quantity: float, reason: str = None, adjustment_type: str = "FOUND_STOCK", user_id: int = None) -> dict:
        """Extract quick stock adjustment logic from QuickStockAdjustmentView"""
        from products.models import Product
        from settings.config import app_settings
        import logging
        
        logger = logging.getLogger(__name__)
        
        if not product_id or quantity is None:
            return {"success": False, "error": "product_id and quantity are required"}
        
        if reason is None:
            reason = "Quick adjustment during service"
        
        try:
            product = Product.objects.get(id=product_id)
            location = app_settings.get_default_location()
            
            # Add the found stock
            stock = InventoryService.add_stock(product, location, quantity)
            
            # Log the adjustment for audit trail
            log_message = f"QUICK STOCK ADJUSTMENT: Added {quantity} of {product.name} - {reason}"
            if user_id:
                try:
                    from users.models import User
                    user = User.objects.get(id=user_id)
                    log_message += f" by {user.username}"
                except User.DoesNotExist:
                    pass
            
            logger.info(log_message)
            logger.info(log_message)  # Log for immediate visibility
            
            return {
                "success": True,
                "message": f"Added {quantity} units of {product.name}",
                "product": {
                    "id": product.id,
                    "name": product.name,
                },
                "new_stock_level": float(stock.quantity),
                "adjustment": {
                    "quantity": float(quantity),
                    "reason": reason,
                    "type": adjustment_type,
                    "location": location.name,
                },
            }
            
        except Product.DoesNotExist:
            return {"success": False, "error": "Product not found"}
        except Exception as e:
            return {"success": False, "error": f"Failed to adjust stock: {str(e)}"}
    
    @staticmethod
    def get_product_stock_details(product_id: int, location_id: int = None) -> dict:
        """Extract product stock checking logic from ProductStockCheckView"""
        from products.models import Product
        from settings.config import app_settings
        
        try:
            product = Product.objects.get(id=product_id)
            
            if location_id:
                try:
                    location = Location.objects.get(id=location_id)
                except Location.DoesNotExist:
                    location = app_settings.get_default_location()
            else:
                location = app_settings.get_default_location()
            
            stock_level = InventoryService.get_stock_level(product, location)
            is_available = stock_level > 0
            
            # For menu items with recipes, check ingredient availability
            if hasattr(product, "recipe") and product.recipe:
                is_available = InventoryService.check_recipe_availability(
                    product, location, 1
                )
            
            return {
                "success": True,
                "product_id": product_id,
                "product_name": product.name,
                "stock_level": stock_level,
                "is_available": is_available,
                "location": location.name,
                "location_id": location.id,
                "has_recipe": hasattr(product, "recipe") and product.recipe is not None,
            }
            
        except Product.DoesNotExist:
            return {"success": False, "error": "Product not found"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @staticmethod
    @transaction.atomic
    def perform_bulk_stock_adjustment(adjustments_data, user_id):
        from users.models import User
        from settings.models import StockActionReasonConfig
        
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            raise ValueError(f"User with id {user_id} not found")

        # Generate a unique reference ID for this bulk operation
        bulk_ref = f"bulk_adj_{uuid.uuid4().hex[:12]}"
        
        results = []
        for item in adjustments_data:
            product = Product.objects.get(id=item['product_id'])
            location = Location.objects.get(id=item['location_id'])
            quantity = Decimal(item['quantity'])
            adjustment_type = item['adjustment_type']
            
            # Extract new reason structure
            reason_config = None
            reason_id = item.get('reason_id')
            if reason_id:
                try:
                    reason_config = StockActionReasonConfig.objects.get(id=reason_id, is_active=True)
                except StockActionReasonConfig.DoesNotExist:
                    # Log warning but continue with operation
                    print(f"Warning: StockActionReasonConfig with id {reason_id} not found or inactive")
            
            detailed_reason = item.get('detailed_reason', '')
            legacy_reason = item.get('reason', '')  # For backward compatibility

            if adjustment_type == "Add":
                stock = InventoryService.add_stock(
                    product, 
                    location, 
                    quantity, 
                    user=user, 
                    reason_config=reason_config,
                    detailed_reason=detailed_reason,
                    legacy_reason=legacy_reason,
                    reference_id=bulk_ref
                )
            else:
                stock = InventoryService.decrement_stock(
                    product, 
                    location, 
                    quantity, 
                    user=user, 
                    reason_config=reason_config,
                    detailed_reason=detailed_reason,
                    legacy_reason=legacy_reason,
                    reference_id=bulk_ref
                )

            results.append({
                'product_id': product.id,
                'location_id': location.id,
                'new_quantity': stock.quantity
            })
        
        return results

    @staticmethod
    @transaction.atomic
    def perform_bulk_stock_transfer(transfers_data, user_id, notes=""):
        from users.models import User
        from settings.models import StockActionReasonConfig
        
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            raise ValueError(f"User with id {user_id} not found")

        # Get global system reason for bulk transfers (tenant=NULL)
        try:
            bulk_transfer_reason = StockActionReasonConfig.objects.get(
                name="Bulk Transfer Operation",
                is_system_reason=True,
                is_active=True,
                tenant__isnull=True
            )
        except StockActionReasonConfig.DoesNotExist:
            # Fallback to any bulk transfer reason
            bulk_transfer_reason = StockActionReasonConfig.objects.filter(
                category="BULK",
                is_active=True
            ).first()
            
            if not bulk_transfer_reason:
                raise ValueError("No active bulk transfer reason configuration found")

        # Generate a unique reference ID for this bulk operation
        bulk_ref = f"bulk_xfer_{uuid.uuid4().hex[:12]}"
        
        results = []
        for item in transfers_data:
            product = Product.objects.get(id=item['product_id'])
            from_location = Location.objects.get(id=item['from_location_id'])
            to_location = Location.objects.get(id=item['to_location_id'])
            quantity = Decimal(item['quantity'])
            
            # Use individual item reason if provided, otherwise use bulk reason
            item_reason_config = bulk_transfer_reason  # Default to bulk reason
            reason_id = item.get('reason_id')
            if reason_id:
                # Handle if reason_id is already a StockActionReasonConfig object or just an ID
                if isinstance(reason_id, StockActionReasonConfig):
                    item_reason_config = reason_id
                else:
                    try:
                        item_reason_config = StockActionReasonConfig.objects.get(id=reason_id, is_active=True)
                    except StockActionReasonConfig.DoesNotExist:
                        print(f"Warning: StockActionReasonConfig with id {reason_id} not found or inactive, using bulk reason")
            
            item_detailed_reason = item.get('detailed_reason', notes)

            source_stock, destination_stock = InventoryService.transfer_stock(
                product,
                from_location,
                to_location,
                quantity,
                user=user,
                reason_config=item_reason_config,
                detailed_reason=item_detailed_reason,
                legacy_reason="Bulk transfer",
                reference_id=bulk_ref
            )

            results.append({
                'product_id': product.id,
                'from_location_id': from_location.id,
                'to_location_id': to_location.id,
                'from_location_quantity': source_stock.quantity,
                'to_location_quantity': destination_stock.quantity
            })
        
        return results
