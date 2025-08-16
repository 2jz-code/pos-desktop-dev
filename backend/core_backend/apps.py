from django.apps import AppConfig
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


class CoreBackendConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core_backend"

    def ready(self):
        """
        Initialize core backend services when Django starts up.
        This includes cache warming for production deployments.
        """
        # Import signals to ensure they are registered
        try:
            import core_backend.signals  # noqa
        except ImportError:
            pass  # Signals module doesn't exist yet, that's okay
        
        # Perform startup cache warming in production environments
        self._startup_cache_warming()

    def _startup_cache_warming(self):
        """
        Warm critical caches during application startup.
        Only runs in production or when explicitly enabled.
        """
        # Check if cache warming is enabled for startup
        cache_warming_enabled = getattr(settings, 'CACHE_WARMING_ON_STARTUP', False)
        is_production = not getattr(settings, 'DEBUG', True)
        
        # Only warm caches if enabled or in production
        if not (cache_warming_enabled or is_production):
            logger.debug("Cache warming on startup disabled (DEBUG=True and CACHE_WARMING_ON_STARTUP=False)")
            return
        
        # Use background task to avoid blocking startup
        try:
            from django.core.management import call_command
            from threading import Thread
            import time
            
            def warm_caches_background():
                """Background cache warming to not block startup"""
                try:
                    # Wait a moment for Django to fully initialize
                    time.sleep(2)
                    
                    logger.info("🔥 Starting background cache warming on startup...")
                    
                    # Use the existing cache warming utilities
                    from core_backend.infrastructure.cache_utils import warm_critical_caches
                    warmed_caches = warm_critical_caches()
                    
                    if warmed_caches:
                        logger.info(f"✅ Startup cache warming completed: {', '.join(warmed_caches)}")
                    else:
                        logger.warning("⚠️ No caches were warmed during startup")
                        
                except Exception as e:
                    logger.error(f"❌ Startup cache warming failed: {e}")
            
            # Start background warming thread
            warming_thread = Thread(target=warm_caches_background, daemon=True)
            warming_thread.start()
            
            logger.info("🚀 Background cache warming initiated on startup")
            
        except Exception as e:
            logger.error(f"Failed to initiate startup cache warming: {e}")