"""
Migration for converting RecipeItem.unit from CharField to ForeignKey(Unit).

This migration:
1. Adds the new unit FK field (nullable initially)
2. Renames the old unit CharField to unit_legacy
3. Migrates data from unit_legacy to unit FK
4. Makes unit FK required
"""
from django.db import migrations, models
import django.db.models.deletion


def migrate_unit_strings_to_fk(apps, schema_editor):
    """
    Migrate existing RecipeItem unit strings to FK references.

    Uses the UNIT_STRING_MAPPINGS to resolve strings to Unit codes,
    then looks up the corresponding Unit record.

    NOTE: apps.get_model() returns a historical model with a plain Manager,
    not the actual model's TenantSoftDeleteManager. However, to be absolutely
    safe, we use raw SQL to fetch all record IDs and then update them.
    """
    from django.db import connection

    Unit = apps.get_model('measurements', 'Unit')

    # Mapping of common unit string variations to canonical codes
    UNIT_STRING_MAPPINGS = {
        # Weight - grams
        "g": "g", "gram": "g", "grams": "g", "gr": "g",
        # Weight - kilograms
        "kg": "kg", "kilogram": "kg", "kilograms": "kg", "kilo": "kg", "kilos": "kg",
        # Weight - ounces
        "oz": "oz", "ounce": "oz", "ounces": "oz",
        # Weight - pounds
        "lb": "lb", "lbs": "lb", "pound": "lb", "pounds": "lb",
        # Volume - milliliters
        "ml": "ml", "milliliter": "ml", "milliliters": "ml",
        "millilitre": "ml", "millilitres": "ml",
        # Volume - liters
        "l": "l", "liter": "l", "liters": "l", "litre": "l", "litres": "l",
        # Volume - fluid ounces
        "fl_oz": "fl_oz", "fl oz": "fl_oz", "fluid ounce": "fl_oz",
        "fluid ounces": "fl_oz", "floz": "fl_oz",
        # Volume - cups
        "cup": "cup", "cups": "cup",
        # Volume - gallons
        "gal": "gal", "gallon": "gal", "gallons": "gal",
        # Count - each
        "each": "each", "ea": "each", "unit": "each", "units": "each",
        # Count - piece
        "piece": "piece", "pieces": "piece", "pc": "piece", "pcs": "piece",
        # Count - slice
        "slice": "slice", "slices": "slice",
        # Count - case
        "case": "case", "cases": "case",
        # Count - dozen
        "dozen": "dozen", "dz": "dozen",
    }

    # Build a cache of unit code -> Unit id
    unit_cache = {}
    for unit in Unit.objects.all():
        unit_cache[unit.code] = unit.id

    # Default fallback unit id
    default_unit_id = unit_cache.get('each')

    # Use raw SQL to get ALL recipe items regardless of any manager filtering
    with connection.cursor() as cursor:
        cursor.execute("SELECT id, unit_legacy FROM inventory_recipeitem WHERE unit_legacy IS NOT NULL AND unit_legacy != ''")
        rows = cursor.fetchall()

    total_count = len(rows)
    print(f"Found {total_count} RecipeItem records to migrate")

    # Migrate each RecipeItem using raw SQL updates for efficiency
    updated_count = 0
    warnings = []

    with connection.cursor() as cursor:
        for row in rows:
            recipe_item_id, unit_string = row

            if not unit_string:
                continue

            # Normalize and look up
            normalized = unit_string.strip().lower()
            canonical_code = UNIT_STRING_MAPPINGS.get(normalized)

            if canonical_code:
                unit_id = unit_cache.get(canonical_code)
            else:
                # Try direct lookup by code
                unit_id = unit_cache.get(normalized)

            if not unit_id:
                # Use default
                unit_id = default_unit_id
                warnings.append(f"Warning: Could not map unit '{unit_string}' for RecipeItem {recipe_item_id}, using 'each'")

            if unit_id:
                cursor.execute(
                    "UPDATE inventory_recipeitem SET unit_id = %s WHERE id = %s",
                    [unit_id, recipe_item_id]
                )
                updated_count += 1

    # Print warnings (limit to first 10 to avoid flooding)
    for warning in warnings[:10]:
        print(warning)
    if len(warnings) > 10:
        print(f"... and {len(warnings) - 10} more warnings")

    print(f"Migrated {updated_count} RecipeItem unit strings to FK references")


def reverse_migration(apps, schema_editor):
    """
    Reverse migration - unit_legacy already has the string data,
    nothing to do for the data itself.
    """
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0015_inventorystock_updated_at_location_updated_at_and_more'),
        ('measurements', '0001_initial'),  # Ensure measurements.Unit exists
    ]

    operations = [
        # Step 1: Rename old 'unit' CharField to 'unit_legacy'
        migrations.RenameField(
            model_name='recipeitem',
            old_name='unit',
            new_name='unit_legacy',
        ),

        # Step 2: Add new 'unit' FK field (nullable initially for migration)
        migrations.AddField(
            model_name='recipeitem',
            name='unit',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='recipe_items',
                to='measurements.unit',
                help_text='Unit of measure for the quantity.',
            ),
        ),

        # Step 3: Run data migration
        migrations.RunPython(migrate_unit_strings_to_fk, reverse_migration),

        # Step 4: Make unit FK required (remove null=True)
        migrations.AlterField(
            model_name='recipeitem',
            name='unit',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='recipe_items',
                to='measurements.unit',
                help_text='Unit of measure for the quantity.',
            ),
        ),

        # Step 5: Make unit_legacy optional (blank=True)
        migrations.AlterField(
            model_name='recipeitem',
            name='unit_legacy',
            field=models.CharField(
                blank=True,
                max_length=50,
                help_text='Legacy unit string (deprecated - use unit FK).',
            ),
        ),
    ]
