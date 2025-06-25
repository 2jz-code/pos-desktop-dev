import React from "react";
import { usePosStore } from "@/domains/pos/store/posStore";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { formatCurrency } from "@/shared/lib/utils";
import { shallow } from "zustand/shallow";

// Import all view components
import InitialOptionsView from "./paymentViews/InitialOptionsView";
import AwaitTipView from "./paymentViews/AwaitTipView";
import CashPaymentView from "./paymentViews/CashPaymentView";
import CompletionView from "./paymentViews/CompletionView";
import SplitPaymentView from "./paymentViews/SplitPaymentView";

const ProcessingView = ({ message = "Processing Payment..." }) => (
	<div className="flex flex-col items-center justify-center p-8 space-y-4">
		<Loader2 className="w-12 h-12 animate-spin text-primary" />
		<p className="text-lg font-medium text-muted-foreground">{message}</p>
	</div>
);

const PaymentErrorView = ({ error, onRetry, onCancel }) => (
	<div className="flex flex-col items-center space-y-4 text-center p-4">
		<h2 className="text-xl font-semibold text-destructive">Payment Failed</h2>
		<p className="font-semibold text-destructive">
			{String(error) || "An unknown error occurred."}
		</p>
		<div className="flex space-x-4">
			<Button onClick={onRetry}>Try Again</Button>
			<Button
				variant="secondary"
				onClick={onCancel}
			>
				Cancel
			</Button>
		</div>
	</div>
);

const TenderDialog = () => {
	const {
		isTenderDialogOpen,
		lastCompletedOrder,
		tenderState,
		balanceDue,
		changeDue,
		error,
		orderNumber,
		selectPaymentMethod,
		applyCashPayment,
		closeTender,
		goBack,
		retryFailedPayment, // <-- Select the new action
	} = usePosStore(
		(state) => ({
			isTenderDialogOpen: state.isTenderDialogOpen,
			lastCompletedOrder: state.lastCompletedOrder,
			tenderState: state.tenderState,
			balanceDue: state.balanceDue,
			changeDue: state.changeDue,
			error: state.error,
			orderNumber: state.orderNumber,
			selectPaymentMethod: state.selectPaymentMethod,
			applyCashPayment: state.applyCashPayment,
			closeTender: state.closeTender,
			goBack: state.goBack,
			retryFailedPayment: state.retryFailedPayment, // <-- Select the new action
		}),
		shallow
	);

	const handleClose = () => closeTender();
	// --- FIX: The retry handler now calls our new, specific action ---
	const handleRetry = () => retryFailedPayment();

	const renderActiveView = () => {
		switch (tenderState) {
			case "awaitingPaymentMethod":
				return <InitialOptionsView onSelect={selectPaymentMethod} />;
			case "awaitingCashAmount":
				return <CashPaymentView onProcessPayment={applyCashPayment} />;
			case "splittingPayment":
				return <SplitPaymentView />;
			case "initializingTerminal":
				return <ProcessingView message="Initializing Terminal..." />;
			case "awaitingTip":
				return <AwaitTipView />;
			case "processingPayment":
				return <ProcessingView />;
			case "complete":
				return (
					<CompletionView
						order={lastCompletedOrder}
						changeDue={changeDue}
						onClose={handleClose}
					/>
				);
			case "paymentError":
				return (
					<PaymentErrorView
						error={error}
						onRetry={handleRetry}
						onCancel={handleClose}
					/>
				);
			case "idle":
			default:
				return null;
		}
	};

	const canGoBack =
		tenderState === "awaitingCashAmount" ||
		tenderState === "awaitingTip" ||
		tenderState === "paymentError" ||
		tenderState === "splittingPayment";

	return (
		<Dialog
			open={isTenderDialogOpen}
			onOpenChange={(open) => !open && handleClose()}
		>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<div className="flex items-center">
						{canGoBack && (
							<Button
								variant="ghost"
								size="icon"
								onClick={goBack}
								className="mr-2"
							>
								<ArrowLeft className="h-4 w-4" />
							</Button>
						)}
						<DialogTitle>Tender: {orderNumber || "..."}</DialogTitle>
					</div>
				</DialogHeader>

				<div className="py-4">{renderActiveView()}</div>

				{tenderState !== "complete" && tenderState !== "idle" && (
					<div className="p-4 bg-muted/50 rounded-md text-right">
						<h3 className="text-lg font-semibold">
							Balance Due: {formatCurrency(balanceDue)}
						</h3>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
};

export default TenderDialog;
