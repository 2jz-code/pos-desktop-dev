# Generated by Django 4.2.13 on 2025-07-10 22:50

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0004_add_is_pos_staff'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='legacy_id',
            field=models.IntegerField(blank=True, db_index=True, help_text='The user ID from the old system.', null=True, unique=True),
        ),
    ]
