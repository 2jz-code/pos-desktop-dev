import { useState } from "react";
import { usePosStore } from "../store/posStore";
import { toast } from "@/shared/components/ui/use-toast";
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
import { ShieldOff } from "lucide-react";
import { formatCurrency } from "@ajeen/ui";

export const TaxExemptDialog = ({ open, onClose }) => {
	const [reason, setReason] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const { taxAmount, orderId, applyTaxExemption } = usePosStore((state) => ({
		taxAmount: state.taxAmount,
		orderId: state.orderId,
		applyTaxExemption: state.applyTaxExemption,
	}));

	const { showApprovalDialog, approvalDialog } = useApprovalDialog();

	const handleSubmit = async () => {
		if (!reason.trim()) {
			toast({
				title: "Reason Required",
				description: "Please provide a reason for tax exemption (required for compliance).",
				variant: "destructive",
			});
			return;
		}

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
			const response = await applyTaxExemption({ reason });

			// Check if approval is required (online mode only)
			if (response.status === "pending_approval") {
				// Show approval dialog
				showApprovalDialog({
					approvalRequestId: response.approval_request_id,
					message: response.message,
					onApproved: () => {
						// Cart will update automatically via WebSocket
						toast({
							title: "Tax Exemption Applied",
							description: `Tax of ${formatCurrency(taxAmount)} has been exempted from this order.`,
						});
					},
				});
				handleCancel();
			} else {
				// Tax exemption applied successfully
				toast({
					title: "Tax Exemption Applied",
					description: `Tax of ${formatCurrency(taxAmount)} has been exempted from this order.`,
				});
				handleCancel();
			}
		} catch (error) {
			console.error("Error applying tax exemption:", error);
			toast({
				title: "Error",
				description: error.response?.data?.error || error.message || "Failed to apply tax exemption",
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
						<ShieldOff className="h-5 w-5 text-orange-600" />
						Tax Exemption
					</DialogTitle>
					<DialogDescription>
						Remove tax from this order. This always requires manager approval for compliance.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					<div className="rounded-lg bg-muted p-4">
						<div className="flex justify-between items-center">
							<span className="font-medium">Current Tax Amount:</span>
							<span className="text-lg font-bold text-orange-600">
								{formatCurrency(taxAmount || 0)}
							</span>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="reason" className="text-sm font-medium">
							Reason for Exemption <span className="text-destructive">*</span>
						</Label>
						<Textarea
							id="reason"
							placeholder="e.g., Tax-exempt organization, Certificate #12345"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							rows={3}
							className="resize-none"
						/>
						<p className="text-xs text-muted-foreground">
							Required for audit trail and compliance purposes
						</p>
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
						disabled={isSubmitting || !reason.trim() || !taxAmount}
					>
						{isSubmitting ? "Applying..." : "Apply Tax Exemption"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
		{approvalDialog}
		</>
	);
};
