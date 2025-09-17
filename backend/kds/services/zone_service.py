from typing import Dict, Optional
import logging

from ..zones.base import BaseKDSZone
from ..zones.kitchen import KitchenZone
from ..zones.qc import QCZone

logger = logging.getLogger(__name__)


class KDSZoneService:
    """Factory and management for KDS zones"""

    _zone_classes = {
        'kitchen': KitchenZone,
        'qc': QCZone,
    }

    @classmethod
    def get_zone(cls, zone_id: str) -> Optional[BaseKDSZone]:
        """Factory method to create zone instances"""
        try:
            from settings.models import PrinterConfiguration

            config = PrinterConfiguration.objects.first()
            if not config:
                logger.error("No printer configuration found")
                return None

            # Find zone config
            zone_config = None
            for zone in config.kitchen_zones or []:
                if zone.get('name') == zone_id:
                    zone_config = zone
                    break

            if not zone_config:
                logger.error(f"Zone {zone_id} not found in configuration")
                return None

            # Determine zone type
            zone_type = zone_config.get('zone_type')
            if zone_type not in ['kitchen', 'qc']:
                # Backward compatibility
                zone_type = 'qc' if zone_config.get('is_qc_zone', False) else 'kitchen'

            zone_class = cls._zone_classes.get(zone_type)
            if not zone_class:
                logger.error(f"Unknown zone type: {zone_type}")
                return None

            logger.debug(f"Creating {zone_type} zone instance for {zone_id}")
            return zone_class(zone_id, zone_config)

        except Exception as e:
            logger.error(f"Error creating zone {zone_id}: {e}")
            return None

    @classmethod
    def get_all_zones(cls) -> Dict[str, BaseKDSZone]:
        """Get all configured zones"""
        zones = {}

        try:
            from settings.models import PrinterConfiguration

            config = PrinterConfiguration.objects.first()
            if not config or not config.kitchen_zones:
                logger.warning("No kitchen zones configured")
                return zones

            for zone_config in config.kitchen_zones:
                zone_id = zone_config.get('name')
                if zone_id:
                    zone = cls.get_zone(zone_id)
                    if zone:
                        zones[zone_id] = zone
                    else:
                        logger.warning(f"Failed to create zone for {zone_id}")

            logger.info(f"Loaded {len(zones)} zones: {list(zones.keys())}")
            return zones

        except Exception as e:
            logger.error(f"Error getting all zones: {e}")
            return zones

    @classmethod
    def get_kitchen_zones(cls) -> Dict[str, BaseKDSZone]:
        """Get only kitchen zones"""
        all_zones = cls.get_all_zones()
        return {zone_id: zone for zone_id, zone in all_zones.items()
                if zone.zone_type == 'kitchen'}

    @classmethod
    def get_qc_zones(cls) -> Dict[str, BaseKDSZone]:
        """Get only QC zones"""
        all_zones = cls.get_all_zones()
        return {zone_id: zone for zone_id, zone in all_zones.items()
                if zone.zone_type == 'qc'}

    @classmethod
    def get_zone_type(cls, zone_id: str) -> Optional[str]:
        """Get the type of a zone"""
        zone = cls.get_zone(zone_id)
        return zone.zone_type if zone else None

    @classmethod
    def is_kitchen_zone(cls, zone_id: str) -> bool:
        """Check if a zone is a kitchen zone"""
        return cls.get_zone_type(zone_id) == 'kitchen'

    @classmethod
    def is_qc_zone(cls, zone_id: str) -> bool:
        """Check if a zone is a QC zone"""
        return cls.get_zone_type(zone_id) == 'qc'

    @classmethod
    def validate_zone_configuration(cls) -> Dict[str, bool]:
        """Validate the current zone configuration"""
        results = {
            'has_kitchen_zones': False,
            'has_qc_zones': False,
            'has_catch_all_kitchen': False,
            'configuration_valid': False,
        }

        try:
            zones = cls.get_all_zones()
            kitchen_zones = [z for z in zones.values() if z.zone_type == 'kitchen']
            qc_zones = [z for z in zones.values() if z.zone_type == 'qc']

            results['has_kitchen_zones'] = len(kitchen_zones) > 0
            results['has_qc_zones'] = len(qc_zones) > 0
            results['has_catch_all_kitchen'] = any(z.is_catch_all_zone() for z in kitchen_zones)

            # Basic validation: must have at least one kitchen zone
            results['configuration_valid'] = results['has_kitchen_zones']

            logger.info(f"Zone validation: {results}")
            return results

        except Exception as e:
            logger.error(f"Error validating zone configuration: {e}")
            return results