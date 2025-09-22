from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0019_product_has_modifiers_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="producttype",
            name="inventory_behavior",
            field=models.CharField(
                choices=[
                    ("NONE", "No Tracking"),
                    ("QUANTITY", "Track Quantity"),
                    ("RECIPE", "Recipe Based"),
                ],
                default="QUANTITY",
                help_text="How inventory is tracked for this type.",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="producttype",
            name="stock_enforcement",
            field=models.CharField(
                choices=[
                    ("IGNORE", "Ignore (never block)"),
                    ("WARN", "Warn only"),
                    ("BLOCK", "Block when insufficient"),
                ],
                default="BLOCK",
                help_text="What to do when stock is insufficient.",
                max_length=8,
            ),
        ),
        migrations.AddField(
            model_name="producttype",
            name="allow_negative_stock",
            field=models.BooleanField(
                default=False,
                help_text="Allow sales below zero stock (never blocks).",
            ),
        ),
        migrations.AddField(
            model_name="producttype",
            name="low_stock_threshold",
            field=models.IntegerField(
                default=10, help_text="Warn when stock is at or below this level.",
            ),
        ),
        migrations.AddField(
            model_name="producttype",
            name="critical_stock_threshold",
            field=models.IntegerField(
                default=5,
                help_text="Critical warning when stock is at or below this level.",
            ),
        ),
        migrations.AddField(
            model_name="producttype",
            name="tax_inclusive",
            field=models.BooleanField(
                default=False,
                help_text="Prices shown/entered include tax by default.",
            ),
        ),
        migrations.AddField(
            model_name="producttype",
            name="pricing_method",
            field=models.CharField(
                choices=[("FIXED", "Fixed Price"), ("COST_PLUS", "Cost Plus Markup")],
                default="FIXED",
                help_text="How price should be calculated.",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="producttype",
            name="default_markup_percent",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="Default markup percent for COST_PLUS pricing.",
                max_digits=5,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="producttype",
            name="available_online",
            field=models.BooleanField(
                default=True, help_text="Available for online ordering.",
            ),
        ),
        migrations.AddField(
            model_name="producttype",
            name="available_pos",
            field=models.BooleanField(
                default=True, help_text="Available for POS ordering.",
            ),
        ),
        migrations.AddField(
            model_name="producttype",
            name="standard_prep_minutes",
            field=models.PositiveIntegerField(
                default=10, help_text="Typical preparation time in minutes.",
            ),
        ),
        migrations.AddField(
            model_name="producttype",
            name="default_taxes",
            field=models.ManyToManyField(
                blank=True,
                help_text="Default taxes applied when product has none.",
                related_name="default_for_product_types",
                to="products.tax",
            ),
        ),
    ]

