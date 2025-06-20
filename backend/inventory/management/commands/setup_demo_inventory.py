"""
Django management command to set up demo inventory data.
This helps test the inventory-order integration.
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from products.models import Product
from inventory.models import Location, InventoryStock
from inventory.services import InventoryService
from settings.config import app_settings


class Command(BaseCommand):
    help = 'Set up demo inventory data for testing'

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Reset all inventory data before creating demo data',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Setting up demo inventory data...'))

        with transaction.atomic():
            if options['reset']:
                self.stdout.write('Resetting existing inventory data...')
                InventoryStock.objects.all().delete()
                # Keep locations but clear their stock

            # Get or create default location
            default_location = app_settings.get_default_location()
            self.stdout.write(f'Using default location: {default_location.name}')

            # Get all products
            products = Product.objects.all()
            
            if not products.exists():
                self.stdout.write(
                    self.style.WARNING(
                        'No products found! Please create some products first.'
                    )
                )
                return

            # Set up inventory for each product
            demo_stock_levels = [
                (50, 100),   # High stock items
                (10, 30),    # Medium stock items  
                (0, 5),      # Low/out of stock items
            ]

            for i, product in enumerate(products):
                # Cycle through different stock level ranges
                min_stock, max_stock = demo_stock_levels[i % len(demo_stock_levels)]
                
                # Use a simple formula to vary stock levels
                stock_level = min_stock + (i * 7) % (max_stock - min_stock + 1)
                
                try:
                    # Add stock using the service (will create if doesn't exist)
                    InventoryService.add_stock(product, default_location, stock_level)
                    
                    self.stdout.write(
                        f'  ✓ Set {product.name}: {stock_level} units'
                    )
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(
                            f'  ✗ Failed to set stock for {product.name}: {e}'
                        )
                    )

            # Summary
            total_stock_records = InventoryStock.objects.count()
            low_stock_count = InventoryStock.objects.filter(quantity__lt=10).count()
            out_of_stock_count = InventoryStock.objects.filter(quantity=0).count()

            self.stdout.write(
                self.style.SUCCESS(
                    f'\nDemo inventory setup complete!'
                )
            )
            self.stdout.write(f'  - Total stock records: {total_stock_records}')
            self.stdout.write(f'  - Low stock items: {low_stock_count}')
            self.stdout.write(f'  - Out of stock items: {out_of_stock_count}')
            
            self.stdout.write(
                self.style.SUCCESS(
                    '\nYou can now test:'
                )
            )
            self.stdout.write('  1. View inventory in the frontend')
            self.stdout.write('  2. Create orders and watch stock decrease')
            self.stdout.write('  3. Try to oversell products with low stock')
            self.stdout.write('  4. Check the inventory dashboard') 