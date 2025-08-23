"""
Dependency validation service for products app.

Handles validation of dependencies when archiving categories and product types
to ensure data integrity and provide clear warnings to users.
"""

from typing import Dict, List, Optional, Any
from django.db import models
from django.contrib.auth import get_user_model

from .models import Product, Category, ProductType

User = get_user_model()


class DependencyValidationService:
    """
    Service for validating and managing dependencies when archiving 
    categories and product types.
    """
    
    @staticmethod
    def get_category_dependencies(category: Category) -> Dict[str, Any]:
        """
        Get all active products that depend on the given category.
        
        Args:
            category: The category to check dependencies for
            
        Returns:
            Dict containing dependency information
        """
        active_products = Product.objects.filter(
            category=category,
            is_active=True
        ).select_related('product_type').prefetch_related('taxes')
        
        return {
            'category_id': category.id,
            'category_name': category.name,
            'dependent_products_count': active_products.count(),
            'dependent_products': [
                {
                    'id': product.id,
                    'name': product.name,
                    'price': str(product.price),
                    'product_type': product.product_type.name if product.product_type else None,
                    'category': product.category_display_name,
                    'is_public': product.is_public,
                }
                for product in active_products[:10]  # Limit for performance
            ],
            'has_more_products': active_products.count() > 10,
        }
    
    @staticmethod
    def get_product_type_dependencies(product_type: ProductType) -> Dict[str, Any]:
        """
        Get all active products that depend on the given product type.
        
        Args:
            product_type: The product type to check dependencies for
            
        Returns:
            Dict containing dependency information
        """
        active_products = Product.objects.filter(
            product_type=product_type,
            is_active=True
        ).select_related('category').prefetch_related('taxes')
        
        return {
            'product_type_id': product_type.id,
            'product_type_name': product_type.name,
            'dependent_products_count': active_products.count(),
            'dependent_products': [
                {
                    'id': product.id,
                    'name': product.name,
                    'price': str(product.price),
                    'product_type': product.product_type.name if product.product_type else None,
                    'category': product.category_display_name,
                    'is_public': product.is_public,
                }
                for product in active_products[:10]  # Limit for performance
            ],
            'has_more_products': active_products.count() > 10,
        }
    
    @staticmethod
    def validate_category_archiving(category: Category, force: bool = False) -> Dict[str, Any]:
        """
        Validate if a category can be safely archived.
        
        Args:
            category: The category to validate
            force: Whether to allow archiving despite dependencies
            
        Returns:
            Dict containing validation results and warnings
        """
        dependencies = DependencyValidationService.get_category_dependencies(category)
        
        can_archive = force or dependencies['dependent_products_count'] == 0
        warnings = []
        
        if dependencies['dependent_products_count'] > 0:
            if not force:
                warnings.append(
                    f"Cannot archive category '{category.name}' - "
                    f"{dependencies['dependent_products_count']} active products depend on it."
                )
            else:
                warnings.append(
                    f"Archiving category '{category.name}' will affect "
                    f"{dependencies['dependent_products_count']} active products. "
                    f"Their category will be set to None."
                )
        
        return {
            'can_archive': can_archive,
            'requires_confirmation': dependencies['dependent_products_count'] > 0,
            'warnings': warnings,
            'dependencies': dependencies,
        }
    
    @staticmethod
    def validate_product_type_archiving(product_type: ProductType, force: bool = False) -> Dict[str, Any]:
        """
        Validate if a product type can be safely archived.
        
        Args:
            product_type: The product type to validate
            force: Whether to allow archiving despite dependencies
            
        Returns:
            Dict containing validation results and warnings
        """
        dependencies = DependencyValidationService.get_product_type_dependencies(product_type)
        
        # ProductType has PROTECT relationship, so we can't archive if there are dependencies
        # unless we provide a replacement or handle the products first
        can_archive = dependencies['dependent_products_count'] == 0
        warnings = []
        
        if dependencies['dependent_products_count'] > 0:
            warnings.append(
                f"Cannot archive product type '{product_type.name}' - "
                f"{dependencies['dependent_products_count']} active products depend on it. "
                f"Please reassign these products to another product type first or archive them."
            )
        
        return {
            'can_archive': can_archive,
            'requires_confirmation': dependencies['dependent_products_count'] > 0,
            'warnings': warnings,
            'dependencies': dependencies,
        }
    
    @staticmethod
    def archive_category_with_dependencies(
        category: Category,
        archived_by: Optional[User] = None,
        handle_products: str = 'set_null'  # 'set_null', 'archive', 'reassign'
    ) -> Dict[str, Any]:
        """
        Archive a category and handle its dependent products.
        
        Args:
            category: The category to archive
            archived_by: User performing the archiving
            handle_products: How to handle dependent products
                - 'set_null': Set category to None (default behavior)
                - 'archive': Archive all dependent products
                - 'reassign': Requires additional reassignment logic
        
        Returns:
            Dict containing operation results
        """
        # For reassign case, get fresh dependencies after external reassignment
        if handle_products == 'reassign':
            # Reassignment should have been handled externally, get fresh count
            fresh_dependencies = DependencyValidationService.get_category_dependencies(category)
            dependencies = fresh_dependencies
        else:
            # For other cases, use initial dependencies
            dependencies = DependencyValidationService.get_category_dependencies(category)
        
        results = {
            'success': True,
            'category_archived': True,
            'products_affected': dependencies['dependent_products_count'],
            'products_archived': 0,
            'products_reassigned': 0,
            'errors': []
        }
        
        try:
            # Handle dependent products first
            if dependencies['dependent_products_count'] > 0:
                dependent_products = Product.objects.filter(
                    category=category,
                    is_active=True
                )
                
                if handle_products == 'archive':
                    for product in dependent_products:
                        product.archive(archived_by=archived_by)
                        results['products_archived'] += 1
                elif handle_products == 'set_null':
                    # Set category to None for all dependent products
                    updated_count = dependent_products.update(category=None)
                    results['products_reassigned'] = updated_count
                elif handle_products == 'reassign':
                    # Products should have been reassigned already via separate API call
                    # If there are still dependent products, this indicates an issue
                    if dependencies['dependent_products_count'] > 0:
                        results['errors'].append(
                            f"Warning: {dependencies['dependent_products_count']} products still depend on this category after reassignment"
                        )
                    # Record the number of products that were supposed to be reassigned
                    results['products_reassigned'] = dependencies['dependent_products_count']
            
            # Archive the category
            category.archive(archived_by=archived_by, force=True, handle_products='skip')
            
        except Exception as e:
            results['success'] = False
            results['errors'].append(str(e))
        
        return results
    
    @staticmethod
    def get_alternative_product_types(exclude_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Get list of active product types that can be used as alternatives.
        
        Args:
            exclude_id: ID of product type to exclude from results
            
        Returns:
            List of alternative product types
        """
        queryset = ProductType.objects.filter(is_active=True)
        
        if exclude_id:
            queryset = queryset.exclude(id=exclude_id)
        
        return [
            {
                'id': pt.id,
                'name': pt.name,
                'description': pt.description,
            }
            for pt in queryset.order_by('name')
        ]
    
    @staticmethod
    def get_alternative_categories(exclude_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Get list of active categories that can be used as alternatives.
        
        Args:
            exclude_id: ID of category to exclude from results
            
        Returns:
            List of alternative categories
        """
        queryset = Category.objects.filter(is_active=True)
        
        if exclude_id:
            queryset = queryset.exclude(id=exclude_id)
        
        return [
            {
                'id': cat.id,
                'name': cat.name,
                'description': cat.description,
                'parent': cat.parent.name if cat.parent else None,
            }
            for cat in queryset.order_by('name')
        ]