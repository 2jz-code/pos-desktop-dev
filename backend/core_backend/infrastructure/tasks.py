from celery import shared_task
from django.core.cache import caches
import logging

logger = logging.getLogger(__name__)

@shared_task
def warm_critical_caches():
    """Celery task for automated comprehensive cache warming for all tenants"""
    try:
        logger.info("🔥 Starting automated cache warming for all tenants...")

        # Run all specialized warming tasks
        results = {}

        # Warm product caches
        try:
            result = warm_product_caches()
            results['products'] = result
        except Exception as e:
            logger.error(f"Product cache warming failed: {e}")
            results['products'] = {'status': 'failed', 'error': str(e)}

        # Warm settings caches
        try:
            result = warm_settings_caches()
            results['settings'] = result
        except Exception as e:
            logger.error(f"Settings cache warming failed: {e}")
            results['settings'] = {'status': 'failed', 'error': str(e)}

        # Warm report caches
        try:
            result = warm_report_caches()
            results['reports'] = result
        except Exception as e:
            logger.error(f"Report cache warming failed: {e}")
            results['reports'] = {'status': 'failed', 'error': str(e)}

        # Warm inventory caches
        try:
            result = warm_inventory_caches()
            results['inventory'] = result
        except Exception as e:
            logger.error(f"Inventory cache warming failed: {e}")
            results['inventory'] = {'status': 'failed', 'error': str(e)}

        # Calculate totals
        total_warmed = sum(r.get('total_warmed', 0) for r in results.values())
        total_tenants = max((r.get('tenants_processed', 0) for r in results.values()), default=0)
        failed_count = sum(1 for r in results.values() if r.get('status') == 'failed')

        logger.info(f"✅ Automated cache warming completed: {total_warmed} caches across {total_tenants} tenants")

        return {
            'status': 'completed' if failed_count == 0 else 'partial',
            'total_warmed': total_warmed,
            'tenants_processed': total_tenants,
            'failed_count': failed_count,
            'results': results
        }

    except Exception as e:
        logger.error(f"❌ Automated cache warming task failed: {e}")
        return {
            'status': 'failed',
            'error': str(e)
        }

@shared_task
def cache_health_check():
    """Perform comprehensive cache health check"""
    from .cache import CacheMonitor
    
    try:
        health_results = CacheMonitor.health_check()
        stats = CacheMonitor.get_all_cache_stats()
        
        unhealthy_caches = [
            name for name, result in health_results.items() 
            if result.get('status') != 'healthy'
        ]
        
        if unhealthy_caches:
            logger.warning(f"Unhealthy caches detected: {unhealthy_caches}")
        else:
            logger.info("All caches are healthy")
        
        return {
            'status': 'completed',
            'health_results': health_results,
            'stats': stats,
            'unhealthy_count': len(unhealthy_caches)
        }
    except Exception as e:
        logger.error(f"Cache health check failed: {e}")
        return {
            'status': 'failed',
            'error': str(e)
        }

@shared_task
def clear_expired_cache_locks():
    """Clear expired distributed locks"""
    from .cache import AdvancedCacheManager
    
    try:
        cache = AdvancedCacheManager.get_cache('default')
        if not cache:
            return {'status': 'failed', 'error': 'Cache not available'}
        
        # Clear lock pattern
        if hasattr(cache, 'delete_pattern'):
            deleted_count = cache.delete_pattern('*lock:*')
            logger.info(f"Cleared {deleted_count} expired cache locks")
            return {
                'status': 'completed',
                'cleared_locks': deleted_count
            }
        else:
            return {
                'status': 'skipped',
                'reason': 'Pattern deletion not supported'
            }
    except Exception as e:
        logger.error(f"Failed to clear expired cache locks: {e}")
        return {
            'status': 'failed',
            'error': str(e)
        }

@shared_task
def invalidate_cache_pattern(pattern, cache_name='default'):
    """Task to invalidate cache patterns"""
    from .cache_utils import invalidate_cache_pattern as invalidate_pattern_util
    
    try:
        result = invalidate_pattern_util(pattern, cache_name)
        
        if result:
            logger.info(f"Successfully invalidated cache pattern '{pattern}' in {cache_name}")
            return {
                'status': 'completed',
                'pattern': pattern,
                'cache_name': cache_name
            }
        else:
            logger.warning(f"Failed to invalidate cache pattern '{pattern}' in {cache_name}")
            return {
                'status': 'failed',
                'pattern': pattern,
                'cache_name': cache_name,
                'error': 'Invalidation failed'
            }
    except Exception as e:
        logger.error(f"Cache invalidation task failed: {e}")
        return {
            'status': 'failed',
            'error': str(e)
        }

# ============================================================================
# SPECIALIZED CACHE WARMING TASKS
# ============================================================================

@shared_task
def warm_product_caches():
    """Warm product-specific caches for all active tenants"""
    try:
        logger.info("🛍️ Warming product caches for all tenants...")

        from products.services import ProductService
        from tenant.models import Tenant
        from tenant.managers import set_current_tenant

        total_warmed = 0
        tenants_processed = 0
        tenant_results = {}

        # Process each tenant separately
        for tenant in Tenant.objects.filter(is_active=True):
            try:
                # Set tenant context for this iteration
                set_current_tenant(tenant)

                warmed_caches = []

                # Warm category tree
                try:
                    ProductService.get_cached_category_tree()
                    warmed_caches.append("category_tree")
                except Exception as e:
                    logger.warning(f"Tenant {tenant.slug}: Failed to warm category tree cache: {e}")

                # Warm active products list
                try:
                    ProductService.get_cached_active_products_list()
                    warmed_caches.append("active_products")
                except Exception as e:
                    logger.warning(f"Tenant {tenant.slug}: Failed to warm active products cache: {e}")

                # Warm product types
                try:
                    ProductService.get_cached_product_types()
                    warmed_caches.append("product_types")
                except Exception as e:
                    logger.warning(f"Tenant {tenant.slug}: Failed to warm product types cache: {e}")

                # Warm taxes
                try:
                    ProductService.get_cached_taxes()
                    warmed_caches.append("taxes")
                except Exception as e:
                    logger.warning(f"Tenant {tenant.slug}: Failed to warm taxes cache: {e}")

                # Warm modifier sets
                try:
                    ProductService.get_cached_modifier_sets()
                    warmed_caches.append("modifier_sets")
                except Exception as e:
                    logger.warning(f"Tenant {tenant.slug}: Failed to warm modifier sets cache: {e}")

                total_warmed += len(warmed_caches)
                tenants_processed += 1
                tenant_results[tenant.slug] = {
                    'warmed_caches': warmed_caches,
                    'count': len(warmed_caches)
                }

                logger.info(f"Tenant {tenant.slug}: Warmed {len(warmed_caches)} product caches")

            except Exception as tenant_exc:
                logger.error(f"Tenant {tenant.slug}: Product cache warming failed: {tenant_exc}")
                tenant_results[tenant.slug] = {
                    'error': str(tenant_exc),
                    'count': 0
                }
            finally:
                # Clear tenant context after each tenant
                set_current_tenant(None)

        logger.info(f"✅ Product cache warming completed: {total_warmed} caches across {tenants_processed} tenants")
        return {
            'status': 'completed',
            'total_warmed': total_warmed,
            'tenants_processed': tenants_processed,
            'tenant_results': tenant_results
        }

    except Exception as e:
        logger.error(f"❌ Product cache warming failed: {e}")
        return {
            'status': 'failed',
            'error': str(e)
        }

@shared_task
def warm_settings_caches():
    """Warm settings-specific caches for all active tenants"""
    try:
        logger.info("⚙️ Warming settings caches for all tenants...")

        from settings.config import app_settings
        from tenant.models import Tenant
        from tenant.managers import set_current_tenant

        total_warmed = 0
        tenants_processed = 0
        tenant_results = {}

        # Process each tenant separately
        for tenant in Tenant.objects.filter(is_active=True):
            try:
                # Set tenant context for this iteration
                set_current_tenant(tenant)

                warmed_count = 0
                if app_settings.warm_settings_cache():
                    warmed_count = 1

                total_warmed += warmed_count
                tenants_processed += 1
                tenant_results[tenant.slug] = {
                    'warmed_count': warmed_count
                }

                logger.info(f"Tenant {tenant.slug}: Warmed {warmed_count} settings caches")

            except Exception as tenant_exc:
                logger.error(f"Tenant {tenant.slug}: Settings cache warming failed: {tenant_exc}")
                tenant_results[tenant.slug] = {
                    'error': str(tenant_exc),
                    'warmed_count': 0
                }
            finally:
                # Clear tenant context after each tenant
                set_current_tenant(None)

        logger.info(f"✅ Settings cache warming completed: {total_warmed} caches across {tenants_processed} tenants")
        return {
            'status': 'completed',
            'total_warmed': total_warmed,
            'tenants_processed': tenants_processed,
            'tenant_results': tenant_results
        }

    except Exception as e:
        logger.error(f"❌ Settings cache warming failed: {e}")
        return {
            'status': 'failed',
            'error': str(e)
        }

@shared_task
def warm_report_caches():
    """Warm report-specific caches for all active tenants"""
    try:
        logger.info("📊 Warming report caches for all tenants...")

        from reports.services_new.metrics_service import BusinessMetricsService
        from tenant.models import Tenant
        from tenant.managers import set_current_tenant

        total_warmed = 0
        tenants_processed = 0
        tenant_results = {}

        # Process each tenant separately
        for tenant in Tenant.objects.filter(is_active=True):
            try:
                # Set tenant context for this iteration
                set_current_tenant(tenant)

                warmed_caches = []

                # Warm business KPIs
                try:
                    BusinessMetricsService.get_cached_business_kpis()
                    warmed_caches.append("business_kpis")
                except Exception as e:
                    logger.warning(f"Tenant {tenant.slug}: Failed to warm business KPIs cache: {e}")

                total_warmed += len(warmed_caches)
                tenants_processed += 1
                tenant_results[tenant.slug] = {
                    'warmed_caches': warmed_caches,
                    'count': len(warmed_caches)
                }

                logger.info(f"Tenant {tenant.slug}: Warmed {len(warmed_caches)} report caches")

            except Exception as tenant_exc:
                logger.error(f"Tenant {tenant.slug}: Report cache warming failed: {tenant_exc}")
                tenant_results[tenant.slug] = {
                    'error': str(tenant_exc),
                    'count': 0
                }
            finally:
                # Clear tenant context after each tenant
                set_current_tenant(None)

        logger.info(f"✅ Report cache warming completed: {total_warmed} caches across {tenants_processed} tenants")
        return {
            'status': 'completed',
            'total_warmed': total_warmed,
            'tenants_processed': tenants_processed,
            'tenant_results': tenant_results
        }

    except Exception as e:
        logger.error(f"❌ Report cache warming failed: {e}")
        return {
            'status': 'failed',
            'error': str(e)
        }

@shared_task
def warm_inventory_caches():
    """Warm inventory-specific caches for all active tenants"""
    try:
        logger.info("📦 Warming inventory caches for all tenants...")

        from tenant.models import Tenant
        from tenant.managers import set_current_tenant

        total_warmed = 0
        tenants_processed = 0
        tenant_results = {}

        # Process each tenant separately
        for tenant in Tenant.objects.filter(is_active=True):
            try:
                # Set tenant context for this iteration
                set_current_tenant(tenant)

                warmed_caches = []

                # Pre-load locations which are frequently accessed
                try:
                    from inventory.models import Location
                    list(Location.objects.all())
                    warmed_caches.append("locations")
                except Exception as e:
                    logger.warning(f"Tenant {tenant.slug}: Failed to warm locations cache: {e}")

                # Warm inventory service caches (Phase 2 complete - caches re-enabled)
                try:
                    from inventory.services import InventoryService
                    from settings.config import app_settings

                    # Get default location for this tenant
                    default_location = app_settings.get_default_location()

                    # Warm stock levels for default location
                    InventoryService.get_stock_levels_by_location(default_location.id)
                    warmed_caches.append("stock_levels")
                except Exception as e:
                    logger.warning(f"Tenant {tenant.slug}: Failed to warm stock levels cache: {e}")

                # Warm recipe ingredients map
                try:
                    from inventory.services import InventoryService
                    InventoryService.get_recipe_ingredients_map()
                    warmed_caches.append("recipe_ingredients")
                except Exception as e:
                    logger.warning(f"Tenant {tenant.slug}: Failed to warm recipe ingredients cache: {e}")

                # Warm inventory availability status
                try:
                    from inventory.services import InventoryService
                    InventoryService.get_inventory_availability_status()
                    warmed_caches.append("inventory_availability")
                except Exception as e:
                    logger.warning(f"Tenant {tenant.slug}: Failed to warm inventory availability cache: {e}")

                total_warmed += len(warmed_caches)
                tenants_processed += 1
                tenant_results[tenant.slug] = {
                    'warmed_caches': warmed_caches,
                    'count': len(warmed_caches)
                }

                logger.info(f"Tenant {tenant.slug}: Warmed {len(warmed_caches)} inventory caches")

            except Exception as tenant_exc:
                logger.error(f"Tenant {tenant.slug}: Inventory cache warming failed: {tenant_exc}")
                tenant_results[tenant.slug] = {
                    'error': str(tenant_exc),
                    'count': 0
                }
            finally:
                # Clear tenant context after each tenant
                set_current_tenant(None)

        logger.info(f"✅ Inventory cache warming completed: {total_warmed} caches across {tenants_processed} tenants")
        return {
            'status': 'completed',
            'total_warmed': total_warmed,
            'tenants_processed': tenants_processed,
            'tenant_results': tenant_results
        }

    except Exception as e:
        logger.error(f"❌ Inventory cache warming failed: {e}")
        return {
            'status': 'failed',
            'error': str(e)
        }

# ============================================================================
# CACHE MAINTENANCE TASKS
# ============================================================================

@shared_task
def refresh_stale_caches():
    """Refresh caches that might be stale (tenant-aware)"""
    try:
        logger.debug("Refreshing potentially stale caches for all tenants...")

        from .cache_utils import get_cache_performance_stats

        # Get current cache stats
        stats = get_cache_performance_stats()

        # If hit rate is low, warm critical caches for all tenants
        hit_rate = stats.get('hit_rate') if stats else None
        if hit_rate is not None and hit_rate < 70:
            logger.info("Low cache hit rate detected: %.1f%% - refreshing caches for all tenants", hit_rate)

            # Call the tenant-aware critical cache warming task
            result = warm_critical_caches()

            if result.get('status') in ['completed', 'partial']:
                logger.info(
                    "Stale cache refresh completed: %d caches across %d tenants",
                    result.get('total_warmed', 0),
                    result.get('tenants_processed', 0)
                )

                return {
                    'status': 'completed',
                    'took_action': True,
                    'total_warmed': result.get('total_warmed', 0),
                    'tenants_processed': result.get('tenants_processed', 0),
                    'cache_stats': stats,
                }
            else:
                logger.warning("Stale cache refresh failed during warming")
                return {
                    'status': 'partial',
                    'took_action': True,
                    'error': result.get('error', 'Unknown error'),
                    'cache_stats': stats,
                }
        else:
            logger.debug(
                "Stale cache refresh completed with no changes (hit rate %.1f%%)",
                hit_rate if hit_rate is not None else 100.0,
            )

            return {
                'status': 'completed',
                'took_action': False,
                'cache_stats': stats,
            }

    except Exception as e:
        logger.error("Stale cache refresh failed: %s", e)
        return {
            'status': 'failed',
            'error': str(e)
        }

@shared_task
def backup_database():
    """Automated database backup task"""
    try:
        logger.info("💾 Starting automated database backup...")
        
        from django.core.management import call_command
        from io import StringIO
        from datetime import datetime, timezone
        
        # Capture command output
        stdout = StringIO()
        stderr = StringIO()
        
        # Run backup command
        call_command(
            'backup_database',
            verbosity=1,
            stdout=stdout,
            stderr=stderr
        )
        
        output = stdout.getvalue()
        error_output = stderr.getvalue()
        
        if error_output:
            logger.warning(f"Backup command warnings: {error_output}")
        
        logger.info("✅ Automated database backup completed successfully")
        return {
            'status': 'completed',
            'output': output,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'backup_type': 'postgresql_s3'
        }
        
    except Exception as e:
        logger.error(f"❌ Automated database backup failed: {e}")
        return {
            'status': 'failed',
            'error': str(e),
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
