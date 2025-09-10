"""
Global PII protection utilities for the entire backend.
"""
import logging
import re
from typing import Dict, Any, Optional


class PIIProtection:
    """Utilities for protecting personally identifiable information."""
    
    # Define PII fields that should be protected across all apps
    PII_FIELDS = {
        'email', 'phone_number', 'street_address', 'apartment', 
        'first_name', 'last_name', 'delivery_instructions',
        'username', 'phone', 'address', 'full_name'
    }
    
    @staticmethod
    def mask_email(email: Optional[str]) -> str:
        """
        Mask email address for safe display.
        Example: john.doe@example.com -> jo***@example.com
        """
        if not email or '@' not in email:
            return email or ''
        
        try:
            local, domain = email.split('@', 1)
            if len(local) <= 2:
                masked_local = local[0] + '*'
            else:
                masked_local = local[:2] + '*' * (len(local) - 2)
            
            return f"{masked_local}@{domain}"
        except (ValueError, IndexError):
            return email
    
    @staticmethod
    def mask_phone(phone: Optional[str]) -> str:
        """
        Mask phone number for safe display.
        Example: +1-555-123-4567 -> ***-***-4567
        """
        if not phone:
            return phone or ''
        
        # Remove all non-digits to get clean number
        digits = re.sub(r'\D', '', phone)
        if len(digits) < 4:
            return '*' * len(phone)
        
        # Show last 4 digits, mask the rest preserving format
        masked = phone
        for i, char in enumerate(phone):
            if char.isdigit():
                digit_position = len(re.sub(r'\D', '', phone[:i+1]))
                if digit_position <= len(digits) - 4:
                    masked = masked[:i] + '*' + masked[i+1:]
        
        return masked
    
    @staticmethod
    def mask_address(address: Optional[str]) -> str:
        """
        Mask street address for safe display.
        Example: 123 Main Street -> 123***
        """
        if not address:
            return address or ''
        
        if len(address) <= 5:
            return '*' * len(address)
        
        # Keep first 3 characters, mask the rest
        return address[:3] + '*' * (len(address) - 3)
    
    @staticmethod
    def mask_name(name: Optional[str]) -> str:
        """
        Mask name for safe display.
        Example: John -> J***
        """
        if not name:
            return name or ''
        
        if len(name) <= 1:
            return '*'
        
        return name[0] + '*' * (len(name) - 1)
    
    @staticmethod
    def mask_field_by_type(field_name: str, value: Optional[str]) -> str:
        """
        Automatically mask a field based on its name.
        """
        if not value:
            return value or ''
        
        field_lower = field_name.lower()
        
        if 'email' in field_lower:
            return PIIProtection.mask_email(value)
        elif 'phone' in field_lower:
            return PIIProtection.mask_phone(value)
        elif 'address' in field_lower or 'street' in field_lower:
            return PIIProtection.mask_address(value)
        elif 'name' in field_lower:
            return PIIProtection.mask_name(value)
        else:
            # Generic masking for unknown PII fields
            if len(value) <= 2:
                return '*' * len(value)
            return value[:2] + '*' * (len(value) - 2)
    
    @staticmethod
    def scrub_pii_from_dict(data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Remove PII fields from dictionary recursively.
        Used for safe logging and error responses.
        """
        if not isinstance(data, dict):
            return data
        
        scrubbed = {}
        for key, value in data.items():
            if key.lower() in PIIProtection.PII_FIELDS:
                scrubbed[key] = '[REDACTED]'
            elif isinstance(value, dict):
                scrubbed[key] = PIIProtection.scrub_pii_from_dict(value)
            elif isinstance(value, list):
                scrubbed[key] = [
                    PIIProtection.scrub_pii_from_dict(item) if isinstance(item, dict) else item
                    for item in value
                ]
            else:
                scrubbed[key] = value
        
        return scrubbed
    
    @staticmethod
    def safe_str_representation(obj, email_field: str = 'email', name_fields: list = None) -> str:
        """
        Create a safe string representation of an object with PII.
        
        Args:
            obj: The object to represent
            email_field: Name of the email field
            name_fields: List of name fields to include (masked)
        
        Returns:
            Safe string representation
        """
        if name_fields is None:
            name_fields = ['first_name', 'last_name']
        
        parts = []
        
        # Add masked names if available
        for field in name_fields:
            value = getattr(obj, field, None)
            if value:
                parts.append(PIIProtection.mask_name(value))
        
        # Add masked email
        email = getattr(obj, email_field, None)
        if email:
            parts.append(f"({PIIProtection.mask_email(email)})")
        
        # Fallback to class name with ID if no PII available
        if not parts:
            return f"{obj.__class__.__name__} #{getattr(obj, 'id', 'unknown')}"
        
        return ' '.join(parts)


class PIISafeLogger:
    """
    Logger wrapper that automatically scrubs PII from log messages.
    Use this instead of regular Python logging for any logs that might contain PII.
    """
    
    def __init__(self, logger_name: str):
        self.logger = logging.getLogger(logger_name)
    
    def _safe_log(self, level: int, message: str, *args, **kwargs):
        """Internal method to log message after scrubbing PII from extra data."""
        extra = kwargs.get('extra', {})
        if extra:
            kwargs['extra'] = PIIProtection.scrub_pii_from_dict(extra)
        
        # Also scrub PII from the message itself if it's a dict/object
        if isinstance(message, dict):
            message = str(PIIProtection.scrub_pii_from_dict(message))
        
        self.logger.log(level, message, *args, **kwargs)
    
    def info(self, message: str, *args, **kwargs):
        """Log info message with PII protection."""
        self._safe_log(logging.INFO, message, *args, **kwargs)
    
    def warning(self, message: str, *args, **kwargs):
        """Log warning message with PII protection."""
        self._safe_log(logging.WARNING, message, *args, **kwargs)
    
    def error(self, message: str, *args, **kwargs):
        """Log error message with PII protection."""
        self._safe_log(logging.ERROR, message, *args, **kwargs)
    
    def debug(self, message: str, *args, **kwargs):
        """Log debug message with PII protection."""
        self._safe_log(logging.DEBUG, message, *args, **kwargs)
    
    def critical(self, message: str, *args, **kwargs):
        """Log critical message with PII protection."""
        self._safe_log(logging.CRITICAL, message, *args, **kwargs)


def get_pii_safe_logger(name: str) -> PIISafeLogger:
    """
    Get a PII-safe logger instance.
    
    Usage:
        from core_backend.utils.pii import get_pii_safe_logger
        logger = get_pii_safe_logger(__name__)
        logger.info("User logged in", extra={"email": "user@example.com"})  # Email will be redacted
    """
    return PIISafeLogger(name)


class PIISerializerMixin:
    """
    Mixin for DRF serializers to add PII masking capabilities.
    
    Usage:
        class CustomerSerializer(PIISerializerMixin, serializers.ModelSerializer):
            class Meta:
                model = Customer
                fields = ['email', 'first_name', 'last_name']
                pii_mask_fields = ['email']  # These will be masked for non-owners
    """
    
    def to_representation(self, instance):
        """Override to mask PII fields based on permissions."""
        data = super().to_representation(instance)
        
        # Get mask fields from Meta
        mask_fields = getattr(self.Meta, 'pii_mask_fields', [])
        if not mask_fields:
            return data
        
        # Check if we should mask PII
        request = self.context.get('request')
        if not request:
            return data
        
        # Don't mask for the owner or staff
        user = request.user
        if (hasattr(instance, 'user') and user == instance.user) or \
           (hasattr(user, 'is_staff') and user.is_staff) or \
           user == instance:
            return data
        
        # Mask specified PII fields
        for field_name in mask_fields:
            if field_name in data and data[field_name]:
                data[field_name] = PIIProtection.mask_field_by_type(field_name, data[field_name])
        
        return data