"""
Role-Based Access Control (RBAC) Tests

Tests for user role permissions and cross-tenant access control.
"""
import pytest
from decimal import Decimal
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from tenant.managers import set_current_tenant
from users.models import User
from users.permissions import IsAdminOrHigher, IsManagerOrHigher, ReadOnlyForCashiers, CanEditUserDetails
from products.models import Product, Tax, ProductType
from discounts.models import Discount


@pytest.mark.django_db
class TestRoleBasedAccessControl:
    """Test role-based access control across different user roles"""

    def test_owner_has_highest_permissions(self, tenant_a, admin_user_tenant_a):
        """Test that owners (admin_user fixture with role=OWNER) have full permissions"""
        set_current_tenant(tenant_a)

        # Owner has role OWNER (stored as string value)
        assert admin_user_tenant_a.role == User.Role.OWNER.value

        # Owner should pass IsAdminOrHigher permission
        permission = IsAdminOrHigher()
        request = type('obj', (object,), {'user': admin_user_tenant_a})
        assert permission.has_permission(request, None) is True

        # Owner should pass IsManagerOrHigher permission
        permission = IsManagerOrHigher()
        assert permission.has_permission(request, None) is True

    def test_admin_has_elevated_permissions(self, tenant_a):
        """Test that admin users have elevated permissions"""
        set_current_tenant(tenant_a)

        # Create an admin user
        admin = User.objects.create_user(
            email='admin_test@pizza.com',
            username='admin_test',
            password='password123',
            tenant=tenant_a,
            role=User.Role.ADMIN,
            is_pos_staff=True
        )

        # Admin should pass IsAdminOrHigher permission
        permission = IsAdminOrHigher()
        request = type('obj', (object,), {'user': admin})
        assert permission.has_permission(request, None) is True

        # Admin should pass IsManagerOrHigher permission
        permission = IsManagerOrHigher()
        assert permission.has_permission(request, None) is True

    def test_manager_has_limited_permissions(self, tenant_a, manager_user_tenant_a):
        """Test that managers have limited permissions"""
        set_current_tenant(tenant_a)

        # Manager has role MANAGER (stored as string value)
        assert manager_user_tenant_a.role == User.Role.MANAGER.value

        # Manager should fail IsAdminOrHigher permission
        permission = IsAdminOrHigher()
        request = type('obj', (object,), {'user': manager_user_tenant_a})
        assert permission.has_permission(request, None) is False

        # Manager should pass IsManagerOrHigher permission
        permission = IsManagerOrHigher()
        assert permission.has_permission(request, None) is True

    def test_cashier_has_minimal_permissions(self, tenant_a, cashier_user_tenant_a):
        """Test that cashiers have minimal permissions"""
        set_current_tenant(tenant_a)

        # Cashier has role CASHIER (stored as string value)
        assert cashier_user_tenant_a.role == User.Role.CASHIER.value

        # Cashier should fail IsAdminOrHigher permission
        permission = IsAdminOrHigher()
        request = type('obj', (object,), {'user': cashier_user_tenant_a})
        assert permission.has_permission(request, None) is False

        # Cashier should fail IsManagerOrHigher permission
        permission = IsManagerOrHigher()
        assert permission.has_permission(request, None) is False

    def test_cross_tenant_product_access_denied(self, tenant_a, tenant_b, admin_user_tenant_a, product_tenant_b):
        """Test that users cannot access products from other tenants"""
        set_current_tenant(tenant_a)

        # Owner from tenant A cannot see product from tenant B via ORM
        products = Product.objects.all()
        assert product_tenant_b not in products

        # Explicitly try to get product_tenant_b should fail
        with pytest.raises(Product.DoesNotExist):
            Product.objects.get(id=product_tenant_b.id)

    def test_user_edit_hierarchy_owner_can_edit_manager(self, tenant_a, admin_user_tenant_a, manager_user_tenant_a):
        """Test that owners can edit manager users"""
        set_current_tenant(tenant_a)

        # Owner can edit manager (CanEditUserDetails permission)
        permission = CanEditUserDetails()
        request = type('obj', (object,), {'user': admin_user_tenant_a})
        assert permission.has_object_permission(request, None, manager_user_tenant_a) is True

    def test_user_edit_hierarchy_manager_can_edit_cashier(self, tenant_a, manager_user_tenant_a, cashier_user_tenant_a):
        """Test that managers can edit cashier users"""
        set_current_tenant(tenant_a)

        # Manager can edit cashier (CanEditUserDetails permission)
        permission = CanEditUserDetails()
        request = type('obj', (object,), {'user': manager_user_tenant_a})
        assert permission.has_object_permission(request, None, cashier_user_tenant_a) is True

    def test_readonly_for_cashiers_read_permission(self, tenant_a, cashier_user_tenant_a):
        """Test ReadOnlyForCashiers allows read access for cashiers"""
        set_current_tenant(tenant_a)

        # Cashier can read (GET request)
        permission = ReadOnlyForCashiers()
        request = type('obj', (object,), {'user': cashier_user_tenant_a, 'method': 'GET'})
        assert permission.has_permission(request, None) is True

    def test_readonly_for_cashiers_write_denied(self, tenant_a, cashier_user_tenant_a):
        """Test ReadOnlyForCashiers denies write access for cashiers"""
        set_current_tenant(tenant_a)

        # Cashier cannot write (POST request)
        permission = ReadOnlyForCashiers()
        request = type('obj', (object,), {'user': cashier_user_tenant_a, 'method': 'POST'})
        assert permission.has_permission(request, None) is False

    def test_superuser_can_access_all_tenants(self, tenant_a, tenant_b, product_tenant_a, product_tenant_b):
        """Test that Django superusers can bypass tenant isolation"""
        # Create a superuser
        superuser = User.objects.create(
            email='superuser@system.com',
            password='superpass',
            tenant=tenant_a,
            is_superuser=True,
            is_staff=True,
            role=User.Role.OWNER
        )

        # Superuser flags are set
        assert superuser.is_superuser is True
        assert superuser.is_staff is True

        # In Django admin, superuser should be able to query all tenants using all_objects
        set_current_tenant(None)  # Clear tenant context
        all_products = Product.all_objects.all()
        assert all_products.filter(id=product_tenant_a.id).exists()
        assert all_products.filter(id=product_tenant_b.id).exists()
