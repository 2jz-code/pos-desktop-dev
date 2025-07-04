# Generated by Django 4.2.13 on 2025-06-28 17:01

from django.db import migrations, models


def set_existing_staff_pos_flag(apps, schema_editor):
    """Set is_pos_staff=True for existing staff users (non-customers)"""
    User = apps.get_model("users", "User")

    # Update all users with staff roles to be POS staff
    staff_roles = ["OWNER", "ADMIN", "MANAGER", "CASHIER"]
    User.objects.filter(role__in=staff_roles).update(is_pos_staff=True)


def reverse_staff_pos_flag(apps, schema_editor):
    """Reverse operation - set all is_pos_staff to False"""
    User = apps.get_model("users", "User")
    User.objects.all().update(is_pos_staff=False)


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0003_user_phone_number"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="is_pos_staff",
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text="Designates whether this user appears in POS staff interface.",
                verbose_name="POS staff",
            ),
        ),
        migrations.RunPython(
            set_existing_staff_pos_flag,
            reverse_staff_pos_flag,
            elidable=True,
        ),
    ]
