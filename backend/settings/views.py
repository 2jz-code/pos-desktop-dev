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
    PrinterConfiguration,
    WebOrderSettings,
    StockActionReasonConfig,
)
from .serializers import (
    GlobalSettingsSerializer,
    StoreLocationSerializer,
    TerminalLocationSerializer,
    PrinterConfigurationSerializer,
    WebOrderSettingsSerializer,
    StockActionReasonConfigSerializer,
    StockActionReasonConfigListSerializer,
)
from .permissions import SettingsReadOnlyOrOwnerAdmin, FinancialSettingsReadAccess
from users.permissions import StockReasonOwnerPermission
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


class StockActionReasonConfigViewSet(BaseViewSet):
    """
    ViewSet for managing stock action reason configurations.
    - List/Read: Available to all authenticated POS staff
    - Create/Update/Delete: Only available to owners
    - System reasons cannot be deleted and have limited editing
    """
    
    queryset = StockActionReasonConfig.objects.all().order_by('category', 'name')
    serializer_class = StockActionReasonConfigSerializer
    permission_classes = [StockReasonOwnerPermission]
    filterset_fields = ['category', 'is_system_reason', 'is_active']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'category', 'created_at']
    ordering = ['category', 'name']
    
    def get_serializer_class(self):
        """Use list serializer for list actions and dropdown endpoints"""
        if self.action == 'list' or self.action == 'active_reasons':
            return StockActionReasonConfigListSerializer
        return StockActionReasonConfigSerializer
    
    def get_queryset(self):
        """Filter queryset based on action and parameters"""
        queryset = super().get_queryset()
        
        # For list and active_reasons actions, optionally filter to only active reasons
        if self.action in ['list', 'active_reasons']:
            # Check if we should only show active reasons
            active_only = self.request.query_params.get('active_only', 'false').lower() == 'true'
            if active_only:
                queryset = queryset.filter(is_active=True)
        
        return queryset
    
    @action(detail=False, methods=['get'])
    def active_reasons(self, request):
        """
        Endpoint to get only active reasons for use in dropdowns.
        Returns a simplified list of active stock action reasons.
        """
        queryset = self.get_queryset().filter(is_active=True)
        
        # Apply category filter if specified
        category = request.query_params.get('category')
        if category:
            queryset = queryset.filter(category=category)
        
        serializer = StockActionReasonConfigListSerializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def categories(self, request):
        """
        Endpoint to get available reason categories.
        Returns the category choices for use in forms.
        """
        categories = [
            {'value': choice[0], 'label': choice[1]}
            for choice in StockActionReasonConfig.CATEGORY_CHOICES
        ]
        return Response(categories)
    
    def perform_create(self, serializer):
        """Override to ensure new reasons are marked as custom (non-system)"""
        # Ensure new reasons are never marked as system reasons
        serializer.save(is_system_reason=False)
    
    def destroy(self, request, *args, **kwargs):
        """Override destroy to prevent deletion of system reasons"""
        instance = self.get_object()
        
        if instance.is_system_reason:
            return Response(
                {'error': 'System reasons cannot be deleted.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return super().destroy(request, *args, **kwargs)
