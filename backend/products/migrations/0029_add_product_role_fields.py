"""
Add product role fields: is_sellable, is_purchasable, is_producible.

These fields represent product identity/capability and are orthogonal
(a product can have multiple roles).

Data seeding tailored to current catalog reality (no RECIPE product types in use):
- All active products are sellable (is_sellable=True)
- Products in Grocery or Canned Drinks categories are purchasable inputs
- All other categories are treated as producible (prep/menu items)
"""
from django.db import migrations, models


def set_initial_role_flags(apps, schema_editor):
    """
    Set initial role flags based on current catalog heuristics:
    - Everything active is sellable
    - Grocery/Canned Drinks categories are purchasable inputs (not producible)
    - All other categories are producible (prep/menu items)
    """
    Product = apps.get_model('products', 'Product')
    Category = apps.get_model('products', 'Category')

    purchasable_category_ids = set(
        Category.objects.filter(
            name__iregex=r"^(grocery|canned\s*drinks)$",
            is_active=True,
        ).values_list('id', flat=True)
    )

    updated_count = 0
    for product in Product.objects.filter(is_active=True):
        in_purchasable_category = product.category_id in purchasable_category_ids

        product.is_sellable = True
        product.is_purchasable = in_purchasable_category
        product.is_producible = not in_purchasable_category
        product.save(update_fields=['is_sellable', 'is_purchasable', 'is_producible'])
        updated_count += 1

    print(f"Updated role flags for {updated_count} active products (sellable=True; purchasable=grocery/canned drinks; producible=others)")


def reverse_role_flags(apps, schema_editor):
    """
    Reverse migration - reset all role flags to False.
    """
    Product = apps.get_model('products', 'Product')
    Product.objects.all().update(
        is_sellable=False,
        is_purchasable=False,
        is_producible=False
    )


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0028_register_has_modifiers_state'),
    ]

    operations = [
        # Add the role fields
        migrations.AddField(
            model_name='product',
            name='is_sellable',
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text="Whether this product appears in menu/POS and can be sold to customers. COGS list shows only sellable products.",
            ),
        ),
        migrations.AddField(
            model_name='product',
            name='is_purchasable',
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text="Whether this product can be received from suppliers (ingredients, beverages, supplies). Used for purchasing/receiving workflows.",
            ),
        ),
        migrations.AddField(
            model_name='product',
            name='is_producible',
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text="Whether this product can have a recipe and be produced in-house (prep items like dough, sauces). Enables sub-recipe costing.",
            ),
        ),

        # Add composite indexes for role-based queries
        migrations.AddIndex(
            model_name='product',
            index=models.Index(
                fields=['tenant', 'is_sellable'],
                name='product_sellable_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='product',
            index=models.Index(
                fields=['tenant', 'is_purchasable'],
                name='product_purchasable_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='product',
            index=models.Index(
                fields=['tenant', 'is_producible'],
                name='product_producible_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='product',
            index=models.Index(
                fields=['tenant', 'is_active', 'is_purchasable', 'is_producible'],
                name='product_ingredient_idx',
            ),
        ),

        # Run data migration to set initial values
        migrations.RunPython(set_initial_role_flags, reverse_role_flags),
    ]
