# Generated by Django 4.2.13 on 2025-06-24 19:31

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0002_paymenttransaction_card_brand_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='payment',
            name='guest_payment_intent_id',
            field=models.CharField(blank=True, help_text='Stripe Payment Intent ID for guest payments', max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='payment',
            name='guest_session_key',
            field=models.CharField(blank=True, db_index=True, help_text='Session key for guest payments', max_length=100, null=True),
        ),
    ]
