"""
Refund API views.

These views handle refund requests, calculations, and audit log retrieval.
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction, models
from django.shortcuts import get_object_or_404
from decimal import Decimal
import logging

from core_backend.base import BaseViewSet, ReadOnlyBaseViewSet
from core_backend.base.mixins import TenantScopedQuerysetMixin, FieldsetQueryParamsMixin

from .models import RefundItem, RefundAuditLog, ExchangeSession
from .serializers import (
    RefundItemSerializer,
    RefundAuditLogSerializer,
    ExchangeSessionSerializer,
    ItemRefundRequestSerializer,
    MultipleItemsRefundRequestSerializer,
    RefundCalculationResponseSerializer,
    MultipleItemsCalculationResponseSerializer,
    RefundResponseSerializer,
    FullOrderRefundRequestSerializer,
    # Exchange serializers
    InitiateExchangeSerializer,
    CreateNewOrderSerializer,
    CompleteExchangeSerializer,
    CancelExchangeSerializer,
    ExchangeSummarySerializer,
    ExchangeBalanceSerializer,
)
from .services import RefundCalculator, RefundValidator
from orders.models import Order, OrderItem
from payments.models import Payment, PaymentTransaction
from payments.services import PaymentService
from users.permissions import IsAdminOrHigher

logger = logging.getLogger(__name__)


class RefundItemViewSet(TenantScopedQuerysetMixin, FieldsetQueryParamsMixin, ReadOnlyBaseViewSet):
    """
    ViewSet for viewing RefundItem records.
    Read-only - refund items are created via refund processing.
    Supports ?view=, ?fields=, ?expand= query params.
    """
    serializer_class = RefundItemSerializer
    permission_classes = [IsAuthenticated]
    queryset = RefundItem.objects.all()

    def get_queryset(self):
        """Filter by payment or order if provided."""
        queryset = super().get_queryset()  # Already tenant-filtered by TenantScopedQuerysetMixin

        queryset = queryset.select_related(
            'order_item',
            'order_item__product',
            'order_item__order',
            'payment_transaction'
        )

        # Filter by payment
        payment_id = self.request.query_params.get('payment_id')
        if payment_id:
            queryset = queryset.filter(payment_transaction__payment_id=payment_id)

        # Filter by order
        order_id = self.request.query_params.get('order_id')
        if order_id:
            queryset = queryset.filter(order_item__order_id=order_id)

        return queryset.order_by('-created_at')


class RefundAuditLogViewSet(TenantScopedQuerysetMixin, FieldsetQueryParamsMixin, ReadOnlyBaseViewSet):
    """
    ViewSet for viewing RefundAuditLog records.
    Read-only - audit logs are created automatically.
    Supports ?view=, ?fields=, ?expand= query params.
    """
    serializer_class = RefundAuditLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrHigher]
    queryset = RefundAuditLog.objects.all()

    def get_queryset(self):
        """Filter by payment if provided."""
        queryset = super().get_queryset()  # Already tenant-filtered by TenantScopedQuerysetMixin

        queryset = queryset.select_related(
            'payment',
            'payment__order',
            'payment_transaction',
            'initiated_by'
        )

        # Filter by payment
        payment_id = self.request.query_params.get('payment_id')
        if payment_id:
            queryset = queryset.filter(payment_id=payment_id)

        # Filter by order
        order_id = self.request.query_params.get('order_id')
        if order_id:
            queryset = queryset.filter(payment__order_id=order_id)

        return queryset.order_by('-created_at')


class ExchangeSessionViewSet(TenantScopedQuerysetMixin, FieldsetQueryParamsMixin, BaseViewSet):
    """
    ViewSet for managing ExchangeSession records.

    Provides custom actions for exchange workflow:
    - summary: Get comprehensive exchange summary
    - balance: Calculate exchange balance
    - initiate: Start an exchange session
    - add_items: Add replacement items to exchange
    - complete: Finalize the exchange
    - cancel: Cancel the exchange

    Supports ?view=list|detail, ?fields=, ?expand= query params.
    """
    serializer_class = ExchangeSessionSerializer
    permission_classes = [IsAuthenticated]
    queryset = ExchangeSession.objects.all()

    def _get_default_view_mode(self):
        """Return default view mode based on action."""
        if self.action == 'list':
            return 'list'
        elif self.action in ['retrieve', 'summary', 'balance']:
            return 'detail'
        return 'detail'

    def get_queryset(self):
        """Filter by order if provided."""
        queryset = super().get_queryset()  # Already tenant-filtered by TenantScopedQuerysetMixin

        queryset = queryset.select_related(
            'original_order',
            'new_order',
            'original_payment',
            'new_payment',
            'refund_transaction',
            'processed_by'
        )

        # Filter by original order
        original_order_id = self.request.query_params.get('original_order_id')
        if original_order_id:
            queryset = queryset.filter(original_order_id=original_order_id)

        # Filter by new order
        new_order_id = self.request.query_params.get('new_order_id')
        if new_order_id:
            queryset = queryset.filter(new_order_id=new_order_id)

        # Filter by status
        session_status = self.request.query_params.get('session_status')
        if session_status:
            queryset = queryset.filter(session_status=session_status)

        return queryset.order_by('-created_at')

    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        """
        Get comprehensive summary of an exchange session.

        GET /refunds/exchanges/{id}/summary/
        """
        from .services import ExchangeService

        exchange_session = self.get_object()

        try:
            summary = ExchangeService.get_exchange_summary(exchange_session)
            serializer = ExchangeSummarySerializer(summary)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Exchange summary error: {e}")
            return Response(
                {'error': f'Failed to retrieve exchange summary: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['get'])
    def balance(self, request, pk=None):
        """
        Calculate the balance for an exchange session.

        GET /refunds/exchanges/{id}/balance/
        """
        from .services import ExchangeService

        exchange_session = self.get_object()

        try:
            balance_info = ExchangeService.calculate_balance(exchange_session)
            serializer = ExchangeBalanceSerializer(balance_info)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Exchange balance calculation error: {e}")
            return Response(
                {'error': f'Failed to calculate balance: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['post'])
    @transaction.atomic
    def initiate(self, request):
        """
        Initiate a new exchange session.

        POST /refunds/exchanges/initiate/
        {
            "original_order_id": "uuid",
            "items_to_return": [
                {"order_item_id": "uuid", "quantity": 2}
            ],
            "reason": "Exchange reason"
        }
        """
        from .services import ExchangeService

        serializer = InitiateExchangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        original_order_id = serializer.validated_data['original_order_id']
        items_to_return = serializer.validated_data['items_to_return']
        reason = serializer.validated_data.get('reason', '')

        # Build items list for ExchangeService
        items_with_quantities = [
            (item['order_item'], item['quantity']) for item in items_to_return
        ]

        try:
            # Get the order
            original_order = get_object_or_404(Order, id=original_order_id)

            # Initiate exchange
            exchange_session = ExchangeService.initiate_exchange(
                original_order=original_order,
                items_to_return=items_with_quantities,
                reason=reason,
                processed_by=request.user
            )

            return Response({
                'success': True,
                'message': 'Exchange initiated successfully',
                'exchange_session_id': str(exchange_session.id),
                'session_status': exchange_session.session_status,
                'refund_amount': str(exchange_session.refund_amount),
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"Exchange initiation error: {e}")
            return Response(
                {'error': f'Exchange initiation failed: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def add_items(self, request, pk=None):
        """
        Add replacement items to an exchange session.

        POST /refunds/exchanges/{id}/add_items/
        {
            "new_items": [
                {"product_id": "uuid", "quantity": 2, "notes": "Optional"}
            ]
        }
        """
        from .services import ExchangeService
        from products.models import Product

        exchange_session = self.get_object()

        # Validate new_items
        new_items = request.data.get('new_items', [])
        if not new_items:
            return Response(
                {'error': 'At least one new item must be provided'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Build items list for ExchangeService
            items_with_details = []
            for item in new_items:
                product = get_object_or_404(Product, id=item['product_id'])
                items_with_details.append({
                    'product': product,
                    'quantity': item['quantity'],
                    'notes': item.get('notes', '')
                })

            # Create new order
            exchange_session = ExchangeService.create_new_order(
                exchange_session=exchange_session,
                new_items=items_with_details
            )

            # Calculate balance
            balance_info = ExchangeService.calculate_balance(exchange_session)

            return Response({
                'success': True,
                'message': 'New order created for exchange',
                'exchange_session_id': str(exchange_session.id),
                'new_order_id': str(exchange_session.new_order.id),
                'new_order_number': exchange_session.new_order.order_number,
                'new_order_amount': str(exchange_session.new_order_amount),
                'balance': str(balance_info['balance']),
                'customer_owes': balance_info['customer_owes'],
                'customer_receives': balance_info['customer_receives'],
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"Exchange new order creation error: {e}")
            return Response(
                {'error': f'New order creation failed: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def complete(self, request, pk=None):
        """
        Complete an exchange session.

        POST /refunds/exchanges/{id}/complete/
        {
            "payment_method": "CARD_ONLINE",  // if customer owes
            "payment_transaction_id": "uuid",  // if customer owes
            "refund_method": "ORIGINAL_PAYMENT"  // if customer receives
        }
        """
        from .services import ExchangeService

        exchange_session = self.get_object()

        payment_method = request.data.get('payment_method')
        payment_transaction_id = request.data.get('payment_transaction_id')
        refund_method = request.data.get('refund_method')

        try:
            # Complete exchange
            exchange_session = ExchangeService.complete_exchange(
                exchange_session=exchange_session,
                payment_method=payment_method,
                payment_transaction_id=payment_transaction_id,
                refund_method=refund_method
            )

            response_data = {
                'success': True,
                'message': 'Exchange completed successfully',
                'exchange_session_id': str(exchange_session.id),
                'final_balance': str(exchange_session.balance_due or Decimal('0.00')),
            }

            # Add payment transaction ID if applicable
            if exchange_session.new_payment:
                latest_transaction = exchange_session.new_payment.transactions.order_by('-created_at').first()
                if latest_transaction:
                    response_data['payment_transaction_id'] = str(latest_transaction.id)

            return Response(response_data, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Exchange completion error: {e}")
            return Response(
                {'error': f'Exchange completion failed: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def cancel(self, request, pk=None):
        """
        Cancel an exchange session.

        POST /refunds/exchanges/{id}/cancel/
        {
            "reason": "Customer changed mind"
        }
        """
        from .services import ExchangeService

        exchange_session = self.get_object()
        reason = request.data.get('reason', '')

        try:
            # Cancel exchange
            exchange_session = ExchangeService.cancel_exchange(
                exchange_session=exchange_session,
                reason=reason
            )

            return Response({
                'success': True,
                'message': 'Exchange cancelled successfully',
                'exchange_session_id': str(exchange_session.id),
                'cancelled_at': exchange_session.completed_at.isoformat() if exchange_session.completed_at else None,
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Exchange cancellation error: {e}")
            return Response(
                {'error': f'Exchange cancellation failed: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def calculate_item_refund(request):
    """
    Calculate refund amounts for one or more items without processing it.

    Handles both single item and multiple items in a single endpoint.

    POST /refunds/calculate-item/

    Single item format:
    {
        "order_item_id": 123,
        "quantity": 2,
        "reason": "Customer request"
    }

    Multiple items format:
    {
        "items": [
            {"order_item_id": 123, "quantity": 2},
            {"order_item_id": 456, "quantity": 1}
        ],
        "reason": "Customer request"
    }

    Returns:
    {
        "can_refund": true,
        "refund_breakdown": {
            "subtotal": "10.00",
            "tax": "0.90",
            "tip": "1.50",
            "surcharge": "0.30",
            "total": "12.70"
        },
        "validation_errors": []
    }
    """
    # Check if this is single item or multiple items request
    if 'items' in request.data:
        # Multiple items request
        serializer = MultipleItemsRefundRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        items = serializer.validated_data['items']

        # Get payment from first item (all items should be from same order)
        first_order_item = items[0]['order_item']
        payment = first_order_item.order.payment_details

        # Validate payment
        is_valid, error_message = RefundValidator.validate_payment_refund(payment)
        if not is_valid:
            return Response({
                'can_refund': False,
                'validation_errors': [error_message],
                'refund_breakdown': None
            })

        # Validate each item
        validation_errors = []
        for item in items:
            is_valid, error_message = RefundValidator.validate_item_refund(
                item['order_item'],
                item['quantity']
            )
            if not is_valid:
                validation_errors.append(error_message)

        if validation_errors:
            return Response({
                'can_refund': False,
                'validation_errors': validation_errors,
                'refund_breakdown': None
            })

        # Build items list for calculator
        items_with_quantities = [
            (item['order_item'], item['quantity']) for item in items
        ]

        # Calculate refund
        calculator = RefundCalculator(payment)
        try:
            refund_calculation = calculator.calculate_multiple_items_refund(items_with_quantities)

            # Extract totals from the multi-item calculation
            return Response({
                'can_refund': True,
                'refund_breakdown': {
                    'subtotal': refund_calculation['total_subtotal'],
                    'tax': refund_calculation['total_tax'],
                    'tip': refund_calculation['total_tip'],
                    'surcharge': refund_calculation['total_surcharge'],
                    'total': refund_calculation['grand_total']
                },
                'validation_errors': []
            })
        except Exception as e:
            logger.error(f"Multiple items refund calculation error: {e}")
            return Response({
                'can_refund': False,
                'validation_errors': [str(e)],
                'refund_breakdown': None
            })
    else:
        # Single item request
        serializer = ItemRefundRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        order_item = serializer.validated_data['order_item']
        quantity = serializer.validated_data['quantity']

        # Validate the refund
        is_valid, error_message = RefundValidator.validate_item_refund(order_item, quantity)
        if not is_valid:
            return Response({
                'can_refund': False,
                'validation_errors': [error_message],
                'refund_breakdown': None
            })

        # Get payment and validate
        payment = order_item.order.payment_details
        is_valid, error_message = RefundValidator.validate_payment_refund(payment)
        if not is_valid:
            return Response({
                'can_refund': False,
                'validation_errors': [error_message],
                'refund_breakdown': None
            })

        # Calculate refund
        calculator = RefundCalculator(payment)
        try:
            refund_calculation = calculator.calculate_item_refund(order_item, quantity)

            # Get quantity available for refund
            total_refunded = RefundItem.objects.filter(
                order_item=order_item
            ).aggregate(
                total=models.Sum('quantity_refunded')
            )['total'] or 0
            quantity_available = order_item.quantity - total_refunded

            response_serializer = RefundCalculationResponseSerializer(refund_calculation)
            return Response({
                'can_refund': True,
                'quantity_available_for_refund': quantity_available,
                'quantity_to_refund': quantity,
                'refund_breakdown': response_serializer.data,
                'validation_errors': []
            })
        except Exception as e:
            logger.error(f"Refund calculation error: {e}")
            return Response({
                'can_refund': False,
                'validation_errors': [str(e)],
                'refund_breakdown': None
            })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@transaction.atomic
def process_item_refund(request):
    """
    Process a refund for one or more items.

    Handles both single item and multiple items in a single endpoint.

    POST /refunds/process-item/

    Single item format:
    {
        "order_item_id": 123,
        "quantity": 2,
        "reason": "Customer not satisfied"
    }

    Multiple items format:
    {
        "items": [
            {"order_item_id": 123, "quantity": 2},
            {"order_item_id": 456, "quantity": 1}
        ],
        "reason": "Customer not satisfied"
    }

    Returns:
    {
        "success": true,
        "message": "Refund processed successfully",
        "refund_transaction_id": "uuid",
        "refund_amount": "12.70",
        "refund_items": [...],
        "audit_log_id": "uuid"
    }
    """
    # Check if this is single item or multiple items request
    transaction_id = None
    if 'items' in request.data:
        # Multiple items request
        serializer = MultipleItemsRefundRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        items = serializer.validated_data['items']
        reason = serializer.validated_data.get('reason', '')
        transaction_id = serializer.validated_data.get('transaction_id')

        # Get payment from first item (all items should be from same order)
        first_order_item = items[0]['order_item']
        payment = first_order_item.order.payment_details

        # Validate payment
        is_valid, error_message = RefundValidator.validate_payment_refund(payment)
        if not is_valid:
            return Response(
                {'error': error_message},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate each item
        for item in items:
            is_valid, error_message = RefundValidator.validate_item_refund(
                item['order_item'],
                item['quantity']
            )
            if not is_valid:
                return Response(
                    {'error': error_message},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Build items list for payment service
        items_with_quantities = [
            (item['order_item'], item['quantity']) for item in items
        ]
    else:
        # Single item request
        serializer = ItemRefundRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        order_item = serializer.validated_data['order_item']
        quantity = serializer.validated_data['quantity']
        reason = serializer.validated_data.get('reason', '')

        # Validate the refund
        is_valid, error_message = RefundValidator.validate_item_refund(order_item, quantity)
        if not is_valid:
            return Response(
                {'error': error_message},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get payment and validate
        payment = order_item.order.payment_details
        is_valid, error_message = RefundValidator.validate_payment_refund(payment)
        if not is_valid:
            return Response(
                {'error': error_message},
                status=status.HTTP_400_BAD_REQUEST
            )

        items_with_quantities = [(order_item, quantity)]

    # Process the refund using PaymentService
    payment_service = PaymentService(payment)
    try:
        result = payment_service.process_item_level_refund(
            order_items_with_quantities=items_with_quantities,
            reason=reason,
            transaction_id=transaction_id
        )

        # Update audit log with request metadata
        audit_log = result['audit_log']
        audit_log.initiated_by = request.user
        audit_log.device_info = {
            'ip': request.META.get('REMOTE_ADDR'),
            'user_agent': request.META.get('HTTP_USER_AGENT'),
        }
        audit_log.source = 'API'
        audit_log.save(update_fields=['initiated_by', 'device_info', 'source'])

        # Return response
        return Response({
            'success': True,
            'message': 'Refund processed successfully',
            'refund_transaction_id': str(result['refund_transaction'].id),
            'refund_amount': str(result['total_refunded']),
            'refund_items': RefundItemSerializer(result['refund_items'], many=True).data,
            'audit_log_id': str(audit_log.id),
        }, status=status.HTTP_201_CREATED)

    except Exception as e:
        logger.error(f"Refund processing error: {e}")
        return Response(
            {'error': f'Refund processing failed: {str(e)}'},
            status=status.HTTP_400_BAD_REQUEST
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@transaction.atomic
def process_full_order_refund(request):
    """
    Process a full refund for an entire order.

    POST /refunds/process-full-order/
    {
        "payment_id": "uuid",
        "reason": "Order cancelled"
    }
    """
    serializer = FullOrderRefundRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    payment_id = serializer.validated_data['payment_id']
    reason = serializer.validated_data.get('reason', '')
    transaction_id = serializer.validated_data.get('transaction_id')

    # Get payment
    payment = get_object_or_404(Payment, id=payment_id)

    # Validate payment
    is_valid, error_message = RefundValidator.validate_payment_refund(payment)
    if not is_valid:
        return Response(
            {'error': error_message},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Process the full order refund using PaymentService
    payment_service = PaymentService(payment)
    try:
        result = payment_service.process_full_order_refund(
            reason=reason,
            transaction_id=transaction_id
        )

        # Update audit log with request metadata
        audit_log = result['audit_log']
        audit_log.initiated_by = request.user
        audit_log.device_info = {
            'ip': request.META.get('REMOTE_ADDR'),
            'user_agent': request.META.get('HTTP_USER_AGENT'),
        }
        audit_log.source = 'API'
        audit_log.action = 'full_refund_initiated'
        audit_log.save(update_fields=['initiated_by', 'device_info', 'source', 'action'])

        # Return response
        return Response({
            'success': True,
            'message': 'Full order refund processed successfully',
            'refund_transaction_id': str(result['refund_transaction'].id),
            'refund_amount': str(result['total_refunded']),
            'refund_items': RefundItemSerializer(result['refund_items'], many=True).data,
            'audit_log_id': str(audit_log.id),
        }, status=status.HTTP_201_CREATED)

    except Exception as e:
        logger.error(f"Full order refund processing error: {e}")
        return Response(
            {'error': f'Refund processing failed: {str(e)}'},
            status=status.HTTP_400_BAD_REQUEST
        )


# ============================================================================
# EXCHANGE API ENDPOINTS
# ============================================================================


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@transaction.atomic
def initiate_exchange(request):
    """
    Initiate an exchange session by processing refund for returned items.

    POST /refunds/exchanges/initiate/
    {
        "original_order_id": "uuid",
        "items_to_return": [
            {"order_item_id": "uuid", "quantity": 2},
            {"order_item_id": "uuid", "quantity": 1}
        ],
        "reason": "Customer wants to exchange items"
    }

    Returns:
    {
        "success": true,
        "message": "Exchange initiated successfully",
        "exchange_session_id": "uuid",
        "session_status": "REFUND_COMPLETED",
        "refund_amount": "45.50"
    }
    """
    from .services import ExchangeService

    serializer = InitiateExchangeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    original_order_id = serializer.validated_data['original_order_id']
    items_to_return = serializer.validated_data['items_to_return']
    reason = serializer.validated_data.get('reason', '')

    # Build items list for ExchangeService
    items_with_quantities = [
        (item['order_item'], item['quantity']) for item in items_to_return
    ]

    try:
        # Get the order
        original_order = get_object_or_404(Order, id=original_order_id)

        # Initiate exchange
        exchange_session = ExchangeService.initiate_exchange(
            original_order=original_order,
            items_to_return=items_with_quantities,
            reason=reason,
            processed_by=request.user
        )

        return Response({
            'success': True,
            'message': 'Exchange initiated successfully',
            'exchange_session_id': str(exchange_session.id),
            'session_status': exchange_session.session_status,
            'refund_amount': str(exchange_session.refund_amount),
        }, status=status.HTTP_201_CREATED)

    except Exception as e:
        logger.error(f"Exchange initiation error: {e}")
        return Response(
            {'error': f'Exchange initiation failed: {str(e)}'},
            status=status.HTTP_400_BAD_REQUEST
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@transaction.atomic
def create_new_order_for_exchange(request):
    """
    Create a new order with replacement items for an exchange.

    POST /refunds/exchanges/create-order/
    {
        "exchange_session_id": "uuid",
        "new_items": [
            {"product_id": "uuid", "quantity": 2},
            {"product_id": "uuid", "quantity": 1, "notes": "No onions"}
        ]
    }

    Returns:
    {
        "success": true,
        "message": "New order created for exchange",
        "exchange_session_id": "uuid",
        "new_order_id": "uuid",
        "new_order_number": "ORD-12346",
        "new_order_amount": "52.30",
        "balance": "6.80"
    }
    """
    from .services import ExchangeService
    from products.models import Product

    serializer = CreateNewOrderSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    exchange_session_id = serializer.validated_data['exchange_session_id']
    new_items = serializer.validated_data['new_items']

    try:
        # Get the exchange session
        exchange_session = get_object_or_404(ExchangeSession, id=exchange_session_id)

        # Build items list for ExchangeService
        items_with_details = []
        for item in new_items:
            product = get_object_or_404(Product, id=item['product_id'])
            items_with_details.append({
                'product': product,
                'quantity': item['quantity'],
                'notes': item.get('notes', '')
            })

        # Create new order
        exchange_session = ExchangeService.create_new_order(
            exchange_session=exchange_session,
            new_items=items_with_details
        )

        # Calculate balance
        balance_info = ExchangeService.calculate_balance(exchange_session)

        return Response({
            'success': True,
            'message': 'New order created for exchange',
            'exchange_session_id': str(exchange_session.id),
            'new_order_id': str(exchange_session.new_order.id),
            'new_order_number': exchange_session.new_order.order_number,
            'new_order_amount': str(exchange_session.new_order_amount),
            'balance': str(balance_info['balance']),
            'customer_owes': balance_info['customer_owes'],
            'customer_receives': balance_info['customer_receives'],
        }, status=status.HTTP_201_CREATED)

    except Exception as e:
        logger.error(f"Exchange new order creation error: {e}")
        return Response(
            {'error': f'New order creation failed: {str(e)}'},
            status=status.HTTP_400_BAD_REQUEST
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@transaction.atomic
def complete_exchange(request):
    """
    Complete an exchange session with payment/refund handling.

    POST /refunds/exchanges/complete/
    {
        "exchange_session_id": "uuid",
        "payment_method": "CARD_ONLINE",  // if customer owes money
        "payment_transaction_id": "uuid",  // if customer owes money
        "refund_method": "ORIGINAL_PAYMENT"  // if customer receives refund
    }

    Returns:
    {
        "success": true,
        "message": "Exchange completed successfully",
        "exchange_session_id": "uuid",
        "final_balance": "0.00",
        "payment_transaction_id": "uuid" (if customer paid),
        "refund_transaction_id": "uuid" (if customer received refund)
    }
    """
    from .services import ExchangeService

    serializer = CompleteExchangeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    exchange_session_id = serializer.validated_data['exchange_session_id']
    payment_method = serializer.validated_data.get('payment_method')
    payment_transaction_id = serializer.validated_data.get('payment_transaction_id')
    refund_method = serializer.validated_data.get('refund_method')

    try:
        # Get the exchange session
        exchange_session = get_object_or_404(ExchangeSession, id=exchange_session_id)

        # Complete exchange
        exchange_session = ExchangeService.complete_exchange(
            exchange_session=exchange_session,
            payment_method=payment_method,
            payment_transaction_id=payment_transaction_id,
            refund_method=refund_method
        )

        response_data = {
            'success': True,
            'message': 'Exchange completed successfully',
            'exchange_session_id': str(exchange_session.id),
            'final_balance': str(exchange_session.balance_due or Decimal('0.00')),
        }

        # Add payment/refund transaction IDs if applicable
        if exchange_session.new_payment:
            # Customer paid additional amount
            latest_transaction = exchange_session.new_payment.transactions.order_by('-created_at').first()
            if latest_transaction:
                response_data['payment_transaction_id'] = str(latest_transaction.id)

        # Original refund transaction is already tracked in exchange_session.refund_transaction

        return Response(response_data, status=status.HTTP_200_OK)

    except Exception as e:
        logger.error(f"Exchange completion error: {e}")
        return Response(
            {'error': f'Exchange completion failed: {str(e)}'},
            status=status.HTTP_400_BAD_REQUEST
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@transaction.atomic
def cancel_exchange(request):
    """
    Cancel an exchange session.

    POST /refunds/exchanges/cancel/
    {
        "exchange_session_id": "uuid",
        "reason": "Customer changed mind"
    }

    Returns:
    {
        "success": true,
        "message": "Exchange cancelled successfully",
        "exchange_session_id": "uuid",
        "cancelled_at": "2024-01-15T10:30:00Z"
    }
    """
    from .services import ExchangeService

    serializer = CancelExchangeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    exchange_session_id = serializer.validated_data['exchange_session_id']
    reason = serializer.validated_data.get('reason', '')

    try:
        # Get the exchange session
        exchange_session = get_object_or_404(ExchangeSession, id=exchange_session_id)

        # Cancel exchange
        exchange_session = ExchangeService.cancel_exchange(
            exchange_session=exchange_session,
            reason=reason
        )

        return Response({
            'success': True,
            'message': 'Exchange cancelled successfully',
            'exchange_session_id': str(exchange_session.id),
            'cancelled_at': exchange_session.completed_at.isoformat() if exchange_session.completed_at else None,
        }, status=status.HTTP_200_OK)

    except Exception as e:
        logger.error(f"Exchange cancellation error: {e}")
        return Response(
            {'error': f'Exchange cancellation failed: {str(e)}'},
            status=status.HTTP_400_BAD_REQUEST
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_exchange_summary(request, exchange_session_id):
    """
    Get comprehensive summary of an exchange session.

    GET /refunds/exchanges/{exchange_session_id}/summary/

    Returns:
    {
        "exchange_session_id": "uuid",
        "session_status": "COMPLETED",
        "original_order_number": "ORD-12345",
        "new_order_number": "ORD-12346",
        "refund_amount": "45.50",
        "new_order_amount": "52.30",
        "balance": "6.80",
        "customer_owes": true,
        "customer_receives": false,
        "exchange_reason": "Customer wants to exchange items",
        "created_at": "2024-01-15T10:00:00Z",
        "completed_at": "2024-01-15T10:30:00Z",
        "refund_items": [...],
        "new_order_items": [...]
    }
    """
    from .services import ExchangeService

    try:
        # Get the exchange session
        exchange_session = get_object_or_404(ExchangeSession, id=exchange_session_id)

        # Get summary
        summary = ExchangeService.get_exchange_summary(exchange_session)

        # Serialize and return
        serializer = ExchangeSummarySerializer(summary)
        return Response(serializer.data)

    except Exception as e:
        logger.error(f"Exchange summary error: {e}")
        return Response(
            {'error': f'Failed to retrieve exchange summary: {str(e)}'},
            status=status.HTTP_400_BAD_REQUEST
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def calculate_exchange_balance(request, exchange_session_id):
    """
    Calculate the balance for an exchange session.

    GET /refunds/exchanges/{exchange_session_id}/balance/

    Returns:
    {
        "balance": "6.80",
        "customer_owes": true,
        "customer_receives": false,
        "refund_amount": "45.50",
        "new_order_amount": "52.30"
    }
    """
    from .services import ExchangeService

    try:
        # Get the exchange session
        exchange_session = get_object_or_404(ExchangeSession, id=exchange_session_id)

        # Calculate balance
        balance_info = ExchangeService.calculate_balance(exchange_session)

        # Serialize and return
        serializer = ExchangeBalanceSerializer(balance_info)
        return Response(serializer.data)

    except Exception as e:
        logger.error(f"Exchange balance calculation error: {e}")
        return Response(
            {'error': f'Failed to calculate balance: {str(e)}'},
            status=status.HTTP_400_BAD_REQUEST
        )
