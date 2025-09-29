import React from "react";
import { usePosStore } from "@/domains/pos/store/posStore";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { formatCurrency } from "@ajeen/ui";
import { shallow } from "zustand/shallow";

// Import all view components
import InitialOptionsView from "./paymentViews/InitialOptionsView";
import AwaitTipView from "./paymentViews/AwaitTipView";
import CashPaymentView from "./paymentViews/CashPaymentView";
import CompletionView from "./paymentViews/CompletionView";
import SplitPaymentView from "./paymentViews/SplitPaymentView";
import GiftCardPaymentView from "./paymentViews/GiftCardPaymentView";
import DeliveryPaymentView from "./paymentViews/DeliveryPaymentView";

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
		partialAmount,
		surchargeAmount,
		changeDue,
		error,
		orderNumber,
		selectPaymentMethod,
		applyCashPayment,
		applyGiftCardPayment,
		selectDeliveryPlatform,
		closeTender,
		goBack,
		retryFailedPayment, // <-- Select the new action
	} = usePosStore(
		(state) => ({
			isTenderDialogOpen: state.isTenderDialogOpen,
			lastCompletedOrder: state.lastCompletedOrder,
			tenderState: state.tenderState,
			balanceDue: state.balanceDue,
			partialAmount: state.partialAmount,
			surchargeAmount: state.surchargeAmount,
			changeDue: state.changeDue,
			error: state.error,
			orderNumber: state.orderNumber,
			selectPaymentMethod: state.selectPaymentMethod,
			applyCashPayment: state.applyCashPayment,
			applyGiftCardPayment: state.applyGiftCardPayment,
			selectDeliveryPlatform: state.selectDeliveryPlatform,
			closeTender: state.closeTender,
			goBack: state.goBack,
			retryFailedPayment: state.retryFailedPayment, // <-- Select the new action
		}),
		shallow
	);

	const resetCart = usePosStore((state) => state.resetCart);
	
	const handleClose = () => closeTender();
	
	// Special close handler for completion state - resets cart before closing
	const handleCompleteClose = () => {
		if (resetCart) {
			resetCart();
		}
		closeTender();
	};
	
	// --- FIX: The retry handler now calls our new, specific action ---
	const handleRetry = () => retryFailedPayment();

	const renderActiveView = () => {
		switch (tenderState) {
			case "awaitingPaymentMethod":
				return <InitialOptionsView onSelect={selectPaymentMethod} />;
			case "awaitingCashAmount":
				return <CashPaymentView onProcessPayment={applyCashPayment} />;
			case "awaitingGiftCard":
				return <GiftCardPaymentView onProcessPayment={applyGiftCardPayment} />;
			case "awaitingDeliveryPlatform":
				return <DeliveryPaymentView onSelectPlatform={selectDeliveryPlatform} />;
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
		tenderState === "awaitingGiftCard" ||
		tenderState === "awaitingDeliveryPlatform" ||
		tenderState === "awaitingTip" ||
		tenderState === "paymentError" ||
		tenderState === "splittingPayment";

	return (
		<Dialog
			open={isTenderDialogOpen}
			onOpenChange={() => {}} // Disable closing by clicking outside or pressing ESC
		>
			<DialogContent 
				className="sm:max-w-[500px]"
				showCloseButton={false} // Disable default close button
				onInteractOutside={(e) => e.preventDefault()} // Prevent closing by clicking outside
				onEscapeKeyDown={(e) => e.preventDefault()} // Prevent closing with ESC key
			>
				<DialogHeader>
					<div className="flex items-center justify-between">
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
						<Button
							variant="ghost"
							size="icon"
							onClick={tenderState === "complete" ? handleCompleteClose : handleClose}
							className="h-6 w-6 rounded-xs opacity-70 hover:opacity-100"
						>
							<X className="h-4 w-4" />
							<span className="sr-only">Close</span>
						</Button>
					</div>
				</DialogHeader>

				<div className="py-4">{renderActiveView()}</div>

				{tenderState !== "complete" && tenderState !== "idle" && (
					<div className="p-4 bg-muted/50 rounded-md text-right">
						{partialAmount > 0 ? (
							<div className="space-y-1">
								<h3 className="text-lg font-semibold">
									Payment Amount:{" "}
									{formatCurrency(partialAmount + (surchargeAmount || 0))}
								</h3>
								{surchargeAmount > 0 && (
									<p className="text-xs text-muted-foreground">
										Base: {formatCurrency(partialAmount)} + Surcharge:{" "}
										{formatCurrency(surchargeAmount)}
									</p>
								)}
								<p className="text-sm text-muted-foreground">
									Remaining Balance: {formatCurrency(balanceDue)}
								</p>
							</div>
						) : (
							<div className="space-y-1">
								<h3 className="text-lg font-semibold">
									{surchargeAmount > 0 ? (
										<>
											Total Amount:{" "}
											{formatCurrency(balanceDue + surchargeAmount)}
										</>
									) : (
										<>Balance Due: {formatCurrency(balanceDue)}</>
									)}
								</h3>
								{surchargeAmount > 0 &&
									tenderState !== "awaitingPaymentMethod" && (
										<p className="text-xs text-muted-foreground">
											Cart Total: {formatCurrency(balanceDue)} + Card Processing
											Fee: {formatCurrency(surchargeAmount)}
										</p>
									)}
							</div>
						)}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
};

export default TenderDialog;
