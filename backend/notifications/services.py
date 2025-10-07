from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
import logging
from django.utils import timezone
from datetime import timedelta
from settings.models import GlobalSettings
import pytz

logger = logging.getLogger(__name__)


class EmailService:
    def __init__(self):
        # Format the sender's email to include a display name
        from_email_address = getattr(
            settings, "DEFAULT_FROM_EMAIL", "contact@bakeajeen.com"
        )
        self.default_from_email = f"Ajeen <{from_email_address}>"

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

    def send_order_confirmation_email(self, order):
        """
        Sends an order confirmation email using the appropriate Maizzle template
        based on whether the customer is registered or a guest.

        Args:
            order: The Order instance to send confirmation for
        """
        try:
            # Determine recipient email
            recipient_email = order.customer_email
            if not recipient_email:
                logger.warning(f"No email address found for order_id {order.id}")
                return False

            # Calculate estimated pickup time
            utc_pickup_time = timezone.now() + timedelta(minutes=15)

            # Convert to local timezone
            try:
                local_tz = pytz.timezone("America/Chicago")
                local_pickup_time = utc_pickup_time.astimezone(local_tz)
            except pytz.UnknownTimeZoneError:
                local_pickup_time = utc_pickup_time  # Fallback to UTC

            # Get store info from order's tenant settings
            store_info = self._get_store_info(order.tenant)

            # Determine which template to use and prepare context
            if order.customer:
                # Registered user
                template_name = "emails/order-confirmation-user.html"
                context = {
                    "user": {
                        "name": order.customer_display_name,
                        "email": order.customer_email,  # Use the property that prioritizes form data
                    },
                    "order": {
                        "orderNumber": order.order_number,
                        "estimated_pickup_time": local_pickup_time.strftime("%I:%M %p"),
                        "items": [
                            {
                                "name": item.product.name,
                                "quantity": item.quantity,
                                "price": float(item.price_at_sale),
                                "total": float(item.total_price),
                                "notes": item.notes or "",
                            }
                            # FIX: Add select_related to prevent N+1 queries when accessing item.product.name
                            for item in order.items.select_related('product').all()
                        ],
                        "subtotal": float(order.subtotal),
                        "discounts": float(order.total_discounts_amount),
                        "surcharges": float(order.payment_surcharges_total),
                        "tax": float(order.tax_total),
                        "tips": float(order.total_tips),
                        "total": float(order.total_collected),
                        "orderType": order.get_order_type_display(),
                        "status": order.get_status_display(),
                        "createdAt": order.created_at.strftime("%B %d, %Y at %I:%M %p"),
                    },
                    "store_info": store_info,
                }
            else:
                # Guest user
                template_name = "emails/order-confirmation-guest.html"
                context = {
                    "order": {
                        "orderNumber": order.order_number,
                        "estimated_pickup_time": local_pickup_time.strftime("%I:%M %p"),
                        "customerName": order.customer_display_name,
                        "customerEmail": order.guest_email,
                        "items": [
                            {
                                "name": item.product.name,
                                "quantity": item.quantity,
                                "price": float(item.price_at_sale),
                                "total": float(item.total_price),
                                "notes": item.notes or "",
                            }
                            # FIX: Add select_related to prevent N+1 queries when accessing item.product.name
                            for item in order.items.select_related('product').all()
                        ],
                        "subtotal": float(order.subtotal),
                        "discounts": float(order.total_discounts_amount),
                        "surcharges": float(order.payment_surcharges_total),
                        "tax": float(order.tax_total),
                        "tips": float(order.total_tips),
                        "total": float(order.total_collected),
                        "orderType": order.get_order_type_display(),
                        "status": order.get_status_display(),
                        "createdAt": order.created_at.strftime("%B %d, %Y at %I:%M %p"),
                    },
                    "store_info": store_info,
                }

            # Send the email
            subject = f"Your Ajeen Order Confirmation #{order.order_number}"
            self.send_email(
                recipient_list=[recipient_email],
                subject=subject,
                template_name=template_name,
                context=context,
            )

            logger.info(
                f"Order confirmation email sent to {recipient_email} for order {order.order_number}"
            )
            return True

        except Exception as e:
            logger.error(
                f"Failed to send order confirmation email for order {order.order_number}: {e}"
            )
            return False

    def send_contact_form_email(self, contact_data):
        """
        Sends a contact form submission email to the restaurant staff.

        Args:
            contact_data: Dictionary containing contact form data
        """
        try:
            template_name = "emails/contact_form_submission.html"
            context = {"contact": contact_data}

            # Send to restaurant/admin email
            admin_email = getattr(settings, "ADMIN_EMAIL", self.default_from_email)
            subject = f"New Contact Form Submission from {contact_data.get('name', 'Customer')}"

            self.send_email(
                recipient_list=[admin_email],
                subject=subject,
                template_name=template_name,
                context=context,
            )

            logger.info(
                f"Contact form email sent for submission from {contact_data.get('email')}"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to send contact form email: {e}")
            return False

    def send_low_stock_alert(
        self, recipient_email, product, current_quantity, location, threshold=None
    ):
        """
        Sends a low stock alert email to owners.

        Args:
            recipient_email (str): Email address to send the alert to
            product: The Product instance with low stock
            current_quantity: Current stock quantity
            location: The Location where stock is low
            threshold: The threshold that triggered this alert
        """
        try:
            template_name = "emails/low_stock_alert.html"
            context = {
                "product": {
                    "name": product.name,
                    "current_quantity": float(current_quantity),
                    "location": location.name,
                    "threshold": float(threshold) if threshold is not None else 0,
                },
                "store_info": self._get_store_info(product.tenant),
            }

            subject = f"Low Stock Alert: {product.name}"

            self.send_email(
                recipient_list=[recipient_email],
                subject=subject,
                template_name=template_name,
                context=context,
            )

            logger.info(
                f"Low stock alert sent to {recipient_email} for {product.name} at {location.name}"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to send low stock alert for product_id {product.id}: {type(e).__name__}")
            return False

    def _get_store_info(self, tenant):
        """
        Get store information from settings with fallback defaults.

        Args:
            tenant: Tenant instance to get settings for
        """
        try:
            store_settings = GlobalSettings.objects.get(tenant=tenant)
            return {
                "address": store_settings.store_address
                or "2105 Cliff Rd Suite 300, Eagan, MN, 55124",
                "phone_display": store_settings.store_phone_display
                or "(651) 412-5336",
                "phone": store_settings.store_phone or "6514125336",
            }
        except (GlobalSettings.DoesNotExist, Exception):
            pass

        # Fallback to default values if no settings found
        return {
            "address": "2105 Cliff Rd Suite 300, Eagan, MN, 55124",
            "phone_display": "(651) 412-5336",
            "phone": "6514125336",
        }

    def send_daily_low_stock_summary(self, recipient_email, low_stock_items):
        """
        Sends a daily summary email of all items below threshold that weren't individually notified.

        Args:
            recipient_email (str): Email address to send the summary to
            low_stock_items: List of InventoryStock instances below threshold
        """
        try:
            if not low_stock_items:
                logger.warning("No low stock items provided to send_daily_low_stock_summary")
                return False

            template_name = "emails/daily_low_stock_summary.html"

            # Get tenant from first item (all items should be from same tenant)
            tenant = low_stock_items[0].tenant

            # Prepare item data for template
            # FIX: N+1 queries are already prevented since low_stock_items should be pre-fetched
            # with select_related('product', 'location') in the calling code
            items_data = []
            for item in low_stock_items:
                items_data.append({
                    "name": item.product.name,
                    "current_quantity": float(item.quantity),
                    "location": item.location.name,
                    "threshold": float(item.effective_low_stock_threshold),
                    "shortage": float(item.effective_low_stock_threshold - item.quantity),
                })

            context = {
                "items": items_data,
                "total_items": len(items_data),
                "store_info": self._get_store_info(tenant),
                "report_date": timezone.now().strftime("%B %d, %Y"),
            }

            subject = f"Daily Low Stock Report - {len(items_data)} Items Need Attention"

            self.send_email(
                recipient_list=[recipient_email],
                subject=subject,
                template_name=template_name,
                context=context,
            )

            logger.info(
                f"Daily low stock summary sent to {recipient_email} for {len(items_data)} items"
            )
            return True

        except Exception as e:
            logger.error(
                f"Failed to send daily low stock summary: {e}"
            )
            return False

    def send_password_reset_email(self, customer, token):
        """
        Send password reset email to customer.
        
        Args:
            customer: Customer instance
            token: Password reset token string
        """
        try:
            from django.conf import settings
            import datetime
            
            # Build reset URL
            customer_site_url = getattr(settings, 'CUSTOMER_SITE_URL', 'http://localhost:3000')
            reset_url = f"{customer_site_url}/reset-password?token={token}"
            
            context = {
                'customer_name': customer.get_short_name(),
                'customer_email': customer.email,
                'reset_url': reset_url,
                'current_year': datetime.datetime.now().year,
            }
            
            subject = "Reset Your Ajeen Fresh Password"
            self.send_email(
                recipient_list=[customer.email],
                subject=subject,
                template_name="emails/password-reset.html",
                context=context,
            )
            
            logger.info(f"Password reset email sent to customer {customer.id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send password reset email to customer {customer.id}: {e}")
            return False

    def send_email_verification(self, customer, token):
        """
        Send email verification email to customer.
        
        Args:
            customer: Customer instance
            token: Email verification token string
        """
        try:
            from django.conf import settings
            import datetime
            
            # Build verification URL
            customer_site_url = getattr(settings, 'CUSTOMER_SITE_URL', 'http://localhost:3000')
            verification_url = f"{customer_site_url}/verify-email?token={token}"
            
            context = {
                'customer_name': customer.get_short_name(),
                'customer_email': customer.email,
                'verification_url': verification_url,
                'current_year': datetime.datetime.now().year,
            }
            
            subject = "Welcome to Ajeen Fresh - Please Verify Your Email"
            self.send_email(
                recipient_list=[customer.email],
                subject=subject,
                template_name="emails/email-verification.html",
                context=context,
            )
            
            logger.info(f"Email verification sent to customer {customer.id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email verification to customer {customer.id}: {e}")
            return False


# Singleton instance
email_service = EmailService()
