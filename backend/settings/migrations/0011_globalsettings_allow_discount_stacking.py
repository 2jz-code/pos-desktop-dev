# Generated by Django 4.2.13 on 2025-07-09 07:13

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('settings', '0010_alter_webordersettings_options_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='globalsettings',
            name='allow_discount_stacking',
            field=models.BooleanField(default=False, help_text='If true, multiple discounts can be applied to a single order. If false, only one discount is allowed.'),
        ),
    ]
