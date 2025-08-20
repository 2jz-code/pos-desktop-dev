from django.core.management.base import BaseCommand
from django.db import transaction
from products.models import ModifierOption, ProductModifierSet


class Command(BaseCommand):
    help = 'Clean up orphaned product-specific modifier options'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be deleted without actually deleting',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be made'))
        
        # Find all product-specific options
        product_specific_options = ModifierOption.objects.filter(is_product_specific=True)
        
        orphaned_options = []
        
        for option in product_specific_options:
            # Check if this option is still referenced by any ProductModifierSet
            is_referenced = ProductModifierSet.objects.filter(
                modifier_set=option.modifier_set,
                extra_options=option
            ).exists()
            
            if not is_referenced:
                orphaned_options.append(option)
        
        if not orphaned_options:
            self.stdout.write(
                self.style.SUCCESS('No orphaned product-specific options found.')
            )
            return
        
        self.stdout.write(
            self.style.WARNING(f'Found {len(orphaned_options)} orphaned product-specific options:')
        )
        
        for option in orphaned_options:
            self.stdout.write(f'  - {option.name} (ID: {option.id}) in modifier set "{option.modifier_set.name}"')
        
        if dry_run:
            self.stdout.write(
                self.style.WARNING('DRY RUN: No options were deleted. Run without --dry-run to actually delete.')
            )
        else:
            with transaction.atomic():
                for option in orphaned_options:
                    self.stdout.write(f'Deleting orphaned option: {option.name} (ID: {option.id})')
                    option.delete()
            
            self.stdout.write(
                self.style.SUCCESS(f'Successfully deleted {len(orphaned_options)} orphaned product-specific options.')
            )