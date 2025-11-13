"""
WebSocket Tests - Priority 4

This module tests real-time WebSocket functionality for the order cart system.
These tests verify that WebSocket connections work correctly and cart updates
are broadcast in real-time.

Priority: LOW (but important for real-time features)

Test Categories:
1. Connection/Disconnection Tests (2 tests)
2. Cart Item Management Tests (5 tests)
3. Discount Management Tests (2 tests)
4. Cart Operations Tests (1 test)
"""
import pytest
import json
from decimal import Decimal
from channels.testing import WebsocketCommunicator
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken

from core_backend.asgi import application
from tenant.models import Tenant
from tenant.managers import set_current_tenant
from products.models import Product, ProductType, Category
from orders.models import Order, OrderItem
from discounts.models import Discount

User = get_user_model()


# ============================================================================
# CONNECTION/DISCONNECTION TESTS
# ============================================================================

@pytest.mark.django_db
@pytest.mark.asyncio
class TestWebSocketConnection:
    """Test WebSocket connection and disconnection."""

    async def test_websocket_connection_with_valid_order(self):
        """
        HIGH: Verify WebSocket connects successfully with valid order.

        Scenario:
        - Connect to order WebSocket with valid order ID
        - Expected: Connection accepted, initial state sent

        Value: Ensures real-time cart updates work for valid orders
        """
        # Create tenant and user
        tenant = await database_sync_to_async(Tenant.objects.create)(
            slug="ws-test",
            name="WebSocket Test",
            is_active=True
        )

        user = await database_sync_to_async(User.objects.create_user)(
            username="wsuser",
            email="ws@test.com",
            password="test123",
            tenant=tenant,
            role="STAFF"
        )

        # Set tenant context
        await database_sync_to_async(set_current_tenant)(tenant)

        # Create order
        order = await database_sync_to_async(Order.objects.create)(
            tenant=tenant,
            order_type='pos',
            subtotal=Decimal('0.00'),
            tax_total=Decimal('0.00'),
            grand_total=Decimal('0.00'),
            status='PENDING'
        )

        # Generate JWT token
        refresh = await database_sync_to_async(RefreshToken.for_user)(user)
        refresh['tenant_id'] = str(tenant.id)
        refresh['tenant_slug'] = tenant.slug
        access_token = str(refresh.access_token)

        # Create WebSocket communicator
        communicator = WebsocketCommunicator(
            application,
            f"/ws/cart/{order.id}/",
            headers=[(b"cookie", f"access_token={access_token}".encode())]
        )

        # Add scope attributes
        communicator.scope['tenant'] = tenant
        communicator.scope['user'] = user

        # Connect
        connected, subprotocol = await communicator.connect()

        assert connected, "WebSocket should connect successfully"

        # Receive initial state
        response = await communicator.receive_json_from()

        assert response['type'] == 'cart_update', "Should receive initial cart state"
        assert 'payload' in response, "Response should contain payload"
        assert response['payload']['id'] == str(order.id), "Should receive correct order"

        # Disconnect
        await communicator.disconnect()

    async def test_websocket_rejects_invalid_order(self):
        """
        HIGH: Verify WebSocket rejects connection to non-existent order.

        Scenario:
        - Try to connect with invalid order ID
        - Expected: Connection rejected

        Value: Prevents unauthorized access to orders
        """
        # Create tenant and user
        tenant = await database_sync_to_async(Tenant.objects.create)(
            slug="ws-reject-test",
            name="WebSocket Reject Test",
            is_active=True
        )

        user = await database_sync_to_async(User.objects.create_user)(
            username="rejectuser",
            email="reject@test.com",
            password="test123",
            tenant=tenant,
            role="STAFF"
        )

        # Generate JWT token
        refresh = await database_sync_to_async(RefreshToken.for_user)(user)
        refresh['tenant_id'] = str(tenant.id)
        refresh['tenant_slug'] = tenant.slug
        access_token = str(refresh.access_token)

        # Try to connect to non-existent order
        fake_order_id = "00000000-0000-0000-0000-000000000000"

        communicator = WebsocketCommunicator(
            application,
            f"/ws/cart/{fake_order_id}/",
            headers=[(b"cookie", f"access_token={access_token}".encode())]
        )

        communicator.scope['tenant'] = tenant
        communicator.scope['user'] = user

        # Connect should fail
        connected, subprotocol = await communicator.connect()

        # Connection should be rejected (close code 4004 = Not Found)
        assert not connected, "WebSocket should reject connection to invalid order"


# ============================================================================
# CART ITEM MANAGEMENT TESTS
# ============================================================================

@pytest.mark.django_db
@pytest.mark.asyncio
class TestCartItemManagement:
    """Test adding, updating, and removing cart items via WebSocket."""

    async def test_add_item_via_websocket(self):
        """
        CRITICAL: Verify adding item via WebSocket updates cart.

        Scenario:
        - Connect to order WebSocket
        - Send add_item message
        - Expected: Item added, updated cart state received

        Value: Core POS functionality - adding items to cart
        """
        # Setup
        tenant = await database_sync_to_async(Tenant.objects.create)(
            slug="ws-add-test",
            name="WebSocket Add Test",
            is_active=True
        )

        user = await database_sync_to_async(User.objects.create_user)(
            username="adduser",
            email="add@test.com",
            password="test123",
            tenant=tenant,
            role="STAFF"
        )

        await database_sync_to_async(set_current_tenant)(tenant)

        # Create product
        product_type = await database_sync_to_async(ProductType.objects.create)(
            tenant=tenant,
            name="Simple"
        )

        product = await database_sync_to_async(Product.objects.create)(
            tenant=tenant,
            name="Test Product",
            price=Decimal("10.00"),
            product_type=product_type
        )

        # Create order
        order = await database_sync_to_async(Order.objects.create)(
            tenant=tenant,
            order_type='pos',
            subtotal=Decimal('0.00'),
            tax_total=Decimal('0.00'),
            grand_total=Decimal('0.00'),
            status='PENDING'
        )

        # Connect WebSocket
        refresh = await database_sync_to_async(RefreshToken.for_user)(user)
        refresh['tenant_id'] = str(tenant.id)
        refresh['tenant_slug'] = tenant.slug
        access_token = str(refresh.access_token)

        communicator = WebsocketCommunicator(
            application,
            f"/ws/cart/{order.id}/",
            headers=[(b"cookie", f"access_token={access_token}".encode())]
        )
        communicator.scope['tenant'] = tenant
        communicator.scope['user'] = user

        connected, _ = await communicator.connect()
        assert connected

        # Consume initial state
        await communicator.receive_json_from()

        # Send add_item message
        await communicator.send_json_to({
            "type": "add_item",
            "payload": {
                "product_id": str(product.id),
                "quantity": 2
            }
        })

        # Receive updated cart state
        response = await communicator.receive_json_from()

        assert response['type'] == 'cart_update', "Should receive cart update"
        assert len(response['payload']['items']) == 1, "Should have 1 item in cart"
        assert response['payload']['items'][0]['quantity'] == 2, "Item quantity should be 2"

        await communicator.disconnect()

    async def test_update_item_quantity_via_websocket(self):
        """
        CRITICAL: Verify updating item quantity via WebSocket.

        Scenario:
        - Add item to cart
        - Update quantity via WebSocket
        - Expected: Quantity updated, cart recalculated

        Value: Core POS functionality - changing item quantities
        """
        # Setup (similar to previous test)
        tenant = await database_sync_to_async(Tenant.objects.create)(
            slug="ws-update-test",
            name="WebSocket Update Test",
            is_active=True
        )

        user = await database_sync_to_async(User.objects.create_user)(
            username="updateuser",
            email="update@test.com",
            password="test123",
            tenant=tenant,
            role="STAFF"
        )

        await database_sync_to_async(set_current_tenant)(tenant)

        product_type = await database_sync_to_async(ProductType.objects.create)(
            tenant=tenant,
            name="Simple"
        )

        product = await database_sync_to_async(Product.objects.create)(
            tenant=tenant,
            name="Test Product",
            price=Decimal("10.00"),
            product_type=product_type
        )

        order = await database_sync_to_async(Order.objects.create)(
            tenant=tenant,
            order_type='pos',
            subtotal=Decimal('10.00'),
            tax_total=Decimal('0.00'),
            grand_total=Decimal('10.00'),
            status='PENDING'
        )

        # Add initial item
        item = await database_sync_to_async(OrderItem.objects.create)(
            tenant=tenant,
            order=order,
            product=product,
            quantity=1,
            price_at_sale=Decimal("10.00")
        )

        # Connect WebSocket
        refresh = await database_sync_to_async(RefreshToken.for_user)(user)
        refresh['tenant_id'] = str(tenant.id)
        refresh['tenant_slug'] = tenant.slug
        access_token = str(refresh.access_token)

        communicator = WebsocketCommunicator(
            application,
            f"/ws/cart/{order.id}/",
            headers=[(b"cookie", f"access_token={access_token}".encode())]
        )
        communicator.scope['tenant'] = tenant
        communicator.scope['user'] = user

        connected, _ = await communicator.connect()
        assert connected

        # Consume initial state
        await communicator.receive_json_from()

        # Update quantity
        await communicator.send_json_to({
            "type": "update_item_quantity",
            "payload": {
                "item_id": str(item.id),
                "quantity": 3
            }
        })

        # Receive updated cart
        response = await communicator.receive_json_from()

        assert response['type'] == 'cart_update'
        assert response['payload']['items'][0]['quantity'] == 3
        assert Decimal(response['payload']['subtotal']) == Decimal('30.00')

        await communicator.disconnect()

    async def test_remove_item_via_websocket(self):
        """
        HIGH: Verify removing item via WebSocket.

        Scenario:
        - Add item to cart
        - Remove it via WebSocket
        - Expected: Item removed, cart recalculated

        Value: Core POS functionality - removing unwanted items
        """
        # Setup
        tenant = await database_sync_to_async(Tenant.objects.create)(
            slug="ws-remove-test",
            name="WebSocket Remove Test",
            is_active=True
        )

        user = await database_sync_to_async(User.objects.create_user)(
            username="removeuser",
            email="remove@test.com",
            password="test123",
            tenant=tenant,
            role="STAFF"
        )

        await database_sync_to_async(set_current_tenant)(tenant)

        product_type = await database_sync_to_async(ProductType.objects.create)(
            tenant=tenant,
            name="Simple"
        )

        product = await database_sync_to_async(Product.objects.create)(
            tenant=tenant,
            name="Test Product",
            price=Decimal("10.00"),
            product_type=product_type
        )

        order = await database_sync_to_async(Order.objects.create)(
            tenant=tenant,
            order_type='pos',
            subtotal=Decimal('10.00'),
            tax_total=Decimal('0.00'),
            grand_total=Decimal('10.00'),
            status='PENDING'
        )

        item = await database_sync_to_async(OrderItem.objects.create)(
            tenant=tenant,
            order=order,
            product=product,
            quantity=1,
            price_at_sale=Decimal("10.00")
        )

        # Connect WebSocket
        refresh = await database_sync_to_async(RefreshToken.for_user)(user)
        refresh['tenant_id'] = str(tenant.id)
        refresh['tenant_slug'] = tenant.slug
        access_token = str(refresh.access_token)

        communicator = WebsocketCommunicator(
            application,
            f"/ws/cart/{order.id}/",
            headers=[(b"cookie", f"access_token={access_token}".encode())]
        )
        communicator.scope['tenant'] = tenant
        communicator.scope['user'] = user

        connected, _ = await communicator.connect()
        assert connected

        # Consume initial state
        await communicator.receive_json_from()

        # Remove item
        await communicator.send_json_to({
            "type": "remove_item",
            "payload": {
                "item_id": str(item.id)
            }
        })

        # Receive updated cart
        response = await communicator.receive_json_from()

        assert response['type'] == 'cart_update'
        assert len(response['payload']['items']) == 0, "Cart should be empty"
        assert Decimal(response['payload']['subtotal']) == Decimal('0.00')

        await communicator.disconnect()

    async def test_add_custom_item_via_websocket(self):
        """
        HIGH: Verify adding custom item (no product) via WebSocket.

        Scenario:
        - Send add_custom_item message
        - Expected: Custom item added to cart

        Value: Allows POS to add non-catalog items
        """
        # Setup
        tenant = await database_sync_to_async(Tenant.objects.create)(
            slug="ws-custom-test",
            name="WebSocket Custom Test",
            is_active=True
        )

        user = await database_sync_to_async(User.objects.create_user)(
            username="customuser",
            email="custom@test.com",
            password="test123",
            tenant=tenant,
            role="STAFF"
        )

        await database_sync_to_async(set_current_tenant)(tenant)

        order = await database_sync_to_async(Order.objects.create)(
            tenant=tenant,
            order_type='pos',
            subtotal=Decimal('0.00'),
            tax_total=Decimal('0.00'),
            grand_total=Decimal('0.00'),
            status='PENDING'
        )

        # Connect WebSocket
        refresh = await database_sync_to_async(RefreshToken.for_user)(user)
        refresh['tenant_id'] = str(tenant.id)
        refresh['tenant_slug'] = tenant.slug
        access_token = str(refresh.access_token)

        communicator = WebsocketCommunicator(
            application,
            f"/ws/cart/{order.id}/",
            headers=[(b"cookie", f"access_token={access_token}".encode())]
        )
        communicator.scope['tenant'] = tenant
        communicator.scope['user'] = user

        connected, _ = await communicator.connect()
        assert connected

        # Consume initial state
        await communicator.receive_json_from()

        # Add custom item
        await communicator.send_json_to({
            "type": "add_custom_item",
            "payload": {
                "name": "Custom Service",
                "price": "25.00",
                "quantity": 1,
                "notes": "One-time charge"
            }
        })

        # Receive updated cart
        response = await communicator.receive_json_from()

        assert response['type'] == 'cart_update'
        assert len(response['payload']['items']) == 1
        assert response['payload']['items'][0]['custom_name'] == "Custom Service"
        assert Decimal(response['payload']['items'][0]['price_at_sale']) == Decimal('25.00')

        await communicator.disconnect()

    async def test_stock_error_prevents_overselling(self):
        """
        CRITICAL: Verify WebSocket prevents adding out-of-stock items.

        Scenario:
        - Try to add item with insufficient stock
        - Expected: Stock error returned, item not added

        Value: Prevents overselling via WebSocket cart updates
        """
        # Setup
        tenant = await database_sync_to_async(Tenant.objects.create)(
            slug="ws-stock-test",
            name="WebSocket Stock Test",
            is_active=True
        )

        user = await database_sync_to_async(User.objects.create_user)(
            username="stockuser",
            email="stock@test.com",
            password="test123",
            tenant=tenant,
            role="STAFF"
        )

        await database_sync_to_async(set_current_tenant)(tenant)

        # Create GlobalSettings for this tenant (required for stock checking)
        from settings.models import GlobalSettings
        await database_sync_to_async(GlobalSettings.objects.create)(
            tenant=tenant,
            store_name=tenant.name,
            store_address='',
            store_phone='',
            store_email=''
        )

        product_type = await database_sync_to_async(ProductType.objects.create)(
            tenant=tenant,
            name="Simple"
        )

        # Create product with inventory tracking but no stock
        product = await database_sync_to_async(Product.objects.create)(
            tenant=tenant,
            name="Out of Stock Product",
            price=Decimal("10.00"),
            product_type=product_type,
            track_inventory=True
        )

        order = await database_sync_to_async(Order.objects.create)(
            tenant=tenant,
            order_type='pos',
            subtotal=Decimal('0.00'),
            tax_total=Decimal('0.00'),
            grand_total=Decimal('0.00'),
            status='PENDING'
        )

        # Connect WebSocket
        refresh = await database_sync_to_async(RefreshToken.for_user)(user)
        refresh['tenant_id'] = str(tenant.id)
        refresh['tenant_slug'] = tenant.slug
        access_token = str(refresh.access_token)

        communicator = WebsocketCommunicator(
            application,
            f"/ws/cart/{order.id}/",
            headers=[(b"cookie", f"access_token={access_token}".encode())]
        )
        communicator.scope['tenant'] = tenant
        communicator.scope['user'] = user

        connected, _ = await communicator.connect()
        assert connected

        # Consume initial state
        await communicator.receive_json_from()

        # Try to add out-of-stock item
        await communicator.send_json_to({
            "type": "add_item",
            "payload": {
                "product_id": str(product.id),
                "quantity": 1
            }
        })

        # Should receive stock error
        response = await communicator.receive_json_from()

        assert response['type'] == 'stock_error', "Should receive stock error"
        assert 'message' in response, "Error should include message"
        assert response['can_override'] == True, "Error should allow override"

        await communicator.disconnect()


# ============================================================================
# DISCOUNT MANAGEMENT TESTS
# ============================================================================

@pytest.mark.django_db
@pytest.mark.asyncio
class TestDiscountManagement:
    """Test applying and removing discounts via WebSocket."""

    async def test_apply_discount_via_websocket(self):
        """
        HIGH: Verify applying discount via WebSocket.

        Scenario:
        - Add item to cart
        - Apply discount via WebSocket
        - Expected: Discount applied, totals recalculated

        Value: Real-time discount application for POS
        """
        # Setup
        tenant = await database_sync_to_async(Tenant.objects.create)(
            slug="ws-discount-test",
            name="WebSocket Discount Test",
            is_active=True
        )

        user = await database_sync_to_async(User.objects.create_user)(
            username="discountuser",
            email="discount@test.com",
            password="test123",
            tenant=tenant,
            role="STAFF"
        )

        await database_sync_to_async(set_current_tenant)(tenant)

        product_type = await database_sync_to_async(ProductType.objects.create)(
            tenant=tenant,
            name="Simple"
        )

        product = await database_sync_to_async(Product.objects.create)(
            tenant=tenant,
            name="Test Product",
            price=Decimal("100.00"),
            product_type=product_type
        )

        order = await database_sync_to_async(Order.objects.create)(
            tenant=tenant,
            order_type='pos',
            subtotal=Decimal('100.00'),
            tax_total=Decimal('0.00'),
            grand_total=Decimal('100.00'),
            status='PENDING'
        )

        await database_sync_to_async(OrderItem.objects.create)(
            tenant=tenant,
            order=order,
            product=product,
            quantity=1,
            price_at_sale=Decimal("100.00")
        )

        # Create discount
        discount = await database_sync_to_async(Discount.objects.create)(
            tenant=tenant,
            name="10% Off",
            code="SAVE10",
            type="PERCENTAGE",
            value=Decimal("10.00"),
            is_active=True
        )

        # Connect WebSocket
        refresh = await database_sync_to_async(RefreshToken.for_user)(user)
        refresh['tenant_id'] = str(tenant.id)
        refresh['tenant_slug'] = tenant.slug
        access_token = str(refresh.access_token)

        communicator = WebsocketCommunicator(
            application,
            f"/ws/cart/{order.id}/",
            headers=[(b"cookie", f"access_token={access_token}".encode())]
        )
        communicator.scope['tenant'] = tenant
        communicator.scope['user'] = user

        connected, _ = await communicator.connect()
        assert connected

        # Consume initial state
        await communicator.receive_json_from()

        # Apply discount
        await communicator.send_json_to({
            "type": "apply_discount",
            "payload": {
                "discount_id": str(discount.id)
            }
        })

        # Receive updated cart
        response = await communicator.receive_json_from()

        assert response['type'] == 'cart_update'
        assert Decimal(response['payload']['total_discounts_amount']) == Decimal('10.00')
        # grand_total includes tax: (100 - 10) * 1.08 = 97.20
        assert Decimal(response['payload']['grand_total']) == Decimal('97.20')

        await communicator.disconnect()

    async def test_remove_discount_via_websocket(self):
        """
        HIGH: Verify removing discount via WebSocket.

        Scenario:
        - Apply discount
        - Remove it via WebSocket
        - Expected: Discount removed, totals recalculated

        Value: Allows correcting discount application mistakes
        """
        # Setup (similar to apply test)
        tenant = await database_sync_to_async(Tenant.objects.create)(
            slug="ws-remove-discount-test",
            name="WebSocket Remove Discount Test",
            is_active=True
        )

        user = await database_sync_to_async(User.objects.create_user)(
            username="removediscountuser",
            email="removediscount@test.com",
            password="test123",
            tenant=tenant,
            role="STAFF"
        )

        await database_sync_to_async(set_current_tenant)(tenant)

        product_type = await database_sync_to_async(ProductType.objects.create)(
            tenant=tenant,
            name="Simple"
        )

        product = await database_sync_to_async(Product.objects.create)(
            tenant=tenant,
            name="Test Product",
            price=Decimal("100.00"),
            product_type=product_type
        )

        order = await database_sync_to_async(Order.objects.create)(
            tenant=tenant,
            order_type='pos',
            subtotal=Decimal('100.00'),
            tax_total=Decimal('0.00'),
            total_discounts_amount=Decimal('10.00'),
            grand_total=Decimal('90.00'),
            status='PENDING'
        )

        await database_sync_to_async(OrderItem.objects.create)(
            tenant=tenant,
            order=order,
            product=product,
            quantity=1,
            price_at_sale=Decimal("100.00")
        )

        discount = await database_sync_to_async(Discount.objects.create)(
            tenant=tenant,
            name="10% Off",
            code="SAVE10",
            type="PERCENTAGE",
            value=Decimal("10.00"),
            is_active=True
        )

        # Apply discount first
        from orders.models import OrderDiscount
        await database_sync_to_async(OrderDiscount.objects.create)(
            tenant=tenant,
            order=order,
            discount=discount,
            amount=Decimal("10.00")
        )

        # Connect WebSocket
        refresh = await database_sync_to_async(RefreshToken.for_user)(user)
        refresh['tenant_id'] = str(tenant.id)
        refresh['tenant_slug'] = tenant.slug
        access_token = str(refresh.access_token)

        communicator = WebsocketCommunicator(
            application,
            f"/ws/cart/{order.id}/",
            headers=[(b"cookie", f"access_token={access_token}".encode())]
        )
        communicator.scope['tenant'] = tenant
        communicator.scope['user'] = user

        connected, _ = await communicator.connect()
        assert connected

        # Consume initial state
        await communicator.receive_json_from()

        # Remove discount
        await communicator.send_json_to({
            "type": "remove_discount",
            "payload": {
                "discount_id": str(discount.id)
            }
        })

        # Receive updated cart
        response = await communicator.receive_json_from()

        assert response['type'] == 'cart_update'
        assert Decimal(response['payload']['total_discounts_amount']) == Decimal('0.00')
        # grand_total includes tax: 100 * 1.08 = 108.00
        assert Decimal(response['payload']['grand_total']) == Decimal('108.00')

        await communicator.disconnect()


# ============================================================================
# CART OPERATIONS TESTS
# ============================================================================

@pytest.mark.django_db
@pytest.mark.asyncio
class TestCartOperations:
    """Test cart-wide operations via WebSocket."""

    async def test_clear_cart_via_websocket(self):
        """
        HIGH: Verify clearing entire cart via WebSocket.

        Scenario:
        - Add multiple items
        - Clear cart via WebSocket
        - Expected: All items removed, cart empty

        Value: Allows starting over without creating new order
        """
        # Setup
        tenant = await database_sync_to_async(Tenant.objects.create)(
            slug="ws-clear-test",
            name="WebSocket Clear Test",
            is_active=True
        )

        user = await database_sync_to_async(User.objects.create_user)(
            username="clearuser",
            email="clear@test.com",
            password="test123",
            tenant=tenant,
            role="STAFF"
        )

        await database_sync_to_async(set_current_tenant)(tenant)

        product_type = await database_sync_to_async(ProductType.objects.create)(
            tenant=tenant,
            name="Simple"
        )

        product1 = await database_sync_to_async(Product.objects.create)(
            tenant=tenant,
            name="Product 1",
            price=Decimal("10.00"),
            product_type=product_type
        )

        product2 = await database_sync_to_async(Product.objects.create)(
            tenant=tenant,
            name="Product 2",
            price=Decimal("20.00"),
            product_type=product_type
        )

        order = await database_sync_to_async(Order.objects.create)(
            tenant=tenant,
            order_type='pos',
            subtotal=Decimal('30.00'),
            tax_total=Decimal('0.00'),
            grand_total=Decimal('30.00'),
            status='PENDING'
        )

        # Add items
        await database_sync_to_async(OrderItem.objects.create)(
            tenant=tenant,
            order=order,
            product=product1,
            quantity=1,
            price_at_sale=Decimal("10.00")
        )

        await database_sync_to_async(OrderItem.objects.create)(
            tenant=tenant,
            order=order,
            product=product2,
            quantity=1,
            price_at_sale=Decimal("20.00")
        )

        # Connect WebSocket
        refresh = await database_sync_to_async(RefreshToken.for_user)(user)
        refresh['tenant_id'] = str(tenant.id)
        refresh['tenant_slug'] = tenant.slug
        access_token = str(refresh.access_token)

        communicator = WebsocketCommunicator(
            application,
            f"/ws/cart/{order.id}/",
            headers=[(b"cookie", f"access_token={access_token}".encode())]
        )
        communicator.scope['tenant'] = tenant
        communicator.scope['user'] = user

        connected, _ = await communicator.connect()
        assert connected

        # Consume initial state
        await communicator.receive_json_from()

        # Clear cart
        await communicator.send_json_to({
            "type": "clear_cart",
            "payload": {
                "order_id": str(order.id)
            }
        })

        # Receive updated cart
        response = await communicator.receive_json_from()

        assert response['type'] == 'cart_update'
        assert len(response['payload']['items']) == 0, "Cart should be empty"
        assert Decimal(response['payload']['subtotal']) == Decimal('0.00')
        assert Decimal(response['payload']['grand_total']) == Decimal('0.00')

        await communicator.disconnect()
