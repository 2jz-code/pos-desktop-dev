from django_filters import rest_framework as filters
from .models import Product, Category


class ProductFilter(filters.FilterSet):
    category = filters.NumberFilter(method="filter_by_category")
    modifier_groups = filters.NumberFilter(method="filter_by_modifier_groups")
    product_type = filters.NumberFilter(field_name='product_type__id')

    class Meta:
        model = Product
        fields = ["category", "is_active", "product_type", "modifier_groups"]

    def filter_by_category(self, queryset, name, value):
        # This custom filter ensures that when a category is selected,
        # all products within that category and any of its sub-categories (descendants) are included.

        # Handle special "uncategorized" filter case
        if value == "uncategorized":
            return queryset.filter(category__isnull=True)

        try:
            category = Category.objects.get(pk=value)
            descendants = category.get_descendants(include_self=True)
            return queryset.filter(category__in=descendants)
        except Category.DoesNotExist:
            return queryset.none()
        except ValueError:
            # Handle case where value is not a valid integer (like "uncategorized")
            return queryset.none()

    def filter_by_modifier_groups(self, queryset, name, value):
        """
        Filter products that have a specific modifier set assigned.
        Used when viewing products from the modifier management page.
        """
        try:
            return queryset.filter(modifier_sets__id=value).distinct()
        except ValueError:
            return queryset.none()
