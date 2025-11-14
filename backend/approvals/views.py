from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.core.exceptions import ValidationError
from core_backend.base.viewsets import BaseViewSet
from core_backend.base.mixins import TenantScopedQuerysetMixin, FieldsetQueryParamsMixin
from users.permissions import IsManagerOrHigher
import logging

from .models import ManagerApprovalRequest, ApprovalPolicy
from .serializers import (
    UnifiedManagerApprovalRequestSerializer,
    ManagerApprovalRequestCreateSerializer,
    UnifiedApprovalPolicySerializer,
    ApprovalPolicyUpdateSerializer,
    ApproveRequestSerializer,
    DenyRequestSerializer,
    ApprovalActionResponseSerializer,
)
from .services import ManagerApprovalService
from .filters import ManagerApprovalRequestFilter

logger = logging.getLogger(__name__)


class ManagerApprovalRequestViewSet(
    TenantScopedQuerysetMixin,
    FieldsetQueryParamsMixin,
    BaseViewSet
):
    """
    ViewSet for managing approval requests.

    Endpoints:
    - GET /api/approvals/requests/ - List approval requests (with filtering)
    - POST /api/approvals/requests/ - Create approval request (cashiers)
    - GET /api/approvals/requests/<id>/ - Retrieve approval request detail
    - POST /api/approvals/requests/<id>/approve/ - Approve request (managers)
    - POST /api/approvals/requests/<id>/deny/ - Deny request (managers)

    Query params:
    - ?view=list|detail|queue (fieldset selection)
    - ?fields=id,status,action_type (dynamic field filtering)
    - ?expand=initiator,approver,order (relationship expansion)
    - ?status=PENDING (filter by status)
    - ?action_type=DISCOUNT (filter by action type)
    - ?store_location=<uuid> (filter by location)
    - ?is_actionable=true (filter pending & non-expired)
    """

    queryset = ManagerApprovalRequest.objects.all()
    serializer_class = UnifiedManagerApprovalRequestSerializer
    filterset_class = ManagerApprovalRequestFilter
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        """Select appropriate serializer based on action"""
        if self.action == 'create':
            return ManagerApprovalRequestCreateSerializer
        elif self.action in ['approve', 'deny']:
            # These actions have their own input serializers
            # Handled in the action methods
            return UnifiedManagerApprovalRequestSerializer
        return self.serializer_class

    def create(self, request, *args, **kwargs):
        """
        Create a new approval request.

        This endpoint validates the input and delegates to ManagerApprovalService.
        """
        serializer = ManagerApprovalRequestCreateSerializer(
            data=request.data,
            context=self.get_serializer_context()
        )
        serializer.is_valid(raise_exception=True)

        # Extract validated data
        validated_data = serializer.validated_data

        # Get store_location from request context
        # Assumes StoreLocationMiddleware sets request.store_location
        store_location = getattr(request, 'store_location', None)
        if not store_location:
            return Response(
                {'error': 'Store location context is required. Include X-Store-Location header.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if approvals are enabled for this location
        if not store_location.manager_approvals_enabled:
            return Response(
                {
                    'error': f'Manager approvals are not enabled for location: {store_location.name}',
                    'detail': 'Please enable manager approvals in store settings.'
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Prepare context for service
        context = {
            'order': validated_data.get('order'),
            'order_item': validated_data.get('order_item'),
            'discount': validated_data.get('discount'),
            'related_object_label': validated_data.get('related_object_label', ''),
            'payload': validated_data.get('payload', {}),
            'reason': validated_data.get('reason', ''),
            'threshold_value': validated_data.get('threshold_value'),
        }

        try:
            # Create approval request via service
            approval_request = ManagerApprovalService.request_approval(
                action_type=validated_data['action_type'],
                initiator=request.user,
                store_location=store_location,
                context=context,
            )

            # Serialize and return
            output_serializer = UnifiedManagerApprovalRequestSerializer(
                approval_request,
                context=self.get_serializer_context()
            )

            return Response(
                output_serializer.data,
                status=status.HTTP_201_CREATED
            )

        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Error creating approval request: {e}", exc_info=True)
            return Response(
                {'error': 'An error occurred while creating the approval request.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def approve(self, request, pk=None):
        """
        Approve a pending approval request.

        Requires:
        - Valid manager username and PIN in request body
        - Request must be in PENDING status and not expired

        Request body:
        {
            "username": "manager_username",
            "pin": "1234"
        }

        Returns:
        - 200: Approval successful (with updated request data)
        - 400: Validation error (wrong PIN, expired, invalid user, etc.)
        - 401: Not authenticated
        - 404: Request not found
        """
        # Validate input
        input_serializer = ApproveRequestSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)

        try:
            # Look up the manager user by username
            from users.models import User
            try:
                approver = User.objects.get(
                    username=input_serializer.validated_data['username'],
                    tenant=request.tenant
                )
            except User.DoesNotExist:
                return Response(
                    {'error': 'Manager user not found'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Approve via service
            result = ManagerApprovalService.approve_request(
                request_id=str(pk),
                approver=approver,
                pin=input_serializer.validated_data['pin'],
            )

            # Serialize response
            response_serializer = ApprovalActionResponseSerializer(result)
            return Response(
                response_serializer.data,
                status=status.HTTP_200_OK
            )

        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Error approving request {pk}: {e}", exc_info=True)
            return Response(
                {'error': 'An error occurred while approving the request.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def deny(self, request, pk=None):
        """
        Deny a pending approval request.

        Requires:
        - Valid manager username and PIN in request body
        - Request must be in PENDING status

        Request body:
        {
            "username": "manager_username",
            "pin": "1234",
            "reason": "Optional denial reason"
        }

        Returns:
        - 200: Denial successful (with updated request data)
        - 400: Validation error (wrong PIN, invalid user, already resolved, etc.)
        - 401: Not authenticated
        - 404: Request not found
        """
        # Validate input
        input_serializer = DenyRequestSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)

        try:
            # Look up the manager user by username
            from users.models import User
            try:
                approver = User.objects.get(
                    username=input_serializer.validated_data['username'],
                    tenant=request.tenant
                )
            except User.DoesNotExist:
                return Response(
                    {'error': 'Manager user not found'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Deny via service
            result = ManagerApprovalService.deny_request(
                request_id=str(pk),
                approver=approver,
                pin=input_serializer.validated_data['pin'],
                reason=input_serializer.validated_data.get('reason', ''),
            )

            # Serialize response
            response_serializer = ApprovalActionResponseSerializer(result)
            return Response(
                response_serializer.data,
                status=status.HTTP_200_OK
            )

        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Error denying request {pk}: {e}", exc_info=True)
            return Response(
                {'error': 'An error occurred while denying the request.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ApprovalPolicyViewSet(
    TenantScopedQuerysetMixin,
    FieldsetQueryParamsMixin,
    BaseViewSet
):
    """
    ViewSet for managing approval policies.

    Endpoints:
    - GET /api/approvals/policies/ - List policies (typically one per location)
    - GET /api/approvals/policies/<id>/ - Retrieve policy detail
    - PATCH /api/approvals/policies/<id>/ - Update policy thresholds

    Note: Policies are auto-created when StoreLocations are created.
    This endpoint is primarily for updating thresholds.
    """

    queryset = ApprovalPolicy.objects.all()
    serializer_class = UnifiedApprovalPolicySerializer
    permission_classes = [IsAuthenticated, IsManagerOrHigher]

    def get_serializer_class(self):
        """Select appropriate serializer based on action"""
        if self.action in ['update', 'partial_update']:
            return ApprovalPolicyUpdateSerializer
        return self.serializer_class

    def destroy(self, request, *args, **kwargs):
        """
        Prevent deletion of policies.

        Policies should not be deleted - they're tied to store locations.
        To disable approvals, set manager_approvals_enabled=False on StoreLocation.
        """
        return Response(
            {
                'error': 'Approval policies cannot be deleted.',
                'detail': 'To disable approvals, set manager_approvals_enabled=False on the store location.'
            },
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )
