"""
Notifications Tests

Basic tests for notifications app (Email and WebSocket notifications).
"""

import pytest


@pytest.mark.django_db
class TestNotificationsApp:
    """Test notifications app basic functionality"""

    def test_email_service_import(self):
        """Test that EmailService can be imported"""
        from notifications.services import EmailService
        assert EmailService is not None

    def test_global_pos_consumer_import(self):
        """Test that GlobalPOSConsumer can be imported"""
        from notifications.consumers import GlobalPOSConsumer
        assert GlobalPOSConsumer is not None

    def test_app_exists(self):
        """Test that notifications app is installed"""
        from django.apps import apps
        assert apps.is_installed('notifications')
