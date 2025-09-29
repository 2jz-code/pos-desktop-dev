from django.test import TestCase
from rest_framework.exceptions import ValidationError
from decimal import Decimal
from .models import Category, Tax, Product, ProductType, ModifierSet, ModifierOption, ProductModifierSet
from .services import ModifierValidationService
from .policies import ProductTypePolicy


class ModifierValidationServiceTests(TestCase):

    @classmethod
    def setUpTestData(cls):
        """Set up data for the whole test case."""
        cls.product_type = ProductType.objects.create(name="Menu Item")
        cls.product = Product.objects.create(name="Test Product", price=10.00, product_type=cls.product_type)

        # Single choice, required
        cls.size_set = ModifierSet.objects.create(name="Size", internal_name="size", selection_type="SINGLE", min_selections=1)
        cls.small_opt = ModifierOption.objects.create(modifier_set=cls.size_set, name="Small", price_delta=-1.00)
        cls.large_opt = ModifierOption.objects.create(modifier_set=cls.size_set, name="Large", price_delta=1.00)
        ProductModifierSet.objects.create(product=cls.product, modifier_set=cls.size_set)

        # Multiple choice, optional, max 2
        cls.toppings_set = ModifierSet.objects.create(name="Toppings", internal_name="toppings", selection_type="MULTIPLE", max_selections=2)
        cls.cheese_opt = ModifierOption.objects.create(modifier_set=cls.toppings_set, name="Cheese", price_delta=0.50)
        cls.bacon_opt = ModifierOption.objects.create(modifier_set=cls.toppings_set, name="Bacon", price_delta=1.00)
        cls.lettuce_opt = ModifierOption.objects.create(modifier_set=cls.toppings_set, name="Lettuce", price_delta=0.25)
        ProductModifierSet.objects.create(product=cls.product, modifier_set=cls.toppings_set)

    def test_valid_single_choice(self):
        """Test that a valid single choice selection passes."""
        try:
            ModifierValidationService.validate_product_selection(self.product, [self.small_opt.id])
        except ValidationError:
            self.fail("Validation raised ValidationError unexpectedly!")

    def test_invalid_multiple_options_for_single_choice(self):
        """Test that selecting multiple options for a single choice set fails."""
        with self.assertRaisesRegex(ValidationError, "Only one option can be selected for 'Size'."):
            ModifierValidationService.validate_product_selection(self.product, [self.small_opt.id, self.large_opt.id])

    def test_missing_required_single_choice(self):
        """Test that not selecting an option for a required single choice set fails."""
        with self.assertRaisesRegex(ValidationError, "A selection is required for 'Size'."):
            ModifierValidationService.validate_product_selection(self.product, [self.cheese_opt.id]) # Only provide optional topping

    def test_valid_multiple_choice(self):
        """Test that a valid multiple choice selection passes."""
        try:
            ModifierValidationService.validate_product_selection(self.product, [self.small_opt.id, self.cheese_opt.id, self.bacon_opt.id])
        except ValidationError:
            self.fail("Validation raised ValidationError unexpectedly!")

    def test_too_many_options_for_multiple_choice(self):
        """Test that selecting too many options for a multiple choice set fails."""
        with self.assertRaisesRegex(ValidationError, "You can select at most 2 options for 'Toppings'."):
            ModifierValidationService.validate_product_selection(self.product, [self.small_opt.id, self.cheese_opt.id, self.bacon_opt.id, self.lettuce_opt.id])

    def test_invalid_option_for_product(self):
        """Test that selecting an option not associated with the product fails."""
        other_set = ModifierSet.objects.create(name="Other", internal_name="other", selection_type="SINGLE")
        other_option = ModifierOption.objects.create(modifier_set=other_set, name="Other Option")
        with self.assertRaisesRegex(ValidationError, "Invalid modifier option\(s\) selected"):
            ModifierValidationService.validate_product_selection(self.product, [self.small_opt.id, other_option.id])


class ProductTypePolicyTests(TestCase):
    """Test the new ProductType functionality."""

    @classmethod
    def setUpTestData(cls):
        """Set up data for the whole test case."""
        # Create a tax for testing
        cls.tax = Tax.objects.create(name="Sales Tax", rate=Decimal("8.25"))

        # Create product type with tax_inclusive enabled
        cls.inclusive_type = ProductType.objects.create(
            name="Tax Inclusive Type",
            tax_inclusive=True,
            max_quantity_per_item=5,
            exclude_from_discounts=True
        )
        cls.inclusive_type.default_taxes.add(cls.tax)

        # Create product type with tax_inclusive disabled
        cls.exclusive_type = ProductType.objects.create(
            name="Tax Exclusive Type",
            tax_inclusive=False
        )
        cls.exclusive_type.default_taxes.add(cls.tax)

        # Create test products
        cls.inclusive_product = Product.objects.create(
            name="Inclusive Product",
            price=Decimal("10.82"),  # Includes 8.25% tax (base price would be 10.00)
            product_type=cls.inclusive_type
        )

        cls.exclusive_product = Product.objects.create(
            name="Exclusive Product",
            price=Decimal("10.00"),
            product_type=cls.exclusive_type
        )

    def test_tax_inclusive_display_price(self):
        """Test that tax_inclusive products display stored price as-is."""
        display_price = ProductTypePolicy.calculate_display_price(
            self.inclusive_product,
            self.inclusive_product.price
        )
        self.assertEqual(display_price, Decimal("10.82"))

    def test_tax_exclusive_display_price(self):
        """Test that tax_exclusive products display stored price as-is."""
        display_price = ProductTypePolicy.calculate_display_price(
            self.exclusive_product,
            self.exclusive_product.price
        )
        self.assertEqual(display_price, Decimal("10.00"))

    def test_tax_inclusive_base_price_calculation(self):
        """Test extracting base price from tax-inclusive display price."""
        base_price = ProductTypePolicy.calculate_base_price_from_display(
            self.inclusive_product,
            Decimal("10.82")
        )
        # Base price should be 10.82 / 1.0825 = 10.00
        self.assertEqual(base_price, Decimal("10.00"))

    def test_tax_exclusive_base_price_calculation(self):
        """Test that tax-exclusive prices return display price as base price."""
        base_price = ProductTypePolicy.calculate_base_price_from_display(
            self.exclusive_product,
            Decimal("10.00")
        )
        self.assertEqual(base_price, Decimal("10.00"))

    def test_max_quantity_per_item_property(self):
        """Test that max_quantity_per_item is properly set."""
        self.assertEqual(self.inclusive_type.max_quantity_per_item, 5)
        self.assertIsNone(self.exclusive_type.max_quantity_per_item)

    def test_exclude_from_discounts_property(self):
        """Test that exclude_from_discounts is properly set."""
        self.assertTrue(self.inclusive_type.exclude_from_discounts)
        self.assertFalse(self.exclusive_type.exclude_from_discounts)
