from .models import Product, Category, Tax
from django.db import transaction
from rest_framework.exceptions import ValidationError
from .models import Product, ModifierSet, ModifierOption, ProductModifierSet


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
        # Keep the image_file in kwargs so the model gets it and the signal can process it
        # image_file = kwargs.pop("image", None)  # Don't remove the image from kwargs

        # Extract inventory-related data
        initial_stock = kwargs.pop("initial_stock", 0)
        location_id = kwargs.pop("location_id", None)

        if category_id:
            kwargs["category"] = Category.objects.get(id=category_id)

        product = Product.objects.create(**kwargs)

        # Remove manual image processing - let the signal handle it
        # if image_file:
        #     processed_image = ImageService.process_image(image_file)
        #     product.image.save(processed_image.name, processed_image, save=True)
        #     product.save()  # Save product again to update image field

        if tax_ids:
            product.taxes.set(Tax.objects.filter(id__in=tax_ids))

        # Create initial stock record if tracking inventory
        if kwargs.get("track_inventory", False):
            from inventory.models import InventoryStock, Location
            from settings.models import GlobalSettings

            # Use provided location or default location
            if location_id:
                location = Location.objects.get(id=location_id)
            else:
                # Get default location from settings
                settings = GlobalSettings.objects.first()
                if settings and settings.default_inventory_location:
                    location = settings.default_inventory_location
                else:
                    # Create a default location if none exists
                    location, created = Location.objects.get_or_create(
                        name="Main Storage",
                        defaults={"description": "Default inventory location"},
                    )
                    if created and settings:
                        settings.default_inventory_location = location
                        settings.save()

            # Create the stock record
            InventoryStock.objects.create(
                product=product, location=location, quantity=float(initial_stock)
            )

        return product


class BaseSelectionStrategy:
    def validate(self, pms, options_in_set):
        raise NotImplementedError("Subclasses must implement this method.")


class SingleSelectionStrategy(BaseSelectionStrategy):
    def validate(self, pms, options_in_set):
        is_required = pms.is_required_override or (pms.modifier_set.min_selections > 0)
        if is_required and not options_in_set:
            raise ValidationError(
                f"A selection is required for '{pms.modifier_set.name}'."
            )
        if len(options_in_set) > 1:
            raise ValidationError(
                f"Only one option can be selected for '{pms.modifier_set.name}'."
            )


class MultipleSelectionStrategy(BaseSelectionStrategy):
    def validate(self, pms, options_in_set):
        num_options = len(options_in_set)
        min_selections = pms.modifier_set.min_selections
        max_selections = pms.modifier_set.max_selections

        if num_options < min_selections:
            raise ValidationError(
                f"You must select at least {min_selections} options for '{pms.modifier_set.name}'."
            )
        if max_selections is not None and num_options > max_selections:
            raise ValidationError(
                f"You can select at most {max_selections} options for '{pms.modifier_set.name}'."
            )


class ModifierValidationService:
    STRATEGIES = {
        "SINGLE": SingleSelectionStrategy(),
        "MULTIPLE": MultipleSelectionStrategy(),
    }

    @classmethod
    def validate_product_selection(cls, product, selected_option_ids):
        if not selected_option_ids:
            # If no options are selected, we only need to check if any required groups were missed.
            required_sets = ProductModifierSet.objects.filter(
                product=product, is_required_override=True
            )
            if required_sets.exists():
                raise ValidationError(
                    f"A selection for '{required_sets.first().modifier_set.name}' is required."
                )
            return

        selected_ids_set = set(selected_option_ids)
        product_modifier_sets = (
            product.product_modifier_sets.all()
            .select_related("modifier_set")
            .prefetch_related(
                "modifier_set__options",
                "hidden_options",
                "extra_options",
                "modifier_set__triggered_by_option",
            )
        )

        all_valid_option_ids = set()
        selections_by_pms = {pms.id: [] for pms in product_modifier_sets}

        for pms in product_modifier_sets:
            valid_options = (
                set(pms.modifier_set.options.filter(is_product_specific=False)) | set(pms.extra_options.all())
            ) - set(pms.hidden_options.all())
            valid_ids_for_set = {opt.id for opt in valid_options}
            all_valid_option_ids.update(valid_ids_for_set)

            for opt_id in selected_ids_set:
                if opt_id in valid_ids_for_set:
                    selections_by_pms[pms.id].append(opt_id)

        # 1. Check for any invalid or disallowed options
        if not selected_ids_set.issubset(all_valid_option_ids):
            invalid_options = selected_ids_set - all_valid_option_ids
            raise ValidationError(
                f"Invalid modifier option(s) selected: {invalid_options}"
            )

        # 2. Validate rules for each group and check for conditional logic violations
        for pms in product_modifier_sets:
            # If a group is conditional, its trigger option MUST be selected
            trigger_option = pms.modifier_set.triggered_by_option
            if trigger_option and trigger_option.id not in selected_ids_set:
                # Check if this conditional set is being used as a standalone base modifier
                # This happens when the trigger option doesn't belong to any modifier set associated with this product
                trigger_option_in_product = any(
                    trigger_option.id in {opt.id for opt in other_pms.modifier_set.options.all()}
                    for other_pms in product_modifier_sets
                )
                
                if trigger_option_in_product:
                    # Normal conditional logic - trigger option exists in product's modifier sets
                    if selections_by_pms[
                        pms.id
                    ]:  # A selection was made for a group that shouldn't be visible
                        raise ValidationError(
                            f"Cannot select options from '{pms.modifier_set.name}' without selecting its trigger option '{trigger_option.name}'."
                        )
                    continue  # Skip validation for non-triggered conditional groups
                else:
                    # Standalone conditional set - treat as base modifier set
                    # The trigger option is not available in this product, so this set acts as a base set
                    pass  # Continue to validation below

            strategy = cls.STRATEGIES.get(pms.modifier_set.selection_type)
            if strategy:
                strategy.validate(pms, selections_by_pms[pms.id])
