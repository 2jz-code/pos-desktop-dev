"""
Pytest fixtures for refunds tests.
"""
import pytest
from decimal import Decimal
import uuid

from tenant.managers import set_current_tenant
from orders.models import Order, OrderItem
from payments.models import Payment, PaymentTransaction
from products.models import Product
from refunds.models import ExchangeSession


@pytest.fixture
def completed_order_with_payment(tenant_a, admin_user_tenant_a, product_tenant_a, store_location_tenant_a):
    """
    Create a completed order with payment for refund testing.

    Order details:
    - 2x product @ $15.99 each = $31.98 subtotal
    - Tax @ 10%: $3.20
    - Total: $35.18
    - Tip: $2.00
    - Surcharge: $1.50
    - Grand Total: $38.68
    """
    set_current_tenant(tenant_a)

    # Create order
    order = Order.objects.create(
        tenant=tenant_a,
        store_location=store_location_tenant_a,
        order_number="TEST-REFUND-001",
        order_type=Order.OrderType.POS,
        status=Order.OrderStatus.COMPLETED,
        cashier=admin_user_tenant_a,
        subtotal=Decimal("31.98"),
        tax_total=Decimal("3.20"),
        grand_total=Decimal("35.18")
    )

    # Create order item
    order_item = OrderItem.objects.create(
        tenant=tenant_a,
        order=order,
        product=product_tenant_a,
        quantity=2,
        price_at_sale=Decimal("15.99"),
        status=OrderItem.ItemStatus.SERVED,
        tax_amount=Decimal("3.20")
    )

    # Create payment
    payment = Payment.objects.create(
        tenant=tenant_a,
        order=order,
        status=Payment.PaymentStatus.PAID,
        total_amount_due=Decimal("38.68"),
        amount_paid=Decimal("38.68")
    )

    # Create successful transaction
    transaction = PaymentTransaction.objects.create(
        tenant=tenant_a,
        payment=payment,
        transaction_id=f"test_txn_{uuid.uuid4()}",
        amount=Decimal("35.18"),
        tip=Decimal("2.00"),
        surcharge=Decimal("1.50"),
        method=PaymentTransaction.PaymentMethod.CARD_ONLINE,
        status=PaymentTransaction.TransactionStatus.SUCCESSFUL,
        provider_response={"test": "data"}
    )

    return {
        'order': order,
        'order_item': order_item,
        'payment': payment,
        'transaction': transaction,
        'tenant': tenant_a,
        'product': product_tenant_a
    }


@pytest.fixture
def product_tenant_a_alt(tenant_a, category_tenant_a, product_type_tenant_a):
    """
    Create a second product for tenant A (for exchange testing).
    """
    from products.models import Product
    from decimal import Decimal

    set_current_tenant(tenant_a)

    return Product.objects.create(
        name='Veggie Burger',
        price=Decimal('25.00'),
        tenant=tenant_a,
        category=category_tenant_a,
        product_type=product_type_tenant_a,
        is_active=True
    )


@pytest.fixture
def multi_item_order_with_payment(tenant_a, admin_user_tenant_a, product_tenant_a, product_tenant_a_alt, store_location_tenant_a):
    """
    Create an order with multiple different products for complex refund testing.

    Order details:
    - 2x product_a @ $15.99 each = $31.98
    - 1x product_b @ $25.00 = $25.00
    - Subtotal: $56.98
    - Tax @ 10%: $5.70
    - Total: $62.68
    - Tip: $5.00
    - Surcharge: $2.00
    - Grand Total: $69.68
    """
    set_current_tenant(tenant_a)

    # Create order
    order = Order.objects.create(
        tenant=tenant_a,
        store_location=store_location_tenant_a,
        order_number="TEST-MULTI-001",
        order_type=Order.OrderType.POS,
        status=Order.OrderStatus.COMPLETED,
        cashier=admin_user_tenant_a,
        subtotal=Decimal("56.98"),
        tax_total=Decimal("5.70"),
        grand_total=Decimal("62.68")
    )

    # Create first order item
    order_item1 = OrderItem.objects.create(
        tenant=tenant_a,
        order=order,
        product=product_tenant_a,
        quantity=2,
        price_at_sale=Decimal("15.99"),
        status=OrderItem.ItemStatus.SERVED,
        tax_amount=Decimal("3.20")
    )

    # Create second order item
    order_item2 = OrderItem.objects.create(
        tenant=tenant_a,
        order=order,
        product=product_tenant_a_alt,
        quantity=1,
        price_at_sale=Decimal("25.00"),
        status=OrderItem.ItemStatus.SERVED,
        tax_amount=Decimal("2.50")
    )

    # Create payment
    payment = Payment.objects.create(
        tenant=tenant_a,
        order=order,
        status=Payment.PaymentStatus.PAID,
        total_amount_due=Decimal("69.68"),
        amount_paid=Decimal("69.68")
    )

    # Create successful transaction
    transaction = PaymentTransaction.objects.create(
        tenant=tenant_a,
        payment=payment,
        transaction_id=f"test_txn_{uuid.uuid4()}",
        amount=Decimal("62.68"),
        tip=Decimal("5.00"),
        surcharge=Decimal("2.00"),
        method=PaymentTransaction.PaymentMethod.CARD_ONLINE,
        status=PaymentTransaction.TransactionStatus.SUCCESSFUL,
        provider_response={"test": "data"}
    )

    return {
        'order': order,
        'order_item1': order_item1,
        'order_item2': order_item2,
        'payment': payment,
        'transaction': transaction,
        'tenant': tenant_a
    }


@pytest.fixture
def exchange_session(completed_order_with_payment):
    """
    Create an exchange session for exchange workflow testing.
    """
    set_current_tenant(completed_order_with_payment['tenant'])

    session = ExchangeSession.objects.create(
        tenant=completed_order_with_payment['tenant'],
        original_order=completed_order_with_payment['order'],
        session_status='initiated',
        refund_amount=Decimal("35.18")
    )

    return session
