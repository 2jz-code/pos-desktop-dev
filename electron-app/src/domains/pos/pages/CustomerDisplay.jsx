import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CustomerCartView from "@/domains/pos/components/customerViews/CustomerCartView";
import PaymentProcessingView from "@/domains/pos/components/customerViews/PaymentProcessingView";
import PaymentSuccessView from "@/domains/pos/components/customerViews/PaymentSuccessView";
import TipSelectionView from "@/domains/pos/components/dialogs/paymentViews/TipSelectionView";

const WelcomeView = ({ key }) => (
	<div
		key={key}
		className="text-center"
	>
		<h1 className="text-5xl font-bold">Welcome</h1>
		<p className="text-2xl mt-4 text-muted-foreground">
			Please see the cashier to begin.
		</p>
	</div>
);

const CustomerDisplay = () => {
	const [state, setState] = useState(null);

	useEffect(() => {
		if (window.ipcApi) {
			// Use the correct, standardized channel name
			const unsubscribe = window.ipcApi.receive(
				"POS_TO_CUSTOMER_STATE",
				(newState) => {
					setState(newState);
				}
			);

			window.ipcApi.send("CUSTOMER_REQUESTS_STATE");

			return () => {
				if (unsubscribe) unsubscribe();
			};
		}
	}, []);

	const renderContent = () => {
		if (!state) {
			return <WelcomeView key="welcome" />;
		}

		// This original logic correctly prioritizes payment views
		const isPaymentActive =
			state.status === "in-progress" || state.status === "success";
		const hasCartItems = state.cartItems?.length > 0;

		if (isPaymentActive) {
			if (state.activeView === "awaitingTip") {
				return (
					<TipSelectionView
						key="tip-select"
						amountDue={state.balanceDue}
					/>
				);
			}
			if (state.activeView === "processingPayment") {
				return <PaymentProcessingView key="processing" />;
			}
			if (state.activeView === "complete") {
				return <PaymentSuccessView key="success" />;
			}
		}

		if (hasCartItems) {
			return (
				<CustomerCartView
					key="cart"
					cart={state.cartItems}
					total={state.cartTotal}
				/>
			);
		}

		return <WelcomeView key="welcome-default" />;
	};

	return (
		<div className="flex flex-col items-center justify-center h-screen bg-background text-foreground p-12">
			<AnimatePresence mode="wait">
				<motion.div
					key={state ? `${state.status}-${state.activeView}` : "initial"}
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -20 }}
					transition={{ duration: 0.3 }}
					className="w-full h-full flex items-center justify-center"
				>
					{renderContent()}
				</motion.div>
			</AnimatePresence>
		</div>
	);
};

export default CustomerDisplay;
