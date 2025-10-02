#!/bin/sh

# docker-entrypoint.sh

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
User = get_user_model()

username = os.environ.get('DJANGO_SUPERUSER_USERNAME')
email = os.environ.get('DJANGO_SUPERUSER_EMAIL')
password = os.environ.get('DJANGO_SUPERUSER_PASSWORD')

if username and email and password:
    if not User.objects.filter(username=username).exists():
        User.objects.create_superuser(username=username, email=email, password=password)
        print(f'Superuser {username} created successfully')
    else:
        print(f'Superuser {username} already exists')
else:
    print('Superuser environment variables not set, skipping creation')
"

# Execute the main command (CMD) passed to this entrypoint script
echo "Executing CMD: $@"
exec "$@"