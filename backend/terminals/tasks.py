"""
Celery tasks for terminal fleet management.

Tasks:
- daily_offline_revenue_summary: Sends email summary and resets daily counters
"""
from celery import shared_task
from django.utils import timezone
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.conf import settings
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)


@shared_task
def daily_offline_revenue_summary():
    """
    Daily task to send offline revenue summary email and reset counters.

    Runs at end of day (e.g., 11:59 PM) to:
    1. Gather all terminals with offline revenue > 0
    2. Send summary email to store owners/managers
    3. Reset daily counters for the next day

    NOTE: Processes ALL tenants - loops through each tenant separately.
    """
    from tenant.models import Tenant
    from tenant.managers import set_current_tenant
    from .models import TerminalRegistration

    logger.info("Starting daily offline revenue summary for all tenants...")

    total_terminals_processed = 0
    total_revenue_reported = Decimal('0.00')
    tenants_processed = 0
    emails_sent = 0

    try:
        for tenant in Tenant.objects.filter(is_active=True):
            try:
                set_current_tenant(tenant)

                # Get all terminals with offline activity today
                terminals_with_activity = TerminalRegistration.objects.filter(
                    daily_offline_revenue__gt=0
                ).select_related('store_location')

                if not terminals_with_activity.exists():
                    logger.debug(f"Tenant {tenant.slug}: No offline activity today")
                    tenants_processed += 1
                    continue

                # Calculate totals for this tenant
                tenant_total_revenue = Decimal('0.00')
                tenant_total_orders = 0
                terminal_data = []

                for terminal in terminals_with_activity:
                    tenant_total_revenue += terminal.daily_offline_revenue
                    tenant_total_orders += terminal.daily_offline_order_count
                    terminal_data.append({
                        'nickname': terminal.nickname or terminal.device_id[:8],
                        'location': terminal.store_location.name if terminal.store_location else 'Unassigned',
                        'revenue': terminal.daily_offline_revenue,
                        'order_count': terminal.daily_offline_order_count,
                    })
                    total_terminals_processed += 1

                total_revenue_reported += tenant_total_revenue

                # Send email summary
                email_sent = _send_offline_summary_email(
                    tenant=tenant,
                    terminals=terminal_data,
                    total_revenue=tenant_total_revenue,
                    total_orders=tenant_total_orders
                )
                if email_sent:
                    emails_sent += 1

                # Reset counters for all terminals in this tenant
                TerminalRegistration.objects.filter(
                    daily_offline_revenue__gt=0
                ).update(
                    daily_offline_revenue=0,
                    daily_offline_order_count=0,
                    daily_offline_revenue_reset_at=timezone.now()
                )

                logger.info(
                    f"Tenant {tenant.slug}: Processed {len(terminal_data)} terminals, "
                    f"${tenant_total_revenue} revenue, {tenant_total_orders} orders"
                )

                tenants_processed += 1

            except Exception as tenant_exc:
                logger.error(f"Error processing tenant {tenant.slug}: {tenant_exc}")
                continue
            finally:
                set_current_tenant(None)

        logger.info(
            f"Daily offline revenue summary completed: "
            f"{total_terminals_processed} terminals, ${total_revenue_reported} total, "
            f"{tenants_processed} tenants, {emails_sent} emails sent"
        )

        return {
            "status": "completed",
            "terminals_processed": total_terminals_processed,
            "total_revenue": str(total_revenue_reported),
            "tenants_processed": tenants_processed,
            "emails_sent": emails_sent,
        }

    except Exception as exc:
        logger.error(f"Error in daily offline revenue summary: {exc}")
        return {"status": "failed", "error": str(exc)}


def _send_offline_summary_email(tenant, terminals, total_revenue, total_orders):
    """
    Send the daily offline revenue summary email for a tenant.

    Args:
        tenant: Tenant instance
        terminals: List of terminal data dicts
        total_revenue: Total offline revenue for the day
        total_orders: Total offline order count for the day

    Returns:
        bool: True if email sent successfully
    """
    from settings.models import GlobalSettings
    from users.models import User

    try:
        # Get store info for email footer
        try:
            global_settings = GlobalSettings.objects.get(tenant=tenant)
            store_info = {
                'name': global_settings.store_name or tenant.name,
                'address': global_settings.store_address,
                'phone_display': global_settings.phone_display,
            }
        except GlobalSettings.DoesNotExist:
            store_info = {'name': tenant.name}

        # Get recipient emails (owners and admins)
        recipients = list(
            User.objects.filter(
                tenant=tenant,
                role__in=['OWNER', 'ADMIN'],
                is_active=True,
                email__isnull=False
            ).exclude(email='').values_list('email', flat=True)
        )

        if not recipients:
            logger.warning(f"No recipients found for tenant {tenant.slug}")
            return False

        # Render email template
        context = {
            'store_info': store_info,
            'report_date': timezone.now().strftime('%B %d, %Y'),
            'terminals': terminals,
            'total_revenue': total_revenue,
            'total_orders': total_orders,
            'terminal_count': len(terminals),
        }

        html_content = render_to_string(
            'emails/daily_offline_revenue_summary.html',
            context
        )

        # Create and send email
        subject = f"Daily Offline Revenue Summary - ${total_revenue:.2f}"
        from_email = settings.DEFAULT_FROM_EMAIL

        email = EmailMultiAlternatives(
            subject=subject,
            body=f"Your terminals processed ${total_revenue:.2f} in offline revenue today across {total_orders} orders.",
            from_email=from_email,
            to=recipients
        )
        email.attach_alternative(html_content, "text/html")
        email.send()

        logger.info(f"Offline summary email sent to {len(recipients)} recipients for tenant {tenant.slug}")
        return True

    except Exception as e:
        logger.error(f"Failed to send offline summary email for tenant {tenant.slug}: {e}")
        return False
