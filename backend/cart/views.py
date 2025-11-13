"""
Cart API views for customer-facing cart operations.

Handles both authenticated users and guest sessions.
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
import logging

from .models import Cart, CartItem
from .serializers import (
    CartSerializer,
    CartItemSerializer,
    AddToCartSerializer,
    UpdateCartItemSerializer,
    SetCartLocationSerializer,
    UpdateCartCustomerInfoSerializer
)
from .services import CartService
from products.models import Product
from settings.models import StoreLocation
from customers.authentication import CustomerCookieJWTAuthentication

logger = logging.getLogger(__name__)


class CartViewSet(viewsets.ViewSet):
    """
    ViewSet for cart operations.

    Supports both authenticated users and guest sessions.

    Endpoints:
    - GET /api/cart/ - Retrieve current cart
    - POST /api/cart/add_item/ - Add item to cart
    - PATCH /api/cart/update_item/{item_id}/ - Update item quantity
    - DELETE /api/cart/remove_item/{item_id}/ - Remove item from cart
    - DELETE /api/cart/clear/ - Clear all items
    - POST /api/cart/set_location/ - Set store location (checkout step 1)
    - POST /api/cart/checkout/ - Convert cart to order
    """

    authentication_classes = [CustomerCookieJWTAuthentication]
    permission_classes = [AllowAny]  # Handle auth internally

    def _get_or_create_cart(self, request) -> Cart:
        """
        Get or create cart for current user/session.

        Uses authentication if available, otherwise uses GuestSessionService
        to ensure guest_id is stored in session for permission checks.
        """
        from orders.services import GuestSessionService

        customer = request.user if request.user.is_authenticated else None

        # For guest users, use GuestSessionService to ensure guest_id is stored IN session
        # This is critical for order permission checks after cart → order conversion
        if not customer:
            session_id = GuestSessionService.get_or_create_guest_id(request)
        else:
            session_id = None

        return CartService.get_or_create_cart(
            customer=customer,
            session_id=session_id,
            tenant=request.tenant
        )

    def retrieve(self, request):
        """
        GET /api/cart/

        Retrieve the current cart with all items and totals.
        """
        cart = self._get_or_create_cart(request)
        serializer = CartSerializer(cart)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='add-item')
    def add_item(self, request):
        """
        POST /api/cart/add-item/

        Add an item to the cart.

        Request body:
        {
            "product_id": "uuid",
            "quantity": 1,
            "selected_modifiers": [
                {"option_id": "uuid", "quantity": 1}
            ],
            "notes": "No onions"
        }
        """
        serializer = AddToCartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        cart = self._get_or_create_cart(request)

        # Get product
        product = get_object_or_404(
            Product,
            id=serializer.validated_data['product_id'],
            tenant=request.tenant
        )

        # Add item to cart
        cart_item = CartService.add_item_to_cart(
            cart=cart,
            product=product,
            quantity=serializer.validated_data['quantity'],
            selected_modifiers=serializer.validated_data.get('selected_modifiers', []),
            notes=serializer.validated_data.get('notes', '')
        )

        # Return updated cart
        cart.refresh_from_db()
        cart_serializer = CartSerializer(cart)
        return Response(cart_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['patch'], url_path='update-item/(?P<item_id>[^/.]+)')
    def update_item(self, request, item_id=None):
        """
        PATCH /api/cart/update-item/{item_id}/

        Update the quantity of a cart item.

        Request body:
        {
            "quantity": 2
        }
        """
        serializer = UpdateCartItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        cart = self._get_or_create_cart(request)

        # Get cart item
        cart_item = get_object_or_404(
            CartItem,
            id=item_id,
            cart=cart,
            tenant=request.tenant
        )

        # Update quantity
        CartService.update_item_quantity(
            cart_item=cart_item,
            new_quantity=serializer.validated_data['quantity']
        )

        # Return updated cart
        cart.refresh_from_db()
        cart_serializer = CartSerializer(cart)
        return Response(cart_serializer.data)

    @action(detail=False, methods=['delete'], url_path='remove-item/(?P<item_id>[^/.]+)')
    def remove_item(self, request, item_id=None):
        """
        DELETE /api/cart/remove-item/{item_id}/

        Remove an item from the cart.
        """
        cart = self._get_or_create_cart(request)

        # Get cart item
        cart_item = get_object_or_404(
            CartItem,
            id=item_id,
            cart=cart,
            tenant=request.tenant
        )

        # Remove item
        CartService.remove_item_from_cart(cart_item)

        # Return updated cart
        cart.refresh_from_db()
        cart_serializer = CartSerializer(cart)
        return Response(cart_serializer.data)

    @action(detail=False, methods=['delete'], url_path='clear')
    def clear(self, request):
        """
        DELETE /api/cart/clear/

        Remove all items from the cart.
        """
        cart = self._get_or_create_cart(request)
        CartService.clear_cart(cart)

        # Return empty cart
        cart.refresh_from_db()
        cart_serializer = CartSerializer(cart)
        return Response(cart_serializer.data)

    @action(detail=False, methods=['post'], url_path='set-location')
    def set_location(self, request):
        """
        POST /api/cart/set-location/

        Set the store location for the cart (checkout step 1).

        Request body:
        {
            "store_location_id": "uuid"
        }
        """
        serializer = SetCartLocationSerializer(
            data=request.data,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)

        cart = self._get_or_create_cart(request)

        # Get store location
        store_location = get_object_or_404(
            StoreLocation,
            id=serializer.validated_data['store_location_id'],
            tenant=request.tenant
        )

        # Set location
        cart = CartService.set_cart_location(cart, store_location)

        # Return updated cart (now includes tax)
        cart_serializer = CartSerializer(cart)
        return Response(cart_serializer.data)

    @action(detail=False, methods=['patch'], url_path='update-customer-info')
    def update_customer_info(self, request):
        """
        PATCH /api/cart/update-customer-info/

        Update customer information on the cart (checkout step 2).

        Request body:
        {
            "guest_first_name": "John",
            "guest_last_name": "Doe",
            "guest_email": "john@example.com",
            "guest_phone": "1234567890"
        }
        """
        serializer = UpdateCartCustomerInfoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        cart = self._get_or_create_cart(request)

        # Update cart with provided fields
        for field, value in serializer.validated_data.items():
            setattr(cart, field, value)

        cart.save()

        # Return updated cart
        cart_serializer = CartSerializer(cart)
        return Response(cart_serializer.data)

    @action(detail=False, methods=['post'], url_path='reorder')
    def reorder(self, request):
        """
        POST /api/cart/reorder/

        Recreate a past order by copying all items into the current cart.

        Request body:
        {
            "order_id": "uuid"
        }

        This clears the current cart and adds all items from the specified order.
        """
        from orders.models import Order

        order_id = request.data.get('order_id')
        if not order_id:
            return Response(
                {'error': 'order_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get the order
        try:
            order = Order.objects.get(id=order_id, tenant=request.tenant)
        except Order.DoesNotExist:
            return Response(
                {'error': 'Order not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Validate order access (customer must own the order)
        if request.user.is_authenticated:
            if order.customer != request.user:
                return Response(
                    {'error': 'You do not have permission to reorder this order'},
                    status=status.HTTP_403_FORBIDDEN
                )
        else:
            # Guest users can't reorder - must be authenticated
            return Response(
                {'error': 'Authentication required to reorder'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Get or create cart
        cart = self._get_or_create_cart(request)

        # Clear existing cart
        CartService.clear_cart(cart)

        # Copy all items from order to cart
        for order_item in order.items.all():
            # Get the current product (it must still exist and be active)
            try:
                product = Product.objects.get(
                    id=order_item.product.id,
                    tenant=request.tenant,
                    is_active=True
                )
            except Product.DoesNotExist:
                # Skip items whose products are no longer available
                logger.warning(
                    f"Skipping order item {order_item.id} - "
                    f"product {order_item.product.name} no longer available"
                )
                continue

            # Extract modifiers from the order item's snapshot
            selected_modifiers = []
            for snapshot in order_item.selected_modifiers_snapshot.all():
                # Try to find the current modifier option by name
                # (IDs might have changed, but names should be stable)
                try:
                    from products.models import ModifierOption
                    option = ModifierOption.objects.get(
                        name=snapshot.option_name,
                        modifier_set__name=snapshot.modifier_set_name,
                        modifier_set__products=product,
                        tenant=request.tenant
                    )
                    selected_modifiers.append({
                        'option_id': str(option.id),
                        'quantity': snapshot.quantity
                    })
                except ModifierOption.DoesNotExist:
                    # Modifier no longer exists, skip it
                    logger.warning(
                        f"Skipping modifier {snapshot.modifier_set_name}/{snapshot.option_name} - "
                        f"no longer available for product {product.name}"
                    )
                    continue

            # Add item to cart
            CartService.add_item_to_cart(
                cart=cart,
                product=product,
                quantity=order_item.quantity,
                selected_modifiers=selected_modifiers,
                notes=order_item.notes or ''
            )

        # Return updated cart
        cart.refresh_from_db()
        cart_serializer = CartSerializer(cart)
        return Response(cart_serializer.data)

    @action(detail=False, methods=['post'], url_path='checkout')
    def checkout(self, request):
        """
        POST /api/cart/checkout/

        DEPRECATED: This endpoint is no longer used for web orders.

        For web orders, the payment flow now handles cart → order conversion atomically.
        Call the payment endpoint directly with cart_id:
        - Guest: POST /api/payments/guest/create-intent/ with cart_id
        - Authenticated: POST /api/payments/create-intent/ with cart_id

        This endpoint is kept for backward compatibility with POS flows only.
        """
        return Response(
            {
                'error': 'This endpoint is deprecated for web orders. '
                        'Please use the payment endpoint directly with cart_id for atomic conversion.'
            },
            status=status.HTTP_410_GONE
        )
