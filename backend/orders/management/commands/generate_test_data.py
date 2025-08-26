"""
Django management command to generate realistic test orders and payments for reporting system testing.

Usage:
    python manage.py generate_test_data --orders 500 --months 3
    python manage.py generate_test_data --orders 1000 --months 2 --dry-run
    python manage.py generate_test_data --orders 200 --months 3 --clear-existing
"""

import random
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from django.contrib.auth.hashers import make_password

from users.models import User
from products.models import Product
from orders.models import Order, OrderItem
from orders.services import OrderService
from payments.models import Payment, PaymentTransaction
from inventory.models import Location
from settings.config import app_settings


class Command(BaseCommand):
    help = "Generate realistic test orders and payments for reporting system testing"

    def add_arguments(self, parser):
        parser.add_argument(
            "--orders",
            type=int,
            default=500,
            help="Number of orders to generate (default: 500)",
        )
        parser.add_argument(
            "--months",
            type=int,
            default=3,
            help="Number of months to scatter orders across (default: 3)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be generated without creating data",
        )
        parser.add_argument(
            "--clear-existing",
            action="store_true",
            help="Clear existing test orders before generating new ones",
        )

    def handle(self, *args, **options):
        self.dry_run = options["dry_run"]
        self.orders_count = options["orders"]
        self.months = options["months"]
        self.clear_existing = options["clear_existing"]

        if self.dry_run:
            self.stdout.write(
                self.style.WARNING("DRY RUN MODE - No data will be created")
            )

        # Validate inputs
        if self.orders_count <= 0:
            raise CommandError("Number of orders must be greater than 0")
        if self.months <= 0:
            raise CommandError("Number of months must be greater than 0")

        self.stdout.write(f"Generating {self.orders_count} orders across {self.months} months")

        try:
            # Clear existing test data if requested
            if self.clear_existing:
                self.clear_test_data()

            # Get required data
            self.load_base_data()

            # Generate test orders
            if not self.dry_run:
                with transaction.atomic():
                    self.generate_orders()
            else:
                self.generate_orders()

            self.stdout.write(
                self.style.SUCCESS(
                    f"Successfully {'would generate' if self.dry_run else 'generated'} "
                    f"{self.orders_count} test orders with payments"
                )
            )

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Generation failed: {str(e)}"))
            raise

    def clear_test_data(self):
        """Clear existing test orders and payments"""
        if self.dry_run:
            self.stdout.write("Would clear existing test orders...")
            return

        # Delete orders created by this script (identifiable by having 'TEST-' prefix)
        test_orders = Order.objects.filter(order_number__startswith='TEST-')
        count = test_orders.count()
        
        if count > 0:
            self.stdout.write(f"Clearing {count} existing test orders...")
            test_orders.delete()
            self.stdout.write(self.style.SUCCESS(f"Cleared {count} test orders"))

    def load_base_data(self):
        """Load users, products, and other required data"""
        # Get cashiers (staff users)
        self.cashiers = list(User.objects.filter(
            is_pos_staff=True,
            role__in=['OWNER', 'MANAGER', 'CASHIER']
        ))
        
        if not self.cashiers:
            raise CommandError("No cashier users found. Please create at least one staff user.")

        # Get customers (optional - for some orders)
        self.customers = list(User.objects.filter(role='CUSTOMER')[:50])  # Limit to 50 customers

        # Get products
        self.products = list(Product.objects.filter(is_active=True))
        if not self.products:
            raise CommandError("No active products found. Please migrate products first.")

        # Categorize products for realistic order composition
        self.categorize_products()

        # Get default location for inventory
        self.main_location = Location.objects.get_or_create(
            name="Main Store",
            defaults={"description": "Main store location"}
        )[0]

        self.stdout.write(f"Loaded {len(self.cashiers)} cashiers, {len(self.customers)} customers, {len(self.products)} products")

    def categorize_products(self):
        """Categorize products for realistic order generation"""
        self.food_products = []
        self.drink_products = []
        self.grocery_products = []
        self.signature_products = []

        for product in self.products:
            product_name = product.name.lower()
            category_name = product.category.name.lower() if product.category else ""

            if any(keyword in category_name for keyword in ['drink', 'juice', 'soda', 'water']):
                self.drink_products.append(product)
            elif any(keyword in category_name for keyword in ['mana', 'soup', 'dessert']):
                self.food_products.append(product)
            elif 'signature' in category_name:
                self.signature_products.append(product)
            else:
                self.grocery_products.append(product)

        self.stdout.write(f"Categorized: {len(self.food_products)} food, {len(self.drink_products)} drinks, "
                         f"{len(self.grocery_products)} grocery, {len(self.signature_products)} signature")

    def generate_orders(self):
        """Generate realistic test orders with varied patterns"""
        end_date = timezone.now()
        start_date = end_date - timedelta(days=30 * self.months)

        # Define order patterns for realism
        patterns = [
            {'type': 'quick_snack', 'weight': 30, 'items': (1, 3), 'avg_price': 15},
            {'type': 'meal', 'weight': 40, 'items': (2, 6), 'avg_price': 35},
            {'type': 'grocery_run', 'weight': 20, 'items': (3, 10), 'avg_price': 60},
            {'type': 'large_order', 'weight': 10, 'items': (5, 15), 'avg_price': 120},
        ]

        # Generate time distribution (busier during meal times)
        business_hours = [
            (11, 14, 2.5),  # Lunch rush - higher weight
            (14, 17, 1.0),  # Afternoon - normal
            (17, 20, 2.0),  # Dinner - higher weight
            (20, 22, 0.5),  # Evening - lower
        ]

        orders_created = 0
        
        for i in range(self.orders_count):
            if self.dry_run:
                self.stdout.write(f"Would create order {i+1}/{self.orders_count}")
                continue

            # Generate random timestamp within the date range
            order_date = self.generate_realistic_timestamp(start_date, end_date, business_hours)
            
            # Choose order pattern
            pattern = self.choose_weighted_pattern(patterns)
            
            # Choose order type (80% POS, 20% WEB)
            order_type = Order.OrderType.WEB if random.random() < 0.2 else Order.OrderType.POS
            
            # Choose cashier
            cashier = random.choice(self.cashiers)
            
            # Choose customer (30% of orders have registered customers)
            customer = None
            if self.customers and random.random() < 0.3:
                customer = random.choice(self.customers)

            try:
                self.stdout.write(f"Creating order {i+1} with pattern {pattern['type']}...")
                order = self.create_realistic_order(
                    order_date, pattern, order_type, cashier, customer, i+1
                )
                orders_created += 1
                
                if orders_created % 10 == 0:
                    self.stdout.write(f"Created {orders_created} orders...")

            except Exception as e:
                import traceback
                self.stdout.write(self.style.ERROR(f"Failed to create order {i+1}: {str(e)}"))
                self.stdout.write(self.style.ERROR(f"Full traceback: {traceback.format_exc()}"))
                continue

        self.stdout.write(self.style.SUCCESS(f"Successfully created {orders_created} orders"))

    def generate_realistic_timestamp(self, start_date, end_date, business_hours):
        """Generate a realistic timestamp based on business hours and patterns"""
        # Choose a random day
        days_range = (end_date - start_date).days
        random_day = start_date + timedelta(days=random.randint(0, days_range))
        
        # Avoid Sundays (closed) - adjust if Sunday
        if random_day.weekday() == 6:  # Sunday = 6
            random_day += timedelta(days=1)

        # Choose time based on business hour weights
        total_weight = sum(weight for _, _, weight in business_hours)
        rand = random.uniform(0, total_weight)
        
        cumulative = 0
        for start_hour, end_hour, weight in business_hours:
            cumulative += weight
            if rand <= cumulative:
                # Generate time within this hour range
                hour = random.randint(start_hour, min(end_hour - 1, 23))
                minute = random.randint(0, 59)
                second = random.randint(0, 59)
                
                return random_day.replace(hour=hour, minute=minute, second=second)

        # Fallback to lunch time
        return random_day.replace(hour=12, minute=random.randint(0, 59), second=random.randint(0, 59))

    def choose_weighted_pattern(self, patterns):
        """Choose an order pattern based on weights"""
        total_weight = sum(p['weight'] for p in patterns)
        rand = random.uniform(0, total_weight)
        
        cumulative = 0
        for pattern in patterns:
            cumulative += pattern['weight']
            if rand <= cumulative:
                return pattern
        
        return patterns[0]  # Fallback

    def create_realistic_order(self, order_date, pattern, order_type, cashier, customer, order_num):
        """Create a realistic order with items and payment"""
        # Create the order in PENDING status first (required to add items)
        order = Order.objects.create(
            order_number=f"TEST-{order_num:06d}",
            order_type=order_type,
            status=Order.OrderStatus.PENDING,  # Start as PENDING to allow adding items
            cashier=cashier,
            customer=customer,
            created_at=order_date,
            updated_at=order_date,
        )

        # Add guest info for orders without customers
        if not customer and random.random() < 0.7:  # 70% of non-customer orders have guest names
            guest_names = ["Ahmed", "Fatima", "Omar", "Aisha", "Hassan", "Zainab", "Ali", "Mariam"]
            order.guest_first_name = random.choice(guest_names)
            order.save()

        # Generate realistic items based on pattern
        items_count = random.randint(*pattern['items'])
        total_spent = Decimal('0.00')

        for _ in range(items_count):
            # Choose product based on order pattern
            if pattern['type'] == 'quick_snack':
                product_pool = self.drink_products + self.signature_products[:5]  # Quick items
            elif pattern['type'] == 'meal':
                product_pool = self.food_products + self.drink_products + self.signature_products
            elif pattern['type'] == 'grocery_run':
                product_pool = self.grocery_products + self.drink_products
            else:  # large_order
                product_pool = self.products

            if not product_pool:
                product_pool = self.products

            product = random.choice(product_pool)
            quantity = random.randint(1, 3 if pattern['type'] != 'grocery_run' else 5)

            # Create order item
            self.stdout.write(f"Adding product {product.name} (price: {product.price}) qty: {quantity}")
            order_item = OrderService.add_item_to_order(
                order=order,
                product=product,
                quantity=quantity,
                force_add=True  # Skip inventory validation for test data
            )

            # Set realistic price at sale (with some variation)
            price_variation = Decimal(str(random.uniform(0.9, 1.1)))
            order_item.price_at_sale = product.price * price_variation
            order_item.save()
            
            line_total = order_item.price_at_sale * order_item.quantity
            self.stdout.write(f"Order item created: {product.name} - ${order_item.price_at_sale} x {quantity} = ${line_total}")
            total_spent += line_total

        # Recalculate order totals
        self.stdout.write(f"Before recalculation: subtotal={order.subtotal}, grand_total={order.grand_total}")
        OrderService.recalculate_order_totals(order)
        # Refresh from database to get updated values
        order.refresh_from_db()
        self.stdout.write(f"After recalculation: subtotal={order.subtotal}, grand_total={order.grand_total}")

        # Complete the order (change status from PENDING to COMPLETED)
        order.status = Order.OrderStatus.COMPLETED
        order.save()

        # Create payment
        try:
            self.stdout.write(f"Creating payment for order {order.order_number}...")
            self.create_realistic_payment(order, order_date)
            self.stdout.write(f"Payment created successfully for order {order.order_number}")
        except Exception as e:
            import traceback
            self.stdout.write(self.style.ERROR(f"Failed to create payment for order {order.order_number}: {str(e)}"))
            self.stdout.write(self.style.ERROR(f"Payment creation traceback: {traceback.format_exc()}"))
            raise  # Re-raise to be caught by the outer exception handler

        return order

    def create_realistic_payment(self, order, payment_date):
        """Create a realistic payment for the order"""
        # Payment methods distribution
        payment_methods = [
            ('cash', 30),
            ('card', 50),
            ('gift_card', 10),
            ('mixed', 10),  # Split payment
        ]

        method = self.choose_weighted_option(payment_methods)
        
        # Create the Payment object
        # Ensure grand_total is converted to Decimal
        grand_total_decimal = Decimal(str(order.grand_total))
        payment = Payment.objects.create(
            order=order,
            payment_number=f"PAY-{order.order_number}",
            status=Payment.PaymentStatus.PAID,
            total_amount_due=grand_total_decimal,
            amount_paid=grand_total_decimal,
            total_collected=grand_total_decimal,
            created_at=payment_date,
            updated_at=payment_date,
        )

        # Add realistic tips with varied probability and amounts
        tip_amount = Decimal('0.00')
        
        # Different tip probabilities based on order type and payment method
        if order.order_type == Order.OrderType.WEB:
            tip_chance = 0.15  # 15% chance for web orders
        else:
            tip_chance = 0.35  # 35% chance for POS orders (higher in-person tipping)
            
        # Higher tip chance for card payments
        if method in ['card', 'mixed']:
            tip_chance += 0.15
            
        if random.random() < tip_chance:
            # More varied tip amounts with realistic distributions
            tip_type = random.choices(
                ['small', 'standard', 'generous', 'round_up'],
                weights=[30, 40, 20, 10],  # Weighted probabilities
                k=1
            )[0]
            
            # Ensure grand_total is converted to Decimal
            grand_total_decimal = Decimal(str(order.grand_total))
            
            if tip_type == 'small':
                # 8-12% tip
                tip_percentage = Decimal(str(random.uniform(0.08, 0.12)))
            elif tip_type == 'standard':
                # 15-18% tip (most common)
                tip_percentage = Decimal(str(random.uniform(0.15, 0.18)))
            elif tip_type == 'generous':
                # 20-25% tip
                tip_percentage = Decimal(str(random.uniform(0.20, 0.25)))
            else:  # round_up
                # Round up to nearest $5 or $10
                current_total = float(grand_total_decimal)
                if current_total < 20:
                    rounded_total = ((current_total // 5) + 1) * 5
                else:
                    rounded_total = ((current_total // 10) + 1) * 10
                tip_amount = Decimal(str(rounded_total - current_total))
                
            # Calculate percentage-based tips
            if tip_type != 'round_up':
                tip_amount = grand_total_decimal * tip_percentage
                
            print(f"DEBUG: tip calculation - order_type: {order.order_type}, payment_method: {method}, tip_type: {tip_type}, grand_total: {grand_total_decimal}, tip_amount: {tip_amount}")
            payment.total_tips = tip_amount
            payment.total_collected += tip_amount

        # Create payment transactions based on method
        if method == 'mixed':
            # Split between cash and card
            cash_amount = grand_total_decimal * Decimal(str(random.uniform(0.3, 0.7)))
            card_amount = grand_total_decimal - cash_amount
            
            # Add 3% surcharge to card portion
            card_surcharge = card_amount * Decimal('0.03')
            payment.total_surcharges = card_surcharge
            
            # For mixed payments, sometimes tip goes to card, sometimes split, sometimes cash
            tip_distribution = random.choices(
                ['card_only', 'split', 'cash_only'],
                weights=[60, 30, 10],  # Most people add tip to card
                k=1
            )[0]
            
            if tip_distribution == 'card_only':
                cash_tip = Decimal('0.00')
                card_tip = tip_amount
            elif tip_distribution == 'split':
                cash_tip = tip_amount * Decimal('0.3')
                card_tip = tip_amount * Decimal('0.7')
            else:  # cash_only
                cash_tip = tip_amount
                card_tip = Decimal('0.00')
            
            print(f"DEBUG: mixed payment - cash_amount: {cash_amount}, card_amount: {card_amount}, card_surcharge: {card_surcharge}, cash_tip: {cash_tip}, card_tip: {card_tip}")

            self.create_payment_transaction(payment, 'CASH', cash_amount + cash_tip, payment_date, tip=cash_tip)
            # Card transaction includes surcharge and tip
            card_total = card_amount + card_surcharge + card_tip
            payment.total_collected = grand_total_decimal + card_surcharge + tip_amount
            self.create_payment_transaction(payment, 'CARD_TERMINAL', card_total, payment_date, surcharge=card_surcharge, tip=card_tip)
        else:
            if method == 'card':
                transaction_method = 'CARD_TERMINAL'
                # Add 3% surcharge for card transactions
                surcharge = grand_total_decimal * Decimal('0.03')
                payment.total_surcharges = surcharge
                transaction_total = grand_total_decimal + surcharge + tip_amount
                payment.total_collected = grand_total_decimal + surcharge + tip_amount
                print(f"DEBUG: card payment - grand_total: {grand_total_decimal}, surcharge: {surcharge}, tip: {tip_amount}, total: {transaction_total}")
                self.create_payment_transaction(payment, transaction_method, transaction_total, payment_date, surcharge=surcharge, tip=tip_amount)
            elif method == 'gift_card':
                transaction_method = 'GIFT_CARD'
                transaction_total = grand_total_decimal + tip_amount
                print(f"DEBUG: gift card payment - grand_total: {grand_total_decimal}, tip: {tip_amount}, total: {transaction_total}")
                self.create_payment_transaction(payment, transaction_method, transaction_total, payment_date, tip=tip_amount)
            else:  # cash
                transaction_method = method.upper()
                transaction_total = grand_total_decimal + tip_amount
                print(f"DEBUG: cash payment - grand_total: {grand_total_decimal}, tip: {tip_amount}, total: {transaction_total}")
                self.create_payment_transaction(payment, transaction_method, transaction_total, payment_date, tip=tip_amount)

        payment.save()
        return payment

    def choose_weighted_option(self, options):
        """Choose an option based on weights"""
        total_weight = sum(weight for _, weight in options)
        rand = random.uniform(0, total_weight)
        
        cumulative = 0
        for option, weight in options:
            cumulative += weight
            if rand <= cumulative:
                return option
        
        return options[0][0]  # Fallback

    def create_payment_transaction(self, payment, method, amount, transaction_date, surcharge=None, tip=None):
        """Create a payment transaction"""
        transaction_data = {
            'payment': payment,
            'transaction_id': f"{method}-{uuid.uuid4().hex[:8]}",
            'method': method,
            'amount': amount,
            'status': PaymentTransaction.TransactionStatus.SUCCESSFUL,
            'created_at': transaction_date,
        }
        
        # Add surcharge if provided
        if surcharge:
            transaction_data['surcharge'] = surcharge
            
        # Add tip if provided
        if tip:
            transaction_data['tip'] = tip
            
        transaction = PaymentTransaction.objects.create(**transaction_data)
        return transaction