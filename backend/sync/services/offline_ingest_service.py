"""
Service for processing offline payloads.

Handles ingestion of orders, payments, inventory changes, and approvals
that were created while a terminal was offline.
"""
import logging
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from products.models import Product
from discounts.models import Discount
from orders.models import Order, OrderItem
from payments.models import Payment, PaymentTransaction
from inventory.models import InventoryStock
from sync.models import OfflineConflict, ProcessedOperation

logger = logging.getLogger(__name__)


class OfflineOrderIngestService:
    """
    Service for ingesting offline orders.

    Validates payloads, checks for conflicts, and creates Order + Payment records.
    """

    @staticmethod
    def ingest_order(payload, terminal):
        """
        Ingest an offline order.

        Args:
            payload: Validated offline order payload (dict)
            terminal: TerminalRegistration instance

        Returns:
            dict: {
                'status': 'SUCCESS'|'CONFLICT'|'ERROR',
                'order_number': str,
                'order_id': uuid,
                'conflicts': list,
                'errors': list
            }
        """
        try:
            # Idempotency check: Has this operation already been processed?
            existing = ProcessedOperation.objects.filter(
                tenant=terminal.tenant,
                terminal=terminal,
                operation_id=payload['operation_id']
            ).first()

            if existing:
                logger.info(
                    f"Duplicate operation detected: {payload['operation_id']}. "
                    f"Returning cached result."
                )
                return existing.result_data

            # Check for conflicts
            conflicts = OfflineOrderIngestService._check_conflicts(payload, terminal)

            if conflicts:
                # Log conflict
                OfflineConflict.objects.create(
                    tenant=terminal.tenant,
                    terminal=terminal,
                    operation_id=payload['operation_id'],
                    payload_snapshot=payload,
                    conflict_type='OTHER',  # Or determine based on first conflict
                    conflict_message='; '.join([c['message'] for c in conflicts]),
                    status='PENDING'
                )

                return {
                    'status': 'CONFLICT',
                    'order_number': None,
                    'order_id': None,
                    'conflicts': conflicts,
                    'errors': []
                }

            # Create order atomically
            with transaction.atomic():
                order = OfflineOrderIngestService._create_order(payload, terminal)
                payments = OfflineOrderIngestService._create_payments(payload, order, terminal)
                OfflineOrderIngestService._process_inventory_deltas(payload, terminal)

                # Build result
                result = {
                    'status': 'SUCCESS',
                    'order_number': order.order_number,
                    'order_id': str(order.id),
                    'conflicts': [],
                    'errors': []
                }

                # Store for idempotency (within same transaction)
                ProcessedOperation.objects.create(
                    tenant=terminal.tenant,
                    terminal=terminal,
                    operation_id=payload['operation_id'],
                    operation_type='OFFLINE_ORDER',
                    result_data=result,
                    order_id=order.id
                )

            logger.info(
                f"Offline order ingested successfully: {order.order_number} "
                f"from terminal {terminal.device_id}"
            )

            return result

        except Exception as e:
            logger.error(f"Error ingesting offline order: {str(e)}", exc_info=True)

            # Log error as conflict
            OfflineConflict.objects.create(
                tenant=terminal.tenant,
                terminal=terminal,
                operation_id=payload['operation_id'],
                payload_snapshot=payload,
                conflict_type='OTHER',
                conflict_message=f"Error: {str(e)}",
                status='PENDING'
            )

            return {
                'status': 'ERROR',
                'order_number': None,
                'order_id': None,
                'conflicts': [],
                'errors': [str(e)]
            }

    @staticmethod
    def _check_conflicts(payload, terminal):
        """
        Check for conflicts in the payload.

        Returns list of conflict dicts.
        """
        conflicts = []
        order_data = payload['order']

        # Check products exist and are active
        for item in order_data.get('items', []):
            product_id = item['product_id']
            try:
                product = Product.objects.get(id=product_id, tenant=terminal.tenant)
                if not product.is_active:
                    conflicts.append({
                        'type': 'PRODUCT_DELETED',
                        'product_id': str(product_id),
                        'message': f"Product {product.name} is no longer active",
                        'expected_version': None,
                        'actual_version': None
                    })
            except Product.DoesNotExist:
                conflicts.append({
                    'type': 'PRODUCT_DELETED',
                    'product_id': str(product_id),
                    'message': f"Product {product_id} not found",
                    'expected_version': None,
                    'actual_version': None
                })

        # Check discounts are still valid
        for discount_data in order_data.get('discounts', []):
            discount_id = discount_data['discount_id']
            try:
                discount = Discount.objects.get(id=discount_id, tenant=terminal.tenant)
                if not discount.is_active:
                    conflicts.append({
                        'type': 'DISCOUNT_EXPIRED',
                        'product_id': None,
                        'message': f"Discount {discount.name} is no longer active",
                        'expected_version': None,
                        'actual_version': None
                    })
            except Discount.DoesNotExist:
                conflicts.append({
                    'type': 'DISCOUNT_EXPIRED',
                    'product_id': None,
                    'message': f"Discount {discount_id} not found",
                    'expected_version': None,
                    'actual_version': None
                })

        return conflicts

    @staticmethod
    def _create_order(payload, terminal):
        """Create Order and OrderItems from payload"""
        order_data = payload['order']

        # Create order
        order = Order.objects.create(
            tenant=terminal.tenant,
            order_type=order_data['order_type'],
            status=order_data.get('status', 'COMPLETED'),
            store_location=terminal.store_location,
            cashier_id=order_data.get('cashier_id'),
            customer_id=order_data.get('customer_id'),
            guest_name=order_data.get('guest_name'),
            guest_email=order_data.get('guest_email'),
            guest_phone=order_data.get('guest_phone'),
            subtotal=Decimal(str(order_data['subtotal'])),
            tax=Decimal(str(order_data['tax'])),
            surcharge=Decimal(str(order_data.get('surcharge', 0))),
            discount_total=Decimal(str(order_data.get('discount_total', 0))),
            total=Decimal(str(order_data['total'])),
            created_at=payload['created_at']  # Use offline timestamp
        )

        # Create order items
        for item_data in order_data['items']:
            OrderItem.objects.create(
                tenant=terminal.tenant,
                order=order,
                product_id=item_data['product_id'],
                quantity=item_data['quantity'],
                price_at_sale=Decimal(str(item_data['price_at_sale'])),
                notes=item_data.get('notes', ''),
                status='COMPLETED'
            )

        return order

    @staticmethod
    def _create_payments(payload, order, terminal):
        """
        Create Payment and PaymentTransaction records.

        Calculates totals from actual tender data and validates against order total.
        """
        payment_list = payload.get('payments', [])

        # Calculate actual totals from tender data
        amount_paid = sum(Decimal(str(p['amount'])) for p in payment_list)
        tips = sum(Decimal(str(p.get('tip', 0))) for p in payment_list)
        surcharges = sum(Decimal(str(p.get('surcharge', 0))) for p in payment_list)

        # Validate: amount_paid should equal order.total
        # Allow small rounding differences (within 0.01)
        if abs(amount_paid - order.total) > Decimal('0.01'):
            logger.warning(
                f"Payment amount mismatch for offline order: "
                f"amount_paid={amount_paid}, order.total={order.total}. "
                f"Using actual tender data."
            )

        # Create payment record with actual tender totals
        payment = Payment.objects.create(
            tenant=terminal.tenant,
            order=order,
            status='COMPLETED' if amount_paid >= order.total else 'PARTIAL',
            total_amount_due=order.total,
            amount_paid=amount_paid,  # Use actual tender total
            tips=tips,
            surcharges=surcharges
        )

        # Create transaction records
        for payment_data in payment_list:
            PaymentTransaction.objects.create(
                tenant=terminal.tenant,
                payment=payment,
                amount=Decimal(str(payment_data['amount'])),
                tip=Decimal(str(payment_data.get('tip', 0))),
                surcharge=Decimal(str(payment_data.get('surcharge', 0))),
                method=payment_data['method'],
                status=payment_data.get('status', 'COMPLETED'),
                transaction_id=payment_data.get('transaction_id'),
                provider_response=payment_data.get('provider_response', {})
            )

        return payment

    @staticmethod
    def _process_inventory_deltas(payload, terminal):
        """Apply inventory deltas (stock deductions)"""
        for delta in payload.get('inventory_deltas', []):
            try:
                stock = InventoryStock.objects.get(
                    tenant=terminal.tenant,
                    product_id=delta['product_id'],
                    location_id=delta['location_id']
                )

                # Apply delta
                stock.quantity += Decimal(str(delta['quantity_change']))
                stock.save(update_fields=['quantity'])

            except InventoryStock.DoesNotExist:
                logger.warning(
                    f"Inventory stock not found for product {delta['product_id']} "
                    f"at location {delta['location_id']}"
                )


class OfflineInventoryIngestService:
    """Service for ingesting offline inventory deltas"""

    @staticmethod
    def ingest_inventory_deltas(payload, terminal):
        """
        Ingest inventory deltas.

        Args:
            payload: Validated inventory deltas payload
            terminal: TerminalRegistration instance

        Returns:
            dict: {'status': 'SUCCESS'|'ERROR', 'errors': list}
        """
        try:
            with transaction.atomic():
                for delta in payload['deltas']:
                    try:
                        stock = InventoryStock.objects.get(
                            tenant=terminal.tenant,
                            product_id=delta['product_id'],
                            location_id=delta['location_id']
                        )

                        # Apply delta
                        new_quantity = stock.quantity + Decimal(str(delta['quantity_change']))

                        if new_quantity < 0:
                            logger.warning(
                                f"Inventory would go negative for product {delta['product_id']}. "
                                f"Current: {stock.quantity}, Delta: {delta['quantity_change']}"
                            )

                        stock.quantity = new_quantity
                        stock.save(update_fields=['quantity'])

                    except InventoryStock.DoesNotExist:
                        logger.error(
                            f"Inventory stock not found: product={delta['product_id']}, "
                            f"location={delta['location_id']}"
                        )

            return {'status': 'SUCCESS', 'errors': []}

        except Exception as e:
            logger.error(f"Error ingesting inventory deltas: {str(e)}", exc_info=True)
            return {'status': 'ERROR', 'errors': [str(e)]}


class OfflineApprovalsIngestService:
    """Service for ingesting offline manager approvals"""

    @staticmethod
    def ingest_approvals(payload, terminal):
        """
        Ingest manager approvals.

        Args:
            payload: Validated approvals payload
            terminal: TerminalRegistration instance

        Returns:
            dict: {'status': 'SUCCESS'|'ERROR', 'errors': list}
        """
        try:
            # For now, just log approvals
            # TODO: Create ManagerApproval records if that model exists
            for approval in payload['approvals']:
                logger.info(
                    f"Offline approval recorded: user={approval['user_id']}, "
                    f"action={approval['action']}, reference={approval['reference']}"
                )

            return {'status': 'SUCCESS', 'errors': []}

        except Exception as e:
            logger.error(f"Error ingesting approvals: {str(e)}", exc_info=True)
            return {'status': 'ERROR', 'errors': [str(e)]}
