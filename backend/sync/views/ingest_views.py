"""
Offline ingest views.

These endpoints accept payloads from terminals that were created offline
and sync them to the backend.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status as http_status
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
import logging

from sync.authentication import DeviceSignatureAuthentication
from sync.permissions import IsAuthenticatedTerminal
from sync.serializers import (
    OfflineOrderSerializer,
    OfflineInventoryIngestSerializer,
    OfflineApprovalsIngestSerializer,
    OfflineOrderIngestResponseSerializer,
    TerminalHeartbeatSerializer,
    TerminalHeartbeatResponseSerializer,
)
from sync.services import (
    OfflineOrderIngestService,
    OfflineInventoryIngestService,
    OfflineApprovalsIngestService,
)
from terminals.models import TerminalRegistration

logger = logging.getLogger(__name__)


def _clear_parked_status(terminal):
    """
    Clear parked status when terminal shows activity.
    Called by ingest views to unpark terminal on any sync request.
    """
    if terminal.parked_at:
        logger.debug(f"Terminal {terminal.device_id} unparked via sync activity")
        terminal.parked_at = None
        terminal.save(update_fields=['parked_at'])


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

        # Clear parked status - terminal is active
        _clear_parked_status(terminal)

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

        # Clear parked status - terminal is active
        _clear_parked_status(terminal)

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

        # Clear parked status - terminal is active
        _clear_parked_status(terminal)

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


class TerminalHeartbeatView(APIView):
    """
    Terminal heartbeat endpoint.

    POST /api/sync/heartbeat/

    Terminals send periodic heartbeats to report their status.
    This allows the backend to:
    - Track terminal health and connectivity
    - Monitor pending sync queues
    - Track offline exposure
    - Trigger alerts for problematic terminals

    OFFLINE DETECTION NOTE:
    Terminals cannot send heartbeats while offline (no network).
    To detect offline terminals, use a stale-heartbeat check:
    - If last_heartbeat_at is older than 2-3 heartbeat intervals (~2-3 min),
      consider the terminal offline even if sync_status says 'online'.
    - The offline_since timestamp is set when terminal comes back online
      and reports it was offline (client-side tracking).
    """

    authentication_classes = [DeviceSignatureAuthentication]
    permission_classes = [IsAuthenticatedTerminal]

    def post(self, request):
        terminal = request.auth

        # Validate payload
        serializer = TerminalHeartbeatSerializer(data=request.data)
        if not serializer.is_valid():
            logger.warning(
                f"Invalid heartbeat from {terminal.device_id}: {serializer.errors}"
            )
            return Response(
                {
                    'status': 'ERROR',
                    'server_timestamp': timezone.now(),
                    'message': str(serializer.errors)
                },
                status=http_status.HTTP_400_BAD_REQUEST
            )

        data = serializer.validated_data
        now = timezone.now()

        # Determine sync status
        if not data['is_online']:
            sync_status = 'offline'
        elif data['is_syncing'] or data['is_flushing']:
            sync_status = 'syncing'
        elif data['pending_orders'] > 0 or data['failed_operations'] > 0:
            sync_status = 'error'
        else:
            sync_status = 'online'

        # Update terminal status
        try:
            terminal.last_heartbeat_at = now
            terminal.sync_status = sync_status
            terminal.pending_orders_count = data['pending_orders']
            terminal.pending_operations_count = data['pending_operations']
            terminal.exposure_amount = data['exposure_amount']

            # Clear parked status - terminal is active again
            if terminal.parked_at:
                logger.debug(f"Terminal {terminal.device_id} unparked via heartbeat")
            terminal.parked_at = None

            # Track offline_since
            if not data['is_online']:
                if not terminal.offline_since:
                    terminal.offline_since = data.get('offline_since') or now
            else:
                terminal.offline_since = None

            # Update last_sync_success if provided
            if data.get('last_sync_success'):
                terminal.last_sync_success_at = data['last_sync_success']

            # Update last_flush_success if provided
            if data.get('last_flush_success'):
                terminal.last_flush_success_at = data['last_flush_success']

            # Reset offline alert flag on heartbeat (terminal is back online)
            terminal.offline_alert_sent_at = None

            terminal.save(update_fields=[
                'last_heartbeat_at',
                'sync_status',
                'pending_orders_count',
                'pending_operations_count',
                'exposure_amount',
                'parked_at',
                'offline_since',
                'last_sync_success_at',
                'last_flush_success_at',
                'offline_alert_sent_at',
                'last_seen',  # auto_now field
            ])

            logger.debug(
                f"Heartbeat from {terminal.device_id}: "
                f"status={sync_status}, pending={data['pending_orders']}, "
                f"exposure={data['exposure_amount']}"
            )

        except Exception as e:
            logger.error(f"Failed to update terminal status: {e}")
            return Response(
                {
                    'status': 'ERROR',
                    'server_timestamp': now,
                    'message': 'Failed to update terminal status'
                },
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # Build response
        response_data = {
            'status': 'OK',
            'server_timestamp': now,
            'force_sync': False,
            'force_flush': False,
            'message': ''
        }

        # Check if we should instruct terminal to flush
        # (e.g., if it has pending orders and is online)
        if data['is_online'] and data['pending_orders'] > 0:
            response_data['force_flush'] = True
            response_data['message'] = 'Pending orders detected, please flush'

        return Response(response_data, status=http_status.HTTP_200_OK)


@method_decorator(csrf_exempt, name='dispatch')
class TerminalParkView(APIView):
    """
    Park/shutdown endpoint for terminals.

    POST /api/sync/park/

    Called when a terminal app is intentionally shut down. Marks the terminal
    as "parked" to suppress offline alerts until it comes back online.

    The parked status is cleared automatically when:
    - Terminal sends a heartbeat
    - Terminal sends any sync/ingest request
    - A new business day starts (parked_at is checked against today)

    Note: CSRF exempt because this endpoint is called from Electron's main process
    during app shutdown, which doesn't have access to session cookies or CSRF tokens.
    Authentication is handled via DeviceSignatureAuthentication (HMAC).
    """

    authentication_classes = [DeviceSignatureAuthentication]
    permission_classes = [IsAuthenticatedTerminal]

    def post(self, request):
        terminal = request.auth
        now = timezone.now()

        try:
            terminal.parked_at = now
            terminal.save(update_fields=['parked_at'])

            logger.info(
                f"Terminal {terminal.device_id} parked at {now.isoformat()}"
            )

            return Response(
                {
                    'status': 'parked',
                    'parked_at': now,
                    'message': 'Terminal marked as parked. Offline alerts suppressed.'
                },
                status=http_status.HTTP_200_OK
            )

        except Exception as e:
            logger.error(f"Failed to park terminal {terminal.device_id}: {e}")
            return Response(
                {
                    'status': 'error',
                    'message': 'Failed to park terminal'
                },
                status=http_status.HTTP_500_INTERNAL_SERVER_ERROR
            )
