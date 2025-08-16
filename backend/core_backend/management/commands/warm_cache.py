"""
Django management command to warm up critical application caches.
Useful for deployment or startup optimization.
"""

from django.core.management.base import BaseCommand
from core_backend.infrastructure.cache_utils import (
    warm_critical_caches,
    get_cache_performance_stats,
    clear_cache_performance_stats
)


class Command(BaseCommand):
    help = 'Warm up critical application caches for better performance'

    def add_arguments(self, parser):
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

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('🔥 Starting cache warming process...'))
        
        # Clear stats if requested
        if options['clear_stats']:
            clear_cache_performance_stats()
            self.stdout.write(self.style.SUCCESS('📊 Cache performance stats cleared'))
        
        # Warm critical caches
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
        
        # Show stats if requested
        if options['show_stats']:
            stats = get_cache_performance_stats()
            if stats:
                self.stdout.write(self.style.SUCCESS('\n📊 Cache Performance Statistics:'))
                self.stdout.write(f"   Total Requests: {stats['total_requests']}")
                self.stdout.write(f"   Cache Hit Rate: {stats['hit_rate']:.1f}%")
                self.stdout.write(f"   Average Hit Time: {stats['avg_hit_time']:.1f}ms")
                self.stdout.write(f"   Average Miss Time: {stats['avg_miss_time']:.1f}ms")
                self.stdout.write(f"   Slow Queries: {stats['slow_queries']}")
            else:
                self.stdout.write(self.style.WARNING('   No cache statistics available'))
        
        self.stdout.write(self.style.SUCCESS('\n🎉 Cache warming completed!'))