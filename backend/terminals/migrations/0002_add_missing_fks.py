# Manual migration to add missing FK columns

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('terminals', '0001_move_terminalregistration_to_terminals'),
        ('tenant', '0003_fix_remaining_null_tenants'),
        ('settings', '0018_move_terminalregistration_to_terminals'),
    ]

    operations = [
        # Add tenant_id and store_location_id columns
        migrations.RunSQL(
            sql="""
                ALTER TABLE settings_terminalregistration
                ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT '0d5fa613-22ee-46e6-abce-c607bf43c400',
                ADD COLUMN IF NOT EXISTS store_location_id bigint NULL;
            """,
            reverse_sql="""
                ALTER TABLE settings_terminalregistration
                DROP COLUMN IF EXISTS tenant_id,
                DROP COLUMN IF EXISTS store_location_id;
            """,
        ),
        # Add foreign key constraints
        migrations.RunSQL(
            sql="""
                ALTER TABLE settings_terminalregistration
                ADD CONSTRAINT settings_terminalregistration_tenant_fk
                FOREIGN KEY (tenant_id) REFERENCES tenants(id)
                ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
                
                ALTER TABLE settings_terminalregistration
                ADD CONSTRAINT settings_terminalregistration_store_location_fk
                FOREIGN KEY (store_location_id) REFERENCES settings_storelocation(id)
                ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
            """,
            reverse_sql="""
                ALTER TABLE settings_terminalregistration
                DROP CONSTRAINT IF EXISTS settings_terminalregistration_tenant_fk;
                
                ALTER TABLE settings_terminalregistration
                DROP CONSTRAINT IF EXISTS settings_terminalregistration_store_location_fk;
            """,
        ),
        # Add index for tenant lookups
        migrations.RunSQL(
            sql="""
                CREATE INDEX IF NOT EXISTS settings_te_tenant__5f4f80_idx 
                ON settings_terminalregistration (tenant_id, store_location_id);
            """,
            reverse_sql="""
                DROP INDEX IF EXISTS settings_te_tenant__5f4f80_idx;
            """,
        ),
    ]
