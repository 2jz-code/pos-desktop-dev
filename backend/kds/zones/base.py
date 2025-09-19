from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class BaseKDSZone(ABC):
    """Abstract base class for all KDS zones"""

    def __init__(self, zone_id: str, zone_config: Dict[str, Any]):
        self.zone_id = zone_id
        self.zone_config = zone_config
        self.zone_type = self._get_zone_type()

    def _get_zone_type(self) -> str:
        """Determine zone type from config"""
        zone_type = self.zone_config.get('zone_type')
        if zone_type in ['kitchen', 'qc']:
            return zone_type
        # Backward compatibility
        return 'qc' if self.zone_config.get('is_qc_zone', False) else 'kitchen'

    @abstractmethod
    def get_orders(self) -> List[Dict[str, Any]]:
        """Get orders for this zone"""
        pass

    @abstractmethod
    def can_handle_item(self, order_item) -> bool:
        """Check if this zone should handle the item"""
        pass

    @abstractmethod
    def format_order_data(self, kds_order) -> Dict[str, Any]:
        """Format order data for this zone type"""
        pass

    def get_category_ids(self) -> List[int]:
        """Get category IDs this zone handles"""
        return self.zone_config.get('categories', [])

    def is_catch_all_zone(self) -> bool:
        """Check if this zone is a catch-all for unassigned items"""
        return len(self.get_category_ids()) == 0

    def _format_base_order_data(self, kds_order) -> Dict[str, Any]:
        """Common order data formatting"""
        return {
            'id': str(kds_order.id),
            'order_number': kds_order.order.order_number,
            'customer_name': kds_order.order.customer_display_name or 'Guest',
            'order_type': kds_order.order.order_type,
            'dining_preference': kds_order.order.dining_preference,
            'status': kds_order.status,
            'is_priority': kds_order.is_priority,
            'created_at': kds_order.created_at.isoformat(),
            'started_at': kds_order.started_at.isoformat() if kds_order.started_at else None,
            'ready_at': kds_order.ready_at.isoformat() if kds_order.ready_at else None,
            'completed_at': kds_order.completed_at.isoformat() if kds_order.completed_at else None,
            'prep_time_minutes': kds_order.prep_time_minutes,
            'total_time_minutes': kds_order.total_time_minutes,
            'is_overdue': kds_order.is_overdue,
        }

    def _format_item_data(self, item) -> Dict[str, Any]:
        """Common item data formatting"""
        return item.to_dict()

    def _log_debug(self, message: str, **kwargs):
        """Debug logging with zone context"""
        logger.debug(f"[{self.__class__.__name__}:{self.zone_id}] {message}", extra=kwargs)

    def _log_info(self, message: str, **kwargs):
        """Info logging with zone context"""
        logger.info(f"[{self.__class__.__name__}:{self.zone_id}] {message}", extra=kwargs)

    def _log_error(self, message: str, **kwargs):
        """Error logging with zone context"""
        logger.error(f"[{self.__class__.__name__}:{self.zone_id}] {message}", extra=kwargs)