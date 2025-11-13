"""
URL configuration for cart app.
"""

from django.urls import path
from .views import CartViewSet

app_name = 'cart'

# Cart endpoints
urlpatterns = [
    # GET /api/cart/ - Retrieve current cart
    path('', CartViewSet.as_view({'get': 'retrieve'}), name='cart-detail'),

    # POST /api/cart/add-item/ - Add item to cart
    path('add-item/', CartViewSet.as_view({'post': 'add_item'}), name='cart-add-item'),

    # PATCH /api/cart/update-item/{item_id}/ - Update item quantity
    path('update-item/<uuid:item_id>/', CartViewSet.as_view({'patch': 'update_item'}), name='cart-update-item'),

    # DELETE /api/cart/remove-item/{item_id}/ - Remove item from cart
    path('remove-item/<uuid:item_id>/', CartViewSet.as_view({'delete': 'remove_item'}), name='cart-remove-item'),

    # DELETE /api/cart/clear/ - Clear all items
    path('clear/', CartViewSet.as_view({'delete': 'clear'}), name='cart-clear'),

    # POST /api/cart/set-location/ - Set store location (checkout step 1)
    path('set-location/', CartViewSet.as_view({'post': 'set_location'}), name='cart-set-location'),

    # PATCH /api/cart/update-customer-info/ - Update customer info (checkout step 2)
    path('update-customer-info/', CartViewSet.as_view({'patch': 'update_customer_info'}), name='cart-update-customer-info'),

    # POST /api/cart/reorder/ - Recreate a past order in cart
    path('reorder/', CartViewSet.as_view({'post': 'reorder'}), name='cart-reorder'),

    # POST /api/cart/checkout/ - Convert cart to order (DEPRECATED)
    path('checkout/', CartViewSet.as_view({'post': 'checkout'}), name='cart-checkout'),
]
