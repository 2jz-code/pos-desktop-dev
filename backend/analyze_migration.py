#!/usr/bin/env python
import os
import django
import sys

# Add the backend directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core_backend.settings')
django.setup()

from orders.models import Order
from payments.models import Payment  
from datetime import datetime
import pytz
from django.db.models import Sum

def analyze_migration_discrepancies():
    test_start = datetime(2025, 6, 1, tzinfo=pytz.UTC)
    test_end = datetime(2025, 7, 10, 23, 59, 59, tzinfo=pytz.UTC)

    orders = Order.objects.filter(
        status='COMPLETED',
        created_at__range=(test_start, test_end)
    ).select_related('payment_details')

    print('MIGRATION DATA INTEGRITY ANALYSIS')
    print('=' * 50)

    # Calculate totals from orders vs payments
    order_total = orders.aggregate(total=Sum('grand_total'))['total']
    payment_total = Payment.objects.filter(order__in=orders).aggregate(total=Sum('total_amount_due'))['total']

    print(f'Sum of order.grand_total: ${order_total:,.2f}')
    print(f'Sum of payment.total_amount_due: ${payment_total:,.2f}')
    print(f'Difference: ${order_total - payment_total:,.2f}')

    # Check individual order mismatches
    mismatched_count = 0
    total_diff = 0
    sample_mismatches = []

    for order in orders:
        if hasattr(order, 'payment_details') and order.payment_details:
            diff = order.grand_total - order.payment_details.total_amount_due
            if abs(diff) > 0.01:  # More than 1 cent difference
                mismatched_count += 1
                total_diff += diff
                if len(sample_mismatches) < 5:  # Collect first 5 examples
                    sample_mismatches.append({
                        'legacy_id': order.legacy_id,
                        'order_total': order.grand_total,
                        'payment_due': order.payment_details.total_amount_due,
                        'difference': diff
                    })

    print(f'\nOrders with mismatched totals: {mismatched_count}/{orders.count()}')
    print(f'Total difference from mismatches: ${total_diff:,.2f}')

    # Show sample mismatches
    print(f'\nSample mismatches:')
    for mismatch in sample_mismatches:
        print(f"  Order {mismatch['legacy_id']}: ${mismatch['order_total']:.2f} vs ${mismatch['payment_due']:.2f} (diff: ${mismatch['difference']:.2f})")

    # Compare with your reported discrepancy
    original_revenue = 14994.04
    new_revenue = 15040.77
    actual_discrepancy = new_revenue - original_revenue

    print(f'\nDISCREPANCY ANALYSIS:')
    print(f'Your reported discrepancy: ${actual_discrepancy:.2f}')
    print(f'Migration mismatch total: ${total_diff:.2f}')
    print(f'Percentage of discrepancy explained: {(total_diff/actual_discrepancy)*100:.1f}%')

    # Additional analysis - check which reports are using which field
    print(f'\nREPORT FIELD USAGE:')
    print(f'If reports use order.grand_total: ${order_total:,.2f}')
    print(f'If reports use payment.total_amount_due: ${payment_total:,.2f}')
    print(f'Original POS reported: $14,994.04')
    
    return {
        'order_total': float(order_total),
        'payment_total': float(payment_total),
        'mismatch_diff': float(total_diff),
        'mismatched_count': mismatched_count,
        'total_orders': orders.count()
    }

if __name__ == '__main__':
    analyze_migration_discrepancies()