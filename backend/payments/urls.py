from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PaymentProcessView,
    PaymentViewSet,
    CreateTerminalIntentView,
    CaptureTerminalIntentView,
    CancelPaymentIntentView,
    TerminalConnectionTokenView,
    StripeWebhookView,
)

app_name = "payments"

router = DefaultRouter()
router.register(r"", PaymentViewSet, basename="payment")

urlpatterns = [
    path("webhooks/stripe/", StripeWebhookView.as_view(), name="stripe-webhook"),
    # Existing URLs
    path("process/", PaymentProcessView.as_view(), name="payment-process"),
    path(
        "orders/<uuid:order_id>/create-terminal-intent/",
        CreateTerminalIntentView.as_view(),
        name="create-terminal-intent",
    ),
    path(
        "orders/<uuid:order_id>/capture-intent/",
        CaptureTerminalIntentView.as_view(),
        name="capture-terminal-intent",
    ),
    path(
        "cancel-intent/",
        CancelPaymentIntentView.as_view(),
        name="cancel-payment-intent",
    ),
    path(
        "terminal/connection-token/",
        TerminalConnectionTokenView.as_view(),
        name="terminal-connection-token",
    ),
    # Include the router-generated URLs
    path("", include(router.urls)),
]
