import { useState } from "react";
import OrderApprovalDialog from "@/domains/orders/components/OrderApprovalDialog";

/**
 * Hook for managing approval dialog state and showing approval requests
 *
 * Usage:
 * ```jsx
 * const { showApprovalDialog } = useApprovalDialog();
 *
 * // When API returns 202 (approval required):
 * if (response.status === "pending_approval") {
 *   showApprovalDialog({
 *     approvalRequestId: response.approval_request_id,
 *     message: response.message,
 *     onApproved: async () => {
 *       await refreshOrder();
 *       toast({ title: "Success", description: "Action completed" });
 *     },
 *   });
 * }
 * ```
 */
export function useApprovalDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [approvalRequest, setApprovalRequest] = useState(null);
  const [onApprovedCallback, setOnApprovedCallback] = useState(null);

  /**
   * Show the approval dialog
   * @param {Object} options
   * @param {string} options.approvalRequestId - ID of the approval request from backend
   * @param {string} options.message - Message to display to the user
   * @param {string} [options.orderNumber] - Order number (optional)
   * @param {string} [options.orderTotal] - Order total amount (optional)
   * @param {string} [options.actionType] - Type of action requiring approval (optional)
   * @param {Function} options.onApproved - Callback to execute when request is approved
   */
  const showApprovalDialog = ({
    approvalRequestId,
    message,
    orderNumber,
    orderTotal,
    actionType,
    onApproved,
  }) => {
    setApprovalRequest({
      approvalRequestId,
      message,
      orderNumber,
      orderTotal,
      actionType,
    });
    setOnApprovedCallback(() => onApproved);
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setApprovalRequest(null);
    setOnApprovedCallback(null);
  };

  const handleSuccess = async (result) => {
    if (result.approved && onApprovedCallback) {
      // Call the onApproved callback
      await onApprovedCallback();
    }
    handleClose();
  };

  return {
    showApprovalDialog,
    approvalDialog: (
      <OrderApprovalDialog
        open={isOpen}
        onClose={handleClose}
        approvalRequest={approvalRequest}
        onSuccess={handleSuccess}
      />
    ),
  };
}
