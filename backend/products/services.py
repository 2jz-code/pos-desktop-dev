from .models import Product, Category, Tax
from django.db import transaction


class ProductService:
    @staticmethod
    @transaction.atomic
    def create_product(**kwargs):
        """
        Creates a new product.

        Args:
            **kwargs: The data for the product.
        """
        category_id = kwargs.pop("category_id", None)
        tax_ids = kwargs.pop("tax_ids", [])

        if category_id:
            kwargs["category"] = Category.objects.get(id=category_id)

        product = Product.objects.create(**kwargs)

        if tax_ids:
            product.taxes.set(Tax.objects.filter(id__in=tax_ids))

        return product
