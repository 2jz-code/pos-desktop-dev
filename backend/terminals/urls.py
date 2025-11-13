from rest_framework.routers import DefaultRouter
from .views import TerminalPairingViewSet, TerminalRegistrationViewSet

router = DefaultRouter()
router.register(r'pairing', TerminalPairingViewSet, basename='terminal-pairing')
router.register(r'registrations', TerminalRegistrationViewSet, basename='terminal-registration')

urlpatterns = router.urls
