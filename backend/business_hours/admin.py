from django.contrib import admin
from django.utils.html import format_html
from .models import (
    BusinessHoursProfile,
    RegularHours,
    TimeSlot,
    SpecialHours,
    SpecialHoursTimeSlot,
    Holiday
)


class TimeSlotInline(admin.TabularInline):
    """Inline admin for time slots within regular hours"""
    model = TimeSlot
    extra = 1
    fields = ['slot_type', 'opening_time', 'closing_time']
    ordering = ['opening_time']

    def save_model(self, request, obj, form, change):
        """Ensure tenant is set from parent RegularHours"""
        if not obj.tenant and hasattr(obj, 'regular_hours'):
            obj.tenant = obj.regular_hours.tenant
        super().save_model(request, obj, form, change)


class SpecialHoursTimeSlotInline(admin.TabularInline):
    """Inline admin for time slots within special hours"""
    model = SpecialHoursTimeSlot
    extra = 1
    fields = ['opening_time', 'closing_time']
    ordering = ['opening_time']

    def save_model(self, request, obj, form, change):
        """Ensure tenant is set from parent SpecialHours"""
        if not obj.tenant and hasattr(obj, 'special_hours'):
            obj.tenant = obj.special_hours.tenant
        super().save_model(request, obj, form, change)


class RegularHoursInline(admin.TabularInline):
    """Inline admin for regular hours within profile"""
    model = RegularHours
    extra = 0
    max_num = 7  # Only 7 days in a week
    fields = ['day_of_week', 'is_closed']
    readonly_fields = ['day_of_week']
    ordering = ['day_of_week']
    can_delete = False
    
    def has_add_permission(self, request, obj):
        # Don't allow adding more than 7 days
        return False


@admin.register(BusinessHoursProfile)
class BusinessHoursProfileAdmin(admin.ModelAdmin):
    """
    Admin for business hours profiles.
    Phase 5: Now includes store_location link.
    """
    list_display = ['name', 'store_location', 'timezone', 'is_active', 'is_default', 'tenant', 'created_at']
    list_filter = ['is_active', 'is_default', 'timezone', 'tenant', 'store_location']
    search_fields = ['name', 'store_location__name']
    inlines = [RegularHoursInline]
    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'store_location', 'timezone', 'tenant')
        }),
        ('Status', {
            'fields': ('is_active', 'is_default')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        })
    )
    readonly_fields = ['created_at', 'updated_at']

    def get_queryset(self, request):
        """Use all_objects to show all tenants in Django admin"""
        return BusinessHoursProfile.all_objects.all()

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        """Filter store_location dropdown by profile's tenant"""
        if db_field.name == "store_location":
            from settings.models import StoreLocation
            from tenant.managers import get_current_tenant

            # Get the profile being edited (if editing existing)
            profile_id = request.resolver_match.kwargs.get('object_id')
            if profile_id:
                try:
                    profile = BusinessHoursProfile.all_objects.get(pk=profile_id)
                    # Filter locations by the profile's tenant
                    kwargs["queryset"] = StoreLocation.all_objects.filter(tenant=profile.tenant)
                except BusinessHoursProfile.DoesNotExist:
                    # Profile not found, fall back to current tenant
                    kwargs["queryset"] = StoreLocation.objects.all()
            else:
                # Creating new profile, use current tenant's locations
                kwargs["queryset"] = StoreLocation.objects.all()

        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def save_model(self, request, obj, form, change):
        """Override to create default regular hours for new profiles"""
        from tenant.managers import get_current_tenant

        # Ensure tenant is set on the profile before saving
        if not obj.tenant:
            obj.tenant = get_current_tenant()

        super().save_model(request, obj, form, change)

        # Create regular hours for each day if they don't exist
        if not change:  # Only for new profiles
            tenant = obj.tenant
            days = [
                (0, 'Monday'),
                (1, 'Tuesday'),
                (2, 'Wednesday'),
                (3, 'Thursday'),
                (4, 'Friday'),
                (5, 'Saturday'),
                (6, 'Sunday'),
            ]
            for day_num, day_name in days:
                # Use all_objects to check across all tenants, then create with correct tenant
                rh, created = RegularHours.all_objects.get_or_create(
                    profile=obj,
                    day_of_week=day_num,
                    defaults={'is_closed': False, 'tenant': tenant}
                )
                # If it existed but had NULL tenant, update it
                if not created and not rh.tenant:
                    rh.tenant = tenant
                    rh.save(update_fields=['tenant'])


@admin.register(RegularHours)
class RegularHoursAdmin(admin.ModelAdmin):
    """Admin for regular weekly hours"""
    list_display = ['profile', 'get_day_display', 'is_closed', 'tenant', 'get_hours_display']
    list_filter = ['profile', 'day_of_week', 'is_closed', 'tenant']
    search_fields = ['profile__name']
    inlines = [TimeSlotInline]
    fieldsets = (
        ('Schedule', {
            'fields': ('profile', 'day_of_week', 'is_closed', 'tenant')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        })
    )
    readonly_fields = ['created_at', 'updated_at', 'tenant']
    ordering = ['profile', 'day_of_week']

    def get_queryset(self, request):
        """Use all_objects to show all tenants in Django admin"""
        return RegularHours.all_objects.all()

    def save_model(self, request, obj, form, change):
        """Ensure tenant is set from profile"""
        from tenant.managers import get_current_tenant
        if not obj.tenant:
            obj.tenant = obj.profile.tenant if obj.profile else get_current_tenant()
        super().save_model(request, obj, form, change)
    
    def get_day_display(self, obj):
        """Display day name"""
        return dict(obj.DAYS_OF_WEEK)[obj.day_of_week]
    get_day_display.short_description = 'Day'
    
    def get_hours_display(self, obj):
        """Display formatted hours"""
        if obj.is_closed:
            return format_html('<span style="color: red;">Closed</span>')
        
        slots = obj.time_slots.all().order_by('opening_time')
        if not slots:
            return format_html('<span style="color: orange;">No hours set</span>')
        
        hours_html = []
        for slot in slots:
            hours_html.append(
                f"{slot.opening_time.strftime('%I:%M %p')} - "
                f"{slot.closing_time.strftime('%I:%M %p')}"
            )
        return format_html('<br>'.join(hours_html))
    get_hours_display.short_description = 'Hours'


@admin.register(SpecialHours)
class SpecialHoursAdmin(admin.ModelAdmin):
    """Admin for special hours on specific dates"""
    list_display = ['profile', 'date', 'is_closed', 'reason', 'tenant', 'get_hours_display']
    list_filter = ['profile', 'is_closed', 'date', 'tenant']
    search_fields = ['profile__name', 'reason']
    date_hierarchy = 'date'
    inlines = [SpecialHoursTimeSlotInline]
    fieldsets = (
        ('Date & Profile', {
            'fields': ('profile', 'date', 'tenant')
        }),
        ('Hours', {
            'fields': ('is_closed', 'reason')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        })
    )
    readonly_fields = ['created_at', 'updated_at', 'tenant']
    ordering = ['-date']

    def get_queryset(self, request):
        """Use all_objects to show all tenants in Django admin"""
        return SpecialHours.all_objects.all()

    def save_model(self, request, obj, form, change):
        """Ensure tenant is set from profile"""
        from tenant.managers import get_current_tenant
        if not obj.tenant:
            obj.tenant = obj.profile.tenant if obj.profile else get_current_tenant()
        super().save_model(request, obj, form, change)
    
    def get_hours_display(self, obj):
        """Display formatted hours"""
        if obj.is_closed:
            return format_html('<span style="color: red;">Closed</span>')
        
        slots = obj.special_time_slots.all().order_by('opening_time')
        if not slots:
            return format_html('<span style="color: orange;">No hours set</span>')
        
        hours_html = []
        for slot in slots:
            hours_html.append(
                f"{slot.opening_time.strftime('%I:%M %p')} - "
                f"{slot.closing_time.strftime('%I:%M %p')}"
            )
        return format_html('<br>'.join(hours_html))
    get_hours_display.short_description = 'Hours'


@admin.register(Holiday)
class HolidayAdmin(admin.ModelAdmin):
    """Admin for recurring holidays"""
    list_display = ['name', 'profile', 'get_date_display', 'is_closed', 'tenant']
    list_filter = ['profile', 'is_closed', 'month', 'tenant']
    search_fields = ['name', 'profile__name']
    fieldsets = (
        ('Holiday Information', {
            'fields': ('profile', 'name', 'tenant')
        }),
        ('Date', {
            'fields': ('month', 'day')
        }),
        ('Status', {
            'fields': ('is_closed',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        })
    )
    readonly_fields = ['created_at', 'updated_at', 'tenant']
    ordering = ['month', 'day']

    def get_queryset(self, request):
        """Use all_objects to show all tenants in Django admin"""
        return Holiday.all_objects.all()

    def save_model(self, request, obj, form, change):
        """Ensure tenant is set from profile"""
        from tenant.managers import get_current_tenant
        if not obj.tenant:
            obj.tenant = obj.profile.tenant if obj.profile else get_current_tenant()
        super().save_model(request, obj, form, change)
    
    def get_date_display(self, obj):
        """Display formatted date"""
        import calendar
        month_name = calendar.month_name[obj.month]
        return f"{month_name} {obj.day}"
    get_date_display.short_description = 'Date'


# Register the remaining models with basic admin
@admin.register(TimeSlot)
class TimeSlotAdmin(admin.ModelAdmin):
    """Admin for time slots"""
    list_display = ['regular_hours', 'slot_type', 'opening_time', 'closing_time', 'tenant']
    list_filter = ['slot_type', 'regular_hours__profile', 'tenant']
    search_fields = ['regular_hours__profile__name']
    ordering = ['regular_hours', 'opening_time']

    def get_queryset(self, request):
        """Use all_objects to show all tenants in Django admin"""
        return TimeSlot.all_objects.all()


@admin.register(SpecialHoursTimeSlot)
class SpecialHoursTimeSlotAdmin(admin.ModelAdmin):
    """Admin for special hours time slots"""
    list_display = ['special_hours', 'opening_time', 'closing_time', 'tenant']
    list_filter = ['special_hours__profile', 'tenant']
    search_fields = ['special_hours__profile__name']
    date_hierarchy = 'special_hours__date'
    ordering = ['special_hours', 'opening_time']

    def get_queryset(self, request):
        """Use all_objects to show all tenants in Django admin"""
        return SpecialHoursTimeSlot.all_objects.all()
