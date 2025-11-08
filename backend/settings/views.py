from django.shortcuts import render
from rest_framework import viewsets, status, generics
from core_backend.base import BaseViewSet, ReadOnlyBaseViewSet
from core_backend.base.mixins import (
    TenantScopedQuerysetMixin,
    FieldsetQueryParamsMixin,
    ArchivingViewSetMixin,
)
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.views import APIView
from django.core.exceptions import ValidationError
from .models import (
    GlobalSettings,
    StoreLocation,
    TerminalLocation,
    Printer,
    KitchenZone,
    PrinterConfiguration,
    StockActionReasonConfig,
)
from .serializers import (
    GlobalSettingsSerializer,
    UnifiedStoreLocationSerializer,
    TerminalLocationSerializer,
    PrinterSerializer,
    KitchenZoneSerializer,
    PrinterConfigResponseSerializer,
    UnifiedStockActionReasonConfigSerializer,
)
from .permissions import SettingsReadOnlyOrOwnerAdmin, FinancialSettingsReadAccess
from users.permissions import StockReasonOwnerPermission
from payments.strategies import StripeTerminalStrategy
from .services import (
    SettingsService,
    PrinterConfigurationService,
    TerminalService,
    SettingsValidationService,
)

# Create your views here.

class GlobalSettingsViewSet(FieldsetQueryParamsMixin, BaseViewSet):
    """
    API endpoint for viewing and editing the application's single GlobalSettings object.
    Provides convenient endpoints for different settings sections.
    Supports ?fields= query param for custom field selection.
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

class PrinterViewSet(TenantScopedQuerysetMixin, FieldsetQueryParamsMixin, BaseViewSet):
    """
    API endpoint for managing network printers.
    Scoped to current location based on query parameters.
    Supports ?view=, ?fields=, ?expand= query params.
    """
    queryset = Printer.objects.all()
    serializer_class = PrinterSerializer
    permission_classes = [SettingsReadOnlyOrOwnerAdmin]
    filterset_fields = ['location', 'printer_type', 'is_active']

    def get_queryset(self):
        """Filter by tenant (via mixin) and optionally by location."""
        queryset = super().get_queryset()  # Already tenant-filtered by TenantScopedQuerysetMixin

        # Filter by location if provided
        location_id = self.request.query_params.get('location')
        if location_id:
            queryset = queryset.filter(location_id=location_id)

        return queryset

    def perform_create(self, serializer):
        """Set tenant on printer creation."""
        serializer.save(tenant=self.request.tenant)


class KitchenZoneViewSet(TenantScopedQuerysetMixin, FieldsetQueryParamsMixin, BaseViewSet):
    """
    API endpoint for managing kitchen zones.
    Scoped to current location based on query parameters.
    Supports ?view=, ?fields=, ?expand= query params.
    """
    queryset = KitchenZone.objects.all()
    serializer_class = KitchenZoneSerializer
    permission_classes = [SettingsReadOnlyOrOwnerAdmin]
    filterset_fields = ['location', 'is_active']

    def get_queryset(self):
        """Filter by tenant (via mixin) and optionally by location."""
        queryset = super().get_queryset()  # Already tenant-filtered by TenantScopedQuerysetMixin

        # Filter by location if provided
        location_id = self.request.query_params.get('location')
        if location_id:
            queryset = queryset.filter(location_id=location_id)

        return queryset

    def perform_create(self, serializer):
        """Set tenant on kitchen zone creation."""
        serializer.save(tenant=self.request.tenant)


class PrinterConfigurationViewSet(BaseViewSet):
    """
    BACKWARD COMPATIBILITY ENDPOINT

    Returns printer config in old JSON format for Electron app.
    Now sources data from relational Printer and KitchenZone models.

    GET settings/printer-config/ → Returns config for terminal's location
    GET settings/printer-config/?location=123 → Returns config for specific location
    """
    permission_classes = [SettingsReadOnlyOrOwnerAdmin]

    def list(self, request, *args, **kwargs):
        """
        Return printer configuration in backward-compatible format.
        Sources from new relational models instead of JSON.
        """
        # Determine which location to fetch config for
        location_id = request.query_params.get('location')

        if not location_id:
            # Try to get location from terminal registration
            device_id = request.headers.get('X-Device-ID')
            if device_id:
                try:
                    from terminals.models import TerminalRegistration
                    terminal = TerminalRegistration.objects.get(
                        device_id=device_id,
                        tenant=request.tenant
                    )
                    location = terminal.store_location
                except TerminalRegistration.DoesNotExist:
                    # No terminal registration, use first active location
                    location = StoreLocation.objects.filter(
                        tenant=request.tenant,
                        is_active=True
                    ).first()
            else:
                # No device ID, use first active location
                location = StoreLocation.objects.filter(
                    tenant=request.tenant,
                    is_active=True
                ).first()
        else:
            # Specific location requested
            try:
                location = StoreLocation.objects.get(
                    id=location_id,
                    tenant=request.tenant
                )
            except StoreLocation.DoesNotExist:
                return Response(
                    {"error": "Location not found"},
                    status=status.HTTP_404_NOT_FOUND
                )

        if not location:
            return Response(
                {
                    "receipt_printers": [],
                    "kitchen_printers": [],
                    "kitchen_zones": [],
                }
            )

        # Use backward-compatible serializer
        serializer = PrinterConfigResponseSerializer({'location': location})
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        """Not supported - use individual Printer/KitchenZone endpoints"""
        return Response(
            {"error": "Use /printers/ and /kitchen-zones/ endpoints to create configurations"},
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    def update(self, request, *args, **kwargs):
        """Not supported - use individual Printer/KitchenZone endpoints"""
        return Response(
            {"error": "Use /printers/ and /kitchen-zones/ endpoints to update configurations"},
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    def partial_update(self, request, *args, **kwargs):
        """Not supported - use individual Printer/KitchenZone endpoints"""
        return Response(
            {"error": "Use /printers/ and /kitchen-zones/ endpoints to update configurations"},
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )

# WebOrderSettings ViewSet REMOVED - settings now managed directly on StoreLocation


class StoreLocationViewSet(FieldsetQueryParamsMixin, BaseViewSet):
    """
    API endpoint for managing primary Store Locations.

    Uses UnifiedStoreLocationSerializer with fieldsets for different views:
    - list action: Returns 'list' fieldset (lightweight for location selection)
    - retrieve/detail: Returns 'detail' fieldset (full including receipt customization)

    Supports ?view=reference|list|detail, ?fields=, ?expand= query params.

    Permissions: AllowAny for list/retrieve (guest checkout needs to select location)
                 IsAuthenticated for create/update/delete (admin only)
    """

    queryset = StoreLocation.objects.all()
    serializer_class = UnifiedStoreLocationSerializer

    def _get_default_view_mode(self):
        """
        Return default view mode based on action.
        List action uses 'list' fieldset, others use 'detail'.
        """
        if self.action == 'list':
            return 'list'
        elif self.action == 'retrieve':
            return 'detail'
        return 'detail'

    def get_permissions(self):
        """
        Allow anonymous access for list/retrieve (guest checkout).
        Require authentication for mutations.
        """
        from rest_framework.permissions import IsAuthenticated, AllowAny

        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        from tenant.managers import get_current_tenant
        tenant = get_current_tenant()
        serializer.save(tenant=tenant)

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


class StockActionReasonConfigViewSet(FieldsetQueryParamsMixin, BaseViewSet):
    """
    ViewSet for managing stock action reason configurations.
    - List/Read: Available to all authenticated POS staff
    - Create/Update/Delete: Only available to owners
    - System reasons cannot be deleted and have limited editing

    Uses UnifiedStockActionReasonConfigSerializer with fieldsets:
    - list/active_reasons: Returns 'list' fieldset (lightweight for dropdowns)
    - retrieve/detail: Returns 'detail' fieldset (full with validation info)

    Supports ?view=reference|list|detail, ?fields= query params.

    IMPORTANT: Uses custom tenant filtering (system reasons + tenant-specific reasons).
    Does not use TenantScopedQuerysetMixin.
    """

    queryset = StockActionReasonConfig.objects.all().order_by('category', 'name')
    serializer_class = UnifiedStockActionReasonConfigSerializer
    permission_classes = [StockReasonOwnerPermission]
    filterset_fields = ['category', 'is_system_reason', 'is_active']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'category', 'created_at']
    ordering = ['category', 'name']

    def _get_default_view_mode(self):
        """
        Return default view mode based on action.
        List and active_reasons use 'list' fieldset, others use 'detail'.
        """
        if self.action in ['list', 'active_reasons']:
            return 'list'
        elif self.action == 'retrieve':
            return 'detail'
        return 'detail'

    def get_queryset(self):
        """Return global system reasons + tenant-specific custom reasons"""
        from tenant.managers import get_current_tenant
        from django.db.models import Q

        tenant = get_current_tenant()

        # Get both global (tenant=NULL) and tenant-specific reasons
        queryset = StockActionReasonConfig.objects.filter(
            Q(tenant__isnull=True) | Q(tenant=tenant)
        )

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
        Returns a simplified list of active stock action reasons using 'list' fieldset.
        """
        queryset = self.get_queryset().filter(is_active=True)

        # Apply category filter if specified
        category = request.query_params.get('category')
        if category:
            queryset = queryset.filter(category=category)

        serializer = self.get_serializer(queryset, many=True)
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
        from tenant.managers import get_current_tenant

        tenant = get_current_tenant()
        # Ensure new reasons are never marked as system reasons
        serializer.save(tenant=tenant, is_system_reason=False)
    
    def destroy(self, request, *args, **kwargs):
        """Override destroy to prevent deletion of system reasons"""
        instance = self.get_object()
        
        if instance.is_system_reason:
            return Response(
                {'error': 'System reasons cannot be deleted.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return super().destroy(request, *args, **kwargs)
