from django.shortcuts import render
from rest_framework import viewsets, status, generics
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.views import APIView
from .models import GlobalSettings, POSDevice, TerminalLocation
from .serializers import (
    GlobalSettingsSerializer,
    POSDeviceSerializer,
    TerminalLocationSerializer,
)
from payments.strategies import StripeTerminalStrategy

# Create your views here.


class GlobalSettingsViewSet(viewsets.ModelViewSet):
    """
    API endpoint for viewing and editing the application's single GlobalSettings object.
    A ModelViewSet is used for simplicity, but we ensure only one instance can exist.
    """

    queryset = GlobalSettings.objects.all()
    serializer_class = GlobalSettingsSerializer

    def get_object(self):
        """
        Always returns the single GlobalSettings instance.
        """
        obj, created = GlobalSettings.objects.get_or_create(pk=1)
        return obj

    def list(self, request, *args, **kwargs):
        """
        Handle GET requests for the list view.
        Since this is a singleton, this will retrieve the single settings object.
        """
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)


class POSDeviceViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing POS device and reader pairings.
    """

    queryset = POSDevice.objects.all()
    serializer_class = POSDeviceSerializer
    lookup_field = "device_id"

    def create(self, request, *args, **kwargs):
        """
        Creates or updates a POSDevice pairing.
        This allows the frontend to simply POST to create or update a pairing.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        device_id = serializer.validated_data.get("device_id")
        reader_id = serializer.validated_data.get("reader_id")
        nickname = serializer.validated_data.get("nickname", "")

        obj, created = POSDevice.objects.update_or_create(
            device_id=device_id, defaults={"reader_id": reader_id, "nickname": nickname}
        )

        response_serializer = self.get_serializer(obj)
        headers = self.get_success_headers(response_serializer.data)

        status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK

        return Response(response_serializer.data, status=status_code, headers=headers)


class TerminalLocationViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing Terminal Locations.
    """

    queryset = TerminalLocation.objects.all()
    serializer_class = TerminalLocationSerializer

    @action(detail=True, methods=["post"], url_path="set-default")
    def set_default(self, request, pk=None):
        """
        Sets the specified location as the default.
        """
        location = self.get_object()
        location.is_default = True
        location.save()
        return Response(
            {"status": "success", "message": f"'{location.name}' is now the default."},
            status=status.HTTP_200_OK,
        )


class SyncStripeLocationsView(APIView):
    """
    An API view to trigger the synchronization of locations from Stripe.
    """

    def post(self, request, *args, **kwargs):
        """
        Handles the POST request to sync locations.
        """
        result = StripeTerminalStrategy.sync_locations_from_stripe()
        if result["status"] == "success":
            return Response(result, status=status.HTTP_200_OK)
        else:
            return Response(result, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
