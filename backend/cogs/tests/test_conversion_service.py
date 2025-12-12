"""
Tests for ConversionService.
"""
import pytest
from decimal import Decimal

from cogs.services import ConversionService
from cogs.exceptions import ConversionError, UnitMappingError


@pytest.mark.django_db
class TestConversionService:
    """Tests for the ConversionService."""

    def test_map_string_to_unit_exact_code(self, tenant, default_units):
        """Test mapping exact unit code."""
        service = ConversionService(tenant)

        unit = service.map_string_to_unit("g")
        assert unit is not None
        assert unit.code == "g"

    def test_map_string_to_unit_full_name(self, tenant, default_units):
        """Test mapping full unit name."""
        service = ConversionService(tenant)

        unit = service.map_string_to_unit("gram")
        assert unit is not None
        assert unit.code == "g"

    def test_map_string_to_unit_plural(self, tenant, default_units):
        """Test mapping plural unit name."""
        service = ConversionService(tenant)

        unit = service.map_string_to_unit("grams")
        assert unit is not None
        assert unit.code == "g"

    def test_map_string_to_unit_case_insensitive(self, tenant, default_units):
        """Test case-insensitive mapping."""
        service = ConversionService(tenant)

        unit = service.map_string_to_unit("KILOGRAM")
        assert unit is not None
        assert unit.code == "kg"

    def test_map_string_to_unit_unknown(self, tenant, default_units):
        """Test mapping unknown unit returns None."""
        service = ConversionService(tenant)

        unit = service.map_string_to_unit("unknown_unit")
        assert unit is None

    def test_convert_same_unit(self, tenant, default_units):
        """Test converting same unit returns same quantity."""
        service = ConversionService(tenant)
        gram = default_units['g']

        result = service.convert(Decimal("100"), gram, gram)
        assert result == Decimal("100")

    def test_convert_kg_to_g(self, tenant, default_units, default_conversions):
        """Test converting kg to g."""
        service = ConversionService(tenant)
        kg = default_units['kg']
        g = default_units['g']

        result = service.convert(Decimal("1"), kg, g)
        assert result == Decimal("1000.0000")

    def test_convert_g_to_kg(self, tenant, default_units, default_conversions):
        """Test converting g to kg (inverse conversion)."""
        service = ConversionService(tenant)
        kg = default_units['kg']
        g = default_units['g']

        result = service.convert(Decimal("1000"), g, kg)
        assert result == Decimal("1.0000")

    def test_convert_lb_to_oz(self, tenant, default_units, default_conversions):
        """Test converting lb to oz."""
        service = ConversionService(tenant)
        lb = default_units['lb']
        oz = default_units['oz']

        result = service.convert(Decimal("1"), lb, oz)
        assert result == Decimal("16.0000")

    def test_convert_no_conversion_path(self, tenant, default_units, default_conversions):
        """Test converting with no conversion path raises error."""
        service = ConversionService(tenant)
        g = default_units['g']
        each = default_units['each']

        with pytest.raises(ConversionError):
            service.convert(Decimal("100"), g, each)

    def test_can_convert_true(self, tenant, default_units, default_conversions):
        """Test can_convert returns True when conversion exists."""
        service = ConversionService(tenant)
        kg = default_units['kg']
        g = default_units['g']

        assert service.can_convert(kg, g) is True
        assert service.can_convert(g, kg) is True  # Inverse

    def test_can_convert_false(self, tenant, default_units, default_conversions):
        """Test can_convert returns False when no conversion exists."""
        service = ConversionService(tenant)
        g = default_units['g']
        each = default_units['each']

        assert service.can_convert(g, each) is False

    def test_convert_from_string(self, tenant, default_units, default_conversions):
        """Test convert_from_string convenience method."""
        service = ConversionService(tenant)
        g = default_units['g']

        result = service.convert_from_string(Decimal("1"), "kg", g)
        assert result == Decimal("1000.0000")

    def test_convert_from_string_unknown_unit(self, tenant, default_units):
        """Test convert_from_string with unknown unit raises error."""
        service = ConversionService(tenant)
        g = default_units['g']

        with pytest.raises(UnitMappingError):
            service.convert_from_string(Decimal("100"), "unknown", g)
