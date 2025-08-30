from django.core.management.base import BaseCommand
from django.db import transaction
from settings.models import StockActionReasonConfig


class Command(BaseCommand):
    help = 'Create default system stock action reasons'

    def add_arguments(self, parser):
        parser.add_argument(
            '--recreate',
            action='store_true',
            help='Delete existing system reasons and recreate them',
        )

    def handle(self, *args, **options):
        # Default system reasons based on existing categories and common use cases
        default_reasons = [
            # SYSTEM category
            {
                'name': 'System Order Deduction',
                'description': 'Automatic stock deduction when an order is completed',
                'category': 'SYSTEM',
                'is_system_reason': True,
            },
            {
                'name': 'System Bulk Operation',
                'description': 'Automatic system-generated bulk stock operations',
                'category': 'SYSTEM',
                'is_system_reason': True,
            },
            
            # MANUAL category
            {
                'name': 'Manual Adjustment - Add Stock',
                'description': 'Manually adding stock to inventory',
                'category': 'MANUAL',
                'is_system_reason': True,
            },
            {
                'name': 'Manual Adjustment - Remove Stock', 
                'description': 'Manually removing stock from inventory',
                'category': 'MANUAL',
                'is_system_reason': True,
            },
            
            # INVENTORY category
            {
                'name': 'Inventory Count Correction',
                'description': 'Adjusting stock based on physical inventory count',
                'category': 'INVENTORY',
                'is_system_reason': True,
            },
            {
                'name': 'Cycle Count Adjustment',
                'description': 'Stock adjustment based on periodic cycle counting',
                'category': 'INVENTORY',
                'is_system_reason': True,
            },
            
            # WASTE category
            {
                'name': 'Damaged Items',
                'description': 'Items removed due to damage or defects',
                'category': 'WASTE',
                'is_system_reason': True,
            },
            {
                'name': 'Expired Items',
                'description': 'Items removed due to expiration',
                'category': 'WASTE',
                'is_system_reason': True,
            },
            {
                'name': 'Spoiled/Contaminated',
                'description': 'Items removed due to spoilage or contamination',
                'category': 'WASTE',
                'is_system_reason': True,
            },
            {
                'name': 'Theft/Loss',
                'description': 'Items missing due to theft or unexplained loss',
                'category': 'WASTE',
                'is_system_reason': True,
            },
            
            # RESTOCK category
            {
                'name': 'Delivery/Shipment Received',
                'description': 'New stock received from suppliers',
                'category': 'RESTOCK',
                'is_system_reason': True,
            },
            {
                'name': 'Purchase Order Fulfillment',
                'description': 'Stock added from purchase order delivery',
                'category': 'RESTOCK',
                'is_system_reason': True,
            },
            {
                'name': 'Production/Manufacturing',
                'description': 'Items added from internal production',
                'category': 'RESTOCK',
                'is_system_reason': True,
            },
            
            # TRANSFER category
            {
                'name': 'Location Transfer',
                'description': 'Moving stock between inventory locations',
                'category': 'TRANSFER',
                'is_system_reason': True,
            },
            {
                'name': 'Store Transfer',
                'description': 'Transferring stock between store locations',
                'category': 'TRANSFER',
                'is_system_reason': True,
            },
            
            # CORRECTION category
            {
                'name': 'Data Entry Error Correction',
                'description': 'Correcting previous incorrect stock entry',
                'category': 'CORRECTION',
                'is_system_reason': True,
            },
            {
                'name': 'System Error Correction',
                'description': 'Correcting stock levels after system error',
                'category': 'CORRECTION',
                'is_system_reason': True,
            },
            
            # BULK category
            {
                'name': 'Bulk Inventory Adjustment',
                'description': 'Large-scale inventory adjustments across multiple items',
                'category': 'BULK',
                'is_system_reason': True,
            },
            {
                'name': 'Bulk Transfer Operation',
                'description': 'Large-scale transfer of multiple items between locations',
                'category': 'BULK',
                'is_system_reason': True,
            },
            
            # OTHER category
            {
                'name': 'Customer Return - Restockable',
                'description': 'Items returned by customer that can be restocked',
                'category': 'OTHER',
                'is_system_reason': True,
            },
            {
                'name': 'Customer Return - Non-restockable',
                'description': 'Items returned by customer that cannot be restocked',
                'category': 'OTHER',
                'is_system_reason': True,
            },
            {
                'name': 'Quality Control Rejection',
                'description': 'Items rejected during quality control process',
                'category': 'OTHER',
                'is_system_reason': True,
            },
            {
                'name': 'Other Reason',
                'description': 'General purpose reason for miscellaneous stock operations',
                'category': 'OTHER',
                'is_system_reason': True,
            },
        ]

        with transaction.atomic():
            if options['recreate']:
                self.stdout.write(
                    self.style.WARNING('Deleting existing system reasons...')
                )
                StockActionReasonConfig.objects.filter(is_system_reason=True).delete()

            created_count = 0
            updated_count = 0

            for reason_data in default_reasons:
                reason, created = StockActionReasonConfig.objects.get_or_create(
                    name=reason_data['name'],
                    defaults=reason_data
                )
                
                if created:
                    created_count += 1
                    self.stdout.write(
                        self.style.SUCCESS(f"✓ Created: {reason.name}")
                    )
                else:
                    # Update existing reason if it's a system reason
                    if reason.is_system_reason:
                        for key, value in reason_data.items():
                            if key != 'name':  # Don't update the name
                                setattr(reason, key, value)
                        reason.save()
                        updated_count += 1
                        self.stdout.write(
                            self.style.WARNING(f"↻ Updated: {reason.name}")
                        )
                    else:
                        self.stdout.write(
                            self.style.ERROR(
                                f"✗ Skipped: {reason.name} (exists as non-system reason)"
                            )
                        )

        self.stdout.write(
            self.style.SUCCESS(
                f'\nCompleted! Created {created_count} new reasons, '
                f'updated {updated_count} existing reasons.'
            )
        )
        
        # Display summary
        total_system_reasons = StockActionReasonConfig.objects.filter(
            is_system_reason=True
        ).count()
        total_custom_reasons = StockActionReasonConfig.objects.filter(
            is_system_reason=False
        ).count()
        
        self.stdout.write(
            f'\nSummary:'
            f'\n  System reasons: {total_system_reasons}'
            f'\n  Custom reasons: {total_custom_reasons}'
            f'\n  Total active reasons: {StockActionReasonConfig.objects.filter(is_active=True).count()}'
        )