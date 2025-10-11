"""
Integrations Tests

Basic tests for integrations app (Google Places API).
"""

import pytest


@pytest.mark.django_db
class TestIntegrationsApp:
    """Test integrations app basic functionality"""

    def test_google_places_service_import(self):
        """Test that GooglePlacesService can be imported"""
        from integrations.services import GooglePlacesService
        assert GooglePlacesService is not None

    def test_app_exists(self):
        """Test that integrations app is installed"""
        from django.apps import apps
        assert apps.is_installed('integrations')
