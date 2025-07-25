# Generated by Django 4.2.13 on 2025-07-10 22:50

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0009_alter_order_created_at_alter_order_updated_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='legacy_id',
            field=models.IntegerField(blank=True, db_index=True, help_text='The order ID from the old system.', null=True, unique=True),
        ),
        migrations.AddField(
            model_name='orderitem',
            name='legacy_id',
            field=models.IntegerField(blank=True, db_index=True, help_text='The order item ID from the old system.', null=True, unique=True),
        ),
    ]
