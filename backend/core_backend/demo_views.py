from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
import time

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def cached_data_demo(request):
    """Demonstrate the performance of Phase 3A & 3B cached data"""
    start_time = time.time()
    demo_data = {}
    
    try:
        # Test cached user authentication data
        from users.services import UserService
        staff_start = time.time()
        staff_users = UserService.get_pos_staff_users()
        staff_time = (time.time() - staff_start) * 1000
        
        permissions_start = time.time()
        permissions = UserService.get_user_permissions_by_role()
        permissions_time = (time.time() - permissions_start) * 1000
        
        demo_data['users'] = {
            'staff_count': len(staff_users),
            'response_time_ms': round(staff_time, 2),
            'permissions_loaded': len(permissions),
            'permissions_time_ms': round(permissions_time, 2)
        }
        
        # Test cached discounts data
        from discounts.services import DiscountService
        discounts_start = time.time()
        active_discounts = DiscountService.get_active_discounts()
        discounts_time = (time.time() - discounts_start) * 1000
        
        demo_data['discounts'] = {
            'active_count': len(active_discounts),
            'response_time_ms': round(discounts_time, 2)
        }
        
        # Test cached Google Reviews data
        from integrations.services import GooglePlacesService
        reviews_start = time.time()
        rating_summary = GooglePlacesService.get_business_rating_summary()
        reviews_time = (time.time() - reviews_start) * 1000
        
        highlights_start = time.time()
        highlights = GooglePlacesService.get_recent_reviews_highlights()
        highlights_time = (time.time() - highlights_start) * 1000
        
        demo_data['reviews'] = {
            'average_rating': rating_summary.get('average_rating', 0),
            'total_reviews': rating_summary.get('total_reviews', 0),
            'summary_time_ms': round(reviews_time, 2),
            'highlights_count': highlights.get('count', 0),
            'highlights_time_ms': round(highlights_time, 2)
        }
        
        total_time = (time.time() - start_time) * 1000
        
        # Test Phase 3B cached data
        
        # Test inventory caching
        from inventory.services import InventoryService
        inventory_start = time.time()
        availability = InventoryService.get_inventory_availability_status()
        inventory_time = (time.time() - inventory_start) * 1000
        
        recipe_start = time.time()
        recipe_map = InventoryService.get_recipe_ingredients_map()
        recipe_time = (time.time() - recipe_start) * 1000
        
        demo_data['inventory'] = {
            'availability_count': len(availability),
            'availability_time_ms': round(inventory_time, 2),
            'recipe_count': len(recipe_map),
            'recipe_time_ms': round(recipe_time, 2)
        }
        
        # Test order calculations caching
        from orders.services import OrderService
        tax_start = time.time()
        tax_matrix = OrderService.get_tax_calculation_matrix()
        tax_time = (time.time() - tax_start) * 1000
        
        demo_data['orders'] = {
            'tax_rate': tax_matrix.get('tax_rate', 0),
            'tax_matrix_size': len(tax_matrix.get('matrix', {})),
            'tax_calculation_time_ms': round(tax_time, 2)
        }
        
        # Test POS menu layout caching
        from products.services import ProductService
        layout_start = time.time()
        pos_layout = ProductService.get_pos_menu_layout()
        layout_time = (time.time() - layout_start) * 1000
        
        metadata = pos_layout.get('metadata', {})
        demo_data['pos_layout'] = {
            'total_products': metadata.get('total_products', 0),
            'total_categories': metadata.get('total_categories', 0),
            'total_modifiers': metadata.get('total_modifiers', 0),
            'layout_generation_time_ms': round(layout_time, 2)
        }
        
        total_time = (time.time() - start_time) * 1000
        
        return Response({
            'status': 'success',
            'message': 'Phase 3A & 3B caching demonstration',
            'total_response_time_ms': round(total_time, 2),
            'data': demo_data,
            'performance_notes': [
                'First request may be slower (cache miss)',
                'Subsequent requests should be much faster (cache hit)',
                'Phase 3B adds inventory, order calculations, and POS layout caching',
                'Complete POS menu layout cached for instant startup'
            ]
        })
        
    except Exception as e:
        return Response({
            'status': 'error',
            'message': f'Demo failed: {str(e)}',
            'total_response_time_ms': round((time.time() - start_time) * 1000, 2)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)