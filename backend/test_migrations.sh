#!/bin/bash
# Test migration rollback and re-application

set -e  # Exit on any error

echo "🧪 Testing Tenant Migration Path"
echo "================================"
echo ""

# Step 1: Backup current database
echo "📦 Step 1: Creating database backup..."
docker exec pos_db pg_dump -U test_ajeen_user test_ajeen_db > backup_before_rollback_$(date +%Y%m%d_%H%M%S).sql
echo "✓ Backup created"
echo ""

# Step 2: Show current migration state
echo "📋 Step 2: Current migration state..."
docker exec pos_backend python manage.py showmigrations tenant users products discounts orders payments inventory reports settings
echo ""

# Step 3: Rollback tenant-related migrations
echo "⏪ Step 3: Rolling back to before tenant implementation..."
echo "   Rolling back users to 0013..."
docker exec pos_backend python manage.py migrate users 0013

echo "   Rolling back products to 0024..."
docker exec pos_backend python manage.py migrate products 0024

echo "   Rolling back discounts to 0005..."
docker exec pos_backend python manage.py migrate discounts 0005

echo "   Rolling back orders to 0023..."
docker exec pos_backend python manage.py migrate orders 0023

echo "   Rolling back payments to 0014..."
docker exec pos_backend python manage.py migrate payments 0014

echo "   Rolling back inventory to 0011..."
docker exec pos_backend python manage.py migrate inventory 0011

echo "   Rolling back reports to 0004..."
docker exec pos_backend python manage.py migrate reports 0004

echo "   Rolling back settings to 0016..."
docker exec pos_backend python manage.py migrate settings 0016

echo "   Rolling back tenant to zero (removing all tenant migrations)..."
docker exec pos_backend python manage.py migrate tenant zero

echo "✓ Rollback complete"
echo ""

# Step 4: Check for orphaned tenant_id columns
echo "🔍 Step 4: Checking database state..."
docker exec pos_db psql -U test_ajeen_user test_ajeen_db -c "\d users_user" | grep tenant || echo "✓ tenant_id column removed from users_user"
echo ""

# Step 5: Re-apply migrations
echo "⏩ Step 5: Re-applying migrations (FULL TEST)..."
docker exec pos_backend python manage.py migrate
echo "✓ Migrations applied"
echo ""

# Step 6: Verify tenant assignments
echo "✅ Step 6: Verifying all data has tenant assignments..."
docker exec pos_backend python manage.py check_tenant_assignments
echo ""

echo "================================"
echo "🎉 Migration test complete!"
echo ""
echo "If you see '✅ All XXXX records have tenant assigned!' above,"
echo "then the migrations work correctly end-to-end."
echo ""
echo "To restore backup if something went wrong:"
echo "  docker-compose exec -T pos_db psql -U pos_user pos_db < backup_before_rollback_TIMESTAMP.sql"
