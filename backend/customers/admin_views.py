"""
Customer admin views and analytics.
"""
from django.shortcuts import render
from django.contrib.admin.views.decorators import staff_member_required
from django.utils.decorators import method_decorator
from django.views import View
from django.http import JsonResponse
from django.utils import timezone
from datetime import timedelta, datetime
from django.db.models import Count, Q, Avg
from django.db.models.functions import TruncDate, TruncMonth

from users.models import User
from orders.models import Order
from .admin import CustomerStats


@method_decorator(staff_member_required, name='dispatch')
class CustomerAnalyticsView(View):
    """
    Customer analytics dashboard for admin interface.
    """
    
    def get(self, request):
        """Render customer analytics dashboard"""
        context = self.get_analytics_context()
        return render(request, 'admin/customers/analytics.html', context)
    
    def get_analytics_context(self):
        """Get analytics data for the dashboard"""
        # Basic stats
        basic_stats = CustomerStats.get_customer_stats()
        
        # Customer growth over time (last 12 months)
        twelve_months_ago = timezone.now() - timedelta(days=365)
        customer_growth = User.objects.filter(
            role=User.Role.CUSTOMER,
            date_joined__gte=twelve_months_ago
        ).extra(
            select={'month': 'DATE_TRUNC(\'month\', date_joined)'}
        ).values('month').annotate(
            count=Count('id')
        ).order_by('month')
        
        # Active vs inactive customers
        active_customers = User.objects.filter(
            role=User.Role.CUSTOMER,
            is_active=True
        ).count()
        
        inactive_customers = User.objects.filter(
            role=User.Role.CUSTOMER,
            is_active=False
        ).count()
        
        # Customer engagement metrics
        thirty_days_ago = timezone.now() - timedelta(days=30)
        
        # Customers who logged in recently
        recent_logins = User.objects.filter(
            role=User.Role.CUSTOMER,
            last_login__gte=thirty_days_ago
        ).count()
        
        # Customers who never logged in
        never_logged_in = User.objects.filter(
            role=User.Role.CUSTOMER,
            last_login__isnull=True
        ).count()
        
        # Order statistics for customers
        customers_with_orders = User.objects.filter(
            role=User.Role.CUSTOMER,
            customer_orders__isnull=False
        ).distinct().count()
        
        customers_without_orders = User.objects.filter(
            role=User.Role.CUSTOMER
        ).exclude(
            customer_orders__isnull=False
        ).count()
        
        # Average orders per customer
        avg_orders_per_customer = Order.objects.filter(
            customer__role=User.Role.CUSTOMER
        ).values('customer').annotate(
            order_count=Count('id')
        ).aggregate(
            avg_orders=Avg('order_count')
        )['avg_orders'] or 0
        
        # Top customers by order count
        top_customers = User.objects.filter(
            role=User.Role.CUSTOMER
        ).annotate(
            order_count=Count('customer_orders')
        ).filter(
            order_count__gt=0
        ).order_by('-order_count')[:10]
        
        # Recent customer registrations (last 7 days)
        seven_days_ago = timezone.now() - timedelta(days=7)
        recent_registrations = User.objects.filter(
            role=User.Role.CUSTOMER,
            date_joined__gte=seven_days_ago
        ).order_by('-date_joined')[:10]
        
        return {
            'basic_stats': basic_stats,
            'customer_growth': list(customer_growth),
            'active_customers': active_customers,
            'inactive_customers': inactive_customers,
            'recent_logins': recent_logins,
            'never_logged_in': never_logged_in,
            'customers_with_orders': customers_with_orders,
            'customers_without_orders': customers_without_orders,
            'avg_orders_per_customer': round(avg_orders_per_customer, 2),
            'top_customers': top_customers,
            'recent_registrations': recent_registrations,
        }


@staff_member_required
def customer_analytics_api(request):
    """
    API endpoint for customer analytics data.
    Used for AJAX requests from admin interface.
    """
    analytics_view = CustomerAnalyticsView()
    data = analytics_view.get_analytics_context()
    
    # Convert QuerySets to lists for JSON serialization
    data['top_customers'] = [
        {
            'id': customer.id,
            'email': customer.email,
            'name': f"{customer.first_name} {customer.last_name}".strip() or customer.username,
            'order_count': customer.order_count,
        }
        for customer in data['top_customers']
    ]
    
    data['recent_registrations'] = [
        {
            'id': customer.id,
            'email': customer.email,
            'name': f"{customer.first_name} {customer.last_name}".strip() or customer.username,
            'date_joined': customer.date_joined.isoformat(),
        }
        for customer in data['recent_registrations']
    ]
    
    return JsonResponse(data)


# Custom admin filters
class CustomerOrderCountFilter(admin.SimpleListFilter):
    """Filter customers by number of orders"""
    title = 'Order Count'
    parameter_name = 'order_count'

    def lookups(self, request, model_admin):
        return (
            ('0', 'No orders'),
            ('1-5', '1-5 orders'),
            ('6-10', '6-10 orders'),
            ('11+', '11+ orders'),
        )

    def queryset(self, request, queryset):
        if self.value() == '0':
            return queryset.annotate(
                order_count=Count('customer_orders')
            ).filter(order_count=0)
        elif self.value() == '1-5':
            return queryset.annotate(
                order_count=Count('customer_orders')
            ).filter(order_count__gte=1, order_count__lte=5)
        elif self.value() == '6-10':
            return queryset.annotate(
                order_count=Count('customer_orders')
            ).filter(order_count__gte=6, order_count__lte=10)
        elif self.value() == '11+':
            return queryset.annotate(
                order_count=Count('customer_orders')
            ).filter(order_count__gte=11)


class CustomerActivityFilter(admin.SimpleListFilter):
    """Filter customers by activity level"""
    title = 'Activity Level'
    parameter_name = 'activity'

    def lookups(self, request, model_admin):
        return (
            ('active', 'Active (logged in last 30 days)'),
            ('inactive', 'Inactive (90+ days since login)'),
            ('never', 'Never logged in'),
        )

    def queryset(self, request, queryset):
        now = timezone.now()
        thirty_days_ago = now - timedelta(days=30)
        ninety_days_ago = now - timedelta(days=90)
        
        if self.value() == 'active':
            return queryset.filter(last_login__gte=thirty_days_ago)
        elif self.value() == 'inactive':
            return queryset.filter(last_login__lt=ninety_days_ago)
        elif self.value() == 'never':
            return queryset.filter(last_login__isnull=True)