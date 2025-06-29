from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.conf import settings

from .serializers import ContactFormSerializer
from .services import EmailService


class ContactFormView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = ContactFormSerializer(data=request.data)
        if serializer.is_valid():
            name = serializer.validated_data.get("name")
            email = serializer.validated_data.get("email")
            message = serializer.validated_data.get("message")

            # Assuming the business contact email is in settings
            business_contact_email = getattr(
                settings, "BUSINESS_CONTACT_EMAIL", "contact@example.com"
            )

            email_service = EmailService()
            try:
                email_service.send_email(
                    recipient_list=[business_contact_email],
                    subject=f"Contact Form Submission",
                    template_name="emails/contact_form_submission.html",
                    context={
                        "name": name,
                        "email": email,
                        "message": message,
                    },
                )
                return Response(
                    {"detail": "Contact form submitted successfully."},
                    status=status.HTTP_200_OK,
                )
            except Exception as e:
                return Response(
                    {"detail": f"Failed to send email: {str(e)}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
