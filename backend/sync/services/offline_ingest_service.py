"""
Service for processing offline payloads.

Handles ingestion of orders, payments, inventory changes, and approvals
that were created while a terminal was offline.
"""
import json
import logging
import uuid
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from products.models import Product, ModifierSet, ModifierOption
from discounts.models import Discount
from orders.models import Order, OrderItem, OrderItemModifier, OrderDiscount, OrderAdjustment
from payments.models import Payment, PaymentTransaction
from inventory.models import InventoryStock
from sync.models import ProcessedOperation
from approvals.models import ManagerApprovalRequest, ActionType, ApprovalStatus

logger = logging.getLogger(__name__)


def serialize_payload(obj):
    """Recursively convert UUIDs, Decimals, and datetimes to JSON-serializable types."""
    from datetime import datetime, date
    if isinstance(obj, dict):
        return {k: serialize_payload(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [serialize_payload(item) for item in obj]
    elif isinstance(obj, uuid.UUID):
        return str(obj)
    elif isinstance(obj, Decimal):
        return str(obj)
    elif isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, date):
        return obj.isoformat()
    return obj


class OfflineOrderIngestService:
    """
    Service for ingesting offline orders.

    Validates payloads, checks for conflicts, and creates Order + Payment records.
    """

    @staticmethod
    def ingest_order(payload, terminal):
        """
        Ingest an offline order.

        Following industry standard (Square, Toast, Clover), offline orders are
        always accepted since the transaction already happened in the real world.
        Any issues (deleted products, expired discounts) are logged for informational
        purposes but don't block order creation.

        Args:
            payload: Validated offline order payload (dict)
            terminal: TerminalRegistration instance

        Returns:
            dict: {
                'status': 'SUCCESS'|'ERROR',
                'order_number': str,
                'order_id': uuid,
                'warnings': list,  # Informational only, doesn't block
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

            # Check for issues (informational only - logged for internal tracking)
            warnings = OfflineOrderIngestService._check_warnings(payload, terminal)

            if warnings:
                # Log warnings for internal tracking (POS admin dashboard)
                # These don't block order creation - just for debugging/auditing
                logger.warning(
                    f"Offline order {payload['operation_id']} from terminal {terminal.device_id} "
                    f"has warnings: {'; '.join([w['message'] for w in warnings])}"
                )

            # Create order atomically
            with transaction.atomic():
                order = OfflineOrderIngestService._create_order(payload, terminal)
                payments = OfflineOrderIngestService._create_payments(payload, order, terminal)
                OfflineOrderIngestService._process_inventory_deltas(payload, terminal)

                # Process any approvals associated with this order
                if payload.get('approvals'):
                    OfflineApprovalsIngestService.ingest_approvals(payload, terminal, order=order)

                # Build result
                result = {
                    'status': 'SUCCESS',
                    'order_number': order.order_number,
                    'order_id': str(order.id),
                    'warnings': warnings,  # Returned for logging, not displayed to user
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
                f"{' (with warnings)' if warnings else ''}"
            )

            return result

        except Exception as e:
            logger.error(f"Error ingesting offline order: {str(e)}", exc_info=True)

            return {
                'status': 'ERROR',
                'order_number': None,
                'order_id': None,
                'warnings': [],
                'errors': [str(e)]
            }

    @staticmethod
    def _check_warnings(payload, terminal):
        """
        Check for potential issues in the payload.

        These are informational warnings only - they don't block order creation.
        The order already happened in the real world, so we accept it regardless.

        Returns list of warning dicts.
        """
        warnings = []
        order_data = payload['order']

        # Check products exist and are active
        for item in order_data.get('items', []):
            product_id = item['product_id']
            try:
                product = Product.objects.get(id=product_id, tenant=terminal.tenant)
                if not product.is_active:
                    warnings.append({
                        'type': 'PRODUCT_INACTIVE',
                        'product_id': str(product_id),
                        'message': f"Product '{product.name}' is now inactive (was active when sold)",
                    })
            except Product.DoesNotExist:
                warnings.append({
                    'type': 'PRODUCT_DELETED',
                    'product_id': str(product_id),
                    'message': f"Product {product_id} no longer exists (was deleted after sale)",
                })

        # Check discounts are still valid
        for discount_data in order_data.get('discounts', []):
            discount_id = discount_data['discount_id']
            try:
                discount = Discount.objects.get(id=discount_id, tenant=terminal.tenant)
                if not discount.is_active:
                    warnings.append({
                        'type': 'DISCOUNT_INACTIVE',
                        'message': f"Discount '{discount.name}' is now inactive (was active when applied)",
                    })
            except Discount.DoesNotExist:
                warnings.append({
                    'type': 'DISCOUNT_DELETED',
                    'message': f"Discount {discount_id} no longer exists (was deleted after application)",
                })

        return warnings

    @staticmethod
    def _create_order(payload, terminal):
        """Create Order, OrderItems, Modifiers, Adjustments, and Discounts from payload"""
        from django.utils.dateparse import parse_datetime
        from users.models import User

        order_data = payload['order']

        # Parse the offline created_at timestamp
        # Note: payload['created_at'] is the auth timestamp (fresh),
        # payload['offline_created_at'] is the actual order creation time
        offline_timestamp = payload.get('offline_created_at') or payload.get('created_at')
        if isinstance(offline_timestamp, str):
            # String timestamp - parse it
            created_at = parse_datetime(offline_timestamp) or timezone.now()
        elif hasattr(offline_timestamp, 'tzinfo'):
            # Already a datetime object (from serializer)
            created_at = offline_timestamp
        else:
            # Fallback to now
            created_at = timezone.now()

        # Get cashier for adjustments/approvals
        cashier_id = order_data.get('cashier_id')
        cashier = None
        if cashier_id:
            try:
                cashier = User.objects.get(id=cashier_id, tenant=terminal.tenant)
            except User.DoesNotExist:
                logger.warning(f"Cashier {cashier_id} not found for offline order")

        # Create order - offline orders are already paid/completed
        order = Order.objects.create(
            tenant=terminal.tenant,
            order_type=order_data['order_type'],
            status='COMPLETED',  # Offline orders are always completed
            payment_status='PAID',  # Offline orders are already paid
            store_location=terminal.store_location,
            cashier_id=cashier_id,
            customer_id=order_data.get('customer_id'),
            guest_first_name=order_data.get('guest_first_name', ''),
            guest_email=order_data.get('guest_email'),
            guest_phone=order_data.get('guest_phone'),
            dining_preference=order_data.get('dining_preference', 'TAKE_OUT'),
            subtotal=Decimal(str(order_data['subtotal'])),
            tax_total=Decimal(str(order_data['tax'])),
            surcharges_total=Decimal(str(order_data.get('surcharge', 0))),
            total_discounts_amount=Decimal(str(order_data.get('discount_total', 0))),
            grand_total=Decimal(str(order_data['total'])),
            created_at=created_at,
            completed_at=created_at,  # Use offline timestamp as completion time
            # Offline tracking fields
            is_offline_order=True,
            offline_created_at=created_at,
            offline_terminal_id=terminal.device_id,
        )

        # Create order items with modifiers and adjustments
        for item_data in order_data['items']:
            order_item = OrderItem.objects.create(
                tenant=terminal.tenant,
                order=order,
                product_id=item_data['product_id'],
                quantity=item_data['quantity'],
                price_at_sale=Decimal(str(item_data['price_at_sale'])),
                notes=item_data.get('notes', ''),
                status='COMPLETED'
            )

            # Create modifier snapshots for this item
            for mod_data in item_data.get('modifiers', []):
                OfflineOrderIngestService._create_item_modifier(
                    order_item, mod_data, terminal
                )

            # Create item-level adjustments
            for adj_data in item_data.get('adjustments', []):
                OfflineOrderIngestService._create_adjustment(
                    order, adj_data, terminal, cashier, order_item=order_item
                )

        # Create promotional/code discounts (OrderDiscount records)
        for discount_data in order_data.get('discounts', []):
            OfflineOrderIngestService._create_order_discount(
                order, discount_data, terminal
            )

        # Create order-level adjustments
        for adj_data in order_data.get('adjustments', []):
            OfflineOrderIngestService._create_adjustment(
                order, adj_data, terminal, cashier, order_item=None
            )

        return order

    @staticmethod
    def _create_item_modifier(order_item, mod_data, terminal):
        """Create OrderItemModifier snapshot from modifier data"""
        try:
            # Try to look up the modifier option to get names
            # IDs can be integers or strings (from CharFieldserializer)
            modifier_set_id = mod_data.get('modifier_set_id')
            modifier_option_id = mod_data.get('modifier_option_id')

            # Convert string IDs to integers if needed (models use integer PKs)
            if modifier_set_id and isinstance(modifier_set_id, str):
                try:
                    modifier_set_id = int(modifier_set_id)
                except ValueError:
                    pass  # Keep as string if not numeric (might be UUID)
            if modifier_option_id and isinstance(modifier_option_id, str):
                try:
                    modifier_option_id = int(modifier_option_id)
                except ValueError:
                    pass  # Keep as string if not numeric

            modifier_set_name = "Unknown"
            option_name = "Unknown"

            if modifier_set_id:
                try:
                    modifier_set = ModifierSet.objects.get(
                        id=modifier_set_id,
                        tenant=terminal.tenant
                    )
                    modifier_set_name = modifier_set.name
                except ModifierSet.DoesNotExist:
                    logger.warning(f"ModifierSet {modifier_set_id} not found")

            if modifier_option_id:
                try:
                    option = ModifierOption.objects.get(
                        id=modifier_option_id,
                        tenant=terminal.tenant
                    )
                    option_name = option.name
                    # Also get set name from option if not already found
                    if modifier_set_name == "Unknown" and option.modifier_set:
                        modifier_set_name = option.modifier_set.name
                except ModifierOption.DoesNotExist:
                    logger.warning(f"ModifierOption {modifier_option_id} not found")

            OrderItemModifier.objects.create(
                tenant=terminal.tenant,
                order_item=order_item,
                modifier_set_name=modifier_set_name,
                option_name=option_name,
                price_at_sale=Decimal(str(mod_data.get('price_delta', 0))),
                quantity=mod_data.get('quantity', 1)
            )

        except Exception as e:
            logger.warning(f"Failed to create modifier snapshot: {e}")

    @staticmethod
    def _create_order_discount(order, discount_data, terminal):
        """Create OrderDiscount record for promotional discounts"""
        try:
            discount_id = discount_data.get('discount_id')
            amount = Decimal(str(discount_data.get('amount', 0)))

            # Look up the discount
            try:
                discount = Discount.objects.get(
                    id=discount_id,
                    tenant=terminal.tenant
                )
                OrderDiscount.objects.create(
                    tenant=terminal.tenant,
                    order=order,
                    discount=discount,
                    amount=amount
                )
            except Discount.DoesNotExist:
                # Discount no longer exists - log but don't fail
                logger.warning(
                    f"Discount {discount_id} not found for offline order {order.id}. "
                    f"Amount {amount} already factored into order total."
                )

        except Exception as e:
            logger.warning(f"Failed to create OrderDiscount: {e}")

    @staticmethod
    def _create_adjustment(order, adj_data, terminal, cashier, order_item=None):
        """Create OrderAdjustment record"""
        try:
            from users.models import User

            adjustment_type = adj_data.get('adjustment_type')
            discount_type = adj_data.get('discount_type')
            value = Decimal(str(adj_data.get('value', 0)))
            reason_text = adj_data.get('notes', '') or adj_data.get('reason', '')

            # Get approver if specified
            approver = None
            approved_by_id = adj_data.get('approved_by_user_id')
            if approved_by_id:
                try:
                    approver = User.objects.get(id=approved_by_id, tenant=terminal.tenant)
                except User.DoesNotExist:
                    logger.warning(f"Approver {approved_by_id} not found")

            # Determine applied_by user - required field, cannot be null
            # Priority: approver > cashier > order.cashier
            applied_by_user = approver or cashier
            if not applied_by_user and order.cashier_id:
                try:
                    applied_by_user = User.objects.get(id=order.cashier_id, tenant=terminal.tenant)
                except User.DoesNotExist:
                    pass

            if not applied_by_user:
                # Cannot create adjustment without applied_by user
                logger.warning(
                    f"Skipping adjustment {adjustment_type} for offline order {order.order_number}: "
                    f"no user found for applied_by (cashier_id={order.cashier_id}, "
                    f"approver_id={approved_by_id})"
                )
                return

            # Calculate amount based on adjustment type
            # For ONE_OFF_DISCOUNT: amount should be negative
            # For PRICE_OVERRIDE: amount is the difference (can be + or -)
            # For TAX_EXEMPT/FEE_EXEMPT: amount represents the waived amount
            amount = Decimal('0.00')
            original_price = None
            new_price = None

            if adjustment_type == 'ONE_OFF_DISCOUNT':
                if discount_type == 'PERCENTAGE':
                    # Calculate percentage of relevant amount
                    if order_item:
                        base = order_item.price_at_sale * order_item.quantity
                    else:
                        base = order.subtotal
                    amount = -(base * value / Decimal('100'))
                else:  # FIXED
                    amount = -value
            elif adjustment_type == 'PRICE_OVERRIDE':
                if order_item:
                    # value is the new price
                    new_price = value
                    # Try to get original price from product
                    try:
                        product = Product.objects.get(id=order_item.product_id)
                        original_price = product.price
                    except Product.DoesNotExist:
                        original_price = order_item.price_at_sale
                    amount = (new_price - original_price) * order_item.quantity
            elif adjustment_type in ('TAX_EXEMPT', 'FEE_EXEMPT'):
                # These typically have 0 amount or represent saved amount
                amount = -value if value > 0 else Decimal('0.00')

            # Create adjustment record using bulk_create to bypass model's custom save()
            # which calls full_clean() - offline orders are already completed, validation doesn't apply
            adjustment = OrderAdjustment(
                tenant=terminal.tenant,
                order=order,
                order_item=order_item,
                adjustment_type=adjustment_type,
                discount_type=discount_type if adjustment_type == 'ONE_OFF_DISCOUNT' else None,
                discount_value=value if adjustment_type == 'ONE_OFF_DISCOUNT' else None,
                original_price=original_price,
                new_price=new_price,
                amount=amount,
                reason=reason_text or f"Offline adjustment - {adjustment_type}",
                applied_by=applied_by_user,
                approved_by=approver,
            )
            # bulk_create bypasses the model's save() method which has full_clean()
            OrderAdjustment.objects.bulk_create([adjustment])

            logger.info(
                f"Created offline adjustment: {adjustment_type} for order {order.order_number}"
            )

        except Exception as e:
            logger.warning(f"Failed to create adjustment: {e}", exc_info=True)

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

        # Validate: amount_paid should equal order.grand_total
        # Allow small rounding differences (within 0.01)
        if abs(amount_paid - order.grand_total) > Decimal('0.01'):
            logger.warning(
                f"Payment amount mismatch for offline order: "
                f"amount_paid={amount_paid}, order.grand_total={order.grand_total}. "
                f"Using actual tender data."
            )

        # Create payment record with actual tender totals
        payment = Payment.objects.create(
            tenant=terminal.tenant,
            order=order,
            store_location=terminal.store_location,
            status='PAID' if amount_paid >= order.grand_total else 'PARTIALLY_PAID',
            total_amount_due=order.grand_total,
            amount_paid=amount_paid,  # Use actual tender total
            total_tips=tips,
            total_surcharges=surcharges,
            total_collected=amount_paid + tips + surcharges
        )

        # Create transaction records
        for payment_data in payment_list:
            # Map status to valid TransactionStatus choices
            raw_status = payment_data.get('status', 'COMPLETED')
            tx_status = 'SUCCESSFUL' if raw_status in ('COMPLETED', 'SUCCESSFUL') else raw_status

            PaymentTransaction.objects.create(
                tenant=terminal.tenant,
                payment=payment,
                amount=Decimal(str(payment_data['amount'])),
                tip=Decimal(str(payment_data.get('tip', 0))),
                surcharge=Decimal(str(payment_data.get('surcharge', 0))),
                method=payment_data['method'],
                status=tx_status,
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

    # Map from client action types to ActionType enum
    ACTION_TYPE_MAP = {
        'DISCOUNT': ActionType.DISCOUNT,
        'ONE_OFF_DISCOUNT': ActionType.CUSTOM_ADJUSTMENT,
        'PRICE_OVERRIDE': ActionType.PRICE_OVERRIDE,
        'TAX_EXEMPT': ActionType.TAX_EXEMPT,
        'FEE_EXEMPT': ActionType.FEE_EXEMPT,
        'REFUND': ActionType.REFUND,
        'ORDER_VOID': ActionType.ORDER_VOID,
    }

    @staticmethod
    def ingest_approvals(payload, terminal, order=None):
        """
        Ingest manager approvals, creating ManagerApprovalRequest records.

        Args:
            payload: Validated approvals payload
            terminal: TerminalRegistration instance
            order: Optional related Order instance

        Returns:
            dict: {'status': 'SUCCESS'|'ERROR', 'errors': list}
        """
        from users.models import User
        from datetime import timedelta

        try:
            approvals_created = 0

            for approval_data in payload.get('approvals', []):
                try:
                    # Get the initiator (cashier who requested approval)
                    initiator_id = approval_data.get('initiator_id') or approval_data.get('cashier_id')
                    initiator = None
                    if initiator_id:
                        try:
                            initiator = User.objects.get(id=initiator_id, tenant=terminal.tenant)
                        except User.DoesNotExist:
                            logger.warning(f"Initiator {initiator_id} not found")

                    # Get the approver (manager who approved)
                    approver_id = approval_data.get('user_id') or approval_data.get('approver_id')
                    approver = None
                    if approver_id:
                        try:
                            approver = User.objects.get(id=approver_id, tenant=terminal.tenant)
                        except User.DoesNotExist:
                            logger.warning(f"Approver {approver_id} not found")

                    # Map action type
                    action_str = approval_data.get('action', 'CUSTOM_ADJUSTMENT')
                    action_type = OfflineApprovalsIngestService.ACTION_TYPE_MAP.get(
                        action_str,
                        ActionType.CUSTOM_ADJUSTMENT
                    )

                    # Parse approval timestamp
                    approved_at = timezone.now()
                    if approval_data.get('timestamp'):
                        from django.utils.dateparse import parse_datetime
                        approved_at = parse_datetime(approval_data['timestamp']) or timezone.now()

                    # Create the approval record
                    approval = ManagerApprovalRequest.objects.create(
                        tenant=terminal.tenant,
                        store_location=terminal.store_location,
                        initiator=initiator or approver,  # Fallback to approver if no initiator
                        approver=approver,
                        action_type=action_type,
                        status=ApprovalStatus.APPROVED,  # Offline approvals are already approved
                        order=order,
                        payload={
                            'offline_approval': True,
                            'reference': approval_data.get('reference'),
                            'value': approval_data.get('value'),
                            'notes': approval_data.get('notes'),
                            'terminal_id': terminal.device_id,
                        },
                        reason=approval_data.get('notes', 'Offline approval'),
                        expires_at=approved_at + timedelta(hours=24),  # Already expired, but required field
                        approved_at=approved_at,
                    )

                    approvals_created += 1
                    logger.info(
                        f"Created offline approval record: {action_type} by {approver} "
                        f"for order {order.order_number if order else 'N/A'}"
                    )

                except Exception as e:
                    logger.warning(f"Failed to create approval record: {e}")

            return {
                'status': 'SUCCESS',
                'approvals_created': approvals_created,
                'errors': []
            }

        except Exception as e:
            logger.error(f"Error ingesting approvals: {str(e)}", exc_info=True)
            return {'status': 'ERROR', 'errors': [str(e)]}
