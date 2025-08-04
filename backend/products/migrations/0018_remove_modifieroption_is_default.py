# Generated manually to remove unused is_default field
# Run this migration with: python manage.py migrate products

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0017_add_product_indexes_alter_producttype_archived_by'),
    ]

    operations = [
        migrations.RunSQL(
            "ALTER TABLE products_modifieroption DROP COLUMN IF EXISTS is_default;",
            reverse_sql="ALTER TABLE products_modifieroption ADD COLUMN is_default BOOLEAN DEFAULT FALSE;"
        ),
    ]