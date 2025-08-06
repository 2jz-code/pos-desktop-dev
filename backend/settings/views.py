from django.shortcuts import render
from rest_framework import viewsets, status, generics
from core_backend.base import BaseViewSet, ReadOnlyBaseViewSet
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.views import APIView
from django.core.exceptions import ValidationError
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
from .services import (
    SettingsService,
    PrinterConfigurationService,
    WebOrderSettingsService,
    TerminalService,
    SettingsValidationService,
)

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
        Uses SettingsService for consistent singleton management.
        """
        return SettingsService.get_global_settings()

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
        Business logic extracted to SettingsService.
        """
        if request.method == "GET":
            data = SettingsService.get_store_info()
            return Response(data)

        elif request.method == "PATCH":
            try:
                data = SettingsService.update_store_info(request.data)
                return Response(data)
            except ValidationError as e:
                return Response(
                    {"error": str(e)}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

    @action(
        detail=False,
        methods=["get", "patch"],
        permission_classes=[FinancialSettingsReadAccess],
    )
    def financial(self, request):
        """
        Get or update just the financial settings section.
        Business logic extracted to SettingsService.
        """
        if request.method == "GET":
            data = SettingsService.get_financial_settings()
            return Response(data)

        elif request.method == "PATCH":
            try:
                data = SettingsService.update_financial_settings(request.data)
                return Response(data)
            except ValidationError as e:
                return Response(
                    {"error": str(e)}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

    @action(detail=False, methods=["get", "patch"])
    def receipt_config(self, request):
        """
        Get or update just the receipt configuration section.
        Business logic extracted to SettingsService.
        """
        if request.method == "GET":
            data = SettingsService.get_receipt_config()
            return Response(data)

        elif request.method == "PATCH":
            try:
                data = SettingsService.update_receipt_config(request.data)
                return Response(data)
            except ValidationError as e:
                return Response(
                    {"error": str(e)}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """
        Get a summary of key settings for display purposes.
        Business logic extracted to SettingsService.
        """
        data = SettingsService.get_settings_summary()
        return Response(data)

    @action(detail=False, methods=["get"])
    def receipt_format_data(self, request):
        """
        Get all the data needed for receipt formatting.
        Business logic extracted to SettingsService.
        """
        data = SettingsService.get_receipt_format_data()
        return Response(data)

    @action(detail=False, methods=["get", "patch"])
    def business_hours(self, request):
        """
        Get or update business hours configuration.
        Complex business logic (64+ lines) extracted to SettingsService.
        """
        if request.method == "GET":
            data = SettingsService.get_business_hours()
            return Response(data)

        elif request.method == "PATCH":
            try:
                data = SettingsService.update_business_hours(request.data)
                return Response(data)
            except ValidationError as e:
                return Response(
                    {"error": str(e)}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

class PrinterConfigurationViewSet(BaseViewSet):
    """
    API endpoint for viewing and editing the singleton PrinterConfiguration object.
    """

    queryset = PrinterConfiguration.objects.all()
    serializer_class = PrinterConfigurationSerializer
    permission_classes = [SettingsReadOnlyOrOwnerAdmin]

    def get_object(self):
        """Uses PrinterConfigurationService for consistent singleton management."""
        return PrinterConfigurationService.get_printer_configuration()

    def list(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        # For singleton, redirect create to update
        return self.update(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        """Handle singleton update using PrinterConfigurationService."""
        try:
            instance = PrinterConfigurationService.update_printer_configuration(
                request.data, partial=False
            )
            serializer = self.get_serializer(instance)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {"error": str(e)}, 
                status=status.HTTP_400_BAD_REQUEST
            )

    def partial_update(self, request, *args, **kwargs):
        """Handle singleton partial update using PrinterConfigurationService."""
        try:
            instance = PrinterConfigurationService.update_printer_configuration(
                request.data, partial=True
            )
            serializer = self.get_serializer(instance)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {"error": str(e)}, 
                status=status.HTTP_400_BAD_REQUEST
            )

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
        Uses WebOrderSettingsService for optimized queries.
        """
        return WebOrderSettingsService.get_web_order_settings()

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
        Handle PUT/PATCH requests using WebOrderSettingsService.
        """
        partial = kwargs.pop("partial", False)
        try:
            instance = WebOrderSettingsService.update_web_order_settings(
                request.data, partial=partial
            )
            serializer = self.get_serializer(instance)
            return Response(serializer.data)
        except ValidationError as e:
            return Response(
                {"error": str(e)}, 
                status=status.HTTP_400_BAD_REQUEST
            )

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
    ordering = ["device_id"]  # Override default ordering since this model uses device_id as PK

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
        Complex business logic (40+ lines) extracted to TerminalService.
        """
        try:
            instance, created = TerminalService.upsert_terminal_registration(
                request.data
            )
            serializer = self.get_serializer(instance)
            
            # Return appropriate status code
            status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
            headers = (
                self.get_success_headers(serializer.data)
                if created else {}
            )
            
            return Response(serializer.data, status=status_code, headers=headers)
        except ValidationError as e:
            if isinstance(e.message_dict if hasattr(e, 'message_dict') else e, dict):
                return Response(e.message_dict, status=status.HTTP_400_BAD_REQUEST)
            else:
                return Response(
                    {"error": str(e)}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

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
        Business logic extracted to TerminalService.
        """
        try:
            location = TerminalService.set_default_store_location(pk)
            return Response(
                {
                    "status": "success",
                    "message": f"'{location.name}' is now the default store location.",
                }
            )
        except ValidationError as e:
            return Response(
                {"error": str(e)}, 
                status=status.HTTP_400_BAD_REQUEST
            )

class TerminalLocationViewSet(ReadOnlyBaseViewSet):
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
        """
        List Stripe Terminal Readers using TerminalService.
        Business logic (25+ lines) extracted to service.
        """
        location_id = request.query_params.get("location_id", None)
        result = TerminalService.list_stripe_readers(location_id)
        
        if result["status"] == "success":
            return Response(result["readers"])
        else:
            return Response(
                {"error": result["error"]},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

class SyncStripeLocationsView(APIView):
    """
    An API view to trigger a sync of locations from Stripe.
    """

    def post(self, request, *args, **kwargs):
        """
        Sync locations from Stripe using TerminalService.
        Business logic extracted to service.
        """
        result = TerminalService.sync_stripe_locations()
        
        if result["status"] == "success":
            return Response(result, status=status.HTTP_200_OK)
        else:
            return Response(result, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
