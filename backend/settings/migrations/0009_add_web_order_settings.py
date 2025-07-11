# Generated by Django 4.2.13 on 2025-07-01 00:55

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('settings', '0008_globalsettings_web_order_auto_print_kitchen_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='WebOrderSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('web_receipt_terminals', models.ManyToManyField(blank=True, help_text='Terminals that should print customer receipts for web orders. POS orders always print on the terminal where the sale was made.', related_name='web_receipt_settings', to='settings.terminalregistration')),
            ],
            options={
                'verbose_name': 'Web Order Settings',
                'verbose_name_plural': 'Web Order Settings',
            },
        ),
    ]
