from django.test import TestCase
from rest_framework.exceptions import ValidationError
from .models import Category, Tax, Product, ProductType, ModifierSet, ModifierOption, ProductModifierSet
from .services import ModifierValidationService


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
