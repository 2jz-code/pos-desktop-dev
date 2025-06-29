from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string


class EmailService:
    def __init__(self):
        self.default_from_email = settings.DEFAULT_FROM_EMAIL

    def send_email(self, recipient_list, subject, template_name, context):
        """
        Sends an email using a Django template.

        Args:
            recipient_list (list): A list of recipient email addresses.
            subject (str): The subject of the email.
            template_name (str): The path to the email template (e.g., 'emails/order_confirmation.html').
            context (dict): A dictionary of data to render in the template.
        """
        html_message = render_to_string(template_name, context)
        send_mail(
            subject,
            "",  # Empty message, as we are sending HTML
            self.default_from_email,
            recipient_list,
            html_message=html_message,
            fail_silently=False,
        )
