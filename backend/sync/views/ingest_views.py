"""
Offline ingest views.

These endpoints accept payloads from terminals that were created offline
and sync them to the backend.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status as http_status
import logging

from sync.authentication import DeviceSignatureAuthentication
from sync.permissions import IsAuthenticatedTerminal
from sync.serializers import (
    OfflineOrderSerializer,
    OfflineInventoryIngestSerializer,
    OfflineApprovalsIngestSerializer,
    OfflineOrderIngestResponseSerializer,
)
from sync.services import (
    OfflineOrderIngestService,
    OfflineInventoryIngestService,
    OfflineApprovalsIngestService,
)

logger = logging.getLogger(__name__)


class OfflineOrderIngestView(APIView):
    """
    Ingest offline orders.

    POST /api/sync/offline-orders/

    Accepts order + payments + inventory deltas created while offline.
    Creates Order, Payment, and InventoryStock records.

    Returns success/conflict/error status.
    """

    authentication_classes = [DeviceSignatureAuthentication]
    permission_classes = [IsAuthenticatedTerminal]

    def post(self, request):
        terminal = request.auth

        logger.info(
            f"Offline order ingest request from terminal {terminal.device_id}"
        )

        # Validate payload
        serializer = OfflineOrderSerializer(data=request.data)
        if not serializer.is_valid():
            logger.error(
                f"Invalid offline order payload from {terminal.device_id}: "
                f"{serializer.errors}"
            )
            return Response(
                {
                    'status': 'ERROR',
                    'errors': [str(serializer.errors)]
                },
                status=http_status.HTTP_400_BAD_REQUEST
            )

        # Process order
        result = OfflineOrderIngestService.ingest_order(
            serializer.validated_data,
            terminal
        )

        # Return response
        response_serializer = OfflineOrderIngestResponseSerializer(data=result)
        if response_serializer.is_valid():
            # Determine HTTP status code
            if result['status'] == 'SUCCESS':
                status_code = http_status.HTTP_201_CREATED
            elif result['status'] == 'CONFLICT':
                status_code = http_status.HTTP_409_CONFLICT
            else:  # ERROR
                status_code = http_status.HTTP_500_INTERNAL_SERVER_ERROR

            return Response(response_serializer.validated_data, status=status_code)
        else:
            # Shouldn't happen, but handle it
            logger.error(f"Invalid response data: {response_serializer.errors}")
            return Response(result, status=http_status.HTTP_500_INTERNAL_SERVER_ERROR)


class OfflineInventoryIngestView(APIView):
    """
    Ingest offline inventory deltas.

    POST /api/sync/offline-inventory/

    Accepts batch of inventory stock changes to apply.
    """

    authentication_classes = [DeviceSignatureAuthentication]
    permission_classes = [IsAuthenticatedTerminal]

    def post(self, request):
        terminal = request.auth

        logger.info(
            f"Offline inventory ingest request from terminal {terminal.device_id}"
        )

        # Validate payload
        serializer = OfflineInventoryIngestSerializer(data=request.data)
        if not serializer.is_valid():
            logger.error(
                f"Invalid offline inventory payload from {terminal.device_id}: "
                f"{serializer.errors}"
            )
            return Response(
                {
                    'status': 'ERROR',
                    'errors': [str(serializer.errors)]
                },
                status=http_status.HTTP_400_BAD_REQUEST
            )

        # Process inventory deltas
        result = OfflineInventoryIngestService.ingest_inventory_deltas(
            serializer.validated_data,
            terminal
        )

        # Return response
        if result['status'] == 'SUCCESS':
            return Response(result, status=http_status.HTTP_200_OK)
        else:
            return Response(result, status=http_status.HTTP_500_INTERNAL_SERVER_ERROR)


class OfflineApprovalsIngestView(APIView):
    """
    Ingest offline manager approvals.

    POST /api/sync/offline-approvals/

    Accepts batch of approvals performed offline.
    """

    authentication_classes = [DeviceSignatureAuthentication]
    permission_classes = [IsAuthenticatedTerminal]

    def post(self, request):
        terminal = request.auth

        logger.info(
            f"Offline approvals ingest request from terminal {terminal.device_id}"
        )

        # Validate payload
        serializer = OfflineApprovalsIngestSerializer(data=request.data)
        if not serializer.is_valid():
            logger.error(
                f"Invalid offline approvals payload from {terminal.device_id}: "
                f"{serializer.errors}"
            )
            return Response(
                {
                    'status': 'ERROR',
                    'errors': [str(serializer.errors)]
                },
                status=http_status.HTTP_400_BAD_REQUEST
            )

        # Process approvals
        result = OfflineApprovalsIngestService.ingest_approvals(
            serializer.validated_data,
            terminal
        )

        # Return response
        if result['status'] == 'SUCCESS':
            return Response(result, status=http_status.HTTP_200_OK)
        else:
            return Response(result, status=http_status.HTTP_500_INTERNAL_SERVER_ERROR)
