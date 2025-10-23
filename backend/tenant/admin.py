from django.contrib import admin
from django.utils.html import format_html
from .models import Tenant, CustomDomain


class CustomDomainInline(admin.TabularInline):
    """Inline editor for custom domains within Tenant admin."""
    model = CustomDomain
    extra = 0
    fields = ['domain', 'is_primary', 'verified', 'verified_at', 'verification_method', 'ssl_enabled', 'notes']
    readonly_fields = ['verified_at']

    def get_readonly_fields(self, request, obj=None):
        """Make certain fields readonly after creation."""
        if obj:  # Editing existing
            return self.readonly_fields + ['domain']
        return self.readonly_fields


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = [
        'name',
        'slug',
        'ownership_type',
        'get_custom_domains_display',
        'is_active',
        'created_at'
    ]
    list_filter = ['is_active', 'ownership_type', 'created_at']
    search_fields = ['name', 'slug', 'business_name', 'contact_email']
    readonly_fields = ['id', 'created_at', 'updated_at', 'get_subdomain_url', 'get_custom_domain_list']
    prepopulated_fields = {'slug': ('name',)}
    inlines = [CustomDomainInline]

    # Enable autocomplete for CustomDomainAdmin
    def get_search_results(self, request, queryset, search_term):
        """Enable autocomplete searching."""
        queryset, use_distinct = super().get_search_results(request, queryset, search_term)
        return queryset, use_distinct

    fieldsets = (
        ('Basic Info', {
            'fields': ('id', 'name', 'slug', 'ownership_type', 'get_subdomain_url')
        }),
        ('Custom Domains', {
            'fields': ('get_custom_domain_list',),
            'description': 'Manage custom domains in the inline section below'
        }),
        ('Business Details', {
            'fields': ('business_name', 'contact_email', 'contact_phone')
        }),
        ('Subscription & Billing', {
            'fields': ('subscription_tier',),
            'description': 'Phase 2: Will be managed via Stripe integration'
        }),
        ('Status & Notes', {
            'fields': ('is_active', 'internal_notes', 'created_at', 'updated_at')
        }),
    )

    def get_subdomain_url(self, obj):
        """Display the subdomain URL for this tenant."""
        if obj and obj.slug:
            return obj.get_subdomain_url()
        return '-'
    get_subdomain_url.short_description = 'Subdomain URL'

    def get_custom_domains_display(self, obj):
        """Display custom domains count in list view."""
        if not obj:
            return '-'
        verified_count = obj.custom_domains.filter(verified=True).count()
        total_count = obj.custom_domains.count()
        if total_count == 0:
            return '-'

        if verified_count == total_count:
            return format_html(
                '<span style="color: green;">✓ {}/{}</span>',
                verified_count, total_count
            )
        elif verified_count > 0:
            return format_html(
                '<span style="color: orange;">⚠ {}/{}</span>',
                verified_count, total_count
            )
        else:
            return format_html(
                '<span style="color: gray;">⏳ 0/{}</span>',
                total_count
            )
    get_custom_domains_display.short_description = 'Custom Domains'

    def get_custom_domain_list(self, obj):
        """Display formatted list of custom domains."""
        if not obj or not obj.pk:
            return 'Save tenant first to add custom domains'

        domains = obj.custom_domains.all()
        if not domains:
            return 'No custom domains configured. Add domains in the inline section below.'

        lines = []
        for domain in domains:
            status = '✅ Verified' if domain.verified else '⏳ Pending'
            primary = '★ PRIMARY' if domain.is_primary else ''
            ssl = '🔒 SSL' if domain.ssl_enabled else ''
            parts = [status, domain.domain, primary, ssl]
            lines.append(' | '.join(filter(None, parts)))

        return format_html('<br>'.join(lines))
    get_custom_domain_list.short_description = 'Domain List'


@admin.register(CustomDomain)
class CustomDomainAdmin(admin.ModelAdmin):
    """Admin interface for managing custom domains."""

    list_display = [
        'domain',
        'tenant',
        'get_status_display',
        'is_primary',
        'verification_method',
        'ssl_enabled',
        'created_at'
    ]
    list_filter = ['verified', 'is_primary', 'ssl_enabled', 'verification_method', 'created_at']
    search_fields = ['domain', 'tenant__name', 'tenant__slug', 'notes']
    readonly_fields = ['verified_at', 'ssl_provisioned_at', 'created_at', 'updated_at']
    autocomplete_fields = ['tenant']

    fieldsets = (
        ('Domain Info', {
            'fields': ('tenant', 'domain', 'is_primary')
        }),
        ('Verification', {
            'fields': ('verified', 'verified_at', 'verification_method'),
            'description': 'Phase 1: Manual verification. Phase 3: Automated DNS/SSL verification'
        }),
        ('SSL/TLS', {
            'fields': ('ssl_enabled', 'ssl_provisioned_at'),
            'description': 'Phase 3: Automated SSL provisioning with Let\'s Encrypt'
        }),
        ('Metadata', {
            'fields': ('notes', 'created_at', 'updated_at')
        }),
    )

    actions = ['mark_as_verified', 'mark_as_unverified', 'enable_ssl']

    def get_status_display(self, obj):
        """Display verification and SSL status."""
        if not obj:
            return '-'

        status_parts = []
        if obj.verified:
            status_parts.append('<span style="color: green;">✅ Verified</span>')
        else:
            status_parts.append('<span style="color: gray;">⏳ Pending</span>')

        if obj.ssl_enabled:
            status_parts.append('<span style="color: blue;">🔒 SSL</span>')

        return format_html(' | '.join(status_parts))
    get_status_display.short_description = 'Status'

    def mark_as_verified(self, request, queryset):
        """Admin action to manually mark domains as verified."""
        from django.utils import timezone

        updated = 0
        for domain in queryset:
            if not domain.verified:
                domain.verified = True
                domain.verified_at = timezone.now()
                domain.verification_method = 'manual'
                domain.save()
                updated += 1

        self.message_user(
            request,
            f"Marked {updated} domain(s) as verified. "
            f"Customers can now access via these domains."
        )
    mark_as_verified.short_description = "✅ Mark as verified (manual)"

    def mark_as_unverified(self, request, queryset):
        """Admin action to unverify domains."""
        updated = queryset.filter(verified=True).update(verified=False, verified_at=None)
        self.message_user(request, f"Unverified {updated} domain(s)")
    mark_as_unverified.short_description = "❌ Mark as unverified"

    def enable_ssl(self, request, queryset):
        """Admin action to enable SSL (Phase 3: will trigger automated provisioning)."""
        updated = queryset.filter(verified=True, ssl_enabled=False).update(ssl_enabled=True)
        self.message_user(
            request,
            f"Enabled SSL for {updated} domain(s). "
            f"Phase 3: This will trigger automated SSL provisioning."
        )
    enable_ssl.short_description = "🔒 Enable SSL"
