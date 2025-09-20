from django.db import models
from django.utils import timezone
from django.db.models import Q, Prefetch
from datetime import datetime, timedelta
from orders.models import Order, OrderItem


class KDSOrderStatus(models.TextChoices):
    PENDING = 'pending', 'Pending'
    IN_PROGRESS = 'in_progress', 'In Progress'
    READY = 'ready', 'Ready'
    COMPLETED = 'completed', 'Completed'


class KDSOrderManager(models.Manager):
    """Custom manager for KDS orders with history query methods"""

    def get_optimized_queryset(self):
        """Get queryset with optimized joins for performance"""
        return self.select_related('order').prefetch_related(
            'items__order_item__product',
            'order__customer'
        )

    def completed_orders_for_zone(self, zone_id, date_from=None, date_to=None, limit=50, offset=0):
        """Get completed orders for a specific zone with date filtering"""
        if date_from is None:
            date_from = timezone.now() - timedelta(days=7)  # Default: last 7 days
        if date_to is None:
            date_to = timezone.now()

        # Check if this is a QC zone by looking at zone configuration
        is_qc_zone = self._is_qc_zone(zone_id)

        if is_qc_zone:
            # QC zones see all completed orders, not zone-specific
            return self.get_optimized_queryset().filter(
                status=KDSOrderStatus.COMPLETED,
                completed_at__range=(date_from, date_to)
            ).order_by('-completed_at')[offset:offset + limit]
        else:
            # Kitchen zones see orders that have items in their zone
            return self.get_optimized_queryset().filter(
                status=KDSOrderStatus.COMPLETED,
                assigned_kitchen_zones__contains=[zone_id],
                completed_at__range=(date_from, date_to)
            ).order_by('-completed_at')[offset:offset + limit]

    def _is_qc_zone(self, zone_id):
        """Helper to check if a zone is a QC zone"""
        try:
            from settings.models import PrinterConfiguration
            config = PrinterConfiguration.objects.first()
            if not config or not config.kitchen_zones:
                return False

            for zone in config.kitchen_zones:
                if zone.get('name') == zone_id:
                    zone_type = zone.get('zone_type')
                    if zone_type:
                        return zone_type == 'qc'
                    # Backward compatibility
                    return zone.get('is_qc_zone', False)
            return False
        except Exception:
            return False

    def search_completed_orders(self, search_term, zone_id=None, date_from=None, date_to=None, limit=50):
        """Search completed orders by order number or customer info"""
        if date_from is None:
            date_from = timezone.now() - timedelta(days=30)  # Default: last 30 days for search
        if date_to is None:
            date_to = timezone.now()

        queryset = self.get_optimized_queryset().filter(
            status=KDSOrderStatus.COMPLETED,
            completed_at__range=(date_from, date_to)
        )

        if zone_id:
            is_qc_zone = self._is_qc_zone(zone_id)
            if not is_qc_zone:
                # Only filter by zone for kitchen zones, not QC zones
                queryset = queryset.filter(assigned_kitchen_zones__contains=[zone_id])

        # If no search term, return all (used for QC zones)
        if not search_term:
            return queryset.order_by('-completed_at')[:limit]

        # Search by order number or customer information
        search_q = Q(order__order_number__icontains=search_term)

        # Search customer fields if they exist (registered customers)
        search_q |= Q(order__customer__first_name__icontains=search_term)
        search_q |= Q(order__customer__last_name__icontains=search_term)
        search_q |= Q(order__customer__email__icontains=search_term)
        search_q |= Q(order__customer__phone_number__icontains=search_term)
        # Guest order fields (for orders without registered customers)
        search_q |= Q(order__guest_first_name__icontains=search_term)
        search_q |= Q(order__guest_last_name__icontains=search_term)
        search_q |= Q(order__guest_phone__icontains=search_term)
        search_q |= Q(order__guest_email__icontains=search_term)

        return queryset.filter(search_q).order_by('-completed_at')[:limit]

    def get_recent_completed(self, hours=24, limit=100):
        """Get recently completed orders for dashboard/analytics"""
        cutoff_time = timezone.now() - timedelta(hours=hours)
        return self.get_optimized_queryset().filter(
            status=KDSOrderStatus.COMPLETED,
            completed_at__gte=cutoff_time
        ).order_by('-completed_at')[:limit]


class KDSOrder(models.Model):
    """Single KDS order that all zones can observe"""
    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='kds_order')
    status = models.CharField(max_length=20, choices=KDSOrderStatus.choices, default=KDSOrderStatus.PENDING)

    # Custom manager
    objects = KDSOrderManager()

    # Timestamps for workflow tracking
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ready_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Kitchen workflow tracking
    assigned_kitchen_zones = models.JSONField(default=list)  # ['grill', 'fryer']
    is_priority = models.BooleanField(default=False)

    # Legacy migration support
    legacy_id = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        ordering = ['-is_priority', 'created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['created_at']),
            models.Index(fields=['-is_priority', 'created_at']),
            # History query optimizations
            models.Index(fields=['status', 'completed_at']),
            models.Index(fields=['completed_at']),
            models.Index(fields=['status', 'created_at']),
        ]

    def __str__(self):
        return f"KDS-{self.order.order_number}"

    @property
    def prep_time_minutes(self):
        """Calculate preparation time in minutes"""
        if self.started_at and self.ready_at:
            return int((self.ready_at - self.started_at).total_seconds() / 60)
        return 0

    @property
    def total_time_minutes(self):
        """Calculate total time from creation to completion"""
        if self.completed_at:
            return int((self.completed_at - self.created_at).total_seconds() / 60)
        return int((timezone.now() - self.created_at).total_seconds() / 60)

    @property
    def is_overdue(self):
        """Check if order is overdue based on estimated prep time"""
        if self.status == KDSOrderStatus.COMPLETED:
            return False
        # Simple overdue logic - more than 30 minutes
        return self.total_time_minutes > 30

    def transition_to(self, new_status):
        """State machine for status transitions"""
        from .services.order_service import KDSOrderService
        return KDSOrderService.transition_order_status(self, new_status)

    def get_zone_items(self, zone_id):
        """Get items for a specific zone"""
        return self.items.filter(assigned_zone=zone_id)

    def get_kitchen_zones_data(self):
        """Get data grouped by kitchen zones for QC view"""
        zones = {}
        for item in self.items.all():
            zone = item.assigned_zone
            if zone not in zones:
                zones[zone] = []
            zones[zone].append({
                'id': str(item.id),
                'product_name': item.order_item.product.name if item.order_item.product else item.order_item.custom_name or 'Custom Item',
                'quantity': item.order_item.quantity,
                'status': item.status,
                'special_instructions': item.order_item.notes or '',
                'is_priority': item.is_priority,
                'started_at': item.started_at.isoformat() if item.started_at else None,
                'completed_at': item.completed_at.isoformat() if item.completed_at else None,
            })
        return zones

    def get_history_summary(self):
        """Get summary data for history display"""
        return {
            'id': str(self.id),
            'order_number': self.order.order_number,
            'customer_info': self.get_customer_display_info(),
            'status': self.status,
            'assigned_zones': self.assigned_kitchen_zones,
            'is_priority': self.is_priority,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'ready_at': self.ready_at.isoformat() if self.ready_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'prep_time_minutes': self.prep_time_minutes,
            'total_time_minutes': self.total_time_minutes,
            'item_count': self.items.count(),
            'order_total': str(self.order.total) if hasattr(self.order, 'total') else None,
        }

    def get_customer_display_info(self):
        """Get customer information for display in history"""
        order = self.order
        if hasattr(order, 'customer') and order.customer:
            return {
                'name': f"{order.customer.first_name} {order.customer.last_name}".strip(),
                'phone': getattr(order.customer, 'phone', None),
                'email': getattr(order.customer, 'email', None),
                'type': 'registered'
            }
        else:
            # Guest order
            return {
                'name': getattr(order, 'guest_name', None) or 'Guest Customer',
                'phone': getattr(order, 'guest_phone', None),
                'email': getattr(order, 'guest_email', None),
                'type': 'guest'
            }

    def get_timeline_data(self):
        """Get detailed timeline for order progression organized by zones"""
        timeline = []

        # Order created
        timeline.append({
            'timestamp': self.created_at.isoformat() if self.created_at else None,
            'event': 'order_created',
            'description': 'Order received and sent to kitchen',
            'zones': self.assigned_kitchen_zones,
            'sort_order': 0
        })

        # Group items by zone to create zone-specific events
        zone_items = {}
        for item in self.items.all():
            zone = item.assigned_zone
            if zone not in zone_items:
                zone_items[zone] = []
            zone_items[zone].append(item)

        # Create zone-specific events
        zone_events = []
        for zone, items in zone_items.items():
            # Find earliest start time for this zone
            zone_start_times = [item.started_at for item in items if item.started_at]
            zone_completion_times = [item.completed_at for item in items if item.completed_at]

            if zone_start_times:
                earliest_start = min(zone_start_times)
                # Items that started in this zone (only unique items)
                started_items = [item for item in items if item.started_at]
                started_items.sort(key=lambda x: x.started_at)

                zone_events.append({
                    'timestamp': earliest_start.isoformat(),
                    'event': 'zone_started',
                    'description': f'{zone} began preparing items',
                    'zone': zone,
                    'items': [
                        {
                            'name': item.order_item.product.name if item.order_item.product else 'Unknown Item',
                            'quantity': item.order_item.quantity,
                            'started_at': item.started_at.isoformat() if item.started_at else None
                        }
                        for item in started_items
                        if item.order_item.quantity > 0  # Filter out zero quantities
                    ],
                    'sort_order': 1,
                    'actual_time': earliest_start
                })

            if zone_completion_times:
                latest_completion = max(zone_completion_times)
                # Items that completed in this zone (only unique items)
                completed_items = [item for item in items if item.completed_at]
                completed_items.sort(key=lambda x: x.completed_at)

                zone_events.append({
                    'timestamp': latest_completion.isoformat(),
                    'event': 'zone_ready_for_qc',
                    'description': f'{zone} ready for quality control',
                    'zone': zone,
                    'items': [
                        {
                            'name': item.order_item.product.name if item.order_item.product else 'Unknown Item',
                            'quantity': item.order_item.quantity,
                            'completed_at': item.completed_at.isoformat() if item.completed_at else None,
                            'prep_time_minutes': item.prep_time_minutes
                        }
                        for item in completed_items
                        if item.order_item.quantity > 0  # Filter out zero quantities
                    ],
                    'sort_order': 2,
                    'actual_time': latest_completion
                })

        # Sort zone events by time
        zone_events.sort(key=lambda x: x['actual_time'])
        timeline.extend(zone_events)

        # All zones ready for QC: use the time when the LAST zone became ready
        if len(self.assigned_kitchen_zones) > 1:
            # Find all zone ready events
            zone_ready_events = [e for e in zone_events if e['event'] == 'zone_ready_for_qc']
            if zone_ready_events:
                # Use the timestamp of the last zone to become ready
                last_zone_ready = max(zone_ready_events, key=lambda x: x['actual_time'])
                timeline.append({
                    'timestamp': last_zone_ready['timestamp'],  # Use the same timestamp format
                    'event': 'all_zones_ready_for_qc',
                    'description': 'All kitchen zones ready for quality control',
                    'zones': self.assigned_kitchen_zones,
                    'actual_time': last_zone_ready['actual_time']
                })

        # Order completed
        if self.completed_at:
            timeline.append({
                'timestamp': self.completed_at.isoformat(),
                'event': 'order_completed',
                'description': 'Quality control completed - order ready for pickup/delivery',
                'zones': self.assigned_kitchen_zones,
                'sort_order': 4,
                'actual_time': self.completed_at
            })

        # Enhanced sorting: ensure logical order is maintained
        def sort_key(event):
            actual_time = event.get('actual_time')
            if actual_time:
                timestamp = actual_time
            else:
                # Fallback for order_created which doesn't have actual_time
                try:
                    from datetime import datetime
                    timestamp = datetime.fromisoformat(event['timestamp'].replace('Z', '+00:00'))
                except:
                    timestamp = self.created_at if self.created_at else datetime.min

            sort_order = event.get('sort_order', 999)

            # Special handling: ensure zone events come before order-level events at same time
            event_type = event.get('event', '')
            if event_type in ['zone_ready_for_qc']:
                priority = 0  # Zone ready events have highest priority at same timestamp
            elif event_type == 'all_zones_ready_for_qc':
                priority = 1  # All zones ready comes after individual zones
            elif event_type == 'order_completed':
                priority = 2  # Order completed comes last
            else:
                priority = sort_order

            return (timestamp, priority, sort_order)

        timeline.sort(key=sort_key)

        # Clean up internal sorting fields
        for event in timeline:
            event.pop('sort_order', None)
            event.pop('actual_time', None)

        return timeline


class KDSOrderItem(models.Model):
    """Individual items within a KDS order"""
    kds_order = models.ForeignKey(KDSOrder, on_delete=models.CASCADE, related_name='items')
    order_item = models.ForeignKey(OrderItem, on_delete=models.CASCADE, related_name='kds_items')
    assigned_zone = models.CharField(max_length=50)  # Which kitchen zone handles this item
    status = models.CharField(max_length=20, choices=KDSOrderStatus.choices, default=KDSOrderStatus.PENDING)

    # Item-specific attributes
    notes = models.TextField(blank=True)
    is_priority = models.BooleanField(default=False)

    # Timing for individual items
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Legacy migration support
    legacy_id = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        ordering = ['-is_priority', 'kds_order__created_at']
        indexes = [
            models.Index(fields=['assigned_zone', 'status']),
            models.Index(fields=['-is_priority']),
        ]
        # Ensure one item per zone per order item
        unique_together = ['order_item', 'assigned_zone']

    def __str__(self):
        product_name = self.order_item.product.name if self.order_item.product else self.order_item.custom_name or 'Custom Item'
        return f"{self.kds_order.order.order_number} - {product_name} ({self.assigned_zone})"

    @property
    def prep_time_minutes(self):
        """Calculate prep time for this specific item"""
        if self.started_at and self.completed_at:
            return int((self.completed_at - self.started_at).total_seconds() / 60)
        return 0

    @property
    def total_time_minutes(self):
        """Total time since item was created"""
        if self.completed_at:
            return int((self.completed_at - self.kds_order.created_at).total_seconds() / 60)
        return int((timezone.now() - self.kds_order.created_at).total_seconds() / 60)

    @property
    def is_overdue(self):
        """Check if this specific item is overdue"""
        if self.status == KDSOrderStatus.COMPLETED:
            return False
        return self.total_time_minutes > 20  # Items should be done in 20 minutes

    def transition_to(self, new_status):
        """Transition this item's status"""
        from .services.order_service import KDSOrderService
        return KDSOrderService.transition_item_status(self, new_status)

    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            'id': str(self.id),
            'product_name': self.order_item.product.name if self.order_item.product else self.order_item.custom_name or 'Custom Item',
            'quantity': self.order_item.quantity,
            'status': self.status,
            'assigned_zone': self.assigned_zone,
            'special_instructions': self.order_item.notes or '',
            'notes': self.notes,
            'is_priority': self.is_priority,
            'is_overdue': self.is_overdue,
            'prep_time_minutes': self.prep_time_minutes,
            'total_time_minutes': self.total_time_minutes,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'modifiers': self._get_modifiers_data(),
        }

    def _get_modifiers_data(self):
        """Get modifier data for this item"""
        try:
            if hasattr(self.order_item, 'selected_modifiers_snapshot'):
                return [
                    {
                        'modifier_set_name': mod.modifier_set_name,
                        'option_name': mod.option_name,
                        'price_at_sale': str(mod.price_at_sale)
                    }
                    for mod in self.order_item.selected_modifiers_snapshot.all()
                ]
        except:
            pass
        return []

    def get_history_summary(self):
        """Get summary data for history display"""
        return {
            'id': str(self.id),
            'product_name': self.order_item.product.name if self.order_item.product else self.order_item.custom_name or 'Custom Item',
            'quantity': self.order_item.quantity,
            'status': self.status,
            'assigned_zone': self.assigned_zone,
            'special_instructions': self.order_item.notes or '',
            'notes': self.notes,
            'is_priority': self.is_priority,
            'is_overdue': self.is_overdue,
            'prep_time_minutes': self.prep_time_minutes,
            'total_time_minutes': self.total_time_minutes,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'modifiers': self._get_modifiers_data(),
        }


class KDSSession(models.Model):
    """Track active KDS terminal sessions"""
    zone_id = models.CharField(max_length=50)
    terminal_id = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_activity = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['zone_id', 'terminal_id']
        ordering = ['-last_activity']

    def __str__(self):
        return f"{self.zone_id} - {self.terminal_id}"

    def update_activity(self):
        """Update last activity timestamp"""
        self.last_activity = timezone.now()
        self.save(update_fields=['last_activity'])

    @classmethod
    def cleanup_old_sessions(cls, hours=24):
        """Clean up old inactive sessions"""
        cutoff_time = timezone.now() - timezone.timedelta(hours=hours)
        return cls.objects.filter(last_activity__lt=cutoff_time).delete()

    @classmethod
    def get_active_sessions(cls):
        """Get all active sessions"""
        return cls.objects.filter(is_active=True)