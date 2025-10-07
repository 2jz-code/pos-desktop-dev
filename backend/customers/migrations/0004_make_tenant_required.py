# Generated manually - Step 3 of 3 for tenant FK addition
# Makes tenant FK required after data has been backfilled

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("tenant", "0005_assign_customers_to_default_tenant"),  # Wait for data migration
        ("customers", "0003_add_tenant_nullable"),
    ]

    operations = [
        # Make tenant FK non-nullable on Customer
        migrations.AlterField(
            model_name="customer",
            name="tenant",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="customers",
                to="tenant.tenant",
                help_text="The tenant this customer belongs to",
            ),
        ),

        # Make tenant FK non-nullable on CustomerAddress
        migrations.AlterField(
            model_name="customeraddress",
            name="tenant",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="customer_addresses",
                to="tenant.tenant",
                help_text="The tenant this address belongs to (inherited from customer)",
            ),
        ),

        # Make tenant FK non-nullable on CustomerPasswordResetToken
        migrations.AlterField(
            model_name="customerpasswordresettoken",
            name="tenant",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="customer_password_reset_tokens",
                to="tenant.tenant",
                help_text="The tenant this token belongs to (inherited from customer)",
            ),
        ),

        # Make tenant FK non-nullable on CustomerEmailVerificationToken
        migrations.AlterField(
            model_name="customeremailverificationtoken",
            name="tenant",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="customer_email_verification_tokens",
                to="tenant.tenant",
                help_text="The tenant this token belongs to (inherited from customer)",
            ),
        ),

        # Add tenant-scoped unique constraint on Customer email
        migrations.AddConstraint(
            model_name="customer",
            constraint=models.UniqueConstraint(
                fields=["tenant", "email"],
                name="unique_customer_email_per_tenant",
            ),
        ),

        # Add tenant-scoped indexes on Customer
        migrations.AddIndex(
            model_name="customer",
            index=models.Index(fields=["tenant", "email"], name="customers_cu_tenant_email_idx"),
        ),
        migrations.AddIndex(
            model_name="customer",
            index=models.Index(fields=["tenant", "is_active"], name="customers_cu_tenant_active_idx"),
        ),
        migrations.AddIndex(
            model_name="customer",
            index=models.Index(fields=["tenant", "phone_number"], name="customers_cu_tenant_phone_idx"),
        ),
        migrations.AddIndex(
            model_name="customer",
            index=models.Index(fields=["tenant", "date_joined"], name="customers_cu_tenant_joined_idx"),
        ),

        # Add tenant-scoped constraints on CustomerAddress
        migrations.AddConstraint(
            model_name="customeraddress",
            constraint=models.UniqueConstraint(
                fields=["tenant", "customer", "address_type", "is_default"],
                name="unique_customer_address_default_per_tenant",
            ),
        ),

        # Add tenant-scoped indexes on CustomerAddress
        migrations.AddIndex(
            model_name="customeraddress",
            index=models.Index(fields=["tenant", "customer"], name="customers_ca_tenant_cust_idx"),
        ),
        migrations.AddIndex(
            model_name="customeraddress",
            index=models.Index(fields=["tenant", "is_default"], name="customers_ca_tenant_default_idx"),
        ),

        # Add tenant-scoped constraints on CustomerPasswordResetToken
        migrations.AddConstraint(
            model_name="customerpasswordresettoken",
            constraint=models.UniqueConstraint(
                fields=["tenant", "token"],
                name="unique_password_reset_token_per_tenant",
            ),
        ),

        # Add tenant-scoped indexes on CustomerPasswordResetToken
        migrations.AddIndex(
            model_name="customerpasswordresettoken",
            index=models.Index(fields=["tenant", "token"], name="customers_pr_tenant_token_idx"),
        ),
        migrations.AddIndex(
            model_name="customerpasswordresettoken",
            index=models.Index(fields=["tenant", "customer"], name="customers_pr_tenant_cust_idx"),
        ),
        migrations.AddIndex(
            model_name="customerpasswordresettoken",
            index=models.Index(fields=["tenant", "expires_at"], name="customers_pr_tenant_expires_idx"),
        ),

        # Add tenant-scoped constraints on CustomerEmailVerificationToken
        migrations.AddConstraint(
            model_name="customeremailverificationtoken",
            constraint=models.UniqueConstraint(
                fields=["tenant", "token"],
                name="unique_email_verification_token_per_tenant",
            ),
        ),

        # Add tenant-scoped indexes on CustomerEmailVerificationToken
        migrations.AddIndex(
            model_name="customeremailverificationtoken",
            index=models.Index(fields=["tenant", "token"], name="customers_ev_tenant_token_idx"),
        ),
        migrations.AddIndex(
            model_name="customeremailverificationtoken",
            index=models.Index(fields=["tenant", "customer"], name="customers_ev_tenant_cust_idx"),
        ),
        migrations.AddIndex(
            model_name="customeremailverificationtoken",
            index=models.Index(fields=["tenant", "expires_at"], name="customers_ev_tenant_expires_idx"),
        ),
    ]
