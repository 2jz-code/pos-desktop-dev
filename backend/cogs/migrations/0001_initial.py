"""
Initial migration for COGS app.

Note: Unit model has been moved to measurements app.
This migration references measurements.Unit for all unit FKs.
"""
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('products', '0028_register_has_modifiers_state'),
        ('settings', '0032_globalsettings_created_at_globalsettings_updated_at_and_more'),
        ('measurements', '0001_initial'),  # Depend on measurements for Unit
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('tenant', '0006_tenant_internal_notes_tenant_ownership_type_and_more'),
    ]

    operations = [
        # IngredientConfig - COGS configuration for products used as ingredients
        migrations.CreateModel(
            name='IngredientConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('is_active', models.BooleanField(db_index=True, default=True, help_text='Designates whether this record is active. Inactive records are considered archived/soft-deleted.')),
                ('archived_at', models.DateTimeField(blank=True, help_text='Timestamp when this record was archived.', null=True)),
                ('archived_by', models.ForeignKey(blank=True, help_text='User who archived this record.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(app_label)s_%(class)s_archived', to=settings.AUTH_USER_MODEL)),
                ('base_unit', models.ForeignKey(help_text='The base unit for all COGS calculations for this ingredient', on_delete=django.db.models.deletion.PROTECT, related_name='ingredient_configs', to='measurements.unit')),
                ('product', models.OneToOneField(help_text='The product this configuration applies to', on_delete=django.db.models.deletion.CASCADE, related_name='cogs_config', to='products.product')),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cogs_ingredient_configs', to='tenant.tenant')),
            ],
            options={
                'verbose_name': 'Ingredient Configuration',
                'verbose_name_plural': 'Ingredient Configurations',
            },
        ),

        # ItemCostSource - Historical cost records for ingredients
        migrations.CreateModel(
            name='ItemCostSource',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('is_active', models.BooleanField(db_index=True, default=True, help_text='Designates whether this record is active. Inactive records are considered archived/soft-deleted.')),
                ('archived_at', models.DateTimeField(blank=True, help_text='Timestamp when this record was archived.', null=True)),
                ('unit_cost', models.DecimalField(decimal_places=4, help_text='Cost per unit (up to 4 decimal places for precision)', max_digits=10)),
                ('source_type', models.CharField(choices=[('manual', 'Manual Entry'), ('default', 'Default'), ('invoice', 'Invoice')], default='manual', help_text='How this cost was entered', max_length=20)),
                ('effective_at', models.DateTimeField(help_text='When this cost becomes effective (uses store timezone)')),
                ('notes', models.TextField(blank=True, help_text='Optional notes about this cost entry')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('archived_by', models.ForeignKey(blank=True, help_text='User who archived this record.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(app_label)s_%(class)s_archived', to=settings.AUTH_USER_MODEL)),
                ('created_by', models.ForeignKey(blank=True, help_text='User who created this cost entry', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='cogs_cost_entries_created', to=settings.AUTH_USER_MODEL)),
                ('product', models.ForeignKey(help_text='The product this cost applies to', on_delete=django.db.models.deletion.CASCADE, related_name='cogs_cost_sources', to='products.product')),
                ('store_location', models.ForeignKey(help_text='The store location this cost applies to', on_delete=django.db.models.deletion.CASCADE, related_name='cogs_item_cost_sources', to='settings.storelocation')),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cogs_item_cost_sources', to='tenant.tenant')),
                ('unit', models.ForeignKey(help_text='The unit the cost is expressed in (e.g., cost per kg)', on_delete=django.db.models.deletion.PROTECT, related_name='cost_sources', to='measurements.unit')),
            ],
            options={
                'verbose_name': 'Item Cost Source',
                'verbose_name_plural': 'Item Cost Sources',
                'ordering': ['-effective_at', '-created_at'],
            },
        ),

        # UnitConversion - Tenant-scoped unit conversions
        migrations.CreateModel(
            name='UnitConversion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('is_active', models.BooleanField(db_index=True, default=True, help_text='Designates whether this record is active. Inactive records are considered archived/soft-deleted.')),
                ('archived_at', models.DateTimeField(blank=True, help_text='Timestamp when this record was archived.', null=True)),
                ('multiplier', models.DecimalField(decimal_places=6, help_text='Multiply the from_unit quantity by this to get to_unit quantity', max_digits=15)),
                ('archived_by', models.ForeignKey(blank=True, help_text='User who archived this record.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(app_label)s_%(class)s_archived', to=settings.AUTH_USER_MODEL)),
                ('from_unit', models.ForeignKey(help_text='The source unit', on_delete=django.db.models.deletion.CASCADE, related_name='conversions_from', to='measurements.unit')),
                ('product', models.ForeignKey(blank=True, help_text="If set, this conversion is specific to this product. If null, it's a generic conversion.", null=True, on_delete=django.db.models.deletion.CASCADE, related_name='cogs_unit_conversions', to='products.product')),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cogs_unit_conversions', to='tenant.tenant')),
                ('to_unit', models.ForeignKey(help_text='The target unit', on_delete=django.db.models.deletion.CASCADE, related_name='conversions_to', to='measurements.unit')),
            ],
            options={
                'verbose_name': 'Unit Conversion',
                'verbose_name_plural': 'Unit Conversions',
            },
        ),

        # Indexes for IngredientConfig
        migrations.AddIndex(
            model_name='ingredientconfig',
            index=models.Index(fields=['tenant', 'product'], name='cogs_ingred_tenant__706b8c_idx'),
        ),

        # Indexes for ItemCostSource
        migrations.AddIndex(
            model_name='itemcostsource',
            index=models.Index(fields=['tenant', 'store_location', 'product', 'effective_at'], name='cogs_cost_lookup_idx'),
        ),
        migrations.AddIndex(
            model_name='itemcostsource',
            index=models.Index(fields=['tenant', 'product'], name='cogs_itemco_tenant__e824d0_idx'),
        ),
        migrations.AddIndex(
            model_name='itemcostsource',
            index=models.Index(fields=['tenant', 'store_location'], name='cogs_itemco_tenant__4895e3_idx'),
        ),
        migrations.AddIndex(
            model_name='itemcostsource',
            index=models.Index(fields=['effective_at'], name='cogs_itemco_effecti_879600_idx'),
        ),

        # Indexes for UnitConversion
        migrations.AddIndex(
            model_name='unitconversion',
            index=models.Index(fields=['tenant', 'product'], name='cogs_unitco_tenant__b09711_idx'),
        ),
        migrations.AddIndex(
            model_name='unitconversion',
            index=models.Index(fields=['tenant', 'from_unit', 'to_unit'], name='cogs_unitco_tenant__aee0d1_idx'),
        ),

        # Constraints
        migrations.AddConstraint(
            model_name='unitconversion',
            constraint=models.UniqueConstraint(fields=('tenant', 'product', 'from_unit', 'to_unit'), name='unique_conversion_per_tenant_product'),
        ),
    ]
