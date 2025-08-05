#!/usr/bin/env python3
"""
Automated migration script to convert ModelViewSets to use BaseViewSet.

This script automatically updates ViewSet inheritance patterns across multiple apps,
focusing only on ModelViewSets to ensure they inherit from BaseViewSet.
"""

import os
import re
import sys
from pathlib import Path


def migrate_viewset_in_file(file_path, app_name):
    """
    Migrate a single views.py file to use BaseViewSet for ModelViewSets only.
    
    Args:
        file_path (str): Path to the views.py file
        app_name (str): Name of the app being migrated
    
    Returns:
        bool: True if changes were made, False otherwise
    """
    print(f"Analyzing {app_name}/views.py...")
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    changes_made = []

    # Step 1: Add BaseViewSet import if not present
    if 'from core_backend.base import BaseViewSet' not in content:
        # Find existing rest_framework imports to add our import nearby
        import_patterns = [
            r'from rest_framework import.*',
            r'from rest_framework\..*',
            r'import.*viewsets.*'
        ]
        
        import_added = False
        for pattern in import_patterns:
            match = re.search(pattern, content, re.MULTILINE)
            if match and not import_added:
                import_line = match.group(0)
                new_import = f"{import_line}\nfrom core_backend.base import BaseViewSet"
                content = content.replace(import_line, new_import)
                changes_made.append("Added BaseViewSet import")
                import_added = True
                break
        
        # If no rest_framework imports found, add at the top after existing imports
        if not import_added:
            lines = content.split('\n')
            import_index = 0
            for i, line in enumerate(lines):
                if line.startswith('from ') or line.startswith('import '):
                    import_index = i + 1
            
            lines.insert(import_index, 'from core_backend.base import BaseViewSet')
            content = '\n'.join(lines)
            changes_made.append("Added BaseViewSet import at top")

    # Step 2: Replace ViewSet inheritance patterns (ModelViewSets only)
    viewset_replacements = [
        # Complex inheritance patterns (most specific first)
        (r'class (\w+)\(ArchivingViewSetMixin,\s*OptimizedQuerysetMixin,\s*viewsets\.ModelViewSet\)', 
         r'class \1(BaseViewSet)'),
        (r'class (\w+)\(OptimizedQuerysetMixin,\s*ArchivingViewSetMixin,\s*viewsets\.ModelViewSet\)', 
         r'class \1(BaseViewSet)'),
        (r'class (\w+)\(ArchivingViewSetMixin,\s*viewsets\.ModelViewSet\)', 
         r'class \1(BaseViewSet)'),
        (r'class (\w+)\(OptimizedQuerysetMixin,\s*viewsets\.ModelViewSet\)', 
         r'class \1(BaseViewSet)'),
        
        # Standard ModelViewSet pattern
        (r'class (\w+)\(viewsets\.ModelViewSet\)', 
         r'class \1(BaseViewSet)'),
        
        # Handle cases with multiple mixins in different orders
        (r'class (\w+)\(([^)]*ArchivingViewSetMixin[^)]*),\s*viewsets\.ModelViewSet\)', 
         r'class \1(BaseViewSet)'),
        (r'class (\w+)\(([^)]*OptimizedQuerysetMixin[^)]*),\s*viewsets\.ModelViewSet\)', 
         r'class \1(BaseViewSet)'),
    ]

    for pattern, replacement in viewset_replacements:
        matches = re.findall(pattern, content)
        if matches:
            content = re.sub(pattern, replacement, content)
            for match in matches:
                viewset_name = match if isinstance(match, str) else match[0]
                changes_made.append(f"Migrated {viewset_name} to BaseViewSet")

    # Step 3: Remove redundant configurations that BaseViewSet provides
    redundant_lines = [
        r'\s*pagination_class\s*=\s*StandardPagination\s*\n',
        r'\s*filter_backends\s*=\s*\[DjangoFilterBackend,\s*filters\.SearchFilter,?\s*filters\.OrderingFilter?\]\s*\n',
        r'\s*filter_backends\s*=\s*\[DjangoFilterBackend,\s*filters\.SearchFilter\]\s*\n',
        r'\s*filter_backends\s*=\s*\[\s*DjangoFilterBackend\s*,\s*filters\.SearchFilter\s*,\s*filters\.OrderingFilter\s*\]\s*\n',
    ]

    for pattern in redundant_lines:
        matches = re.findall(pattern, content)
        if matches:
            content = re.sub(pattern, '\n', content)
            changes_made.append("Removed redundant pagination/filter config")

    # Step 4: Clean up any duplicate newlines
    content = re.sub(r'\n\n\n+', '\n\n', content)

    # Write changes if any were made
    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"Successfully migrated {app_name}/views.py")
        for change in changes_made:
            print(f"   - {change}")
        return True
    else:
        print(f"No ModelViewSet changes needed in {app_name}/views.py")
        return False


def get_backend_path():
    """Get the backend directory path"""
    current_dir = Path(__file__).parent
    return str(current_dir)


def migrate_all_apps():
    """Migrate all remaining apps to use BaseViewSet"""
    
    # Apps to migrate (excluding already completed inventory and products)
    apps_to_migrate = [
        'discounts',
        'orders', 
        'payments',
        'users',
        'reports',
        'settings'
    ]

    backend_path = get_backend_path()
    print(f"Starting automated BaseViewSet migration...")
    print(f"Backend path: {backend_path}")
    print(f"Apps to migrate: {', '.join(apps_to_migrate)}")
    print("=" * 60)

    results = {
        'migrated': [],
        'no_changes': [],
        'not_found': [],
        'errors': []
    }

    for app_name in apps_to_migrate:
        views_file = os.path.join(backend_path, app_name, 'views.py')
        
        try:
            if os.path.exists(views_file):
                print(f"\nProcessing {app_name} app...")
                
                if migrate_viewset_in_file(views_file, app_name):
                    results['migrated'].append(app_name)
                else:
                    results['no_changes'].append(app_name)
            else:
                print(f"Views file not found: {views_file}")
                results['not_found'].append(app_name)
                
        except Exception as e:
            print(f"Error migrating {app_name}: {str(e)}")
            results['errors'].append((app_name, str(e)))

    # Print summary
    print("\n" + "=" * 60)
    print("MIGRATION SUMMARY")
    print("=" * 60)
    
    if results['migrated']:
        print(f"Successfully migrated ({len(results['migrated'])}): {', '.join(results['migrated'])}")
    
    if results['no_changes']:
        print(f"No changes needed ({len(results['no_changes'])}): {', '.join(results['no_changes'])}")
    
    if results['not_found']:
        print(f"Views files not found ({len(results['not_found'])}): {', '.join(results['not_found'])}")
    
    if results['errors']:
        print(f"Errors occurred ({len(results['errors'])}):")
        for app, error in results['errors']:
            print(f"   - {app}: {error}")

    total_processed = len(results['migrated']) + len(results['no_changes'])
    print(f"\nMigration complete! Processed {total_processed} apps successfully.")
    
    if results['migrated']:
        print("\nNext steps:")
        print("1. Run validation: python manage.py check")
        print("2. Test the migrated apps")
        print("3. Update serializers to inherit from BaseModelSerializer (manual)")
        print("4. Add optimization fields to serializer Meta classes (manual)")

    return len(results['errors']) == 0


if __name__ == '__main__':
    print("Django BaseViewSet Migration Script")
    print("This script migrates ModelViewSets to inherit from BaseViewSet")
    print("-" * 60)
    
    try:
        success = migrate_all_apps()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\nMigration cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        sys.exit(1)