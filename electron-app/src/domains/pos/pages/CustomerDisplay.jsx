import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import WelcomeView from "../components/customerViews/WelcomeView";
import CustomerCartView from "../components/customerViews/CustomerCartView";
import PaymentProcessingView from "../components/customerViews/PaymentProcessingView";
import PaymentSuccessView from "../components/customerViews/PaymentSuccessView";
import TipSelectionView from "../components/customerViews/TipSelectionView";

// This function determines which view should be active based on the state.
// It's the "brain" of the customer display.
const getActiveView = (state) => {
	if (!state) {
		return "welcome";
	}

	const isPaymentActive =
		state.status === "in-progress" || state.status === "success";
	const hasCartItems = state.cartItems?.length > 0;

	if (isPaymentActive) {
		// Show tip screen only for card payments that are awaiting a tip
		if (state.activeView === "awaitingTip" && state.paymentMethod === "CREDIT") {
			return "tip";
		}
		if (state.activeView === "processingPayment") {
			return "processing";
		}
		if (state.activeView === "complete") {
			return "success";
		}
	}

	if (hasCartItems && state.pathname === "/pos") {
		return "cart";
	}

	return "welcome";
};

const CustomerDisplay = () => {
	const [state, setState] = useState(null);

	useEffect(() => {
		if (window.electronAPI) {
			const unsubscribe = window.electronAPI.onMessage(
				"POS_TO_CUSTOMER_STATE",
				(newState) => {
					// Directly set the new state. No more transition hacks.
					setState(newState);
				}
			);

			// Ask the main process for the last known state upon mounting
			window.electronAPI.requestInitialState();

			return () => {
				if (unsubscribe) unsubscribe();
			};
		}
	}, []);

	// Handler for tip selection
	const handleTipSelect = (tipAmount) => {
		if (window.electronAPI) {
			window.electronAPI.sendActionToPos("CUSTOMER_TO_POS_TIP", tipAmount);
		}
	};

	const renderContent = () => {
		const currentView = getActiveView(state);

		switch (currentView) {
			case "tip":
				return (
					<TipSelectionView
						key="tip-select"
						amountDue={state.balanceDue}
						onTipSelect={handleTipSelect}
					/>
				);
			case "processing":
				return (
					<PaymentProcessingView
						key="processing"
						status={state.paymentStatus}
					/>
				);
			case "success":
				return <PaymentSuccessView key="success" />;
			case "cart":
				return (
					<CustomerCartView
						key="cart"
						cart={state.cartItems}
						total={state.cartTotal}
					/>
				);
			case "welcome":
			default:
				return <WelcomeView key="welcome" />;
		}
	};

	const pageTransition = {
		initial: { opacity: 0, scale: 0.95, y: 20 },
		animate: { opacity: 1, scale: 1, y: 0 },
		exit: { opacity: 0, scale: 1.05, y: -20 },
	};

	return (
		<div className="w-full h-screen overflow-hidden bg-white dark:bg-slate-900">
			<AnimatePresence mode="wait">
				<motion.div
					// The key is now the stable view name from our "router" function
					key={getActiveView(state)}
					initial="initial"
					animate="animate"
					exit="exit"
					variants={pageTransition}
					transition={{
						duration: 0.4,
						ease: [0.4, 0, 0.2, 1],
					}}
					className="w-full h-full"
				>
					{renderContent()}
				</motion.div>
			</AnimatePresence>
		</div>
	);
};

export default CustomerDisplay;