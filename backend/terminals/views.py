from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.core.exceptions import ValidationError
from django.utils import timezone

from .models import TerminalPairingCode, TerminalRegistration
from .serializers import (
    DeviceAuthorizationSerializer,
    TokenRequestSerializer,
    ApprovalSerializer,
    TerminalPairingCodeSerializer,
    TerminalRegistrationSerializer,
)
from .services import TerminalPairingService
from settings.models import StoreLocation


class TerminalPairingViewSet(viewsets.ViewSet):
    """RFC 8628 device authorization endpoints"""

    @action(
        detail=False,
        methods=['post'],
        url_path='device-authorization',
        permission_classes=[AllowAny]  # Public endpoint
    )
    def device_authorization(self, request):
        """
        Terminal requests pairing codes (no auth required).

        Request: { "client_id": "terminal-client", "device_fingerprint": "uuid" }
        Response: { "device_code", "user_code", "verification_uri", "expires_in", "interval" }
        """
        serializer = DeviceAuthorizationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        pairing = TerminalPairingService.initiate_pairing(
            device_fingerprint=serializer.validated_data['device_fingerprint'],
            ip_address=request.META.get('REMOTE_ADDR')
        )

        # RFC 8628 response
        return Response({
            'device_code': pairing.device_code,
            'user_code': pairing.user_code,
            'verification_uri': f"{request.scheme}://{request.get_host()}/admin/terminals/activate",
            'expires_in': int((pairing.expires_at - timezone.now()).total_seconds()),
            'interval': pairing.interval,
        }, status=status.HTTP_201_CREATED)

    @action(
        detail=False,
        methods=['post'],
        url_path='token',
        permission_classes=[AllowAny]  # Public endpoint
    )
    def token(self, request):
        """
        Terminal polls for token (no auth required).

        Request: {
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            "device_code": "...",
            "client_id": "terminal-client"
        }
        """
        serializer = TokenRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            result, data = TerminalPairingService.poll_for_token(
                serializer.validated_data['device_code']
            )

            if result == 'pending':
                return Response({
                    'error': 'authorization_pending',
                    'error_description': 'The authorization request is still pending'
                }, status=status.HTTP_400_BAD_REQUEST)

            elif result == 'expired':
                return Response({
                    'error': 'expired_token',
                    'error_description': 'The device code has expired'
                }, status=status.HTTP_400_BAD_REQUEST)

            elif result == 'denied':
                return Response({
                    'error': 'access_denied',
                    'error_description': 'The authorization request was denied'
                }, status=status.HTTP_400_BAD_REQUEST)

            elif result == 'approved':
                return Response(data, status=status.HTTP_200_OK)

        except ValidationError as e:
            return Response({
                'error': 'invalid_request',
                'error_description': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)

    @action(
        detail=False,
        methods=['get'],
        url_path='verify',
        permission_classes=[IsAuthenticated]
    )
    def verify(self, request):
        """
        Admin looks up pairing by user code.

        Query: ?user_code=ABCD-1234
        """
        user_code = request.query_params.get('user_code', '').upper()

        try:
            pairing = TerminalPairingCode.objects.get(
                user_code=user_code,
                status='pending'
            )

            if timezone.now() > pairing.expires_at:
                pairing.status = 'expired'
                pairing.save()
                return Response({
                    'error': 'Code expired'
                }, status=status.HTTP_404_NOT_FOUND)

            return Response({
                'user_code': pairing.user_code,
                'device_fingerprint': pairing.device_fingerprint,
                'expires_in': int((pairing.expires_at - timezone.now()).total_seconds()),
                'created_at': pairing.created_at,
            })

        except TerminalPairingCode.DoesNotExist:
            return Response({
                'error': 'Invalid code'
            }, status=status.HTTP_404_NOT_FOUND)

    @action(
        detail=False,
        methods=['post'],
        url_path='approve',
        permission_classes=[IsAuthenticated]
    )
    def approve(self, request):
        """
        Admin approves pairing.

        Request: {
            "user_code": "ABCD-1234",
            "location_id": 5,
            "nickname": "Front Counter"
        }
        """
        # Check permissions
        if request.user.role not in ['manager', 'admin', 'owner']:
            return Response({
                'error': 'Insufficient permissions'
            }, status=status.HTTP_403_FORBIDDEN)

        serializer = ApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            # IMPORTANT: Validate location belongs to admin's tenant
            location = StoreLocation.objects.get(
                id=serializer.validated_data['location_id'],
                tenant=request.tenant  # Tenant from middleware
            )
        except StoreLocation.DoesNotExist:
            return Response({
                'error': 'Location not found'
            }, status=status.HTTP_404_NOT_FOUND)

        try:
            pairing = TerminalPairingService.approve_pairing(
                user_code=serializer.validated_data['user_code'],
                admin_user=request.user,
                location=location,
                nickname=serializer.validated_data.get('nickname', '')
            )

            return Response({
                'message': 'Terminal approved',
                'user_code': pairing.user_code,
                'location': location.name,
            })

        except ValidationError as e:
            return Response({
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)

    @action(
        detail=False,
        methods=['post'],
        url_path='deny',
        permission_classes=[IsAuthenticated]
    )
    def deny(self, request):
        """Admin denies pairing"""
        if request.user.role not in ['manager', 'admin', 'owner']:
            return Response({
                'error': 'Insufficient permissions'
            }, status=status.HTTP_403_FORBIDDEN)

        user_code = request.data.get('user_code', '').upper()

        try:
            TerminalPairingService.deny_pairing(user_code, request.user)
            return Response({'message': 'Terminal pairing denied'})
        except ValidationError as e:
            return Response({
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)

    @action(
        detail=False,
        methods=['get'],
        url_path='pending-pairings',
        permission_classes=[IsAuthenticated]
    )
    def pending_pairings(self, request):
        """List pending pairing requests"""
        # IMPORTANT: Use all_objects (pairings don't have tenant until approved)
        pairings = TerminalPairingCode.objects.filter(
            status='pending',
            expires_at__gt=timezone.now()
        ).order_by('-created_at')

        return Response({
            'results': [{
                'user_code': p.user_code,
                'device_fingerprint': p.device_fingerprint,
                'expires_in': int((p.expires_at - timezone.now()).total_seconds()),
                'created_at': p.created_at,
            } for p in pairings]
        })


class TerminalRegistrationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing terminal registrations.
    Read-only for now - terminals are created via pairing flow.
    """
    queryset = TerminalRegistration.objects.select_related('tenant', 'store_location', 'pairing_code')
    serializer_class = TerminalRegistrationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Filter by tenant from request"""
        if hasattr(self.request, 'tenant'):
            return self.queryset.filter(tenant=self.request.tenant)
        return self.queryset.none()
