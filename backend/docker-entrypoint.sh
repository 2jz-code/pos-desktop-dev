#!/bin/sh

# docker-entrypoint.sh

# Start Redis in background BEFORE anything else that might need it
echo "Starting Redis server..."
/usr/bin/redis-server /etc/redis/redis.conf --daemonize yes --supervised no --loglevel notice
sleep 2  # Give Redis a moment to start

# Verify Redis is running
if /usr/bin/redis-cli ping > /dev/null 2>&1; then
  echo "✓ Redis is running"
else
  echo "⚠ Warning: Redis failed to start, continuing anyway..."
fi

echo "Waiting for database..."
python ${APP_HOME}/wait_for_db.py
echo "Database is ready!"

# Create Nginx health check file
mkdir -p ${APP_HOME}/staticfiles/healthcheck
echo "Nginx_Static_OK" > ${APP_HOME}/staticfiles/healthcheck/nginx_health.txt
chmod -R 755 ${APP_HOME}/staticfiles/healthcheck

# Apply database migrations
if [ "$SKIP_MIGRATIONS" != "true" ]; then
  echo "Applying database migrations..."
  python manage.py migrate --noinput
else
  echo "SKIP_MIGRATIONS is set to true, skipping migrations."
fi

# Ensure system tenant exists (idempotent)
echo "Ensuring system tenant exists..."
python manage.py ensure_system_tenant

# Create initial superuser if credentials are provided and user doesn't exist
echo "Checking for initial superuser..."
python -c "
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core_backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from tenant.models import Tenant
User = get_user_model()

username = os.environ.get('DJANGO_SUPERUSER_USERNAME')
email = os.environ.get('DJANGO_SUPERUSER_EMAIL')
password = os.environ.get('DJANGO_SUPERUSER_PASSWORD')

if username and email and password:
    if not User.objects.filter(username=username).exists():
        # Get the system/default tenant
        try:
            tenant = Tenant.objects.filter(is_active=True).first()
            if not tenant:
                print('No active tenant found, cannot create superuser')
            else:
                User.objects.create_superuser(
                    username=username,
                    email=email,
                    password=password,
                    tenant=tenant
                )
                print(f'Superuser {username} created successfully for tenant {tenant.slug}')
        except Exception as e:
            print(f'Error creating superuser: {e}')
    else:
        print(f'Superuser {username} already exists')
else:
    print('Superuser environment variables not set, skipping creation')
"

# Execute the main command (CMD) passed to this entrypoint script
echo "Executing CMD: $@"
exec "$@"