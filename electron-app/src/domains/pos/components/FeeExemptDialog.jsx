import { useState } from "react";
import { usePosStore } from "../store/posStore";
import { toast } from "@/shared/components/ui/use-toast";
import { applyFeeExempt } from "@/domains/orders/services/orderService";
import { useApprovalDialog } from "@/domains/approvals/hooks/useApprovalDialog.jsx";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { Label } from "@/shared/components/ui/label";
import { Ban } from "lucide-react";
import { formatCurrency } from "@ajeen/ui";

export const FeeExemptDialog = ({ open, onClose }) => {
	const [reason, setReason] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const orderId = usePosStore((state) => state.orderId);
	const { showApprovalDialog, approvalDialog } = useApprovalDialog();

	const handleSubmit = async () => {
		if (!orderId) {
			toast({
				title: "Error",
				description: "No active order found. Please add items to the cart first.",
				variant: "destructive",
			});
			return;
		}

		setIsSubmitting(true);

		try {
			const response = await applyFeeExempt(orderId, reason || "Fee exemption requested");

			// Check if approval is required
			if (response.status === "pending_approval") {
				// Show approval dialog
				showApprovalDialog({
					approvalRequestId: response.approval_request_id,
					message: response.message,
					onApproved: () => {
						// Cart will update automatically via WebSocket
						toast({
							title: "Fee Exemption Applied",
							description: "Service fees will not be added when payment is processed.",
						});
					},
				});
				handleCancel();
			} else {
				// Fee exemption applied successfully - cart will update automatically via WebSocket
				toast({
					title: "Fee Exemption Applied",
					description: "Service fees will not be added when payment is processed.",
				});
				handleCancel();
			}
		} catch (error) {
			console.error("Error applying fee exemption:", error);
			toast({
				title: "Error",
				description: error.response?.data?.error || error.message || "Failed to apply fee exemption",
				variant: "destructive",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleCancel = () => {
		if (!isSubmitting) {
			setReason("");
			onClose();
		}
	};

	return (
		<>
		<Dialog open={open} onOpenChange={handleCancel}>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Ban className="h-5 w-5 text-blue-600" />
						Fee Exemption
					</DialogTitle>
					<DialogDescription>
						Remove service fees from this order. This always requires manager approval.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					<div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-4">
						<p className="text-sm text-blue-700 dark:text-blue-300">
							Service fees are calculated and added during payment. This exemption will prevent service fees from being added when you charge the customer.
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="reason" className="text-sm font-medium">
							Reason for Exemption (Optional)
						</Label>
						<Textarea
							id="reason"
							placeholder="e.g., Customer complaint, promotional offer"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							rows={3}
							className="resize-none"
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={handleCancel}
						disabled={isSubmitting}
					>
						Cancel
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={isSubmitting}
					>
						{isSubmitting ? "Applying..." : "Apply Fee Exemption"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
		{approvalDialog}
		</>
	);
};
