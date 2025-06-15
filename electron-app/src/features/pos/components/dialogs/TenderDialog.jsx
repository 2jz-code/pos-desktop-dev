import React from "react";
import { usePosStore } from "@/store/posStore";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react"; // Import Loader2 for the processing view

// Import all the view components that DO exist
import InitialOptionsView from "./paymentViews/InitialOptionsView";
import AwaitTipView from "./paymentViews/AwaitTipView";
import CashPaymentView from "./paymentViews/CashPaymentView";
import CompletionView from "./paymentViews/CompletionView";
// Note: We don't need CreditCardView if we use a generic processing view

// --- NEW: Inline components for states that don't have a dedicated view file ---

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
	// Select ALL state and actions needed for the entire flow
	const {
		isTenderDialogOpen,
		order,
		closeTender,
		tenderState,
		balanceDue,
		changeDue,
		error,
		selectPaymentMethod,
		applyCashPayment,
		goBack,
	} = usePosStore((state) => ({
		isTenderDialogOpen: state.isTenderDialogOpen,
		order: state.order,
		closeTender: state.closeTender,
		tenderState: state.tenderState,
		balanceDue: state.balanceDue,
		changeDue: state.changeDue,
		error: state.error,
		selectPaymentMethod: state.selectPaymentMethod,
		applyCashPayment: state.applyCashPayment,
		applyTerminalPayment: state.applyTerminalPayment,
		goBack: state.goBack,
	}));

	const handleClose = () => {
		closeTender();
	};

	const renderActiveView = () => {
		switch (tenderState) {
			case "awaitingPaymentMethod":
				return <InitialOptionsView onSelect={selectPaymentMethod} />;

			case "awaitingCashAmount":
				return (
					<CashPaymentView
						balanceDue={balanceDue}
						onProcessPayment={applyCashPayment}
					/>
				);

			case "initializingTerminal":
				return <ProcessingView message="Initializing Terminal..." />;

			case "awaitingTip":
				return <AwaitTipView />;

			case "processingPayment":
				return <ProcessingView />;

			case "complete":
				return (
					<CompletionView
						changeDue={changeDue}
						onClose={handleClose}
					/>
				);

			case "paymentError":
				return (
					<PaymentErrorView
						error={error}
						onRetry={goBack}
						onCancel={handleClose}
					/>
				);

			case "idle":
			default:
				return <ProcessingView message="Initializing..." />;
		}
	};

	const canGoBack =
		tenderState === "awaitingCashAmount" ||
		tenderState === "awaitingTip" ||
		tenderState === "paymentError";

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
						<DialogTitle>
							Tender Order #{order?.id?.substring(0, 8)}...
						</DialogTitle>
					</div>
				</DialogHeader>

				<div className="py-4">{renderActiveView()}</div>

				{tenderState !== "complete" && (
					<div className="p-4 bg-muted/50 rounded-md text-right">
						<h3 className="text-lg font-semibold">
							Balance Due: ${balanceDue.toFixed(2)}
						</h3>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
};

export default TenderDialog;
