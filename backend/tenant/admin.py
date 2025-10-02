from django.contrib import admin
from .models import Tenant


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'business_name', 'is_active', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['name', 'slug', 'business_name', 'contact_email']
    readonly_fields = ['id', 'created_at', 'updated_at', 'get_subdomain_url']
    prepopulated_fields = {'slug': ('name',)}

    fieldsets = (
        ('Basic Info', {
            'fields': ('id', 'name', 'slug', 'get_subdomain_url')
        }),
        ('Business Details', {
            'fields': ('business_name', 'contact_email', 'contact_phone')
        }),
        ('Status', {
            'fields': ('is_active', 'created_at', 'updated_at')
        }),
    )

    def get_subdomain_url(self, obj):
        """Display the subdomain URL for this tenant."""
        if obj and obj.slug:
            return obj.get_subdomain_url()
        return '-'
    get_subdomain_url.short_description = 'Subdomain URL'
