# Generated by Django 4.2.13 on 2025-07-29 17:54

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0013_orderitemmodifier'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='orderitem',
            options={'ordering': ['variation_group', 'item_sequence'], 'verbose_name': 'Order Item', 'verbose_name_plural': 'Order Items'},
        ),
        migrations.AddField(
            model_name='orderitem',
            name='item_sequence',
            field=models.PositiveIntegerField(default=1, help_text='Sequential number for items of the same product (#1, #2, #3, etc.)'),
        ),
        migrations.AddField(
            model_name='orderitem',
            name='kitchen_notes',
            field=models.TextField(blank=True, help_text='Special preparation instructions for kitchen staff'),
        ),
        migrations.AddField(
            model_name='orderitem',
            name='variation_group',
            field=models.CharField(blank=True, help_text="Groups related items together (e.g., 'hummus', 'burger')", max_length=100),
        ),
    ]
