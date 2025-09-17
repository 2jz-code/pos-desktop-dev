from django.db import models
from django.utils import timezone
from orders.models import Order, OrderItem


class KDSOrderStatus(models.TextChoices):
    PENDING = 'pending', 'Pending'
    IN_PROGRESS = 'in_progress', 'In Progress'
    READY = 'ready', 'Ready'
    COMPLETED = 'completed', 'Completed'


class KDSOrder(models.Model):
    """Single KDS order that all zones can observe"""
    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='kds_order')
    status = models.CharField(max_length=20, choices=KDSOrderStatus.choices, default=KDSOrderStatus.PENDING)

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