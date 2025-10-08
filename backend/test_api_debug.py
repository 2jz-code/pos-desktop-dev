import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core_backend.settings')
django.setup()

from rest_framework.test import APIClient
from tenant.models import Tenant
from users.models import User
from products.models import Category, Tax
from tenant.managers import set_current_tenant
from rest_framework_simplejwt.tokens import RefreshToken
from django.conf import settings
import json

# Clean up existing test data
Tenant.objects.filter(slug='pizza-place').delete()

# Create test data
tenant_a = Tenant.objects.create(name='Pizza Place', slug='pizza-place', is_active=True)
set_current_tenant(tenant_a)

admin_user = User.objects.create_user(
    email='admin@pizza.com',
    username='admin_pizza',
    password='password123',
    tenant=tenant_a,
    role='owner'
)

category = Category.objects.create(name='Pizzas', tenant=tenant_a)
tax = Tax.objects.create(name='Sales Tax', rate=0.10, tenant=tenant_a)

# Create authenticated client
client = APIClient()
refresh = RefreshToken.for_user(admin_user)
refresh['tenant_id'] = str(tenant_a.id)
refresh['tenant_slug'] = tenant_a.slug

cookie_name = settings.SIMPLE_JWT.get('AUTH_COOKIE', 'access_token')
client.cookies[cookie_name] = str(refresh.access_token)

print(f"Cookie name: {cookie_name}")
print(f"Token: {str(refresh.access_token)[:50]}...")
print(f"Tenant ID: {tenant_a.id}")
print(f"Admin user: {admin_user.email} (role: {admin_user.role})")

# Try to create a product
response = client.post('/api/products/', {
    'name': 'New Pizza',
    'price': '12.99',
    'category': category.id,
    'tax': tax.id,
    'is_active': True
}, format='json')

print(f"\nStatus: {response.status_code}")
print(f"Content Type: {response.get('Content-Type', 'N/A')}")
if hasattr(response, 'data'):
    print(f"Data: {json.dumps(response.data, indent=2)}")
else:
    print(f"Content: {response.content.decode()[:500]}")
