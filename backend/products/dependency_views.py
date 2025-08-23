"""
API views for dependency-aware archiving operations.

Provides endpoints for validating dependencies and performing safe
archiving operations with proper warnings and confirmation.
"""

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from .models import Category, ProductType, Product
from .dependency_service import DependencyValidationService
from .dependency_serializers import (
    CategoryArchiveValidationSerializer,
    ProductTypeArchiveValidationSerializer,
    ArchiveOperationResultSerializer,
    BulkArchiveRequestSerializer,
    BulkArchiveResponseSerializer,
    ReassignmentRequestSerializer,
    ReassignmentResponseSerializer,
    AlternativeCategorySerializer,
    AlternativeProductTypeSerializer,
)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def validate_category_archiving(request, category_id):
    """
    Validate if a category can be safely archived.
    
    Returns dependency information and warnings.
    """
    category = get_object_or_404(Category, id=category_id)
    force = request.query_params.get('force', 'false').lower() == 'true'
    
    validation_data = DependencyValidationService.validate_category_archiving(
        category, force=force
    )
    
    serializer = CategoryArchiveValidationSerializer(validation_data)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def validate_product_type_archiving(request, product_type_id):
    """
    Validate if a product type can be safely archived.
    
    Returns dependency information and warnings.
    """
    product_type = get_object_or_404(ProductType, id=product_type_id)
    force = request.query_params.get('force', 'false').lower() == 'true'
    
    validation_data = DependencyValidationService.validate_product_type_archiving(
        product_type, force=force
    )
    
    serializer = ProductTypeArchiveValidationSerializer(validation_data)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def archive_category(request, category_id):
    """
    Archive a category with dependency handling.
    """
    category = get_object_or_404(Category, id=category_id)
    
    force = request.data.get('force', False)
    handle_products = request.data.get('handle_products', 'set_null')
    
    try:
        # Always use the dependency service for proper handling
        result = DependencyValidationService.archive_category_with_dependencies(
            category,
            archived_by=request.user,
            handle_products=handle_products
        )
        
        serializer = ArchiveOperationResultSerializer(result)
        return Response(serializer.data, status=status.HTTP_200_OK)
        
    except ValueError as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def archive_product_type(request, product_type_id):
    """
    Archive a product type with dependency handling.
    """
    product_type = get_object_or_404(ProductType, id=product_type_id)
    
    force = request.data.get('force', False)
    handle_products = request.data.get('handle_products', 'archive')  # Default to archive for product types
    
    try:
        # Get dependency information
        dependencies = DependencyValidationService.get_product_type_dependencies(product_type)
        
        # Handle dependent products first if needed
        products_affected = dependencies['dependent_products_count']
        products_archived = 0
        
        if products_affected > 0 and handle_products == 'archive':
            # Archive all dependent products first
            dependent_products = Product.objects.filter(
                product_type=product_type,
                is_active=True
            )
            for product in dependent_products:
                product.archive(archived_by=request.user)
                products_archived += 1
        
        # Now archive the product type
        product_type.archive(archived_by=request.user, force=True)  # Force since we've handled dependencies
        
        result = {
            'success': True,
            'product_type_archived': True,
            'products_affected': products_affected,
            'products_archived': products_archived,
            'errors': []
        }
        
        serializer = ArchiveOperationResultSerializer(result)
        return Response(serializer.data, status=status.HTTP_200_OK)
        
    except ValueError as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_alternative_categories(request):
    """
    Get list of active categories that can be used as alternatives.
    """
    exclude_id = request.query_params.get('exclude_id')
    alternatives = DependencyValidationService.get_alternative_categories(
        exclude_id=exclude_id
    )
    
    serializer = AlternativeCategorySerializer(alternatives, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_alternative_product_types(request):
    """
    Get list of active product types that can be used as alternatives.
    """
    exclude_id = request.query_params.get('exclude_id')
    alternatives = DependencyValidationService.get_alternative_product_types(
        exclude_id=exclude_id
    )
    
    serializer = AlternativeProductTypeSerializer(alternatives, many=True)
    return Response(serializer.data)


class BulkArchiveView(APIView):
    """
    Handle bulk archiving operations for categories and product types.
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        """
        Perform bulk archiving operations.
        """
        serializer = BulkArchiveRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        data = serializer.validated_data
        category_ids = data.get('category_ids', [])
        product_type_ids = data.get('product_type_ids', [])
        force = data.get('force', False)
        handle_products = data.get('handle_products', 'set_null')
        
        result = {
            'categories_processed': 0,
            'product_types_processed': 0,
            'categories_archived': 0,
            'product_types_archived': 0,
            'products_affected': 0,
            'products_archived': 0,
            'errors': [],
            'warnings': []
        }
        
        # Process categories
        for category_id in category_ids:
            try:
                category = Category.objects.get(id=category_id)
                result['categories_processed'] += 1
                
                dependencies = DependencyValidationService.get_category_dependencies(category)
                result['products_affected'] += dependencies['dependent_products_count']
                
                if handle_products == 'archive':
                    archive_result = DependencyValidationService.archive_category_with_dependencies(
                        category,
                        archived_by=request.user,
                        handle_products='archive'
                    )
                    result['products_archived'] += archive_result['products_archived']
                else:
                    category.archive(
                        archived_by=request.user,
                        force=force,
                        handle_products=handle_products
                    )
                
                result['categories_archived'] += 1
                
            except Category.DoesNotExist:
                result['errors'].append(f'Category with ID {category_id} not found')
            except ValueError as e:
                result['errors'].append(f'Category {category_id}: {str(e)}')
            except Exception as e:
                result['errors'].append(f'Unexpected error with category {category_id}: {str(e)}')
        
        # Process product types
        for product_type_id in product_type_ids:
            try:
                product_type = ProductType.objects.get(id=product_type_id)
                result['product_types_processed'] += 1
                
                product_type.archive(archived_by=request.user, force=force)
                result['product_types_archived'] += 1
                
            except ProductType.DoesNotExist:
                result['errors'].append(f'Product type with ID {product_type_id} not found')
            except ValueError as e:
                result['errors'].append(f'Product type {product_type_id}: {str(e)}')
            except Exception as e:
                result['errors'].append(f'Unexpected error with product type {product_type_id}: {str(e)}')
        
        response_serializer = BulkArchiveResponseSerializer(result)
        response_status = status.HTTP_200_OK if not result['errors'] else status.HTTP_207_MULTI_STATUS
        
        return Response(response_serializer.data, status=response_status)


class ProductReassignmentView(APIView):
    """
    Handle product reassignment operations.
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        """
        Reassign products to new categories or product types.
        """
        serializer = ReassignmentRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        data = serializer.validated_data
        product_ids = data['product_ids']
        new_category_id = data.get('new_category_id')
        new_product_type_id = data.get('new_product_type_id')
        
        result = {
            'products_reassigned': 0,
            'category_reassigned': False,
            'product_type_reassigned': False,
            'errors': []
        }
        
        # Validate new category and product type
        new_category = None
        new_product_type = None
        
        if new_category_id:
            try:
                new_category = Category.objects.get(id=new_category_id, is_active=True)
            except Category.DoesNotExist:
                return Response(
                    {'error': f'Active category with ID {new_category_id} not found'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        if new_product_type_id:
            try:
                new_product_type = ProductType.objects.get(id=new_product_type_id, is_active=True)
            except ProductType.DoesNotExist:
                return Response(
                    {'error': f'Active product type with ID {new_product_type_id} not found'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        # Reassign products
        for product_id in product_ids:
            try:
                product = Product.objects.get(id=product_id, is_active=True)
                
                updated_fields = []
                
                if new_category is not None:
                    product.category = new_category
                    updated_fields.append('category')
                    result['category_reassigned'] = True
                
                if new_product_type is not None:
                    product.product_type = new_product_type
                    updated_fields.append('product_type')
                    result['product_type_reassigned'] = True
                
                if updated_fields:
                    product.save(update_fields=updated_fields)
                    result['products_reassigned'] += 1
                
            except Product.DoesNotExist:
                result['errors'].append(f'Active product with ID {product_id} not found')
            except Exception as e:
                result['errors'].append(f'Error reassigning product {product_id}: {str(e)}')
        
        response_serializer = ReassignmentResponseSerializer(result)
        response_status = status.HTTP_200_OK if not result['errors'] else status.HTTP_207_MULTI_STATUS
        
        return Response(response_serializer.data, status=response_status)