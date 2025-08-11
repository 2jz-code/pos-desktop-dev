from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db.models import Sum, Count, Q, F
from django.utils import timezone
from orders.models import Order, OrderItem
from payments.models import Payment, PaymentTransaction
from tabulate import tabulate
import json


class Command(BaseCommand):
    help = 'Diagnose financial data inconsistencies between orders, payments, and transactions'

    def add_arguments(self, parser):
        parser.add_argument(
            '--order-id',
            type=str,
            help='Analyze specific order by ID',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=20,
            help='Limit number of orders to analyze in detail (default: 20)',
        )
        parser.add_argument(
            '--show-all-orders',
            action='store_true',
            help='Show analysis for all orders (can be very verbose)',
        )
        parser.add_argument(
            '--only-discrepancies',
            action='store_true',
            help='Only show orders with financial discrepancies',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('=' * 80))
        self.stdout.write(self.style.SUCCESS('FINANCIAL DISCREPANCY DIAGNOSTIC REPORT'))
        self.stdout.write(self.style.SUCCESS('=' * 80))
        self.stdout.write(f"Generated at: {timezone.now()}")
        self.stdout.write("")

        if options['order_id']:
            self.analyze_specific_order(options['order_id'])
        else:
            self.run_comprehensive_analysis(options)

    def run_comprehensive_analysis(self, options):
        """Run the full diagnostic analysis"""
        
        # 1. Database Statistics
        self.show_database_statistics()
        
        # 2. Transaction Status Analysis
        self.analyze_transaction_statuses()
        
        # 3. Aggregated Financial Totals
        self.show_aggregated_totals()
        
        # 4. Individual Order Analysis
        limit = None if options['show_all_orders'] else options['limit']
        self.analyze_individual_orders(
            limit=limit, 
            only_discrepancies=options['only_discrepancies']
        )
        
        # 5. Specific Discrepancy Patterns
        self.identify_discrepancy_patterns()
        
        # 6. Report Service Query Simulation
        self.simulate_report_queries()

    def show_database_statistics(self):
        """Show basic database statistics"""
        self.stdout.write(self.style.WARNING("\n1. DATABASE STATISTICS"))
        self.stdout.write("-" * 50)
        
        order_count = Order.objects.count()
        payment_count = Payment.objects.count()
        transaction_count = PaymentTransaction.objects.count()
        
        self.stdout.write(f"Total Orders: {order_count}")
        self.stdout.write(f"Total Payments: {payment_count}")
        self.stdout.write(f"Total Payment Transactions: {transaction_count}")
        
        # Orders without payments
        orders_without_payments = Order.objects.filter(payment_details__isnull=True).count()
        if orders_without_payments > 0:
            self.stdout.write(self.style.ERROR(f"⚠️  Orders without payments: {orders_without_payments}"))
        
        # Payments without transactions
        payments_without_transactions = Payment.objects.filter(
            transactions__isnull=True
        ).count()
        if payments_without_transactions > 0:
            self.stdout.write(self.style.ERROR(f"⚠️  Payments without transactions: {payments_without_transactions}"))

    def analyze_transaction_statuses(self):
        """Analyze transaction statuses to identify potential issues"""
        self.stdout.write(self.style.WARNING("\n2. TRANSACTION STATUS ANALYSIS"))
        self.stdout.write("-" * 50)
        
        status_counts = PaymentTransaction.objects.values('status').annotate(
            count=Count('id'),
            total_amount=Sum('amount'),
            total_tip=Sum('tip'),
            total_surcharge=Sum('surcharge')
        ).order_by('status')
        
        headers = ['Status', 'Count', 'Total Amount', 'Total Tip', 'Total Surcharge']
        rows = []
        
        for status_data in status_counts:
            rows.append([
                status_data['status'],
                status_data['count'],
                f"${status_data['total_amount'] or Decimal('0.00'):.2f}",
                f"${status_data['total_tip'] or Decimal('0.00'):.2f}",
                f"${status_data['total_surcharge'] or Decimal('0.00'):.2f}"
            ])
        
        self.stdout.write(tabulate(rows, headers=headers, tablefmt='grid'))
        
        # Check for non-successful transactions that might be included in calculations
        non_successful_with_amounts = PaymentTransaction.objects.exclude(
            status='SUCCESSFUL'
        ).filter(
            Q(amount__gt=0) | Q(tip__gt=0) | Q(surcharge__gt=0)
        )
        
        if non_successful_with_amounts.exists():
            self.stdout.write(self.style.ERROR(
                f"\n⚠️  Found {non_successful_with_amounts.count()} non-successful transactions with positive amounts!"
            ))
            for txn in non_successful_with_amounts[:5]:  # Show first 5
                self.stdout.write(f"   - Transaction {txn.id}: {txn.status}, Amount: ${txn.amount}, Tip: ${txn.tip}")

    def show_aggregated_totals(self):
        """Show aggregated totals across all financial fields"""
        self.stdout.write(self.style.WARNING("\n3. AGGREGATED FINANCIAL TOTALS"))
        self.stdout.write("-" * 50)
        
        # Order totals
        order_aggregates = Order.objects.aggregate(
            total_subtotal=Sum('subtotal'),
            total_tax=Sum('tax_total'),
            total_grand_total=Sum('grand_total')
        )
        
        # Payment totals
        payment_aggregates = Payment.objects.aggregate(
            total_collected=Sum('total_collected'),
            total_amount_due=Sum('total_amount_due'),
            total_tips=Sum('total_tips'),
            total_surcharges=Sum('total_surcharges')
        )
        
        # Transaction totals (successful only)
        successful_txn_aggregates = PaymentTransaction.objects.filter(
            status='SUCCESSFUL'
        ).aggregate(
            total_amount=Sum('amount'),
            total_tip=Sum('tip'),
            total_surcharge=Sum('surcharge')
        )
        
        # All transaction totals (for comparison)
        all_txn_aggregates = PaymentTransaction.objects.aggregate(
            total_amount=Sum('amount'),
            total_tip=Sum('tip'),
            total_surcharge=Sum('surcharge')
        )
        
        # Display results
        self.stdout.write("ORDER TOTALS:")
        self.stdout.write(f"  Subtotal Sum: ${order_aggregates['total_subtotal'] or Decimal('0.00'):.2f}")
        self.stdout.write(f"  Tax Sum: ${order_aggregates['total_tax'] or Decimal('0.00'):.2f}")
        self.stdout.write(f"  Grand Total Sum: ${order_aggregates['total_grand_total'] or Decimal('0.00'):.2f}")
        
        self.stdout.write("\nPAYMENT TOTALS:")
        self.stdout.write(f"  Total Collected Sum: ${payment_aggregates['total_collected'] or Decimal('0.00'):.2f}")
        self.stdout.write(f"  Amount Due Sum: ${payment_aggregates['total_amount_due'] or Decimal('0.00'):.2f}")
        self.stdout.write(f"  Tips Sum: ${payment_aggregates['total_tips'] or Decimal('0.00'):.2f}")
        self.stdout.write(f"  Surcharges Sum: ${payment_aggregates['total_surcharges'] or Decimal('0.00'):.2f}")
        
        self.stdout.write("\nTRANSACTION TOTALS (Successful Only):")
        self.stdout.write(f"  Amount Sum: ${successful_txn_aggregates['total_amount'] or Decimal('0.00'):.2f}")
        self.stdout.write(f"  Tip Sum: ${successful_txn_aggregates['total_tip'] or Decimal('0.00'):.2f}")
        self.stdout.write(f"  Surcharge Sum: ${successful_txn_aggregates['total_surcharge'] or Decimal('0.00'):.2f}")
        
        self.stdout.write("\nTRANSACTION TOTALS (All Statuses):")
        self.stdout.write(f"  Amount Sum: ${all_txn_aggregates['total_amount'] or Decimal('0.00'):.2f}")
        self.stdout.write(f"  Tip Sum: ${all_txn_aggregates['total_tip'] or Decimal('0.00'):.2f}")
        self.stdout.write(f"  Surcharge Sum: ${all_txn_aggregates['total_surcharge'] or Decimal('0.00'):.2f}")
        
        # Calculate discrepancies
        self.stdout.write(self.style.ERROR("\nDISCREPANCY ANALYSIS:"))
        
        order_grand_total = order_aggregates['total_grand_total'] or Decimal('0.00')
        payment_collected = payment_aggregates['total_collected'] or Decimal('0.00')
        successful_txn_total = successful_txn_aggregates['total_amount'] or Decimal('0.00')
        all_txn_total = all_txn_aggregates['total_amount'] or Decimal('0.00')
        
        discrepancy_1 = order_grand_total - payment_collected
        discrepancy_2 = payment_collected - successful_txn_total
        discrepancy_3 = successful_txn_total - all_txn_total
        
        self.stdout.write(f"  Order Grand Total vs Payment Collected: ${discrepancy_1:.2f}")
        self.stdout.write(f"  Payment Collected vs Successful Transactions: ${discrepancy_2:.2f}")
        self.stdout.write(f"  Successful vs All Transactions: ${discrepancy_3:.2f}")

    def analyze_individual_orders(self, limit=None, only_discrepancies=False):
        """Analyze individual orders for discrepancies"""
        self.stdout.write(self.style.WARNING("\n4. INDIVIDUAL ORDER ANALYSIS"))
        self.stdout.write("-" * 50)
        
        orders_query = Order.objects.select_related('payment_details').prefetch_related(
            'payment_details__transactions'
        )
        
        if limit:
            orders_query = orders_query[:limit]
        
        discrepancy_count = 0
        orders_analyzed = 0
        
        for order in orders_query:
            orders_analyzed += 1
            analysis = self.analyze_single_order(order)
            
            has_discrepancy = (
                analysis['order_vs_payment_discrepancy'] != 0 or
                analysis['payment_vs_transactions_discrepancy'] != 0 or
                analysis['transactions_status_discrepancy'] != 0
            )
            
            if only_discrepancies and not has_discrepancy:
                continue
                
            if has_discrepancy:
                discrepancy_count += 1
                
            self.display_order_analysis(order, analysis, has_discrepancy)
        
        self.stdout.write(f"\nSUMMARY: Analyzed {orders_analyzed} orders, found {discrepancy_count} with discrepancies")

    def analyze_single_order(self, order):
        """Analyze a single order's financial data"""
        analysis = {
            'order_id': str(order.id),
            'order_number': order.order_number,
            'order_subtotal': order.subtotal,
            'order_tax_total': order.tax_total,
            'order_grand_total': order.grand_total,
            'has_payment': hasattr(order, 'payment_details') and order.payment_details is not None,
        }
        
        if analysis['has_payment']:
            payment = order.payment_details
            analysis.update({
                'payment_total_collected': payment.total_collected,
                'payment_amount_due': payment.total_amount_due,
                'payment_tips': payment.total_tips,
                'payment_surcharges': payment.total_surcharges,
            })
            
            # Transaction analysis
            all_transactions = payment.transactions.all()
            successful_transactions = all_transactions.filter(status='SUCCESSFUL')
            
            analysis.update({
                'total_transactions': all_transactions.count(),
                'successful_transactions': successful_transactions.count(),
                'all_transactions_amount': sum(t.amount for t in all_transactions),
                'all_transactions_tip': sum(t.tip for t in all_transactions),
                'all_transactions_surcharge': sum(t.surcharge for t in all_transactions),
                'successful_transactions_amount': sum(t.amount for t in successful_transactions),
                'successful_transactions_tip': sum(t.tip for t in successful_transactions),
                'successful_transactions_surcharge': sum(t.surcharge for t in successful_transactions),
            })
            
            # Calculate discrepancies
            analysis['order_vs_payment_discrepancy'] = analysis['order_grand_total'] - analysis['payment_total_collected']
            analysis['payment_vs_transactions_discrepancy'] = analysis['payment_total_collected'] - analysis['successful_transactions_amount']
            analysis['transactions_status_discrepancy'] = analysis['all_transactions_amount'] - analysis['successful_transactions_amount']
            
        else:
            analysis.update({
                'payment_total_collected': Decimal('0.00'),
                'payment_amount_due': Decimal('0.00'),
                'payment_tips': Decimal('0.00'),
                'payment_surcharges': Decimal('0.00'),
                'total_transactions': 0,
                'successful_transactions': 0,
                'all_transactions_amount': Decimal('0.00'),
                'successful_transactions_amount': Decimal('0.00'),
                'order_vs_payment_discrepancy': analysis['order_grand_total'],
                'payment_vs_transactions_discrepancy': Decimal('0.00'),
                'transactions_status_discrepancy': Decimal('0.00'),
            })
        
        return analysis

    def display_order_analysis(self, order, analysis, has_discrepancy):
        """Display analysis for a single order"""
        if has_discrepancy:
            self.stdout.write(self.style.ERROR(f"\n⚠️  ORDER {analysis['order_number']} (ID: {analysis['order_id']}) - DISCREPANCY FOUND"))
        else:
            self.stdout.write(f"\n✅ ORDER {analysis['order_number']} (ID: {analysis['order_id']}) - OK")
        
        # Order details
        self.stdout.write(f"  Order Subtotal: ${analysis['order_subtotal']:.2f}")
        self.stdout.write(f"  Order Tax: ${analysis['order_tax_total']:.2f}")
        self.stdout.write(f"  Order Grand Total: ${analysis['order_grand_total']:.2f}")
        
        if analysis['has_payment']:
            # Payment details
            self.stdout.write(f"  Payment Total Collected: ${analysis['payment_total_collected']:.2f}")
            self.stdout.write(f"  Payment Amount Due: ${analysis['payment_amount_due']:.2f}")
            self.stdout.write(f"  Payment Tips: ${analysis['payment_tips']:.2f}")
            self.stdout.write(f"  Payment Surcharges: ${analysis['payment_surcharges']:.2f}")
            
            # Transaction details
            self.stdout.write(f"  Total Transactions: {analysis['total_transactions']} (Successful: {analysis['successful_transactions']})")
            self.stdout.write(f"  All Transactions Amount: ${analysis['all_transactions_amount']:.2f}")
            self.stdout.write(f"  Successful Transactions Amount: ${analysis['successful_transactions_amount']:.2f}")
            
            # Discrepancies
            if analysis['order_vs_payment_discrepancy'] != 0:
                self.stdout.write(self.style.ERROR(f"  🔸 Order vs Payment Discrepancy: ${analysis['order_vs_payment_discrepancy']:.2f}"))
            
            if analysis['payment_vs_transactions_discrepancy'] != 0:
                self.stdout.write(self.style.ERROR(f"  🔸 Payment vs Transactions Discrepancy: ${analysis['payment_vs_transactions_discrepancy']:.2f}"))
            
            if analysis['transactions_status_discrepancy'] != 0:
                self.stdout.write(self.style.ERROR(f"  🔸 Transaction Status Discrepancy: ${analysis['transactions_status_discrepancy']:.2f}"))
                
            # Show individual transactions if there are discrepancies
            if has_discrepancy and hasattr(order, 'payment_details'):
                self.stdout.write("  Transaction Details:")
                for txn in order.payment_details.transactions.all():
                    status_indicator = "✅" if txn.status == 'SUCCESSFUL' else "❌"
                    self.stdout.write(f"    {status_indicator} {txn.id}: {txn.status} - ${txn.amount:.2f} (tip: ${txn.tip:.2f})")
        
        else:
            self.stdout.write(self.style.ERROR("  ❌ NO PAYMENT RECORD"))

    def identify_discrepancy_patterns(self):
        """Identify common patterns in discrepancies"""
        self.stdout.write(self.style.WARNING("\n5. DISCREPANCY PATTERN ANALYSIS"))
        self.stdout.write("-" * 50)
        
        # Orders with grand_total != payment.total_collected
        orders_with_payment_discrepancy = Order.objects.select_related('payment_details').exclude(
            payment_details__isnull=True
        ).exclude(
            grand_total=F('payment_details__total_collected')
        )
        
        self.stdout.write(f"Orders where grand_total ≠ payment.total_collected: {orders_with_payment_discrepancy.count()}")
        
        if orders_with_payment_discrepancy.exists():
            self.stdout.write("\nTop 10 examples:")
            for order in orders_with_payment_discrepancy[:10]:
                diff = order.grand_total - order.payment_details.total_collected
                self.stdout.write(f"  Order {order.order_number}: Grand Total ${order.grand_total:.2f} vs Collected ${order.payment_details.total_collected:.2f} (Diff: ${diff:.2f})")
        
        # Payments where total_collected != sum of successful transactions
        payments_with_transaction_discrepancy = []
        for payment in Payment.objects.prefetch_related('transactions'):
            successful_amount = sum(
                txn.amount for txn in payment.transactions.filter(status='SUCCESSFUL')
            )
            if payment.total_collected != successful_amount:
                payments_with_transaction_discrepancy.append({
                    'payment': payment,
                    'collected': payment.total_collected,
                    'successful_amount': successful_amount,
                    'difference': payment.total_collected - successful_amount
                })
        
        self.stdout.write(f"\nPayments where total_collected ≠ sum of successful transactions: {len(payments_with_transaction_discrepancy)}")
        
        if payments_with_transaction_discrepancy:
            self.stdout.write("\nTop 10 examples:")
            for item in payments_with_transaction_discrepancy[:10]:
                payment = item['payment']
                order_number = payment.order.order_number if hasattr(payment, 'order') else 'N/A'
                self.stdout.write(f"  Payment for Order {order_number}: Collected ${item['collected']:.2f} vs Transactions ${item['successful_amount']:.2f} (Diff: ${item['difference']:.2f})")

    def simulate_report_queries(self):
        """Simulate the queries that the reports service would run"""
        self.stdout.write(self.style.WARNING("\n6. REPORT SERVICE QUERY SIMULATION"))
        self.stdout.write("-" * 50)
        
        # Simulate common report queries
        self.stdout.write("Simulating typical report service queries:")
        
        # Query 1: Total sales from Order.grand_total
        total_sales_from_orders = Order.objects.aggregate(
            total=Sum('grand_total')
        )['total'] or Decimal('0.00')
        self.stdout.write(f"1. Total Sales (from Order.grand_total): ${total_sales_from_orders:.2f}")
        
        # Query 2: Total collected from Payment.total_collected
        total_collected_from_payments = Payment.objects.aggregate(
            total=Sum('total_collected')
        )['total'] or Decimal('0.00')
        self.stdout.write(f"2. Total Collected (from Payment.total_collected): ${total_collected_from_payments:.2f}")
        
        # Query 3: Total transactions (successful only)
        total_from_successful_transactions = PaymentTransaction.objects.filter(
            status='SUCCESSFUL'
        ).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0.00')
        self.stdout.write(f"3. Total from Successful Transactions: ${total_from_successful_transactions:.2f}")
        
        # Query 4: Total transactions (all statuses)
        total_from_all_transactions = PaymentTransaction.objects.aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0.00')
        self.stdout.write(f"4. Total from All Transactions: ${total_from_all_transactions:.2f}")
        
        # Show the exact discrepancies mentioned in the issue
        self.stdout.write(self.style.ERROR("\nREPORT DISCREPANCIES:"))
        discrepancy_1 = total_sales_from_orders - total_collected_from_payments
        discrepancy_2 = total_collected_from_payments - total_from_successful_transactions
        
        self.stdout.write(f"Order.grand_total vs Payment.total_collected: ${discrepancy_1:.2f}")
        self.stdout.write(f"Payment.total_collected vs Successful Transactions: ${discrepancy_2:.2f}")
        
        if abs(discrepancy_1) == Decimal('10.77'):
            self.stdout.write(self.style.ERROR("📍 Found the +10.77 discrepancy between orders and payments!"))
        
        if abs(discrepancy_2) == Decimal('31.51'):
            self.stdout.write(self.style.ERROR("📍 Found the -31.51 discrepancy between payments and transactions!"))

    def analyze_specific_order(self, order_id):
        """Analyze a specific order in detail"""
        try:
            order = Order.objects.select_related('payment_details').prefetch_related(
                'payment_details__transactions',
                'items'
            ).get(id=order_id)
        except Order.DoesNotExist:
            self.stdout.write(self.style.ERROR(f"Order with ID {order_id} not found"))
            return
        
        self.stdout.write(self.style.SUCCESS(f"DETAILED ANALYSIS FOR ORDER {order.order_number}"))
        self.stdout.write("=" * 60)
        
        # Basic order info
        self.stdout.write(f"Order ID: {order.id}")
        self.stdout.write(f"Order Number: {order.order_number}")
        self.stdout.write(f"Status: {order.status}")
        self.stdout.write(f"Created: {order.created_at}")
        
        # Order financial details
        self.stdout.write(f"\nORDER FINANCIALS:")
        self.stdout.write(f"  Subtotal: ${order.subtotal:.2f}")
        self.stdout.write(f"  Tax Total: ${order.tax_total:.2f}")
        self.stdout.write(f"  Grand Total: ${order.grand_total:.2f}")
        
        # Order items breakdown
        self.stdout.write(f"\nORDER ITEMS:")
        total_from_items = Decimal('0.00')
        for item in order.items.all():
            line_total = item.price_at_sale * item.quantity
            total_from_items += line_total
            self.stdout.write(f"  - {item.product.name}: {item.quantity} x ${item.price_at_sale:.2f} = ${line_total:.2f}")
        
        self.stdout.write(f"  Total from items: ${total_from_items:.2f}")
        
        # Payment details
        if hasattr(order, 'payment_details') and order.payment_details:
            payment = order.payment_details
            self.stdout.write(f"\nPAYMENT DETAILS:")
            self.stdout.write(f"  Payment ID: {payment.id}")
            self.stdout.write(f"  Status: {payment.status}")
            self.stdout.write(f"  Total Collected: ${payment.total_collected:.2f}")
            self.stdout.write(f"  Amount Due: ${payment.total_amount_due:.2f}")
            self.stdout.write(f"  Tips: ${payment.total_tips:.2f}")
            self.stdout.write(f"  Surcharges: ${payment.total_surcharges:.2f}")
            
            # Transaction details
            transactions = payment.transactions.all()
            self.stdout.write(f"\nTRANSACTIONS ({transactions.count()} total):")
            
            successful_total = Decimal('0.00')
            all_total = Decimal('0.00')
            
            for txn in transactions:
                status_indicator = "✅" if txn.status == 'SUCCESSFUL' else "❌"
                self.stdout.write(f"  {status_indicator} Transaction {txn.id}:")
                self.stdout.write(f"    Status: {txn.status}")
                self.stdout.write(f"    Amount: ${txn.amount:.2f}")
                self.stdout.write(f"    Tip: ${txn.tip:.2f}")
                self.stdout.write(f"    Surcharge: ${txn.surcharge:.2f}")
                self.stdout.write(f"    Method: {txn.method}")
                self.stdout.write(f"    Provider: {txn.provider}")
                self.stdout.write(f"    Created: {txn.created_at}")
                
                all_total += txn.amount
                if txn.status == 'SUCCESSFUL':
                    successful_total += txn.amount
            
            self.stdout.write(f"\n  Sum of all transactions: ${all_total:.2f}")
            self.stdout.write(f"  Sum of successful transactions: ${successful_total:.2f}")
            
            # Discrepancy analysis
            self.stdout.write(self.style.ERROR(f"\nDISCREPANCY ANALYSIS:"))
            
            order_payment_diff = order.grand_total - payment.total_collected
            payment_txn_diff = payment.total_collected - successful_total
            txn_status_diff = all_total - successful_total
            
            if order_payment_diff != 0:
                self.stdout.write(self.style.ERROR(f"  Order Grand Total vs Payment Collected: ${order_payment_diff:.2f}"))
            else:
                self.stdout.write("  ✅ Order Grand Total matches Payment Collected")
                
            if payment_txn_diff != 0:
                self.stdout.write(self.style.ERROR(f"  Payment Collected vs Successful Transactions: ${payment_txn_diff:.2f}"))
            else:
                self.stdout.write("  ✅ Payment Collected matches Successful Transactions")
                
            if txn_status_diff != 0:
                self.stdout.write(self.style.ERROR(f"  All Transactions vs Successful Transactions: ${txn_status_diff:.2f}"))
            else:
                self.stdout.write("  ✅ All transactions are successful")
        
        else:
            self.stdout.write(self.style.ERROR("\n❌ NO PAYMENT RECORD FOR THIS ORDER"))
            self.stdout.write(f"  This creates a discrepancy of ${order.grand_total:.2f}")