"""
Pytest fixtures for COGS tests.
"""
import pytest
from decimal import Decimal
from django.utils import timezone

from tenant.models import Tenant
from tenant.managers import set_current_tenant
from users.models import User
from products.models import Product, ProductType, Category
from settings.models import StoreLocation
from inventory.models import Recipe, RecipeItem
from cogs.models import Unit, UnitConversion, IngredientConfig, ItemCostSource, UnitCategory


@pytest.fixture
def tenant(db):
    """Create a test tenant."""
    tenant = Tenant.objects.create(
        name="Test Restaurant",
        slug="test-restaurant",
    )
    set_current_tenant(tenant)
    return tenant


@pytest.fixture
def store_location(tenant):
    """Create a test store location."""
    return StoreLocation.objects.create(
        tenant=tenant,
        name="Main Store",
        address_line1="123 Test St",
        city="Test City",
        state="TS",
        postal_code="12345",
        country="US",
        timezone="America/New_York",
    )


@pytest.fixture
def manager_user(tenant):
    """Create a manager user."""
    return User.objects.create(
        tenant=tenant,
        email="manager@test.com",
        first_name="Test",
        last_name="Manager",
        role=User.Role.MANAGER,
        is_active=True,
    )


@pytest.fixture
def cashier_user(tenant):
    """Create a cashier user (should not have COGS access)."""
    return User.objects.create(
        tenant=tenant,
        email="cashier@test.com",
        first_name="Test",
        last_name="Cashier",
        role=User.Role.CASHIER,
        is_active=True,
    )


@pytest.fixture
def ingredient_product_type(tenant):
    """Create an Ingredient product type."""
    return ProductType.objects.create(
        tenant=tenant,
        name="Ingredient",
        inventory_behavior=ProductType.InventoryBehavior.QUANTITY,
        stock_enforcement=ProductType.StockEnforcement.WARN,
    )


@pytest.fixture
def menu_product_type(tenant):
    """Create a Menu Item product type."""
    return ProductType.objects.create(
        tenant=tenant,
        name="Menu Item",
        inventory_behavior=ProductType.InventoryBehavior.RECIPE,
        stock_enforcement=ProductType.StockEnforcement.IGNORE,
    )


@pytest.fixture
def category(tenant):
    """Create a test category."""
    return Category.objects.create(
        tenant=tenant,
        name="Test Category",
    )


@pytest.fixture
def default_units(db):
    """Create default global units for testing."""
    units = {}
    unit_data = [
        ("g", "gram", UnitCategory.WEIGHT),
        ("kg", "kilogram", UnitCategory.WEIGHT),
        ("oz", "ounce", UnitCategory.WEIGHT),
        ("lb", "pound", UnitCategory.WEIGHT),
        ("ml", "milliliter", UnitCategory.VOLUME),
        ("l", "liter", UnitCategory.VOLUME),
        ("each", "each", UnitCategory.COUNT),
        ("piece", "piece", UnitCategory.COUNT),
    ]
    for code, name, category in unit_data:
        unit, _ = Unit.objects.get_or_create(
            code=code,
            defaults={
                "name": name,
                "category": category,
            }
        )
        units[code] = unit
    return units


@pytest.fixture
def default_conversions(tenant, default_units):
    """Create default unit conversions for the test tenant."""
    conversions = []
    conversion_data = [
        ("kg", "g", Decimal("1000")),
        ("lb", "oz", Decimal("16")),
        ("lb", "g", Decimal("453.592")),
        ("oz", "g", Decimal("28.3495")),
        ("l", "ml", Decimal("1000")),
    ]
    for from_code, to_code, multiplier in conversion_data:
        conversion, _ = UnitConversion.all_objects.get_or_create(
            tenant=tenant,
            from_unit=default_units[from_code],
            to_unit=default_units[to_code],
            defaults={
                "multiplier": multiplier,
            }
        )
        conversions.append(conversion)
    return conversions


@pytest.fixture
def cheese_ingredient(tenant, ingredient_product_type):
    """Create a cheese ingredient product."""
    return Product.objects.create(
        tenant=tenant,
        name="Mozzarella Cheese",
        product_type=ingredient_product_type,
        price=Decimal("0.00"),
        is_public=False,
        track_inventory=True,
    )


@pytest.fixture
def tomato_ingredient(tenant, ingredient_product_type):
    """Create a tomato sauce ingredient product."""
    return Product.objects.create(
        tenant=tenant,
        name="Tomato Sauce",
        product_type=ingredient_product_type,
        price=Decimal("0.00"),
        is_public=False,
        track_inventory=True,
    )


@pytest.fixture
def dough_ingredient(tenant, ingredient_product_type):
    """Create a dough ingredient product."""
    return Product.objects.create(
        tenant=tenant,
        name="Pizza Dough",
        product_type=ingredient_product_type,
        price=Decimal("0.00"),
        is_public=False,
        track_inventory=True,
    )


@pytest.fixture
def pizza_menu_item(tenant, menu_product_type, category):
    """Create a pizza menu item."""
    return Product.objects.create(
        tenant=tenant,
        name="Margherita Pizza",
        product_type=menu_product_type,
        category=category,
        price=Decimal("12.99"),
        is_public=True,
    )


@pytest.fixture
def pizza_recipe(tenant, pizza_menu_item):
    """Create a recipe for the pizza."""
    return Recipe.objects.create(
        tenant=tenant,
        menu_item=pizza_menu_item,
        name="Margherita Pizza Recipe",
    )


@pytest.fixture
def pizza_recipe_items(
    tenant, pizza_recipe, cheese_ingredient, tomato_ingredient, dough_ingredient, default_units
):
    """Create recipe items for the pizza."""
    items = []

    # 150g cheese
    items.append(RecipeItem.objects.create(
        tenant=tenant,
        recipe=pizza_recipe,
        product=cheese_ingredient,
        quantity=Decimal("150"),
        unit="g",
    ))

    # 100g tomato sauce
    items.append(RecipeItem.objects.create(
        tenant=tenant,
        recipe=pizza_recipe,
        product=tomato_ingredient,
        quantity=Decimal("100"),
        unit="g",
    ))

    # 1 piece dough
    items.append(RecipeItem.objects.create(
        tenant=tenant,
        recipe=pizza_recipe,
        product=dough_ingredient,
        quantity=Decimal("1"),
        unit="each",
    ))

    return items


@pytest.fixture
def ingredient_configs(
    tenant, cheese_ingredient, tomato_ingredient, dough_ingredient, default_units
):
    """Create ingredient configs."""
    configs = {}

    configs['cheese'] = IngredientConfig.objects.create(
        tenant=tenant,
        product=cheese_ingredient,
        base_unit=default_units['g'],
    )

    configs['tomato'] = IngredientConfig.objects.create(
        tenant=tenant,
        product=tomato_ingredient,
        base_unit=default_units['g'],
    )

    configs['dough'] = IngredientConfig.objects.create(
        tenant=tenant,
        product=dough_ingredient,
        base_unit=default_units['each'],
    )

    return configs


@pytest.fixture
def ingredient_costs(
    tenant, store_location, cheese_ingredient, tomato_ingredient, dough_ingredient, default_units
):
    """Create cost sources for ingredients."""
    costs = {}

    # Cheese: $15/kg = $0.015/g
    costs['cheese'] = ItemCostSource.objects.create(
        tenant=tenant,
        store_location=store_location,
        product=cheese_ingredient,
        unit_cost=Decimal("15.00"),
        unit=default_units['kg'],
        source_type='manual',
        effective_at=timezone.now(),
    )

    # Tomato sauce: $5/kg = $0.005/g
    costs['tomato'] = ItemCostSource.objects.create(
        tenant=tenant,
        store_location=store_location,
        product=tomato_ingredient,
        unit_cost=Decimal("5.00"),
        unit=default_units['kg'],
        source_type='manual',
        effective_at=timezone.now(),
    )

    # Dough: $1.50/each
    costs['dough'] = ItemCostSource.objects.create(
        tenant=tenant,
        store_location=store_location,
        product=dough_ingredient,
        unit_cost=Decimal("1.50"),
        unit=default_units['each'],
        source_type='manual',
        effective_at=timezone.now(),
    )

    return costs
