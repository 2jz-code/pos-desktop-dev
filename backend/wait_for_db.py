# /backend/wait_for_db.py
import os
import time
import sys

MAX_RETRIES = 30
RETRY_INTERVAL_SECONDS = 3


def check_db_connection_with_django_settings():
    """
    Uses Django's configured database connection to check readiness.
    This is generally preferred as it uses the exact same mechanism
    your application will use.
    """
    print("Attempting to connect to the database using Django settings...")
    try:
        # Ensure Django settings are configured
        # This line requires DJANGO_SETTINGS_MODULE to be set
        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core_backend.settings")
        import django

        django.setup()  # This loads settings and configures applications

        from django.db import connections
        from django.db.utils import OperationalError

        db_conn = connections["default"]
        db_conn.ensure_connection()  # Tries to connect if not already connected
        print("Database connection successful (via Django settings).")
        return True
    except OperationalError as e:
        print(f"Django DB connection failed: {e}")
        return False
    except ImportError as e:
        print(
            f"Failed to import Django or its components: {e}. Ensure DJANGO_SETTINGS_MODULE is set and project is in PYTHONPATH."
        )
        return False
    except Exception as e:
        print(
            f"An unexpected error occurred while trying to connect via Django settings: {e}"
        )
        return False


if __name__ == "__main__":
    retries = 0
    while retries < MAX_RETRIES:
        if check_db_connection_with_django_settings():
            sys.exit(0)  # Success
        retries += 1
        print(
            f"Database not ready yet (attempt {retries}/{MAX_RETRIES}). Waiting {RETRY_INTERVAL_SECONDS} seconds..."
        )
        time.sleep(RETRY_INTERVAL_SECONDS)

    print(f"Database was not ready after {MAX_RETRIES} attempts. Exiting.")
    sys.exit(1)  # Failure