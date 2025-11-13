import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion"; // eslint-disable-line
import WelcomeView from "../components/customerViews/WelcomeView";
import CustomerCartView from "../components/customerViews/CustomerCartView";
import PaymentProcessingView from "../components/customerViews/PaymentProcessingView";
import PaymentSuccessView from "../components/customerViews/PaymentSuccessView";
import TipSelectionView from "../components/customerViews/TipSelectionView";

// Watchdog configuration
const HEARTBEAT_CHECK_INTERVAL_MS = 5000; // Check every 5 seconds
const STALE_THRESHOLD_MS = 30000; // Reload if no updates for 30 seconds

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
		if (
			state.activeView === "awaitingTip" &&
			state.paymentMethod === "CREDIT"
		) {
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
	const lastUpdateTimestamp = useRef(Date.now());
	const watchdogIntervalRef = useRef(null);
	const blockIPC = useRef(false); // Test mode flag

	// Watchdog: Check for stale connection and auto-reload
	useEffect(() => {
		watchdogIntervalRef.current = setInterval(() => {
			const now = Date.now();
			const timeSinceLastUpdate = now - lastUpdateTimestamp.current;

			if (timeSinceLastUpdate > STALE_THRESHOLD_MS) {
				console.error(
					`[CustomerDisplay] Watchdog detected stale connection (${Math.round(timeSinceLastUpdate / 1000)}s since last update). Auto-reloading...`
				);
				window.location.reload();
			}
		}, HEARTBEAT_CHECK_INTERVAL_MS);

		return () => {
			if (watchdogIntervalRef.current) {
				clearInterval(watchdogIntervalRef.current);
			}
		};
	}, []);

	useEffect(() => {
		if (window.electronAPI) {
			const unsubscribe = window.electronAPI.onMessage(
				"POS_TO_CUSTOMER_STATE",
				(newState) => {
					// TEST MODE: Simulate IPC channel drop
					if (blockIPC.current) {
						console.warn("[CustomerDisplay] TEST MODE: Ignoring state update (IPC blocked)");
						return;
					}

					// Update the timestamp whenever we receive a message
					lastUpdateTimestamp.current = Date.now();

					// Directly set the new state. No more transition hacks.
					setState(newState);
				}
			);

			// Ask the main process for the last known state upon mounting
			window.electronAPI.requestInitialState();
			// Update timestamp on mount as well
			lastUpdateTimestamp.current = Date.now();

			return () => {
				if (unsubscribe) unsubscribe();
			};
		}
	}, []);

	// Health check ping/pong listener - respond to main process health checks
	useEffect(() => {
		if (window.electronAPI) {
			const unsubscribe = window.electronAPI.onMessage(
				"CUSTOMER_HEALTH_CHECK_PING",
				() => {
					// TEST MODE: Simulate IPC channel drop (no pong response)
					if (blockIPC.current) {
						console.warn("[CustomerDisplay] TEST MODE: Ignoring health check ping (IPC blocked)");
						return;
					}

					window.electronAPI.sendHealthCheckPong();
				}
			);

			return () => {
				if (unsubscribe) unsubscribe();
			};
		}
	}, []);

	// Expose test functions for DevTools testing
	useEffect(() => {
		window.customerDisplayTest = {
			blockAllIPC: () => {
				blockIPC.current = true;
				console.warn("🚫 TEST MODE: All IPC messages blocked");
			},
			unblockIPC: () => {
				blockIPC.current = false;
			},
			isIPCBlocked: () => {
				return blockIPC.current;
			},
			getTimeSinceLastUpdate: () => {
				return Date.now() - lastUpdateTimestamp.current;
			}
		};

		return () => {
			delete window.customerDisplayTest;
		};
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
