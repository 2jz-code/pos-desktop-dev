"""
Simple admin view for legacy data migration.
"""

from django.contrib.admin.views.decorators import staff_member_required
from django.contrib import messages
from django.shortcuts import render, redirect
from django.core.management import call_command
from io import StringIO
import sys


@staff_member_required
def legacy_migration_view(request):
    """Simple view to run customer migration from users to customers model."""
    
    if request.method == 'POST':
        try:
            # Capture command output
            old_stdout = sys.stdout
            stdout_capture = StringIO()
            sys.stdout = stdout_capture
            
            try:
                # Run customer migration command
                call_command('migrate_users_to_customers', '--force')
                output = stdout_capture.getvalue()
                messages.success(request, 'Customer migration completed successfully!')
                
            finally:
                sys.stdout = old_stdout
                
        except Exception as e:
            messages.error(request, f'Migration failed: {str(e)}')
            output = f'Error: {str(e)}'
        
        context = {
            'title': 'Customer Migration',
            'output': output,
        }
        return render(request, 'admin/legacy_migration.html', context)
    
    # GET request - show the form
    context = {
        'title': 'Customer Migration',
    }
    return render(request, 'admin/legacy_migration.html', context)