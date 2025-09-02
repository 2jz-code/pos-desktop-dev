"""
URL configuration for core_backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.conf import settings
from django.contrib import admin
from django.urls import path, include
from django.conf.urls.static import static
from django.http import JsonResponse
from .views import (
    cache_health_check,
    warm_caches,
    invalidate_cache,
    cache_statistics,
)
from .admin_views import legacy_migration_view


def health_check(request):
    """Simple health check endpoint that doesn't require authentication"""
    return JsonResponse({"status": "ok", "message": "Backend is running"})


urlpatterns = [
    path("api/health/", health_check, name="health_check"),
    path("admin/legacy-migration/", legacy_migration_view, name="legacy_migration"),
    path("admin/", admin.site.urls),
    # Cache monitoring endpoints (admin only)
    path("api/cache/health/", cache_health_check, name="cache_health_check"),
    path("api/cache/warm/", warm_caches, name="warm_caches"),
    path("api/cache/invalidate/", invalidate_cache, name="invalidate_cache"),
    path("api/cache/stats/", cache_statistics, name="cache_statistics"),
    path("api/users/", include("users.urls")),
    path(
        "api/auth/customer/", include("users.customer_urls")
    ),  # Customer authentication
    path("api/products/", include("products.urls")),
    path("api/inventory/", include("inventory.urls")),
    # *** IMPORTANT CHANGE HERE ***
    # Change "api/orders/" to "api/" to avoid double-prefixing.
    # The 'orders' app itself registers its base endpoint as 'orders'.
    path("api/", include("orders.urls")),  # This ensures the final path is /api/orders/
    path("api/payments/", include("payments.urls")),
    path("api/", include("discounts.urls")),
    path("api/settings/", include("settings.urls")),
    path("api/integrations/", include("integrations.urls")),
    path("api/notifications/", include("notifications.urls")),
    path("api/reports/", include("reports.urls")),
    path("api/business-hours/", include("business_hours.urls")),
]

if settings.DEBUG:
    import debug_toolbar
    urlpatterns += [
        path('__debug__/', include(debug_toolbar.urls)),
    ]
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
