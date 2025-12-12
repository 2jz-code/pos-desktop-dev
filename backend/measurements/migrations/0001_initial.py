"""
Initial migration for measurements app.

Creates the Unit model with global (non-tenant-scoped) units.
"""
from django.db import migrations, models


def seed_default_units(apps, schema_editor):
    """
    Seed the default units that are shared across all tenants.
    """
    Unit = apps.get_model('measurements', 'Unit')

    default_units = [
        # Weight units
        {"code": "g", "name": "gram", "category": "weight"},
        {"code": "kg", "name": "kilogram", "category": "weight"},
        {"code": "oz", "name": "ounce", "category": "weight"},
        {"code": "lb", "name": "pound", "category": "weight"},

        # Volume units
        {"code": "ml", "name": "milliliter", "category": "volume"},
        {"code": "l", "name": "liter", "category": "volume"},
        {"code": "fl_oz", "name": "fluid ounce", "category": "volume"},
        {"code": "cup", "name": "cup", "category": "volume"},
        {"code": "gal", "name": "gallon", "category": "volume"},

        # Count units
        {"code": "each", "name": "each", "category": "count"},
        {"code": "piece", "name": "piece", "category": "count"},
        {"code": "slice", "name": "slice", "category": "count"},
        {"code": "case", "name": "case", "category": "count"},
        {"code": "dozen", "name": "dozen", "category": "count"},
    ]

    for unit_data in default_units:
        Unit.objects.get_or_create(
            code=unit_data["code"],
            defaults={
                "name": unit_data["name"],
                "category": unit_data["category"],
            }
        )

    print(f"Seeded {len(default_units)} default units")


def reverse_seed(apps, schema_editor):
    """
    Reverse migration - remove seeded units.
    Note: This will fail if units are referenced by other models.
    """
    Unit = apps.get_model('measurements', 'Unit')
    Unit.objects.all().delete()


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='Unit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(
                    help_text='Short code for the unit (e.g., g, kg, oz)',
                    max_length=20,
                    unique=True,
                )),
                ('name', models.CharField(
                    help_text='Full name of the unit (e.g., gram, kilogram, ounce)',
                    max_length=50,
                )),
                ('category', models.CharField(
                    choices=[
                        ('weight', 'Weight'),
                        ('volume', 'Volume'),
                        ('count', 'Count'),
                    ],
                    help_text='Category of the unit',
                    max_length=20,
                )),
            ],
            options={
                'verbose_name': 'Unit',
                'verbose_name_plural': 'Units',
                'ordering': ['category', 'code'],
            },
        ),
        migrations.AddIndex(
            model_name='unit',
            index=models.Index(fields=['code'], name='measurement_code_idx'),
        ),
        migrations.AddIndex(
            model_name='unit',
            index=models.Index(fields=['category'], name='measurement_category_idx'),
        ),
        # Seed default units
        migrations.RunPython(seed_default_units, reverse_seed),
    ]
