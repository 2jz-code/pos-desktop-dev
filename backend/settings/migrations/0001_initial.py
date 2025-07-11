# Generated by Django 4.2.13 on 2025-06-17 17:03

from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='GlobalSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tax_rate', models.DecimalField(decimal_places=2, default=Decimal('0.08'), help_text='The default sales tax rate as a decimal (e.g., 0.08 for 8%).', max_digits=5)),
                ('surcharge_percentage', models.DecimalField(decimal_places=2, default=Decimal('0.00'), help_text='A percentage-based surcharge applied to the subtotal (e.g., 0.02 for 2%).', max_digits=5)),
                ('active_terminal_provider', models.CharField(choices=[('STRIPE_TERMINAL', 'Stripe Terminal'), ('CLOVER_TERMINAL', 'Clover Terminal')], default='STRIPE_TERMINAL', help_text='The currently active payment terminal provider.', max_length=50)),
            ],
            options={
                'verbose_name_plural': 'Global Settings',
            },
        ),
        migrations.CreateModel(
            name='POSDevice',
            fields=[
                ('device_id', models.CharField(help_text='Unique identifier for the POS device, generated by the client application.', max_length=255, primary_key=True, serialize=False, unique=True)),
                ('reader_id', models.CharField(help_text='The ID of the Stripe Terminal reader assigned to this device (e.g., tmr_...).', max_length=255)),
                ('nickname', models.CharField(blank=True, help_text="An optional friendly name for the POS station (e.g., 'Front Counter').", max_length=100)),
            ],
            options={
                'verbose_name': 'POS Device Pairing',
                'verbose_name_plural': 'POS Device Pairings',
            },
        ),
        migrations.CreateModel(
            name='TerminalLocation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(help_text='The user-friendly name of the location.', max_length=255)),
                ('stripe_id', models.CharField(help_text='The ID of the location from Stripe (e.g., tml_...).', max_length=255, unique=True)),
                ('is_default', models.BooleanField(default=False, help_text='Whether this is the default location for transactions.')),
            ],
            options={
                'verbose_name': 'Terminal Location',
                'verbose_name_plural': 'Terminal Locations',
                'ordering': ['name'],
            },
        ),
    ]
