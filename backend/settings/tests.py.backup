from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from decimal import Decimal
from .models import GlobalSettings


class GlobalSettingsModelTest(TestCase):
    """Test the GlobalSettings model functionality."""

    def test_singleton_behavior(self):
        """Test that only one GlobalSettings instance can exist."""
        # Create first instance
        settings1 = GlobalSettings.objects.create(
            store_name="Test Store", tax_rate=Decimal("0.08")
        )

        # Try to create second instance - should raise ValidationError
        with self.assertRaises(Exception):
            settings2 = GlobalSettings()
            settings2.full_clean()
            settings2.save()

    def test_default_values(self):
        """Test that default values are set correctly."""
        settings = GlobalSettings.objects.create()

        self.assertEqual(settings.tax_rate, Decimal("0.08"))
        self.assertEqual(settings.surcharge_percentage, Decimal("0.00"))
        self.assertEqual(settings.currency, "USD")
        self.assertEqual(settings.receipt_footer, "Thank you for your business!")
        self.assertTrue(settings.print_customer_copy)


class GlobalSettingsAPITest(APITestCase):
    """Test the GlobalSettings API endpoints."""

    def setUp(self):
        """Set up test data."""
        self.settings = GlobalSettings.objects.create(
            store_name="Test Store",
            store_address="123 Test St",
            store_phone="555-0123",
            tax_rate=Decimal("0.08"),
            currency="USD",
        )

    def test_get_settings_list(self):
        """Test retrieving settings via list endpoint."""
        url = reverse("settings:global-settings-list")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["store_name"], "Test Store")

    def test_update_settings(self):
        """Test updating settings via PATCH."""
        url = reverse("settings:global-settings-detail", args=[self.settings.pk])
        data = {"store_name": "Updated Store Name", "tax_rate": "0.10"}
        response = self.client.patch(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.settings.refresh_from_db()
        self.assertEqual(self.settings.store_name, "Updated Store Name")
        self.assertEqual(self.settings.tax_rate, Decimal("0.10"))

    def test_store_info_endpoint(self):
        """Test the store info section endpoint."""
        url = reverse("settings:global-settings-store-info")

        # Test GET
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["store_name"], "Test Store")

        # Test PATCH
        data = {"store_name": "New Store Name"}
        response = self.client.patch(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.settings.refresh_from_db()
        self.assertEqual(self.settings.store_name, "New Store Name")

    def test_financial_endpoint(self):
        """Test the financial settings section endpoint."""
        url = reverse("settings:global-settings-financial")

        # Test GET
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(response.data["tax_rate"]), "0.08")

        # Test PATCH
        data = {"tax_rate": "0.09", "currency": "EUR"}
        response = self.client.patch(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.settings.refresh_from_db()
        self.assertEqual(self.settings.tax_rate, Decimal("0.09"))
        self.assertEqual(self.settings.currency, "EUR")

    def test_receipt_config_endpoint(self):
        """Test the receipt configuration section endpoint."""
        url = reverse("settings:global-settings-receipt-config")

        # Test GET
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Test PATCH
        data = {"receipt_header": "Welcome!", "print_customer_copy": False}
        response = self.client.patch(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.settings.refresh_from_db()
        self.assertEqual(self.settings.receipt_header, "Welcome!")
        self.assertFalse(self.settings.print_customer_copy)

    def test_summary_endpoint(self):
        """Test the settings summary endpoint."""
        url = reverse("settings:global-settings-summary")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        expected_fields = [
            "store_name",
            "currency",
            "tax_rate",
            "timezone",
            "active_terminal_provider",
        ]
        for field in expected_fields:
            self.assertIn(field, response.data)
