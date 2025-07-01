import React from "react";
import { X, ShoppingBag, Clock, User } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { formatCurrency } from "@/shared/lib/utils";

const WebOrderNotification = ({ order, onDismiss, onViewOrder }) => {
	if (!order) {
		return (
			<div className="p-4 text-sm text-red-600">
				Error: Order data is missing.
			</div>
		);
	}

	const handleViewOrder = () => {
		onViewOrder?.(order);
	};

	const itemCount = order.items?.length || 0;
	const customerName = order.customer_display_name || "Guest Customer";
	const orderTime = new Date(order.created_at).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});

	return (
		<div className="w-full p-2">
			<div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden">
				{/* Header */}
				<div className="bg-green-50 dark:bg-green-900/30 px-3 py-2">
					<div className="flex items-center justify-between">
						<div className="flex items-center space-x-2">
							<div className="flex items-center justify-center w-6 h-6 bg-green-100 dark:bg-green-800 rounded-full">
								<ShoppingBag className="h-3 w-3 text-green-600 dark:text-green-400" />
							</div>
							<div>
								<h3 className="font-semibold text-sm text-green-800 dark:text-green-200">
									New Web Order
								</h3>
								<div className="flex items-center space-x-2 text-xs text-green-600 dark:text-green-400">
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
							onClick={(e) => {
								e.stopPropagation();
								onDismiss?.();
							}}
							className="h-7 w-7 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
						>
							<X className="h-4 w-4" />
						</Button>
					</div>
				</div>

				{/* Content */}
				<div className="p-3 space-y-2">
					{/* Customer Info */}
					<div className="flex items-center space-x-2 text-xs text-gray-600 dark:text-gray-400">
						<User className="h-4 w-4" />
						<span>{customerName}</span>
					</div>

					{/* Order Summary */}
					<div className="space-y-2">
						<div className="flex justify-between items-center">
							<span className="text-xs text-gray-600 dark:text-gray-400">
								{itemCount} item{itemCount !== 1 ? "s" : ""}
							</span>
							<span className="font-semibold text-base">
								{formatCurrency(order.grand_total)}
							</span>
						</div>
					</div>

					{/* Actions */}
					<div className="flex space-x-2 pt-1">
						<Button
							onClick={handleViewOrder}
							className="flex-1 bg-green-600 hover:bg-green-700 text-white h-8 text-xs"
						>
							View Details
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default WebOrderNotification;
