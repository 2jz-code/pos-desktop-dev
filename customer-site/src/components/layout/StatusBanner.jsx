import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Clock, Store, AlertTriangle } from "lucide-react";
import { useStoreStatus } from "@/contexts/StoreStatusContext";

const StatusBanner = () => {
	const [isDismissed, setIsDismissed] = useState(false);
	const [timeLeft, setTimeLeft] = useState(null);
	const storeStatus = useStoreStatus();

	// Update countdown timer
	useEffect(() => {
		if (storeStatus.isClosingSoon && storeStatus.timeUntilClose) {
			const interval = setInterval(() => {
				setTimeLeft(storeStatus.timeUntilClose);
			}, 60000); // Update every minute

			// Set initial time
			setTimeLeft(storeStatus.timeUntilClose);

			return () => clearInterval(interval);
		}
	}, [storeStatus.isClosingSoon, storeStatus.timeUntilClose]);

	// Reset dismissed state when status changes significantly
	useEffect(() => {
		setIsDismissed(false);
	}, [storeStatus.isOpen, storeStatus.canPlaceOrder]);

	// Don't show banner if dismissed or loading
	if (isDismissed || storeStatus.isLoading) {
		return null;
	}

	// Determine banner content and style based on store status
	let bannerConfig = null;

	if (!storeStatus.canPlaceOrder) {
		// Store is closed
		bannerConfig = {
			type: "error",
			icon: Store,
			bgColor: "bg-red-600",
			textColor: "text-white",
			title: "Store Closed",
			message: storeStatus.getNextOpeningDisplay() 
				? `We'll reopen at ${storeStatus.getNextOpeningDisplay()}. Feel free to browse our menu!`
				: "We're currently closed, but feel free to browse our menu!",
			showTimer: false
		};
	} else if (storeStatus.isClosingSoon) {
		// Store is closing soon
		bannerConfig = {
			type: "warning",
			icon: Clock,
			bgColor: "bg-yellow-600",
			textColor: "text-white",
			title: "Store Closing Soon",
			message: `We're closing in ${storeStatus.getTimeUntilCloseString()}`,
			showTimer: true
		};
	}

	// Don't render if no banner needed
	if (!bannerConfig) {
		return null;
	}

	const { icon: Icon, bgColor, textColor, title, message, showTimer } = bannerConfig;

	return (
		<AnimatePresence>
			<motion.div
				initial={{ y: -100, opacity: 0 }}
				animate={{ y: 0, opacity: 1 }}
				exit={{ y: -100, opacity: 0 }}
				transition={{ duration: 0.3 }}
				className={`fixed top-20 left-0 right-0 z-30 ${bgColor} ${textColor} shadow-lg`}
			>
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
					<div className="flex items-center justify-between py-3">
						{/* Banner Content */}
						<div className="flex items-center space-x-3 flex-1">
							{/* Icon */}
							<div className="flex-shrink-0">
								<Icon className="h-5 w-5" />
							</div>

							{/* Text Content */}
							<div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 flex-1">
								<span className="font-semibold text-sm">
									{title}
								</span>
								<span className="text-sm opacity-90">
									{message}
								</span>
							</div>

							{/* Timer (if applicable) */}
							{showTimer && timeLeft && (
								<div className="hidden sm:flex items-center space-x-1 text-sm font-mono bg-white/20 px-2 py-1 rounded">
									<Clock className="h-3 w-3" />
									<span>{storeStatus.getTimeUntilCloseString()}</span>
								</div>
							)}
						</div>

						{/* Dismiss Button */}
						<div className="flex-shrink-0 ml-4">
							<button
								type="button"
								className={`inline-flex p-1.5 rounded-md hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 transition-colors`}
								onClick={() => setIsDismissed(true)}
								aria-label="Dismiss banner"
							>
								<X className="h-4 w-4" />
							</button>
						</div>
					</div>
				</div>

				{/* Progress bar for closing soon */}
				{showTimer && storeStatus.timeUntilClose && (
					<motion.div
						className="h-1 bg-white/30"
						initial={{ scaleX: 1 }}
						animate={{ scaleX: 1 }}
					>
						<motion.div
							className="h-full bg-white"
							initial={{ scaleX: 1 }}
							animate={{ 
								scaleX: storeStatus.timeUntilClose / 30 // Assuming 30 minutes warning
							}}
							transition={{ duration: 1 }}
						/>
					</motion.div>
				)}
			</motion.div>
		</AnimatePresence>
	);
};

export default StatusBanner;