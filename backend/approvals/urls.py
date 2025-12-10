from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ManagerApprovalRequestViewSet, ApprovalPolicyViewSet

router = DefaultRouter()
router.register(r"requests", ManagerApprovalRequestViewSet, basename="approval-request")
router.register(r"policies", ApprovalPolicyViewSet, basename="approval-policy")

urlpatterns = [
    path("", include(router.urls)),
]
