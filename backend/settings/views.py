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
    Provides convenient endpoints for different settings sections.
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

    def update(self, request, *args, **kwargs):
        """
        Handle PUT/PATCH requests to update settings.
        """
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        """
        Handle PATCH requests for partial updates.
        """
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    @action(detail=False, methods=["get", "patch"])
    def store_info(self, request):
        """
        Get or update just the store information section.
        """
        instance = self.get_object()

        if request.method == "GET":
            data = {
                "store_name": instance.store_name,
                "store_address": instance.store_address,
                "store_phone": instance.store_phone,
                "store_email": instance.store_email,
            }
            return Response(data)

        elif request.method == "PATCH":
            # Update only store info fields
            allowed_fields = [
                "store_name",
                "store_address",
                "store_phone",
                "store_email",
            ]
            update_data = {k: v for k, v in request.data.items() if k in allowed_fields}

            serializer = self.get_serializer(instance, data=update_data, partial=True)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)

            # Return updated store info
            return self.store_info(type("Request", (), {"method": "GET"})())

    @action(detail=False, methods=["get", "patch"])
    def financial(self, request):
        """
        Get or update just the financial settings section.
        """
        instance = self.get_object()

        if request.method == "GET":
            data = {
                "tax_rate": instance.tax_rate,
                "surcharge_percentage": instance.surcharge_percentage,
                "currency": instance.currency,
            }
            return Response(data)

        elif request.method == "PATCH":
            # Update only financial fields
            allowed_fields = ["tax_rate", "surcharge_percentage", "currency"]
            update_data = {k: v for k, v in request.data.items() if k in allowed_fields}

            serializer = self.get_serializer(instance, data=update_data, partial=True)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)

            # Return updated financial settings
            return self.financial(type("Request", (), {"method": "GET"})())

    @action(detail=False, methods=["get", "patch"])
    def receipt_config(self, request):
        """
        Get or update just the receipt configuration section.
        """
        instance = self.get_object()

        if request.method == "GET":
            data = {
                "receipt_header": instance.receipt_header,
                "receipt_footer": instance.receipt_footer,
            }
            return Response(data)

        elif request.method == "PATCH":
            # Update only receipt config fields
            allowed_fields = ["receipt_header", "receipt_footer"]
            update_data = {k: v for k, v in request.data.items() if k in allowed_fields}

            serializer = self.get_serializer(instance, data=update_data, partial=True)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)

            # Return updated receipt config
            return self.receipt_config(type("Request", (), {"method": "GET"})())

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """
        Get a summary of key settings for display purposes.
        """
        instance = self.get_object()
        data = {
            "store_name": instance.store_name,
            "currency": instance.currency,
            "tax_rate": instance.tax_rate,
            "timezone": instance.timezone,
            "active_terminal_provider": instance.active_terminal_provider,
        }
        return Response(data)

    @action(detail=False, methods=["get"])
    def receipt_format_data(self, request):
        """
        Get all the data needed for receipt formatting.
        This combines store info and receipt configuration for use by receipt formatters.
        """
        instance = self.get_object()
        data = {
            # Store Information
            "store_name": instance.store_name,
            "store_address": instance.store_address,
            "store_phone": instance.store_phone,
            "store_email": instance.store_email,
            # Receipt Configuration
            "receipt_header": instance.receipt_header,
            "receipt_footer": instance.receipt_footer,
        }
        return Response(data)

    @action(detail=False, methods=["get", "patch"])
    def business_hours(self, request):
        """
        Get or update business hours configuration.
        """
        instance = self.get_object()

        if request.method == "GET":
            data = {
                "opening_time": (
                    instance.opening_time.strftime("%H:%M")
                    if instance.opening_time
                    else None
                ),
                "closing_time": (
                    instance.closing_time.strftime("%H:%M")
                    if instance.closing_time
                    else None
                ),
                "timezone": instance.timezone,
            }
            return Response(data)

        elif request.method == "PATCH":
            # Update business hours fields
            allowed_fields = ["opening_time", "closing_time", "timezone"]

            updated_data = {}
            for field in allowed_fields:
                if field in request.data:
                    value = request.data[field]

                    # Handle time fields that might be null/empty
                    if field in ["opening_time", "closing_time"]:
                        if value is None or value == "":
                            setattr(instance, field, None)
                        else:
                            # Parse time string (HH:MM format)
                            from datetime import datetime

                            try:
                                time_obj = datetime.strptime(value, "%H:%M").time()
                                setattr(instance, field, time_obj)
                            except ValueError:
                                return Response(
                                    {
                                        "error": f"Invalid time format for {field}. Use HH:MM format."
                                    },
                                    status=400,
                                )
                    else:
                        setattr(instance, field, value)

                    updated_data[field] = request.data[field]

            if updated_data:
                instance.save(update_fields=list(updated_data.keys()))

                # Clear settings cache after update
                from .config import app_settings

                app_settings.reload_settings()

                # Return updated data
                return self.business_hours(type("Request", (), {"method": "GET"})())

            return Response({"message": "No valid fields to update"}, status=400)


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
