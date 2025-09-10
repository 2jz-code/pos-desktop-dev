"""
Customer admin interface with PII protection.
"""
from django.contrib import admin
from django.core.cache import cache
from django.contrib import messages
from django.db import models
from django.db.models import Count
from django.utils.html import format_html
from django.urls import reverse
from django.utils import timezone
from datetime import timedelta
from core_backend.utils.pii import PIIProtection

from .models import Customer, CustomerAddress


def _norm_email(email: str) -> str:
    """Normalize email for cache key usage"""
    return (email or "").strip().lower()


@admin.action(description="Clear login locks for selected customers")
def clear_customer_login_locks(modeladmin, request, queryset):
    """Clear login locks for customer accounts"""
    cleared = 0
    for customer in queryset:
        email = _norm_email(getattr(customer, "email", ""))
        if not email:
            continue
        # Clear customer-specific login locks (web login locks)
        keys = [
            f"web_login_fail:{email}",
            f"web_login_lock:{email}",
        ]
        cache.delete_many(keys)
        cleared += 1
    modeladmin.message_user(
        request,
        f"Cleared login locks for {cleared} customer(s).",
        level=messages.SUCCESS,
    )


@admin.action(description="Activate selected customers")
def activate_customers(modeladmin, request, queryset):
    """Activate customer accounts"""
    updated = queryset.filter(is_active=False).update(is_active=True)
    modeladmin.message_user(
        request,
        f"Activated {updated} customer(s).",
        level=messages.SUCCESS,
    )


@admin.action(description="Deactivate selected customers")
def deactivate_customers(modeladmin, request, queryset):
    """Deactivate customer accounts"""
    updated = queryset.filter(is_active=True).update(is_active=False)
    modeladmin.message_user(
        request,
        f"Deactivated {updated} customer(s).",
        level=messages.SUCCESS,
    )


# Custom admin filters
class CustomerOrderCountFilter(admin.SimpleListFilter):
    """Filter customers by number of orders (calculated on demand)"""
    title = 'Order Activity'
    parameter_name = 'order_activity'

    def lookups(self, request, model_admin):
        return (
            ('active', 'Has Orders'),
            ('inactive', 'No Orders'),
            ('recent', 'Ordered in last 30 days'),
        )

    def queryset(self, request, queryset):
        # Note: These filters use properties that query orders on demand
        # For better performance, consider adding order counts to Customer model
        # or using annotations if this becomes a performance issue
        if self.value() == 'active':
            return queryset.filter(id__in=[
                c.id for c in queryset if c.total_orders > 0
            ])
        elif self.value() == 'inactive':
            return queryset.filter(id__in=[
                c.id for c in queryset if c.total_orders == 0
            ])
        elif self.value() == 'recent':
            return queryset.filter(id__in=[
                c.id for c in queryset 
                if c.last_order_date and c.days_since_last_order is not None and c.days_since_last_order <= 30
            ])


class CustomerActivityFilter(admin.SimpleListFilter):
    """Filter customers by login activity"""
    title = 'Login Activity'
    parameter_name = 'login_activity'

    def lookups(self, request, model_admin):
        return (
            ('recent', 'Logged in last 30 days'),
            ('inactive', 'Inactive (90+ days)'),
            ('never', 'Never logged in'),
        )

    def queryset(self, request, queryset):
        now = timezone.now()
        thirty_days_ago = now - timedelta(days=30)
        ninety_days_ago = now - timedelta(days=90)
        
        if self.value() == 'recent':
            return queryset.filter(last_login__gte=thirty_days_ago)
        elif self.value() == 'inactive':
            return queryset.filter(last_login__lt=ninety_days_ago)
        elif self.value() == 'never':
            return queryset.filter(last_login__isnull=True)


class CustomerAddressInline(admin.TabularInline):
    """Inline to show customer addresses"""
    model = CustomerAddress
    extra = 0
    readonly_fields = ('created_at', 'updated_at', 'masked_address_display')
    fields = ('address_type', 'is_default', 'masked_address_display', 'city', 'state', 'country')
    
    def masked_address_display(self, obj):
        """Show masked street address for privacy"""
        if obj.street_address:
            return PIIProtection.mask_address(obj.street_address)
        return "-"
    masked_address_display.short_description = "Street Address"
    
    def has_add_permission(self, request, obj=None):
        """Allow adding addresses"""
        return True


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    """Admin interface for customer management with PII protection"""
    
    list_display = (
        "masked_email_display",
        "masked_name_display",
        "masked_phone_display",
        "is_active",
        "date_joined",
        "last_login",
        "total_orders_display",
        "account_status_display",
    )
    
    list_filter = (
        "is_active",
        "email_verified",
        "phone_verified",
        "preferred_contact_method",
        "marketing_opt_in",
        "date_joined",
        CustomerOrderCountFilter,
        CustomerActivityFilter,
    )
    
    search_fields = ("email", "first_name", "last_name", "phone_number")
    ordering = ("-date_joined",)
    
    fieldsets = (
        ("Account Information", {
            "fields": ("email", "is_active", "password_change_link")
        }),
        ("Personal Information", {
            "fields": ("first_name", "last_name", "phone_number", "birth_date")
        }),
        ("Preferences", {
            "fields": ("preferred_contact_method", "marketing_opt_in", "newsletter_subscribed")
        }),
        ("Verification Status", {
            "fields": ("email_verified", "phone_verified"),
            "classes": ("collapse",)
        }),
        ("Account Activity", {
            "fields": ("date_joined", "last_login", "updated_at"),
            "classes": ("collapse",)
        }),
        ("Legacy Data", {
            "fields": ("legacy_id",),
            "classes": ("collapse",)
        }),
    )
    
    readonly_fields = ("date_joined", "last_login", "updated_at", "password_change_link")
    
    inlines = [CustomerAddressInline]
    
    actions = [clear_customer_login_locks, activate_customers, deactivate_customers]
    
    def masked_email_display(self, obj):
        """Display masked email for privacy in list view"""
        return PIIProtection.mask_email(obj.email)
    masked_email_display.short_description = "Email"
    masked_email_display.admin_order_field = "email"
    
    def masked_name_display(self, obj):
        """Display masked name for privacy in list view"""
        full_name = obj.get_full_name()
        if full_name:
            return PIIProtection.mask_name(full_name)
        return "-"
    masked_name_display.short_description = "Name"
    masked_name_display.admin_order_field = "first_name"
    
    def masked_phone_display(self, obj):
        """Display masked phone for privacy in list view"""
        if obj.phone_number:
            return PIIProtection.mask_phone(obj.phone_number)
        return "-"
    masked_phone_display.short_description = "Phone"
    
    def total_orders_display(self, obj):
        """Show total number of orders for this customer"""
        return obj.total_orders
    total_orders_display.short_description = "Orders"
    
    def account_status_display(self, obj):
        """Display account status with color coding"""
        if not obj.is_active:
            return format_html(
                '<span style="color: red; font-weight: bold;">Inactive</span>'
            )
        elif not obj.last_login:
            return format_html(
                '<span style="color: orange;">Never logged in</span>'
            )
        elif obj.last_login < timezone.now() - timedelta(days=90):
            return format_html(
                '<span style="color: orange;">Inactive (90+ days)</span>'
            )
        else:
            return format_html(
                '<span style="color: green;">Active</span>'
            )
    account_status_display.short_description = "Status"
    
    def password_change_link(self, obj):
        """Link to change customer password"""
        if obj.pk:
            return format_html(
                '<a href="{}">Change Password</a>',
                f'/admin/auth/user/{obj.pk}/password/'  # This will need to be implemented
            )
        return "-"
    password_change_link.short_description = "Password"
    
    def has_add_permission(self, request):
        """Allow adding customers through admin"""
        return True
    
    def has_delete_permission(self, request, obj=None):
        """Allow deleting customers, but show warning"""
        return True
    
    def save_model(self, request, obj, form, change):
        """Handle saving customer model"""
        if not change:  # New customer
            # Set default values for new customers
            obj.is_active = True
            
        super().save_model(request, obj, form, change)
    
    def get_form(self, request, obj=None, **kwargs):
        """Customize form for customer admin"""
        form = super().get_form(request, obj, **kwargs)
        
        # Password field should be hidden and handled separately
        if 'password' in form.base_fields:
            form.base_fields['password'].widget = admin.widgets.AdminTextInputWidget(
                attrs={'readonly': 'readonly', 'placeholder': 'Use "Change Password" link to modify'}
            )
            
        return form

    def get_queryset(self, request):
        """Optimize queryset for admin list view"""
        qs = super().get_queryset(request)
        # Add any needed optimizations here
        return qs


@admin.register(CustomerAddress)
class CustomerAddressAdmin(admin.ModelAdmin):
    """Admin interface for customer addresses"""
    
    list_display = (
        "customer_display",
        "address_type",
        "is_default",
        "masked_street_display",
        "city",
        "state",
        "country",
        "created_at",
    )
    
    list_filter = (
        "address_type",
        "is_default",
        "country",
        "state",
        "created_at",
    )
    
    search_fields = ("customer__email", "customer__first_name", "customer__last_name", "city", "state")
    ordering = ("-created_at",)
    
    fieldsets = (
        ("Customer", {
            "fields": ("customer",)
        }),
        ("Address Type", {
            "fields": ("address_type", "is_default")
        }),
        ("Address Details", {
            "fields": ("street_address", "apartment", "city", "state", "postal_code", "country")
        }),
        ("Special Instructions", {
            "fields": ("delivery_instructions",),
            "classes": ("collapse",)
        }),
        ("Timestamps", {
            "fields": ("created_at", "updated_at"),
            "classes": ("collapse",)
        }),
    )
    
    readonly_fields = ("created_at", "updated_at")
    
    def customer_display(self, obj):
        """Display customer with masked email"""
        return PIIProtection.mask_email(obj.customer.email)
    customer_display.short_description = "Customer"
    customer_display.admin_order_field = "customer__email"
    
    def masked_street_display(self, obj):
        """Display masked street address"""
        return PIIProtection.mask_address(obj.street_address)
    masked_street_display.short_description = "Street Address"
    masked_street_display.admin_order_field = "street_address"


# Customer analytics admin if you want customer statistics
class CustomerStats:
    """Helper class for customer statistics"""
    
    @staticmethod
    def get_customer_stats():
        """Get customer statistics"""
        total_customers = Customer.objects.count()
        active_customers = Customer.objects.filter(is_active=True).count()
        
        # Customers with orders (using property, could be optimized)
        customers_with_orders = len([
            c for c in Customer.objects.all() 
            if c.total_orders > 0
        ])
        
        # Customers registered in last 30 days
        thirty_days_ago = timezone.now() - timedelta(days=30)
        new_customers = Customer.objects.filter(
            date_joined__gte=thirty_days_ago
        ).count()
        
        return {
            'total_customers': total_customers,
            'active_customers': active_customers,
            'customers_with_orders': customers_with_orders,
            'new_customers_30_days': new_customers,
        }