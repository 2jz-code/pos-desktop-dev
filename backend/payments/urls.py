from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PaymentProcessView,
    PaymentViewSet,
    CreateTerminalIntentView,
    CaptureTerminalIntentView,
    CancelPaymentIntentView,
    TerminalConnectionTokenView,
    TerminalConfigurationView,
    StripeWebhookView,
    CreateGuestPaymentIntentView,
    CompleteGuestPaymentView,
)

app_name = "payments"

router = DefaultRouter()
router.register(r"", PaymentViewSet, basename="payment")

urlpatterns = [
    path("webhooks/stripe/", StripeWebhookView.as_view(), name="stripe-webhook"),
    # Guest payment endpoints (no authentication required)
    path(
        "guest/create-payment-intent/",
        CreateGuestPaymentIntentView.as_view(),
        name="guest-create-payment-intent",
    ),
    path(
        "guest/complete-payment/",
        CompleteGuestPaymentView.as_view(),
        name="guest-complete-payment",
    ),
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
    path(
        "terminal/configuration/",
        TerminalConfigurationView.as_view(),
        name="terminal-configuration",
    ),
    # Include the router-generated URLs
    path("", include(router.urls)),
]
