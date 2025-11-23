"""
Dataset sync views for offline mode.

These endpoints provide incremental sync of datasets needed for POS operations:
- Products (catalog)
- Categories
- Discounts
- Inventory
- Settings
- Users

All endpoints:
- Require DeviceSignatureAuthentication
- Use IsAuthenticatedTerminal permission
- Support incremental sync via `since` parameter
- Return data + next_version token + deleted_ids
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from django.db.models import Q
from datetime import datetime, timedelta
from dateutil import parser as date_parser

from sync.authentication import DeviceSignatureAuthentication
from sync.permissions import IsAuthenticatedTerminal
from sync.serializers import (
    SyncProductSerializer,
    SyncCategorySerializer,
    SyncTaxSerializer,
    SyncProductTypeSerializer,
    SyncModifierSetSerializer,
    SyncDiscountSerializer,
    SyncInventoryStockSerializer,
    SyncInventoryLocationSerializer,
    SyncGlobalSettingsSerializer,
    SyncStoreLocationSerializer,
    SyncUserSerializer,
)

from products.models import Product, Category, Tax, ProductType, ModifierSet
from discounts.models import Discount
from inventory.models import InventoryStock, Location
from settings.models import GlobalSettings, StoreLocation
from users.models import User


class BaseSyncView(APIView):
    """
    Base view for dataset sync endpoints.

    Provides common functionality:
    - Authentication via device signatures
    - Incremental sync via `since` parameter
    - Standard response format
    """

    authentication_classes = [DeviceSignatureAuthentication]
    permission_classes = [IsAuthenticatedTerminal]

    # Subclasses must define these
    model = None
    serializer_class = None
    dataset_name = None

    def get_queryset(self, terminal):
        """
        Get base queryset filtered by terminal's tenant.

        Subclasses can override to add location filtering, etc.
        """
        return self.model.objects.filter(tenant=terminal.tenant)

    def parse_since_param(self, since_str):
        """Parse `since` parameter to datetime"""
        if not since_str:
            return None

        try:
            return date_parser.isoparse(since_str)
        except (ValueError, TypeError):
            return None

    def get_deleted_ids(self, queryset, since):
        """
        Get IDs of soft-deleted records since given timestamp.

        Override this if your model uses different soft delete patterns.
        """
        if not since or not hasattr(self.model, 'is_active'):
            return []

        # Include archived records when checking for deletions
        if hasattr(queryset, 'with_archived'):
            queryset = queryset.with_archived()

        # Find records that were active before `since` but are now inactive
        deleted = queryset.filter(
            is_active=False,
            updated_at__gte=since
        ).values_list('id', flat=True)

        return list(deleted)

    def post(self, request):
        """
        POST /api/sync/<dataset>/

        Body params (in addition to device auth fields):
        - since: ISO8601 timestamp for incremental sync
        - limit: Max records to return (default: 1000)

        Device auth fields (required by DeviceSignatureAuthentication):
        - device_id: Terminal device ID
        - nonce: Random nonce
        - created_at: Request timestamp

        Returns:
        {
            "data": [...],
            "next_version": "2025-02-15T14:30:22.123Z",
            "deleted_ids": [...],
            "dataset": "products",
            "synced_at": "2025-02-15T14:30:22.123Z"
        }
        """
        terminal = request.auth  # TerminalRegistration instance
        since_param = request.data.get('since')
        limit = int(request.data.get('limit', 1000))

        # Parse since parameter
        since = self.parse_since_param(since_param)

        # Get base queryset
        queryset = self.get_queryset(terminal)

        # Filter by updated_at if since provided
        if since:
            queryset = queryset.filter(updated_at__gte=since)

        # Only active records (soft delete support)
        if hasattr(self.model, 'is_active'):
            # Get active records for data
            active_records = queryset.filter(is_active=True).order_by('updated_at')[:limit]
            # Get deleted IDs
            deleted_ids = self.get_deleted_ids(self.get_queryset(terminal), since)
        else:
            active_records = queryset.order_by('updated_at')[:limit]
            deleted_ids = []

        # Serialize data
        serializer = self.serializer_class(active_records, many=True)

        # Calculate next_version using latest updated_at across active + archived records
        all_records = self.get_queryset(terminal)
        if hasattr(all_records, 'with_archived'):
            all_records = all_records.with_archived()
        if since:
            all_records = all_records.filter(updated_at__gte=since)

        latest_update = all_records.order_by('-updated_at').values_list('updated_at', flat=True).first()

        if latest_update:
            # Bump by 1 microsecond to avoid re-sending the same records on next sync
            next_version = (latest_update + timedelta(microseconds=1)).isoformat()
        else:
            next_version = (since or timezone.now()).isoformat()

        # Return response
        return Response({
            'data': serializer.data,
            'next_version': next_version,
            'deleted_ids': deleted_ids,
            'dataset': self.dataset_name,
            'synced_at': timezone.now().isoformat(),
        })


class CatalogSyncView(BaseSyncView):
    """
    Sync products (catalog) dataset.

    POST /api/sync/catalog/

    Body params:
    - since: ISO8601 timestamp for incremental sync
    - limit: Max records to return (default: 1000)
    - device_id, nonce, created_at (required for device auth)

    Returns products only. Use separate endpoints for categories, modifiers, etc.
    """

    model = Product
    serializer_class = SyncProductSerializer
    dataset_name = 'products'

    def get_queryset(self, terminal):
        """Include prefetches to avoid N+1 queries"""
        return super().get_queryset(terminal).select_related(
            'category', 'product_type'
        ).prefetch_related(
            'taxes',
            'product_modifier_sets__modifier_set__options'
        )


class CategoriesSyncView(BaseSyncView):
    """
    Sync categories dataset.

    GET /api/sync/categories/?since=2025-02-15T14:30:22.123Z
    """

    model = Category
    serializer_class = SyncCategorySerializer
    dataset_name = 'categories'


class TaxesSyncView(BaseSyncView):
    """
    Sync taxes dataset.

    GET /api/sync/taxes/?since=2025-02-15T14:30:22.123Z
    """

    model = Tax
    serializer_class = SyncTaxSerializer
    dataset_name = 'taxes'


class ProductTypesSyncView(BaseSyncView):
    """
    Sync product types dataset.

    GET /api/sync/product-types/?since=2025-02-15T14:30:22.123Z
    """

    model = ProductType
    serializer_class = SyncProductTypeSerializer
    dataset_name = 'product_types'


class ModifierSetsSyncView(BaseSyncView):
    """
    Sync modifier sets dataset (includes nested options).

    GET /api/sync/modifiers/?since=2025-02-15T14:30:22.123Z
    """

    model = ModifierSet
    serializer_class = SyncModifierSetSerializer
    dataset_name = 'modifier_sets'

    def get_queryset(self, terminal):
        """Include options prefetch"""
        return super().get_queryset(terminal).prefetch_related('options')


class DiscountsSyncView(BaseSyncView):
    """
    Sync discounts dataset.

    GET /api/sync/discounts/?since=2025-02-15T14:30:22.123Z
    """

    model = Discount
    serializer_class = SyncDiscountSerializer
    dataset_name = 'discounts'

    def get_queryset(self, terminal):
        """Include applicable products/categories prefetch"""
        return super().get_queryset(terminal).prefetch_related(
            'applicable_products',
            'applicable_categories'
        )


class InventorySyncView(BaseSyncView):
    """
    Sync inventory stock dataset.

    Filtered by terminal's store location.
    GET /api/sync/inventory/?since=2025-02-15T14:30:22.123Z
    """

    model = InventoryStock
    serializer_class = SyncInventoryStockSerializer
    dataset_name = 'inventory'

    def get_queryset(self, terminal):
        """Filter by terminal's store location"""
        queryset = super().get_queryset(terminal)

        if not terminal.store_location:
            # No location = no inventory
            return queryset.none()

        return queryset.filter(
            store_location=terminal.store_location
        ).select_related('product', 'location')


class SettingsSyncView(APIView):
    """
    Sync settings dataset (global + store location).

    POST /api/sync/settings/

    Body params:
    - device_id, nonce, created_at (required for device auth)

    Returns both global settings and store location settings.
    """

    authentication_classes = [DeviceSignatureAuthentication]
    permission_classes = [IsAuthenticatedTerminal]

    def post(self, request):
        terminal = request.auth
        since_param = request.data.get('since')

        # Parse since parameter
        since = None
        if since_param:
            try:
                since = date_parser.isoparse(since_param)
            except (ValueError, TypeError):
                since = None

        # Get global settings
        global_settings = None
        global_data = None
        try:
            global_settings = GlobalSettings.objects.get(tenant=terminal.tenant)
            # Only include if updated since last sync
            if not since or global_settings.updated_at >= since:
                global_data = SyncGlobalSettingsSerializer(global_settings).data
        except GlobalSettings.DoesNotExist:
            pass

        # Get store location settings
        store_location = terminal.store_location
        location_data = None
        if store_location:
            # Only include if updated since last sync
            if not since or store_location.updated_at >= since:
                location_data = SyncStoreLocationSerializer(store_location).data

        # Calculate next_version from latest updated_at timestamp
        timestamps = []
        if global_settings and hasattr(global_settings, 'updated_at'):
            timestamps.append(global_settings.updated_at)
        if store_location and hasattr(store_location, 'updated_at'):
            timestamps.append(store_location.updated_at)

        if timestamps:
            latest_update = max(timestamps)
            # Bump by 1 microsecond to avoid re-sending on next sync
            next_version = (latest_update + timedelta(microseconds=1)).isoformat()
        else:
            next_version = (since or timezone.now()).isoformat()

        return Response({
            'data': {
                'global_settings': global_data,
                'store_location': location_data,
            },
            'next_version': next_version,
            'deleted_ids': [],  # Settings cannot be deleted (singleton)
            'dataset': 'settings',
            'synced_at': timezone.now().isoformat(),
        })


class UsersSyncView(BaseSyncView):
    """
    Sync users dataset (POS staff only).

    POST /api/sync/users/

    Body params:
    - since: ISO8601 timestamp for incremental sync
    - device_id, nonce, created_at (required for device auth)

    Only returns active POS staff (is_pos_staff=True, is_active=True).
    Includes hashed PINs for offline authentication.
    """

    model = User
    serializer_class = SyncUserSerializer
    dataset_name = 'users'

    def get_queryset(self, terminal):
        """Only POS staff"""
        return super().get_queryset(terminal).filter(
            is_pos_staff=True,
            is_active=True
        )


class InventoryLocationsSyncView(BaseSyncView):
    """
    Sync inventory locations dataset.

    POST /api/sync/inventory-locations/

    Body params:
    - since: ISO8601 timestamp for incremental sync
    - limit: Max records to return (default: 1000)
    - device_id, nonce, created_at (required for device auth)

    Returns location metadata (name, thresholds) needed for POS inventory UI.
    Filtered by terminal's tenant.
    """

    model = Location
    serializer_class = SyncInventoryLocationSerializer
    dataset_name = 'inventory_locations'
