from decimal import Decimal
from django.test import TestCase
from orders.models import Order
from payments.models import Payment, PaymentTransaction
from payments.services import PaymentService
from users.models import User
from products.models import Product


class PaymentServiceTests(TestCase):

    @classmethod
    def setUpTestData(cls):
        """Set up data for the whole test case."""
        cashier = User.objects.create_user(
            email="cashier@test.com", password="password"
        )
        product = Product.objects.create(name="Test Product", price=Decimal("100.00"))

        cls.order = Order.objects.create(cashier=cashier, grand_total=Decimal("100.00"))

    def test_process_full_cash_payment(self):
        """Test processing a single transaction that covers the full order amount."""
        transaction = PaymentService.process_transaction(
            order=self.order,
            method=PaymentTransaction.PaymentMethod.CASH,
            amount=Decimal("100.00"),
        )

        self.assertEqual(
            transaction.status, PaymentTransaction.TransactionStatus.SUCCESSFUL
        )

        payment = transaction.payment
        self.assertEqual(payment.status, Payment.PaymentStatus.PAID)
        self.assertEqual(payment.amount_paid, Decimal("100.00"))
        self.assertEqual(payment.total_amount_due, Decimal("100.00"))

    def test_process_partial_payment(self):
        """Test processing a single partial payment."""
        transaction = PaymentService.process_transaction(
            order=self.order,
            method=PaymentTransaction.PaymentMethod.CASH,
            amount=Decimal("40.00"),
        )

        payment = transaction.payment
        self.assertEqual(payment.status, Payment.PaymentStatus.PARTIALLY_PAID)
        self.assertEqual(payment.amount_paid, Decimal("40.00"))

    def test_process_split_payment_completion(self):
        """Test processing two transactions that complete the payment."""
        # First payment
        PaymentService.process_transaction(
            order=self.order,
            method=PaymentTransaction.PaymentMethod.CASH,
            amount=Decimal("60.00"),
        )

        # Second payment
        transaction = PaymentService.process_transaction(
            order=self.order,
            method=PaymentTransaction.PaymentMethod.CARD_TERMINAL,
            amount=Decimal("40.00"),
        )

        payment = transaction.payment
        self.assertEqual(payment.status, Payment.PaymentStatus.PAID)
        self.assertEqual(payment.amount_paid, Decimal("100.00"))
        self.assertEqual(payment.transactions.count(), 2)

    def test_card_terminal_strategy(self):
        """Test that the card terminal strategy runs and creates a transaction ID."""
        transaction = PaymentService.process_transaction(
            order=self.order,
            method=PaymentTransaction.PaymentMethod.CARD_TERMINAL,
            amount=Decimal("100.00"),
        )

        self.assertEqual(
            transaction.status, PaymentTransaction.TransactionStatus.SUCCESSFUL
        )
        self.assertIsNotNone(transaction.transaction_id)
        self.assertTrue(transaction.transaction_id.startswith("sim_"))

    def test_invalid_payment_method(self):
        """Test that using an unknown payment method raises a ValueError."""
        with self.assertRaises(ValueError):
            PaymentService.process_transaction(
                order=self.order, method="INVALID_METHOD", amount=Decimal("100.00")
            )

    def test_get_or_create_payment_idempotency(self):
        """Test that get_or_create_payment doesn't create a new payment if one exists."""
        payment1 = PaymentService.get_or_create_payment(self.order)
        payment2 = PaymentService.get_or_create_payment(self.order)
        self.assertEqual(payment1.id, payment2.id)
        self.assertEqual(Payment.objects.filter(order=self.order).count(), 1)
