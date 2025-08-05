from django.shortcuts import render
from rest_framework import viewsets, status, generics
from core_backend.base import BaseViewSet
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.views import APIView
from .models import (
    GlobalSettings,
    StoreLocation,
    TerminalLocation,
    TerminalRegistration,
    PrinterConfiguration,
    WebOrderSettings,
)
from .serializers import (
    GlobalSettingsSerializer,
    StoreLocationSerializer,
    TerminalLocationSerializer,
    TerminalRegistrationSerializer,
    PrinterConfigurationSerializer,
    WebOrderSettingsSerializer,
)
from .permissions import SettingsReadOnlyOrOwnerAdmin, FinancialSettingsReadAccess
from payments.strategies import StripeTerminalStrategy
from core_backend.base.mixins import ArchivingViewSetMixin

# Create your views here.

class GlobalSettingsViewSet(BaseViewSet):
    """
    API endpoint for viewing and editing the application's single GlobalSettings object.
    Provides convenient endpoints for different settings sections.
    """

    queryset = GlobalSettings.objects.all()
    serializer_class = GlobalSettingsSerializer
    permission_classes = [SettingsReadOnlyOrOwnerAdmin]

    def get_object(self):
        """
        Always returns the single GlobalSettings instance.
        """
        obj, created = GlobalSettings.objects.get_or_create(pk=1)
        return obj

    def list(self, request, *args, **kwargs):
        """
        Handle GET requests for the list view.
        Since this is a singleton, this will retrieve the single settings object.
        """
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def update(self, request, *args, **kwargs):
        """
        Handle PUT/PATCH requests to update settings.
        """
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        """
        Handle PATCH requests for partial updates.
        """
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    @action(detail=False, methods=["get", "patch"])
    def store_info(self, request):
        """
        Get or update just the store information section.
        """
        instance = self.get_object()

        if request.method == "GET":
            data = {
                "store_name": instance.store_name,
                "store_address": instance.store_address,
                "store_phone": instance.store_phone,
                "store_email": instance.store_email,
            }
            return Response(data)

        elif request.method == "PATCH":
            # Update only store info fields
            allowed_fields = [
                "store_name",
                "store_address",
                "store_phone",
                "store_email",
            ]
            update_data = {k: v for k, v in request.data.items() if k in allowed_fields}

            serializer = self.get_serializer(instance, data=update_data, partial=True)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)

            # Return updated store info
            return self.store_info(type("Request", (), {"method": "GET"})())

    @action(
        detail=False,
        methods=["get", "patch"],
        permission_classes=[FinancialSettingsReadAccess],
    )
    def financial(self, request):
        """
        Get or update just the financial settings section.
        """
        instance = self.get_object()

        if request.method == "GET":
            data = {
                "tax_rate": instance.tax_rate,
                "surcharge_percentage": instance.surcharge_percentage,
                "currency": instance.currency,
            }
            return Response(data)

        elif request.method == "PATCH":
            # Update only financial fields
            allowed_fields = ["tax_rate", "surcharge_percentage", "currency"]
            update_data = {k: v for k, v in request.data.items() if k in allowed_fields}

            serializer = self.get_serializer(instance, data=update_data, partial=True)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)

            # Return updated financial settings
            return self.financial(type("Request", (), {"method": "GET"})())

    @action(detail=False, methods=["get", "patch"])
    def receipt_config(self, request):
        """
        Get or update just the receipt configuration section.
        """
        instance = self.get_object()

        if request.method == "GET":
            data = {
                "receipt_header": instance.receipt_header,
                "receipt_footer": instance.receipt_footer,
            }
            return Response(data)

        elif request.method == "PATCH":
            # Update only receipt config fields
            allowed_fields = ["receipt_header", "receipt_footer"]
            update_data = {k: v for k, v in request.data.items() if k in allowed_fields}

            serializer = self.get_serializer(instance, data=update_data, partial=True)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)

            # Return updated receipt config
            return self.receipt_config(type("Request", (), {"method": "GET"})())

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """
        Get a summary of key settings for display purposes.
        """
        instance = self.get_object()
        data = {
            "store_name": instance.store_name,
            "currency": instance.currency,
            "tax_rate": instance.tax_rate,
            "timezone": instance.timezone,
            "active_terminal_provider": instance.active_terminal_provider,
        }
        return Response(data)

    @action(detail=False, methods=["get"])
    def receipt_format_data(self, request):
        """
        Get all the data needed for receipt formatting.
        This combines store info and receipt configuration for use by receipt formatters.
        """
        instance = self.get_object()
        data = {
            # Store Information
            "store_name": instance.store_name,
            "store_address": instance.store_address,
            "store_phone": instance.store_phone,
            "store_email": instance.store_email,
            # Receipt Configuration
            "receipt_header": instance.receipt_header,
            "receipt_footer": instance.receipt_footer,
        }
        return Response(data)

    @action(detail=False, methods=["get", "patch"])
    def business_hours(self, request):
        """
        Get or update business hours configuration.
        """
        instance = self.get_object()

        if request.method == "GET":
            data = {
                "opening_time": (
                    instance.opening_time.strftime("%H:%M")
                    if instance.opening_time
                    else None
                ),
                "closing_time": (
                    instance.closing_time.strftime("%H:%M")
                    if instance.closing_time
                    else None
                ),
                "timezone": instance.timezone,
            }
            return Response(data)

        elif request.method == "PATCH":
            # Update business hours fields
            allowed_fields = ["opening_time", "closing_time", "timezone"]

            updated_data = {}
            for field in allowed_fields:
                if field in request.data:
                    value = request.data[field]

                    # Handle time fields that might be null/empty
                    if field in ["opening_time", "closing_time"]:
                        if value is None or value == "":
                            setattr(instance, field, None)
                        else:
                            # Parse time string (HH:MM format)
                            from datetime import datetime

                            try:
                                time_obj = datetime.strptime(value, "%H:%M").time()
                                setattr(instance, field, time_obj)
                            except ValueError:
                                return Response(
                                    {
                                        "error": f"Invalid time format for {field}. Use HH:MM format."
                                    },
                                    status=400,
                                )
                    else:
                        setattr(instance, field, value)

                    updated_data[field] = request.data[field]

            if updated_data:
                instance.save(update_fields=list(updated_data.keys()))

                # Clear settings cache after update
                from .config import app_settings

                app_settings.reload()

                # Return updated data
                return self.business_hours(type("Request", (), {"method": "GET"})())

class PrinterConfigurationViewSet(BaseViewSet):
    """
    API endpoint for viewing and editing the singleton PrinterConfiguration object.
    """

    queryset = PrinterConfiguration.objects.all()
    serializer_class = PrinterConfigurationSerializer
    permission_classes = [SettingsReadOnlyOrOwnerAdmin]

    def get_object(self):
        obj, _ = PrinterConfiguration.objects.get_or_create(pk=1)
        return obj

    def list(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        # For singleton, redirect create to update
        return self.update(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        # Handle singleton update without requiring an ID in the URL
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=False)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        # Handle singleton partial update without requiring an ID in the URL
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

class WebOrderSettingsViewSet(BaseViewSet):
    """
    API endpoint for viewing and editing the singleton WebOrderSettings object.
    Manages which terminals should print customer receipts for web orders.
    """

    queryset = WebOrderSettings.objects.all()
    serializer_class = WebOrderSettingsSerializer
    permission_classes = [SettingsReadOnlyOrOwnerAdmin]

    def get_object(self):
        """
        Always returns the single WebOrderSettings instance.
        """
        obj, created = WebOrderSettings.objects.prefetch_related(
            'web_receipt_terminals__store_location'
        ).get_or_create(pk=1)
        return obj

    def list(self, request, *args, **kwargs):
        """
        Handle GET requests for the list view.
        Since this is a singleton, this will retrieve the single settings object.
        """
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        """
        For singleton, redirect create to update.
        """
        return self.update(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        """
        Handle PUT/PATCH requests to update settings.
        """
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        """
        Handle PATCH requests for partial updates.
        """
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

class TerminalRegistrationViewSet(BaseViewSet):
    """
    API endpoint for managing Terminal Registrations.
    This replaces the old POSDeviceViewSet.
    """

    queryset = TerminalRegistration.objects.all()
    serializer_class = TerminalRegistrationSerializer
    lookup_field = "device_id"

    def get_queryset(self):
        return TerminalRegistration.objects.select_related('store_location')

    def perform_create(self, serializer):
        """
        Saves the serializer instance.
        """
        serializer.save()

    def create(self, request, *args, **kwargs):
        """
        Creates or updates a terminal registration (UPSERT).
        This method is designed to be called via a POST request.
        """
        # The device_id is expected in the request data
        device_id = request.data.get("device_id")
        if not device_id:
            return Response(
                {"device_id": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get the instance if it exists, otherwise None
        instance = self.get_queryset().filter(device_id=device_id).first()

        # When creating, partial=False. When updating, partial=True.
        serializer = self.get_serializer(
            instance, data=request.data, partial=instance is not None
        )
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        # Determine the status code based on whether an instance was updated or created
        status_code = status.HTTP_200_OK if instance else status.HTTP_201_CREATED
        headers = (
            self.get_success_headers(serializer.data)
            if status_code == status.HTTP_201_CREATED
            else {}
        )

        return Response(serializer.data, status=status_code, headers=headers)

    def update(self, request, *args, **kwargs):
        """
        Handles standard updates for a terminal registration.
        """
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

class StoreLocationViewSet(BaseViewSet):
    """
    API endpoint for managing primary Store Locations.
    """

    queryset = StoreLocation.objects.all()
    serializer_class = StoreLocationSerializer

    @action(detail=True, methods=["post"], url_path="set-default")
    def set_default(self, request, pk=None):
        """
        Sets this location as the default store location.
        """
        location = self.get_object()
        location.is_default = True
        location.save()
        return Response(
            {
                "status": "success",
                "message": f"'{location.name}' is now the default store location.",
            }
        )

class TerminalLocationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows Stripe Terminal Locations to be viewed.
    """

    queryset = TerminalLocation.objects.select_related("store_location").all()
    serializer_class = TerminalLocationSerializer

class TerminalReaderListView(APIView):
    """
    API endpoint to list available Stripe Terminal Readers.
    Can be filtered by a Stripe location ID.
    """

    permission_classes = [SettingsReadOnlyOrOwnerAdmin]

    def get(self, request, *args, **kwargs):
        location_id = request.query_params.get("location_id", None)

        try:
            strategy = StripeTerminalStrategy()
            readers = strategy.list_readers(location_id=location_id)
            return Response(readers)
        except Exception as e:
            # Consider more specific error handling for Stripe errors
            return Response(
                {"error": f"Failed to retrieve readers from Stripe: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

class SyncStripeLocationsView(APIView):
    """
    An API view to trigger a sync of locations from Stripe.
    """

    def post(self, request, *args, **kwargs):
        """
        Handles the POST request to sync locations.
        """
        result = StripeTerminalStrategy.sync_locations_from_stripe()
        if result["status"] == "success":
            return Response(result, status=status.HTTP_200_OK)
        else:
            return Response(result, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
