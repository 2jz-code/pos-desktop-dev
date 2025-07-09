import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion"; // eslint-disable-line
import WelcomeView from "../components/customerViews/WelcomeView";
import CustomerCartView from "../components/customerViews/CustomerCartView";
import PaymentProcessingView from "../components/customerViews/PaymentProcessingView";
import PaymentSuccessView from "../components/customerViews/PaymentSuccessView";
import TipSelectionView from "../components/customerViews/TipSelectionView";

const CustomerDisplay = () => {
	const [state, setState] = useState(null);
	const [isTransitioning, setIsTransitioning] = useState(false);

	useEffect(() => {
		if (window.electronAPI) {
			const unsubscribe = window.electronAPI.onMessage(
				"POS_TO_CUSTOMER_STATE",
				(newState) => {
					setIsTransitioning(true);
					setTimeout(() => {
						setState(newState);
						setIsTransitioning(false);
					}, 150); // Brief transition delay
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
						onTipSelect={handleTipSelect}
					/>
				);
			}
			if (state.activeView === "processingPayment") {
				return (
					<PaymentProcessingView
						key="processing"
						status={state.paymentStatus}
					/>
				);
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

	const pageTransition = {
		initial: { opacity: 0, scale: 0.95, y: 20 },
		animate: { opacity: 1, scale: 1, y: 0 },
		exit: { opacity: 0, scale: 1.05, y: -20 },
	};

	return (
		<div className="w-full h-screen overflow-hidden">
			<AnimatePresence mode="wait">
				{!isTransitioning && (
					<motion.div
						key={state ? `${state.status}-${state.activeView}` : "initial"}
						initial="initial"
						animate="animate"
						exit="exit"
						variants={pageTransition}
						transition={{
							duration: 0.4,
							ease: [0.4, 0, 0.2, 1], // Custom easing for smooth transitions
						}}
						className="w-full h-full"
					>
						{renderContent()}
					</motion.div>
				)}
			</AnimatePresence>

			{/* Loading overlay during transitions */}
			<AnimatePresence>
				{isTransitioning && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50"
					>
						<motion.div
							animate={{ rotate: 360 }}
							transition={{
								duration: 1,
								repeat: Number.POSITIVE_INFINITY,
								ease: "linear",
							}}
							className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"
						/>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
};

export default CustomerDisplay;
