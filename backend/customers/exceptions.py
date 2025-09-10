"""
Customer-specific exceptions with PII protection.
"""
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
from core_backend.utils.pii import PIIProtection


def customer_exception_handler(exc, context):
    """
    Custom exception handler for customer app that scrubs PII from error responses.
    """
    # Call the default exception handler first
    response = exception_handler(exc, context)
    
    if response is not None and response.data:
        # Scrub PII from error response data
        response.data = scrub_pii_from_response_data(response.data)
        
        # Add safe error logging
        from core_backend.utils.pii import get_pii_safe_logger
        logger = get_pii_safe_logger(__name__)
        
        request = context.get('request')
        if request:
            logger.error(
                f"Customer API error: {exc.__class__.__name__}",
                extra={
                    'status_code': response.status_code,
                    'path': request.path,
                    'method': request.method,
                    'user_agent': request.META.get('HTTP_USER_AGENT', ''),
                    'ip': get_client_ip(request),
                }
            )
    
    return response


def scrub_pii_from_response_data(data):
    """
    Recursively scrub PII from response data.
    """
    if isinstance(data, dict):
        scrubbed = {}
        for key, value in data.items():
            # Check for common PII field names in error messages
            if any(pii_field in key.lower() for pii_field in PIIProtection.PII_FIELDS):
                # Don't completely remove the field, just mask the value if it's a string
                if isinstance(value, str):
                    scrubbed[key] = PIIProtection.mask_field_by_type(key, value)
                else:
                    scrubbed[key] = value
            elif isinstance(value, (dict, list)):
                scrubbed[key] = scrub_pii_from_response_data(value)
            else:
                scrubbed[key] = value
        return scrubbed
    
    elif isinstance(data, list):
        return [scrub_pii_from_response_data(item) for item in data]
    
    elif isinstance(data, str):
        # Check if the string contains PII patterns
        return scrub_pii_from_string(data)
    
    return data


def scrub_pii_from_string(text):
    """
    Scrub potential PII from error message strings.
    """
    import re
    
    # Email pattern
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    text = re.sub(email_pattern, lambda m: PIIProtection.mask_email(m.group()), text)
    
    # Phone pattern (basic US format)
    phone_pattern = r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b'
    text = re.sub(phone_pattern, lambda m: PIIProtection.mask_phone(m.group()), text)
    
    # Credit card pattern (basic)
    cc_pattern = r'\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b'
    text = re.sub(cc_pattern, '**** **** **** ****', text)
    
    return text


def get_client_ip(request):
    """
    Get client IP address from request headers.
    """
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip


class CustomerServiceError(Exception):
    """
    Base exception for customer service errors.
    Automatically scrubs PII from error messages.
    """
    
    def __init__(self, message, details=None):
        if isinstance(message, str):
            message = scrub_pii_from_string(message)
        
        if details:
            details = PIIProtection.scrub_pii_from_dict(details)
        
        super().__init__(message)
        self.details = details


class CustomerAuthenticationError(CustomerServiceError):
    """Raised when customer authentication fails"""
    pass


class CustomerValidationError(CustomerServiceError):
    """Raised when customer data validation fails"""
    pass


class CustomerNotFoundError(CustomerServiceError):
    """Raised when customer is not found"""
    pass


class CustomerInactiveError(CustomerServiceError):
    """Raised when attempting to authenticate inactive customer"""
    pass