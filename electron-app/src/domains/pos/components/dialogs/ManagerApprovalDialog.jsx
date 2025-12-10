import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Shield, AlertTriangle, Loader2 } from "lucide-react";
import { usePosStore } from "@/domains/pos/store/posStore";
import { useState, useRef, useEffect } from "react";
import approvalsService from "@/services/api/approvalsService";

const ManagerApprovalDialog = () => {
	const { approvalRequest, cancelApprovalRequest, showToast, loadCartFromOrderId, orderId } = usePosStore(
		(state) => ({
			approvalRequest: state.approvalRequest,
			cancelApprovalRequest: state.cancelApprovalRequest,
			showToast: state.showToast,
			loadCartFromOrderId: state.loadCartFromOrderId,
			orderId: state.orderId,
		})
	);

	const [username, setUsername] = useState("");
	const [pin, setPin] = useState("");
	const [isApproving, setIsApproving] = useState(false);
	const [error, setError] = useState("");
	const pinInputRef = useRef(null);

	// Focus PIN input when dialog opens
	useEffect(() => {
		if (approvalRequest.show && pinInputRef.current) {
			setTimeout(() => pinInputRef.current?.focus(), 100);
		}
	}, [approvalRequest.show]);

	const handleApprove = async () => {
		if (!username.trim()) {
			setError("Manager username is required");
			return;
		}

		if (!pin.trim()) {
			setError("PIN is required");
			return;
		}

		setIsApproving(true);
		setError("");

		try {
			const response = await approvalsService.approveRequest(
				approvalRequest.approvalRequestId,
				username,
				pin
			);

			if (response.data.success) {
				showToast({
					title: "Approved",
					description: `${approvalRequest.actionType} approved by manager`,
					variant: "default",
				});

				// Close dialog
				handleClose();

				// Reload the cart to get the updated order with the applied discount
				if (orderId) {
					await loadCartFromOrderId(orderId);
				}
			} else {
				setError(response.data.message || "Approval failed");
			}
		} catch (err) {
			console.error("Approval error:", err);
			const errorMessage =
				err.response?.data?.error ||
				err.response?.data?.message ||
				"Failed to approve request";
			setError(errorMessage);
		} finally {
			setIsApproving(false);
		}
	};

	const handleDeny = async () => {
		if (!username.trim()) {
			setError("Manager username is required");
			return;
		}

		if (!pin.trim()) {
			setError("PIN is required");
			return;
		}

		setIsApproving(true);
		setError("");

		try {
			const response = await approvalsService.denyRequest(
				approvalRequest.approvalRequestId,
				username,
				pin
			);

			if (response.data.success) {
				showToast({
					title: "Denied",
					description: `${approvalRequest.actionType} request denied`,
					variant: "destructive",
				});

				// Close dialog
				handleClose();
			} else {
				setError(response.data.message || "Denial failed");
			}
		} catch (err) {
			console.error("Denial error:", err);
			const errorMessage =
				err.response?.data?.error ||
				err.response?.data?.message ||
				"Failed to deny request";
			setError(errorMessage);
		} finally {
			setIsApproving(false);
		}
	};

	const handleClose = () => {
		setUsername("");
		setPin("");
		setError("");
		cancelApprovalRequest();
	};

	const handlePinKeyPress = (e) => {
		if (e.key === "Enter") {
			handleApprove();
		}
	};

	if (!approvalRequest.show) return null;

	// Format action type for display
	const actionTypeDisplay = approvalRequest.actionType
		? approvalRequest.actionType.replace(/_/g, " ")
		: "Action";

	return (
		<Dialog open={approvalRequest.show} onOpenChange={(open) => !open && handleClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Shield className="h-5 w-5 text-blue-600" />
						Manager Approval Required
					</DialogTitle>
					<DialogDescription>
						This {actionTypeDisplay.toLowerCase()} requires manager authorization to proceed.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<Alert className="border-blue-200 bg-blue-50">
						<AlertTriangle className="h-4 w-4 text-blue-600" />
						<AlertDescription className="text-sm text-blue-800">
							{approvalRequest.message}
							{approvalRequest.discountName && (
								<div className="mt-1 font-semibold">
									{approvalRequest.discountName} ({approvalRequest.discountValue}%)
								</div>
							)}
						</AlertDescription>
					</Alert>

					<div className="space-y-3">
						<div>
							<Label htmlFor="manager-username" className="text-sm font-medium">
								Manager Username
							</Label>
							<Input
								id="manager-username"
								type="text"
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								placeholder="Enter manager username"
								disabled={isApproving}
								className="mt-1"
								autoComplete="username"
							/>
						</div>

						<div>
							<Label htmlFor="manager-pin" className="text-sm font-medium">
								Manager PIN
							</Label>
							<p className="text-sm text-muted-foreground mb-2">
								Enter your PIN to approve or deny this request
							</p>
							<Input
								ref={pinInputRef}
								id="manager-pin"
								type="password"
								value={pin}
								onChange={(e) => setPin(e.target.value)}
								onKeyPress={handlePinKeyPress}
								placeholder="Enter PIN"
								disabled={isApproving}
								maxLength={6}
								className="mt-1"
								autoComplete="off"
							/>
						</div>
					</div>

					{error && (
						<Alert variant="destructive">
							<AlertDescription className="text-sm">{error}</AlertDescription>
						</Alert>
					)}

					<div className="flex gap-2 justify-end">
						<Button
							variant="outline"
							onClick={handleClose}
							disabled={isApproving}
						>
							Cancel
						</Button>
						<Button
							variant="outline"
							onClick={handleDeny}
							disabled={isApproving || !username.trim() || !pin.trim()}
							className="border-red-300 text-red-700 hover:bg-red-50"
						>
							{isApproving ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									Denying...
								</>
							) : (
								"Deny"
							)}
						</Button>
						<Button
							onClick={handleApprove}
							disabled={isApproving || !username.trim() || !pin.trim()}
							className="bg-blue-600 hover:bg-blue-700"
						>
							{isApproving ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									Approving...
								</>
							) : (
								"Approve"
							)}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};

export default ManagerApprovalDialog;
