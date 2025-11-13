"""
Feature gating system for subscription-based access control.

Phase 1: Always returns True (permissive by default)
Phase 2: Enforces subscription tier limits
Phase 3: Adds usage-based limits and overages

Usage:
    from utils.feature_gates import FeatureGate

    # Check boolean feature access
    if FeatureGate.can_access_feature(tenant, 'advanced_reports'):
        # Generate advanced report
        ...

    # Check numeric limits
    max_locations = FeatureGate.get_feature_limit(tenant, 'max_locations')
    if current_locations >= max_locations:
        return Response({'error': 'Location limit reached'}, status=403)
"""

from django.conf import settings
from typing import Any, Optional


class FeatureGate:
    """
    Centralized feature access control with subscription awareness.

    Priority:
    1. System-owned tenants (your restaurants) get everything
    2. Feature overrides (TenantSubscription.feature_overrides in Phase 2)
    3. Subscription tier limits (SubscriptionTier.features in Phase 2)
    4. Default behavior (Phase 1: allow, Phase 2: deny)
    """

    # Feature keys (used across the system)
    FEATURE_CUSTOM_DOMAIN = 'custom_domain'
    FEATURE_ADVANCED_REPORTS = 'advanced_reports'
    FEATURE_API_ACCESS = 'api_access'
    FEATURE_PRIORITY_SUPPORT = 'priority_support'
    FEATURE_MULTI_LOCATION = 'multi_location'
    FEATURE_INVENTORY_MANAGEMENT = 'inventory_management'
    FEATURE_ONLINE_ORDERING = 'online_ordering'
    FEATURE_GIFT_CARDS = 'gift_cards'
    FEATURE_LOYALTY_PROGRAM = 'loyalty_program'
    FEATURE_WHITE_LABEL = 'white_label'

    # Numeric limit keys
    LIMIT_MAX_LOCATIONS = 'max_locations'
    LIMIT_MAX_USERS = 'max_users'
    LIMIT_MAX_PRODUCTS = 'max_products'
    LIMIT_MAX_ORDERS_PER_MONTH = 'max_orders_per_month'

    @staticmethod
    def can_access_feature(tenant, feature_key: str) -> bool:
        """
        Check if tenant can access a feature.

        Priority:
        1. System-owned tenants (your restaurants) get everything
        2. Feature overrides (TenantSubscription.feature_overrides)
        3. Subscription tier limits (SubscriptionTier.features)
        4. Default behavior (Phase 1: allow, Phase 2: deny)

        Args:
            tenant: Tenant instance
            feature_key: Feature identifier (e.g., 'advanced_reports')

        Returns:
            bool: True if tenant can access feature

        Examples:
            >>> FeatureGate.can_access_feature(tenant, 'advanced_reports')
            True
            >>> FeatureGate.can_access_feature(tenant, 'white_label')
            False
        """
        # Phase 1: System-owned tenants get full access
        if tenant.ownership_type == 'system':
            return True

        # Phase 2: Check subscription
        if hasattr(tenant, 'subscription'):
            subscription = tenant.subscription

            # Inactive subscriptions lose access
            if not subscription.is_active_subscription:
                return False

            # Check feature-specific access
            return subscription.get_feature(feature_key)

        # Phase 1: Default to allowing (flip to False in Phase 2)
        # This prevents breaking existing functionality during transition
        return getattr(settings, 'DEFAULT_FEATURE_ACCESS', True)

    @staticmethod
    def get_feature_limit(tenant, limit_key: str) -> int:
        """
        Get numeric limit for a feature (e.g., max_locations, max_users).

        Args:
            tenant: Tenant instance
            limit_key: Limit identifier (e.g., 'max_locations')

        Returns:
            int: Limit value (999999 = unlimited)

        Examples:
            >>> FeatureGate.get_feature_limit(tenant, 'max_locations')
            3
            >>> FeatureGate.get_feature_limit(system_tenant, 'max_users')
            999999  # Unlimited for system-owned
        """
        # System-owned tenants have no limits
        if tenant.ownership_type == 'system':
            return 999999

        # Phase 2: Check subscription limits
        if hasattr(tenant, 'subscription'):
            subscription = tenant.subscription
            return subscription.get_feature(limit_key)

        # Phase 1: Default limits from settings
        defaults = {
            'max_locations': 999,  # Generous during Phase 1
            'max_users': 999,
            'max_products': 999999,
            'max_orders_per_month': 999999,
        }
        return defaults.get(limit_key, 999)

    @staticmethod
    def get_upgrade_prompt(tenant, feature_key: str) -> Optional[dict]:
        """
        Get upgrade prompt information for a denied feature.

        Args:
            tenant: Tenant instance
            feature_key: Feature that was denied

        Returns:
            dict or None: {
                'message': 'This feature requires a Pro subscription',
                'required_tier': 'pro',
                'upgrade_url': '/billing/upgrade?feature=advanced_reports'
            }

        Examples:
            >>> FeatureGate.get_upgrade_prompt(tenant, 'white_label')
            {
                'message': 'This feature is not available on your current plan',
                'required_tier': 'pro',
                'upgrade_url': '/billing/upgrade?feature=white_label'
            }
        """
        if FeatureGate.can_access_feature(tenant, feature_key):
            return None

        # Phase 2: Build intelligent upgrade prompts based on SubscriptionTier
        # For now, return generic message
        return {
            'message': f'This feature is not available on your current plan',
            'required_tier': 'pro',  # Phase 2: Determine from SubscriptionTier
            'upgrade_url': f'/billing/upgrade?feature={feature_key}',
            'feature_name': feature_key.replace('_', ' ').title()
        }

    @staticmethod
    def check_limit(tenant, limit_key: str, current_value: int) -> dict:
        """
        Check if a limit has been reached.

        Args:
            tenant: Tenant instance
            limit_key: Limit to check (e.g., 'max_locations')
            current_value: Current usage

        Returns:
            dict: {
                'allowed': bool,
                'limit': int,
                'current': int,
                'remaining': int,
                'message': str (if denied)
            }

        Examples:
            >>> FeatureGate.check_limit(tenant, 'max_locations', 5)
            {
                'allowed': False,
                'limit': 3,
                'current': 5,
                'remaining': 0,
                'message': 'Location limit reached (5/3). Upgrade to add more.'
            }
        """
        limit = FeatureGate.get_feature_limit(tenant, limit_key)
        allowed = current_value < limit
        remaining = max(0, limit - current_value)

        result = {
            'allowed': allowed,
            'limit': limit,
            'current': current_value,
            'remaining': remaining,
        }

        if not allowed:
            limit_name = limit_key.replace('max_', '').replace('_', ' ').title()
            result['message'] = (
                f"{limit_name} limit reached ({current_value}/{limit}). "
                f"Upgrade to add more."
            )
            result['upgrade_url'] = f'/billing/upgrade?limit={limit_key}'

        return result
