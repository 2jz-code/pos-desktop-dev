from django.urls import path, include
from rest_framework.routers import DefaultRouter

# Import from organized view modules
from .views.authenticated import (
    PaymentViewSet,
    PaymentProcessView,
    CreateUserPaymentIntentView,
    CompleteUserPaymentView,
    SurchargeCalculationView,
    GiftCardValidationView,
    GiftCardPaymentView,
    GiftCardListView,
)
from .views.terminal import (
    CreateTerminalIntentView,
    CaptureTerminalIntentView,
    CancelPaymentIntentView,
    TerminalConnectionTokenView,
    TerminalConfigurationView,
)
from .views.webhooks import StripeWebhookView
from .views.guest import (
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
    # Gift card endpoints
    path(
        "gift-cards/validate/",
        GiftCardValidationView.as_view(),
        name="gift-card-validate",
    ),
    path(
        "gift-cards/payment/",
        GiftCardPaymentView.as_view(),
        name="gift-card-payment",
    ),
    path(
        "gift-cards/",
        GiftCardListView.as_view(),
        name="gift-card-list",
    ),
    # Authenticated payment endpoints
    path("process/", PaymentProcessView.as_view(), name="payment-process"),
    path(
        "calculate-surcharge/",
        SurchargeCalculationView.as_view(),
        name="calculate-surcharge",
    ),
    path(
        "create-payment-intent/",
        CreateUserPaymentIntentView.as_view(),
        name="create-payment-intent",
    ),
    path(
        "complete-payment/",
        CompleteUserPaymentView.as_view(),
        name="complete-payment",
    ),
    # Terminal payment endpoints
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
    # Include the router-generated URLs for PaymentViewSet
    # This includes: /api/payments/, /api/payments/{id}/, and all ViewSet actions
    path("", include(router.urls)),
]
