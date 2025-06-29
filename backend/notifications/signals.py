from django.dispatch import receiver
from payments.signals import payment_completed
from .services import EmailService
from django.conf import settings


@receiver(payment_completed)
def handle_payment_completed(sender, order, **kwargs):
    """
    Receiver function to send an order confirmation email when a payment is completed.
    """
    email_service = EmailService()
    customer_email = (
        order.customer.email
        if order.customer and order.customer.email
        else order.guest_email
    )

    if customer_email:
        try:
            email_service.send_email(
                recipient_list=[customer_email],
                subject=f"Order Confirmation - Order #{order.order_number}",
                template_name="emails/order_confirmation.html",
                context={
                    "order": order,
                    "customer_name": (
                        order.customer.first_name
                        if order.customer
                        else "Valued Customer"
                    ),
                },
            )
            print(
                f"Order confirmation email sent to {customer_email} for Order #{order.order_number}"
            )
        except Exception as e:
            print(f"Failed to send order confirmation email to {customer_email}: {e}")
    else:
        print(
            f"No email address found for Order #{order.order_number}. Skipping confirmation email."
        )
