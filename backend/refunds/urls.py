"""
URL configuration for refunds app.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    RefundItemViewSet,
    RefundAuditLogViewSet,
    ExchangeSessionViewSet,
    calculate_item_refund,
    process_item_refund,
    process_full_order_refund,
    # Exchange views
    initiate_exchange,
    create_new_order_for_exchange,
    complete_exchange,
    cancel_exchange,
    get_exchange_summary,
    calculate_exchange_balance,
)

# Create router for ViewSets
router = DefaultRouter()
router.register(r'items', RefundItemViewSet, basename='refund-item')
router.register(r'audit-logs', RefundAuditLogViewSet, basename='refund-audit-log')
router.register(r'exchanges', ExchangeSessionViewSet, basename='exchange-session')

urlpatterns = [
    # ViewSet routes
    path('', include(router.urls)),

    # Calculation endpoint (preview only, no processing - handles both single and multiple items)
    path('calculate-item/', calculate_item_refund, name='calculate-item-refund'),

    # Processing endpoints (actually perform refunds)
    path('process-item/', process_item_refund, name='process-item-refund'),
    path('process-full-order/', process_full_order_refund, name='process-full-order-refund'),

    # Exchange endpoints
    path('exchanges/initiate/', initiate_exchange, name='initiate-exchange'),
    path('exchanges/create-order/', create_new_order_for_exchange, name='create-exchange-order'),
    path('exchanges/complete/', complete_exchange, name='complete-exchange'),
    path('exchanges/cancel/', cancel_exchange, name='cancel-exchange'),
    path('exchanges/<uuid:exchange_session_id>/summary/', get_exchange_summary, name='exchange-summary'),
    path('exchanges/<uuid:exchange_session_id>/balance/', calculate_exchange_balance, name='exchange-balance'),
]
