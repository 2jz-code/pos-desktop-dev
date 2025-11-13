# Generated migration for adding store_location to reports with auto-backfill

from django.db import migrations, models
import django.db.models.deletion


def backfill_store_location(apps, schema_editor):
    """Backfill store_location with the first location for each tenant"""
    ReportCache = apps.get_model('reports', 'ReportCache')
    SavedReport = apps.get_model('reports', 'SavedReport')
    ReportTemplate = apps.get_model('reports', 'ReportTemplate')
    ReportExecution = apps.get_model('reports', 'ReportExecution')
    StoreLocation = apps.get_model('settings', 'StoreLocation')
    Tenant = apps.get_model('tenant', 'Tenant')

    # Get all tenants
    for tenant in Tenant.objects.all():
        # Get first location for this tenant
        first_location = StoreLocation.objects.filter(tenant=tenant).first()

        if first_location:
            # Backfill ReportCache
            ReportCache.objects.filter(tenant=tenant, store_location__isnull=True).update(
                store_location=first_location
            )

            # Backfill SavedReport
            SavedReport.objects.filter(tenant=tenant, store_location__isnull=True).update(
                store_location=first_location
            )

            # Backfill ReportTemplate
            ReportTemplate.objects.filter(tenant=tenant, store_location__isnull=True).update(
                store_location=first_location
            )

            # Backfill ReportExecution
            ReportExecution.objects.filter(tenant=tenant, store_location__isnull=True).update(
                store_location=first_location
            )


class Migration(migrations.Migration):

    dependencies = [
        ('reports', '0006_reportexecution_parameters_and_more'),
        ('settings', '0028_add_web_order_defaults_to_global_settings'),  # Ensure StoreLocation exists
    ]

    operations = [
        # Add store_location field to ReportCache
        migrations.AddField(
            model_name='reportcache',
            name='store_location',
            field=models.ForeignKey(
                blank=True,
                help_text='Store location this cache entry is for (optional for multi-location filtering)',
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='report_caches',
                to='settings.storelocation'
            ),
        ),

        # Add store_location field to SavedReport
        migrations.AddField(
            model_name='savedreport',
            name='store_location',
            field=models.ForeignKey(
                blank=True,
                help_text='Default store location for this saved report',
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='saved_reports',
                to='settings.storelocation'
            ),
        ),

        # Add store_location field to ReportTemplate
        migrations.AddField(
            model_name='reporttemplate',
            name='store_location',
            field=models.ForeignKey(
                blank=True,
                help_text='Default store location for this report template',
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='report_templates',
                to='settings.storelocation'
            ),
        ),

        # Add store_location field to ReportExecution
        migrations.AddField(
            model_name='reportexecution',
            name='store_location',
            field=models.ForeignKey(
                blank=True,
                help_text='Store location this execution is for',
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='report_executions',
                to='settings.storelocation'
            ),
        ),

        # Run the backfill function
        migrations.RunPython(backfill_store_location, reverse_code=migrations.RunPython.noop),

        # Add indexes for better query performance
        migrations.AddIndex(
            model_name='reportcache',
            index=models.Index(fields=['tenant', 'store_location', 'report_type'], name='reports_cache_ten_loc_type_idx'),
        ),
        migrations.AddIndex(
            model_name='savedreport',
            index=models.Index(fields=['tenant', 'store_location', 'report_type'], name='reports_saved_ten_loc_type_idx'),
        ),
        migrations.AddIndex(
            model_name='reporttemplate',
            index=models.Index(fields=['tenant', 'store_location', 'report_type'], name='reports_tmpl_ten_loc_type_idx'),
        ),
        migrations.AddIndex(
            model_name='reportexecution',
            index=models.Index(fields=['tenant', 'store_location', 'status'], name='reports_exec_ten_loc_stat_idx'),
        ),
    ]
