"""
Utility functions for core_backend.
"""


def get_client_ip(group, request):
    """
    Extract the real client IP from the request.

    Args:
        group: The rate limit group (required by django-ratelimit but unused)
        request: The Django request object

    Priority order:
    1. CF-Connecting-IP (when behind Cloudflare proxy - system subdomain)
    2. X-Forwarded-For LAST IP (when direct to ALB - api subdomain)
    3. REMOTE_ADDR (fallback)

    Architecture:
    - system.bakeajeen.com → Cloudflare (proxied) → ALB → Backend
      Uses CF-Connecting-IP for the real client IP (most trustworthy)
    - api.bakeajeen.com → ALB (DNS only) → Backend
      Uses LAST IP from X-Forwarded-For (ALB appends the real client IP)

    Security note: Using the LAST IP prevents client spoofing of X-Forwarded-For.
    ALB appends the actual client IP it sees, so that's the trustworthy one.
    """
    # Check for Cloudflare's connecting IP header first (most reliable)
    cf_connecting_ip = request.META.get('HTTP_CF_CONNECTING_IP')
    if cf_connecting_ip:
        return cf_connecting_ip

    # Fall back to X-Forwarded-For (for direct ALB traffic)
    # Use LAST IP (not first) to prevent spoofing - ALB appends the real client
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[-1].strip()  # Last IP is the real client
        return ip

    # Final fallback
    return request.META.get('REMOTE_ADDR')
