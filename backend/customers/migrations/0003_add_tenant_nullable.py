# Generated manually - Step 1 of 3 for tenant FK addition

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("tenant", "0001_initial"),
        ("customers", "0002_customerpasswordresettoken_and_more"),
    ]

    operations = [
        # Remove old unique constraint on Customer (email only)
        migrations.AlterUniqueTogether(
            name="customer",
            unique_together=set(),
        ),
        # Remove old unique constraint on CustomerAddress
        migrations.AlterUniqueTogether(
            name="customeraddress",
            unique_together=set(),
        ),

        # Add nullable tenant FK to Customer
        migrations.AddField(
            model_name="customer",
            name="tenant",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="customers",
                to="tenant.tenant",
                help_text="The tenant this customer belongs to",
            ),
        ),

        # Add nullable tenant FK to CustomerAddress
        migrations.AddField(
            model_name="customeraddress",
            name="tenant",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="customer_addresses",
                to="tenant.tenant",
                help_text="The tenant this address belongs to (inherited from customer)",
            ),
        ),

        # Add nullable tenant FK to CustomerPasswordResetToken
        migrations.AddField(
            model_name="customerpasswordresettoken",
            name="tenant",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="customer_password_reset_tokens",
                to="tenant.tenant",
                help_text="The tenant this token belongs to (inherited from customer)",
            ),
        ),

        # Add nullable tenant FK to CustomerEmailVerificationToken
        migrations.AddField(
            model_name="customeremailverificationtoken",
            name="tenant",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="customer_email_verification_tokens",
                to="tenant.tenant",
                help_text="The tenant this token belongs to (inherited from customer)",
            ),
        ),

        # Update Customer email field help text
        migrations.AlterField(
            model_name="customer",
            name="email",
            field=models.EmailField(
                max_length=254,
                help_text="Customer's primary email address (unique per tenant)",
            ),
        ),

        # Remove old unique constraints on tokens (will be replaced with tenant-scoped ones later)
        migrations.AlterField(
            model_name="customerpasswordresettoken",
            name="token",
            field=models.CharField(max_length=40, db_index=True),
        ),
        migrations.AlterField(
            model_name="customeremailverificationtoken",
            name="token",
            field=models.CharField(max_length=40, db_index=True),
        ),
    ]
