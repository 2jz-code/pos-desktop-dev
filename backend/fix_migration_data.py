#!/usr/bin/env python
"""
Data correction script to fix financial inconsistencies from migration.
This script ensures Order and Payment financial fields are properly aligned.
"""
import os
import django
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core_backend.settings')
django.setup()

from orders.models import Order
from payments.models import Payment
from datetime import datetime
import pytz
from django.db.models import Sum
from decimal import Decimal
from django.db import transaction

def fix_financial_data():
    """Fix financial data inconsistencies from migration"""
    
    print("FIXING MIGRATION FINANCIAL DATA")
    print("=" * 50)
    
    # Get orders in your test period
    test_start = datetime(2025, 6, 1, tzinfo=pytz.UTC)
    test_end = datetime(2025, 7, 10, 23, 59, 59, tzinfo=pytz.UTC)
    
    orders = Order.objects.filter(
        status='COMPLETED',
        created_at__range=(test_start, test_end),
        legacy_id__isnull=False  # Only fix migrated orders
    ).select_related('payment_details')
    
    print(f"Processing {orders.count()} migrated orders...")
    
    fixed_count = 0
    total_adjustment = Decimal('0.00')
    
    with transaction.atomic():
        for order in orders:
            if not hasattr(order, 'payment_details') or not order.payment_details:
                continue
                
            payment = order.payment_details
            
            # Calculate what the order.grand_total SHOULD be (excluding tips/surcharges)
            correct_grand_total = (
                order.subtotal + 
                order.tax_total - 
                order.total_discounts_amount
            )
            
            # Calculate what payment.total_amount_due SHOULD be  
            correct_total_amount_due = correct_grand_total
            
            # Check if order.grand_total includes tips/surcharges (incorrect)
            order_includes_extras = abs(order.grand_total - (correct_grand_total + payment.total_tips + payment.total_surcharges)) < 0.01
            
            if order_includes_extras:
                # Fix the order grand_total by removing tips/surcharges
                old_grand_total = order.grand_total
                order.grand_total = correct_grand_total
                order.save(update_fields=['grand_total'])
                
                adjustment = old_grand_total - correct_grand_total
                total_adjustment += adjustment
                fixed_count += 1
                
                if fixed_count <= 5:  # Show first 5 examples
                    print(f"  Fixed Order {order.legacy_id}: ${old_grand_total:.2f} -> ${correct_grand_total:.2f} (removed ${adjustment:.2f})")
            
            # Always fix payment.total_amount_due to match corrected order total
            if abs(payment.total_amount_due - correct_total_amount_due) > 0.01:
                payment.total_amount_due = correct_total_amount_due
                payment.save(update_fields=['total_amount_due'])
    
    print(f"\nFixed {fixed_count} orders")
    print(f"Total grand_total adjustment: ${total_adjustment:.2f}")
    
    # Verify the fix
    print(f"\nVERIFICATION:")
    order_total_after = orders.aggregate(total=Sum('grand_total'))['total']
    payment_total_after = Payment.objects.filter(order__in=orders).aggregate(total=Sum('total_amount_due'))['total']
    
    print(f"Order grand_total sum: ${order_total_after:,.2f}")
    print(f"Payment total_amount_due sum: ${payment_total_after:,.2f}")
    print(f"Difference: ${abs(order_total_after - payment_total_after):,.2f}")
    
    return {
        'fixed_count': fixed_count,
        'total_adjustment': float(total_adjustment),
        'order_total_after': float(order_total_after),
        'payment_total_after': float(payment_total_after)
    }

if __name__ == '__main__':
    fix_financial_data()