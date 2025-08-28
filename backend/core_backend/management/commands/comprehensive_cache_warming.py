"""
Comprehensive cache warming management command for production deployment.
This command provides advanced cache warming capabilities beyond the basic warm_cache command.
"""

from django.core.management.base import BaseCommand
from django.conf import settings
from core_backend.infrastructure.cache import (
    CacheWarmingManager,
    CacheMonitor
)
# Backward compatibility import
from core_backend.infrastructure.cache_utils import (
    warm_critical_caches,
    get_cache_performance_stats,
    clear_cache_performance_stats
)
from core_backend.signals import (
    trigger_comprehensive_cache_warming,
    schedule_cache_health_check
)
from celery import current_app
import logging
import time

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Comprehensive cache warming for production deployment with advanced options. Use --basic for simple warming (replaces warm_cache command).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--mode',
            choices=['sync', 'async', 'both'],
            default='sync',
            help='Cache warming mode: sync (immediate), async (background), or both',
        )
        parser.add_argument(
            '--areas',
            nargs='*',
            choices=['critical', 'products', 'settings', 'reports', 'inventory', 'all'],
            default=['all'],
            help='Specific cache areas to warm',
        )
        parser.add_argument(
            '--basic',
            action='store_true',
            help='Simple cache warming (equivalent to basic warm_cache command)',
        )
        parser.add_argument(
            '--clear-stats',
            action='store_true',
            help='Clear cache performance statistics before warming',
        )
        parser.add_argument(
            '--show-stats',
            action='store_true', 
            help='Show cache performance statistics after warming',
        )
        parser.add_argument(
            '--health-check',
            action='store_true',
            help='Perform cache health check after warming',
        )
        parser.add_argument(
            '--production-ready',
            action='store_true',
            help='Enable production-ready cache warming (all areas, async + sync)',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force cache warming even if disabled in settings',
        )
        parser.add_argument(
            '--timeout',
            type=int,
            default=300,
            help='Timeout for sync operations (seconds)',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('🔥 Starting comprehensive cache warming process...'))
        
        # Check if cache warming is enabled
        if not self._is_cache_warming_allowed(options):
            return
        
        # Clear stats if requested
        if options['clear_stats']:
            clear_cache_performance_stats()
            self.stdout.write(self.style.SUCCESS('📊 Cache performance stats cleared'))
        
        # Handle basic mode (simple cache warming like warm_cache command)
        if options['basic']:
            self._basic_warming()
        # Handle production-ready mode
        elif options['production_ready']:
            self._production_ready_warming()
        else:
            # Handle specific warming based on options
            self._custom_warming(options)
        
        # Show stats if requested
        if options['show_stats']:
            self._show_performance_stats()
        
        # Health check if requested
        if options['health_check']:
            self._perform_health_check()
        
        self.stdout.write(self.style.SUCCESS('\n🎉 Comprehensive cache warming completed!'))

    def _is_cache_warming_allowed(self, options):
        """Check if cache warming is allowed"""
        cache_warming_enabled = getattr(settings, 'CACHE_WARMING_ENABLED', True)
        
        if not cache_warming_enabled and not options['force']:
            self.stdout.write(
                self.style.WARNING(
                    '⚠️  Cache warming is disabled in settings. Use --force to override.'
                )
            )
            return False
        
        if options['force'] and not cache_warming_enabled:
            self.stdout.write(
                self.style.WARNING(
                    '⚡ Cache warming forced (disabled in settings)'
                )
            )
        
        return True

    def _basic_warming(self):
        """Basic cache warming equivalent to the simple warm_cache command"""
        self.stdout.write(self.style.SUCCESS('⚡ Basic cache warming (equivalent to warm_cache command)...'))
        
        # Use the simple critical cache warming function
        warmed_caches = warm_critical_caches()
        
        if warmed_caches:
            self.stdout.write(
                self.style.SUCCESS(
                    f'✅ Successfully warmed {len(warmed_caches)} cache types: {", ".join(warmed_caches)}'
                )
            )
        else:
            self.stdout.write(
                self.style.WARNING(
                    '⚠️  No caches were warmed. This may indicate configuration issues.'
                )
            )

    def _production_ready_warming(self):
        """Production-ready cache warming with all areas and both sync + async"""
        self.stdout.write(self.style.SUCCESS('🚀 Production-ready cache warming initiated...'))
        
        # Sync warming first for immediate availability
        self.stdout.write('⚡ Phase 1: Synchronous warming for immediate availability...')
        warmed_caches = warm_critical_caches()
        
        if warmed_caches:
            self.stdout.write(
                self.style.SUCCESS(
                    f'✅ Sync warming completed: {", ".join(warmed_caches)}'
                )
            )
        
        # Async warming for comprehensive coverage
        self.stdout.write('🔄 Phase 2: Asynchronous warming for comprehensive coverage...')
        trigger_comprehensive_cache_warming()
        
        self.stdout.write(
            self.style.SUCCESS(
                '✅ Production-ready warming initiated (sync + async)'
            )
        )

    def _custom_warming(self, options):
        """Custom cache warming based on user options"""
        mode = options['mode']
        areas = options['areas']
        
        if 'all' in areas:
            areas = ['critical', 'products', 'settings', 'reports', 'inventory']
        
        self.stdout.write(f'🎯 Warming areas: {", ".join(areas)} in {mode} mode')
        
        # Sync warming
        if mode in ['sync', 'both']:
            self._sync_warming(areas)
        
        # Async warming
        if mode in ['async', 'both']:
            self._async_warming(areas)

    def _sync_warming(self, areas):
        """Synchronous cache warming"""
        self.stdout.write('⚡ Synchronous warming started...')
        
        total_warmed = []
        
        if 'critical' in areas:
            warmed = warm_critical_caches()
            total_warmed.extend(warmed)
        
        if 'products' in areas:
            try:
                from products.services import ProductService
                ProductService.get_cached_category_tree()
                ProductService.get_cached_active_products_list()
                ProductService.get_cached_product_types()
                ProductService.get_cached_taxes()
                total_warmed.append('products')
            except Exception as e:
                self.stdout.write(self.style.WARNING(f'⚠️ Product warming failed: {e}'))
        
        if 'settings' in areas:
            try:
                from settings.config import app_settings
                app_settings.warm_settings_cache()
                total_warmed.append('settings')
            except Exception as e:
                self.stdout.write(self.style.WARNING(f'⚠️ Settings warming failed: {e}'))
        
        if 'reports' in areas:
            try:
                from reports.services_new.metrics_service import BusinessMetricsService
                BusinessMetricsService.get_cached_business_kpis()
                total_warmed.append('reports')
            except Exception as e:
                self.stdout.write(self.style.WARNING(f'⚠️ Report warming failed: {e}'))
        
        if 'inventory' in areas:
            try:
                from inventory.models import Location
                list(Location.objects.all())
                total_warmed.append('inventory')
            except Exception as e:
                self.stdout.write(self.style.WARNING(f'⚠️ Inventory warming failed: {e}'))
        
        self.stdout.write(
            self.style.SUCCESS(
                f'✅ Sync warming completed: {", ".join(set(total_warmed))}'
            )
        )

    def _async_warming(self, areas):
        """Asynchronous cache warming"""
        self.stdout.write('🔄 Asynchronous warming started...')
        
        tasks_queued = []
        
        if 'critical' in areas:
            current_app.send_task('core_backend.infrastructure.tasks.warm_critical_caches')
            tasks_queued.append('critical')
        
        if 'products' in areas:
            current_app.send_task('core_backend.infrastructure.tasks.warm_product_caches')
            tasks_queued.append('products')
        
        if 'settings' in areas:
            current_app.send_task('core_backend.infrastructure.tasks.warm_settings_caches')
            tasks_queued.append('settings')
        
        if 'reports' in areas:
            current_app.send_task('core_backend.infrastructure.tasks.warm_report_caches')
            tasks_queued.append('reports')
        
        if 'inventory' in areas:
            current_app.send_task('core_backend.infrastructure.tasks.warm_inventory_caches')
            tasks_queued.append('inventory')
        
        self.stdout.write(
            self.style.SUCCESS(
                f'✅ Async tasks queued: {", ".join(tasks_queued)}'
            )
        )

    def _show_performance_stats(self):
        """Show cache performance statistics"""
        self.stdout.write('\n📊 Cache Performance Statistics:')
        
        stats = get_cache_performance_stats()
        if stats:
            self.stdout.write(f'   Total Requests: {stats["total_requests"]}')
            self.stdout.write(f'   Cache Hit Rate: {stats["hit_rate"]:.1f}%')
            self.stdout.write(f'   Cache Miss Rate: {stats["miss_rate"]:.1f}%')
            self.stdout.write(f'   Average Hit Time: {stats["avg_hit_time"]:.1f}ms')
            self.stdout.write(f'   Average Miss Time: {stats["avg_miss_time"]:.1f}ms')
            self.stdout.write(f'   Slow Queries: {stats["slow_queries"]}')
        else:
            self.stdout.write('   No cache statistics available')

    def _perform_health_check(self):
        """Perform cache health check"""
        self.stdout.write('\n🏥 Performing cache health check...')
        
        try:
            schedule_cache_health_check()
            self.stdout.write(self.style.SUCCESS('✅ Cache health check scheduled'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'❌ Health check failed: {e}'))