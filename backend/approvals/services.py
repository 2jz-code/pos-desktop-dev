from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
from typing import Dict, List, Optional
from decimal import Decimal
import logging

from .models import ManagerApprovalRequest, ApprovalPolicy, ActionType, ApprovalStatus
from .signals import approval_request_created, approval_request_resolved
from users.models import User

logger = logging.getLogger(__name__)


class ManagerApprovalService:
    """
    Service layer for managing approval requests.

    Handles creation, approval, denial, and lifecycle management of manager approval requests.
    """

    @staticmethod
    @transaction.atomic
    def request_approval(
        action_type: str,
        initiator: User,
        store_location,
        context: Dict,
    ) -> ManagerApprovalRequest:
        """
        Create a new approval request.

        Args:
            action_type: One of ActionType choices (DISCOUNT, ORDER_VOID, etc.)
            initiator: User requesting the approval (typically a cashier)
            store_location: StoreLocation where the action is taking place
            context: Dict containing:
                - order: Order instance (optional)
                - order_item: OrderItem instance (optional)
                - discount: Discount instance (optional)
                - payload: Dict with action-specific data
                - reason: String explaining why approval is needed
                - threshold_value: Decimal value that triggered approval requirement

        Returns:
            ManagerApprovalRequest instance with status=PENDING

        Raises:
            ValidationError: If required context is missing or invalid
        """
        # Validate action_type
        if action_type not in [choice[0] for choice in ActionType.choices]:
            raise ValidationError(f"Invalid action_type: {action_type}")

        # Validate initiator has access to store_location
        if initiator.tenant_id != store_location.tenant_id:
            raise ValidationError("Initiator does not belong to the same tenant as store location")

        # Check if approvals are enabled for this location
        if not store_location.manager_approvals_enabled:
            raise ValidationError(
                f"Manager approvals are not enabled for location: {store_location.name}"
            )

        # Get or create approval policy for location
        policy = ApprovalPolicy.get_for_location(store_location)

        # Calculate expiry time
        expires_at = timezone.now() + timezone.timedelta(minutes=policy.approval_expiry_minutes)

        # Create the approval request
        approval_request = ManagerApprovalRequest.objects.create(
            tenant=store_location.tenant,
            store_location=store_location,
            initiator=initiator,
            action_type=action_type,
            status=ApprovalStatus.PENDING,
            order=context.get('order'),
            order_item=context.get('order_item'),
            discount=context.get('discount'),
            related_object_label=context.get('related_object_label', ''),
            payload=context.get('payload', {}),
            reason=context.get('reason', ''),
            threshold_value=context.get('threshold_value'),
            expires_at=expires_at,
        )

        logger.info(
            f"Created approval request {approval_request.id} - "
            f"Action: {action_type}, Initiator: {initiator.email}, "
            f"Location: {store_location.name}, Expires: {expires_at}"
        )

        # Emit signal for downstream handlers (WebSocket notifications, etc.)
        approval_request_created.send(
            sender=ManagerApprovalRequest,
            instance=approval_request,
            created=True
        )

        return approval_request

    @staticmethod
    @transaction.atomic
    def approve_request(
        request_id: str,
        approver: User,
        pin: str,
    ) -> Dict:
        """
        Approve a pending approval request.

        Args:
            request_id: UUID of the approval request
            approver: User approving the request (must be manager or above)
            pin: PIN code for verification

        Returns:
            Dict with:
                - success: bool
                - request: ManagerApprovalRequest instance
                - message: str

        Raises:
            ValidationError: If validation fails
        """
        # Fetch the request with select_for_update to prevent race conditions
        try:
            approval_request = ManagerApprovalRequest.objects.select_for_update().get(
                id=request_id
            )
        except ManagerApprovalRequest.DoesNotExist:
            raise ValidationError(f"Approval request {request_id} not found")

        # Validate approver belongs to same tenant
        if approver.tenant_id != approval_request.tenant_id:
            raise ValidationError("Approver does not belong to the same tenant as the request")

        # Validate approver role
        if approver.role not in [User.Role.MANAGER, User.Role.ADMIN, User.Role.OWNER]:
            raise ValidationError(
                f"User role '{approver.get_role_display()}' is not authorized to approve requests. "
                "Manager role or above required."
            )

        # Validate approver has PIN set
        if not approver.pin:
            raise ValidationError(
                "Manager must set a PIN before approving requests. "
                "Please configure your PIN in account settings."
            )

        # Validate PIN
        if not approver.check_pin(pin):
            raise ValidationError("Invalid PIN. Please try again.")

        # Check if request can be approved
        if not approval_request.can_be_approved:
            if approval_request.is_expired:
                raise ValidationError(
                    f"Approval request has expired. Expired at: {approval_request.expires_at}"
                )
            else:
                raise ValidationError(
                    f"Approval request cannot be approved. Current status: "
                    f"{approval_request.get_status_display()}"
                )

        # Check self-approval policy
        policy = ApprovalPolicy.get_for_location(approval_request.store_location)
        if not policy.allow_self_approval and approval_request.initiator_id == approver.id:
            raise ValidationError(
                "Self-approval is not allowed. Another manager must approve this request."
            )

        # Approve the request
        approval_request.status = ApprovalStatus.APPROVED
        approval_request.approver = approver
        approval_request.approved_at = timezone.now()
        approval_request.save(update_fields=['status', 'approver', 'approved_at', 'updated_at'])

        logger.info(
            f"Approved request {approval_request.id} - "
            f"Action: {approval_request.action_type}, "
            f"Approver: {approver.email}, "
            f"Initiator: {approval_request.initiator.email}"
        )

        # Emit signal for downstream handlers
        approval_request_resolved.send(
            sender=ManagerApprovalRequest,
            instance=approval_request,
            outcome='approved'
        )

        return {
            'success': True,
            'request': approval_request,
            'message': f'Request approved successfully by {approver.username}'
        }

    @staticmethod
    @transaction.atomic
    def deny_request(
        request_id: str,
        approver: User,
        pin: str,
        reason: str = '',
    ) -> Dict:
        """
        Deny a pending approval request.

        Args:
            request_id: UUID of the approval request
            approver: User denying the request (must be manager or above)
            pin: PIN code for verification
            reason: Optional reason for denial

        Returns:
            Dict with:
                - success: bool
                - request: ManagerApprovalRequest instance
                - message: str

        Raises:
            ValidationError: If validation fails
        """
        # Fetch the request with select_for_update to prevent race conditions
        try:
            approval_request = ManagerApprovalRequest.objects.select_for_update().get(
                id=request_id
            )
        except ManagerApprovalRequest.DoesNotExist:
            raise ValidationError(f"Approval request {request_id} not found")

        # Validate approver belongs to same tenant
        if approver.tenant_id != approval_request.tenant_id:
            raise ValidationError("Approver does not belong to the same tenant as the request")

        # Validate approver role
        if approver.role not in [User.Role.MANAGER, User.Role.ADMIN, User.Role.OWNER]:
            raise ValidationError(
                f"User role '{approver.get_role_display()}' is not authorized to deny requests. "
                "Manager role or above required."
            )

        # Validate approver has PIN set
        if not approver.pin:
            raise ValidationError(
                "Manager must set a PIN before denying requests. "
                "Please configure your PIN in account settings."
            )

        # Validate PIN
        if not approver.check_pin(pin):
            raise ValidationError("Invalid PIN. Please try again.")

        # Check if request can be denied
        if approval_request.status != ApprovalStatus.PENDING:
            raise ValidationError(
                f"Approval request cannot be denied. Current status: "
                f"{approval_request.get_status_display()}"
            )

        # Deny the request
        approval_request.status = ApprovalStatus.DENIED
        approval_request.approver = approver
        approval_request.denied_at = timezone.now()
        if reason:
            # Append denial reason to existing reason
            if approval_request.reason:
                approval_request.reason += f"\n\nDenial reason: {reason}"
            else:
                approval_request.reason = f"Denial reason: {reason}"
        approval_request.save(
            update_fields=['status', 'approver', 'denied_at', 'reason', 'updated_at']
        )

        logger.info(
            f"Denied request {approval_request.id} - "
            f"Action: {approval_request.action_type}, "
            f"Approver: {approver.email}, "
            f"Initiator: {approval_request.initiator.email}, "
            f"Reason: {reason or 'No reason provided'}"
        )

        # Emit signal for downstream handlers
        approval_request_resolved.send(
            sender=ManagerApprovalRequest,
            instance=approval_request,
            outcome='denied'
        )

        return {
            'success': True,
            'request': approval_request,
            'message': f'Request denied by {approver.username}'
        }

    @staticmethod
    @transaction.atomic
    def mark_expired(request_ids: List[str]) -> int:
        """
        Mark multiple pending requests as expired.

        Called by Celery task to process expired requests in bulk.

        Args:
            request_ids: List of approval request UUIDs to mark as expired

        Returns:
            Number of requests marked as expired
        """
        if not request_ids:
            return 0

        now = timezone.now()

        # Use all_objects to update across all tenants (called from Celery task without tenant context)
        count = ManagerApprovalRequest.all_objects.filter(
            id__in=request_ids,
            status=ApprovalStatus.PENDING,
            expires_at__lt=now
        ).update(
            status=ApprovalStatus.EXPIRED,
            updated_at=now
        )

        if count > 0:
            logger.info(f"Marked {count} approval requests as expired")

        return count

    @staticmethod
    @transaction.atomic
    def cleanup_old_requests(days: int = 90) -> int:
        """
        Hard-delete resolved approval requests older than specified days.

        Called by Celery task for periodic cleanup.

        Args:
            days: Number of days to keep resolved requests (default: 90)

        Returns:
            Number of requests deleted
        """
        cutoff_date = timezone.now() - timezone.timedelta(days=days)

        # Delete resolved requests (APPROVED, DENIED, EXPIRED) older than cutoff
        # Use all_objects to cleanup across all tenants (called from Celery task without tenant context)
        count, _ = ManagerApprovalRequest.all_objects.filter(
            status__in=[ApprovalStatus.APPROVED, ApprovalStatus.DENIED, ApprovalStatus.EXPIRED],
            updated_at__lt=cutoff_date
        ).delete()

        if count > 0:
            logger.info(
                f"Purged {count} resolved approval requests older than {days} days "
                f"(cutoff: {cutoff_date})"
            )

        return count

    @staticmethod
    def get_pending_for_location(store_location, limit: Optional[int] = None):
        """
        Get all pending (non-expired) approval requests for a store location.

        Used for manager queue dashboards.

        Args:
            store_location: StoreLocation instance
            limit: Optional limit on number of results

        Returns:
            QuerySet of pending ManagerApprovalRequest instances
        """
        queryset = ManagerApprovalRequest.objects.filter(
            store_location=store_location,
            status=ApprovalStatus.PENDING,
            expires_at__gt=timezone.now()
        ).select_related(
            'initiator',
            'order',
            'discount'
        ).order_by('created_at')

        if limit:
            queryset = queryset[:limit]

        return queryset

    @staticmethod
    def check_if_needs_approval(
        action_type: str,
        store_location,
        value: Decimal,
    ) -> bool:
        """
        Check if an action requires manager approval based on policy thresholds.

        Args:
            action_type: One of ActionType choices
            store_location: StoreLocation instance
            value: The value to check against threshold (e.g., discount %, refund amount)

        Returns:
            True if approval is required, False otherwise
        """
        # Check if approvals are enabled for this location
        if not store_location.manager_approvals_enabled:
            return False

        # Get policy for location
        policy = ApprovalPolicy.get_for_location(store_location)

        # Check threshold based on action type
        if action_type == ActionType.DISCOUNT:
            return value > policy.max_discount_percent
        elif action_type == ActionType.REFUND:
            return value > policy.max_refund_amount
        elif action_type == ActionType.PRICE_OVERRIDE:
            return value > policy.max_price_override_amount
        elif action_type == ActionType.ORDER_VOID:
            return value > policy.max_void_order_amount
        elif action_type == ActionType.CUSTOM_ADJUSTMENT:
            # Custom adjustments always require approval
            return True

        return False
