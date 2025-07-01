import React, { useState, useEffect, useRef } from "react";
import { X, ShoppingBag, Clock, User } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { formatCurrency } from "@/shared/lib/utils";
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";

const WebOrderNotification = ({
	order,
	onDismiss,
	onViewOrder,
	autoHideDelay = 10000,
}) => {
	const [isVisible, setIsVisible] = useState(true);
	const timeoutRef = useRef(null);

	useEffect(() => {
		// Auto-hide after delay
		if (autoHideDelay > 0) {
			timeoutRef.current = setTimeout(() => {
				handleDismiss();
			}, autoHideDelay);
		}

		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, [autoHideDelay]);

	const handleDismiss = () => {
		setIsVisible(false);
		setTimeout(() => {
			onDismiss?.();
		}, 300); // Wait for exit animation
	};

	const handleViewOrder = () => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
		}
		onViewOrder?.(order);
	};

	if (!isVisible) return null;

	const itemCount = order.items?.length || 0;
	const customerName = order.customer_display_name || "Guest Customer";
	const orderTime = new Date(order.created_at).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});

	return (
		<AnimatePresence>
			<motion.div
				initial={{ opacity: 0, y: -50, scale: 0.95 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				exit={{ opacity: 0, y: -20, scale: 0.95 }}
				transition={{ duration: 0.3, ease: "easeOut" }}
				className="fixed top-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)]"
			>
				<div className="bg-white dark:bg-gray-800 border border-green-200 dark:border-green-700 rounded-lg shadow-lg overflow-hidden">
					{/* Header */}
					<div className="bg-green-50 dark:bg-green-900/30 px-4 py-3 border-b border-green-200 dark:border-green-700">
						<div className="flex items-center justify-between">
							<div className="flex items-center space-x-2">
								<div className="flex items-center justify-center w-8 h-8 bg-green-100 dark:bg-green-800 rounded-full">
									<ShoppingBag className="h-4 w-4 text-green-600 dark:text-green-400" />
								</div>
								<div>
									<h3 className="font-semibold text-green-800 dark:text-green-200">
										New Web Order
									</h3>
									<div className="flex items-center space-x-2 text-sm text-green-600 dark:text-green-400">
										<Badge
											variant="secondary"
											className="text-xs"
										>
											#{order.order_number}
										</Badge>
										<span className="flex items-center space-x-1">
											<Clock className="h-3 w-3" />
											<span>{orderTime}</span>
										</span>
									</div>
								</div>
							</div>
							<Button
								variant="ghost"
								size="icon"
								onClick={handleDismiss}
								className="h-8 w-8 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
							>
								<X className="h-4 w-4" />
							</Button>
						</div>
					</div>

					{/* Content */}
					<div className="p-4 space-y-3">
						{/* Customer Info */}
						<div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
							<User className="h-4 w-4" />
							<span>{customerName}</span>
						</div>

						{/* Order Summary */}
						<div className="space-y-2">
							<div className="flex justify-between items-center">
								<span className="text-sm text-gray-600 dark:text-gray-400">
									{itemCount} item{itemCount !== 1 ? "s" : ""}
								</span>
								<span className="font-semibold text-lg">
									{formatCurrency(order.grand_total)}
								</span>
							</div>

							{/* First few items preview */}
							{order.items && order.items.length > 0 && (
								<div className="text-sm text-gray-600 dark:text-gray-400">
									<div className="max-h-16 overflow-hidden">
										{order.items.slice(0, 3).map((item, index) => (
											<div
												key={index}
												className="flex justify-between"
											>
												<span className="truncate">
													{item.quantity}x {item.product?.name}
												</span>
												<span className="ml-2 font-medium">
													{formatCurrency(item.total_price)}
												</span>
											</div>
										))}
										{order.items.length > 3 && (
											<div className="text-xs text-gray-500 mt-1">
												+{order.items.length - 3} more items...
											</div>
										)}
									</div>
								</div>
							)}
						</div>

						{/* Actions */}
						<div className="flex space-x-2 pt-2">
							<Button
								onClick={handleViewOrder}
								className="flex-1 bg-green-600 hover:bg-green-700 text-white"
								size="sm"
							>
								View Details
							</Button>
							<Button
								onClick={handleDismiss}
								variant="outline"
								size="sm"
								className="border-green-200 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-900/30"
							>
								Dismiss
							</Button>
						</div>
					</div>
				</div>
			</motion.div>
		</AnimatePresence>
	);
};

export default WebOrderNotification;
