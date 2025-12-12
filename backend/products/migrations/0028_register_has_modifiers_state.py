# Generated manually to fix migration state for has_modifiers field
# The field was added via RunPython in 0014, but Django's state doesn't know about it.
# This migration registers the field in Django's state without touching the database.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0027_category_updated_at_modifierset_updated_at_and_more"),
    ]

    operations = [
        # Use SeparateDatabaseAndState to tell Django the field exists
        # without trying to create it (since it already exists in the DB)
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name="product",
                    name="has_modifiers",
                    field=models.BooleanField(
                        default=False,
                        help_text="Whether this product has modifier sets configured.",
                    ),
                ),
            ],
            database_operations=[
                # No database operations - the column already exists
            ],
        ),
    ]
