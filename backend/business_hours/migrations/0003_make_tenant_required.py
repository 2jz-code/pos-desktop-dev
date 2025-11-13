# Generated migration to make tenant_id NOT NULL
# This is run AFTER tenant/0004_assign_business_hours_to_default_tenant

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('tenant', '0004_assign_business_hours_to_default_tenant'),  # Wait for data migration
        ('business_hours', '0002_businesshoursprofile_tenant_holiday_tenant_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='businesshoursprofile',
            name='tenant',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='business_hours_profiles',
                to='tenant.tenant'
            ),
        ),
        migrations.AlterField(
            model_name='holiday',
            name='tenant',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='holidays',
                to='tenant.tenant'
            ),
        ),
        migrations.AlterField(
            model_name='regularhours',
            name='tenant',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='regular_hours',
                to='tenant.tenant'
            ),
        ),
        migrations.AlterField(
            model_name='specialhours',
            name='tenant',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='special_hours',
                to='tenant.tenant'
            ),
        ),
        migrations.AlterField(
            model_name='specialhourstimeslot',
            name='tenant',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='special_hours_time_slots',
                to='tenant.tenant'
            ),
        ),
        migrations.AlterField(
            model_name='timeslot',
            name='tenant',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='time_slots',
                to='tenant.tenant'
            ),
        ),
    ]
