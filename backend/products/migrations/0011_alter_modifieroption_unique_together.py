# Generated by Django 4.2.13 on 2025-07-26 16:22

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0010_modifieroption_modifierset_productmodifierset_and_more'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='modifieroption',
            unique_together={('modifier_set', 'name')},
        ),
    ]
