"""Debug test to see actual API responses"""
import pytest
from rest_framework import status


@pytest.mark.django_db
def test_debug_order_creation(authenticated_client, tenant_a, admin_user_tenant_a):
    """Debug test to see actual response"""
    client = authenticated_client(admin_user_tenant_a)

    response = client.post('/api/orders/', {
        'order_type': 'dine_in'
    }, format='json')

    print(f"\n\nStatus Code: {response.status_code}")
    print(f"Response Data: {response.data}")
    print(f"Response Headers: {dict(response.items())}")

    assert False, f"Status: {response.status_code}, Data: {response.data}"
