import React from "react";
import { Card, CardContent, CardHeader } from "@/shared/components/ui";
import { Clock, User, CheckCircle, AlertTriangle } from "lucide-react";

/**
 * QC Order Card Component
 * Single grid display showing all orders with item status badges
 * Clickable when all items are ready to complete the order
 */
export function QCOrderCard({ order, onStatusChange }) {
	const getOrderAge = (createdAt) => {
		const now = new Date();
		const timeCreated = new Date(createdAt);
		const diffInMinutes = Math.floor((now - timeCreated) / (1000 * 60));

		if (diffInMinutes < 1) {
			return "Just now";
		} else if (diffInMinutes < 60) {
			return `${diffInMinutes}m ago`;
		} else {
			const hours = Math.floor(diffInMinutes / 60);
			const minutes = diffInMinutes % 60;
			return `${hours}h ${minutes}m ago`;
		}
	};

	const getOrderTypeIcon = (orderType) => {
		switch (orderType) {
			case "dine-in":
				return "🍽️";
			case "takeout":
				return "🥡";
			case "delivery":
				return "🚚";
			default:
				return "📋";
		}
	};

	const getItemStatusBadge = (status) => {
		switch (status) {
			case "pending":
				return "bg-blue-100 text-blue-800";
			case "in_progress":
				return "bg-yellow-100 text-yellow-800";
			case "ready":
				return "bg-green-100 text-green-800";
			case "completed":
				return "bg-gray-100 text-gray-800";
			default:
				return "bg-gray-100 text-gray-800";
		}
	};

	const getItemStatusIcon = (status) => {
		switch (status) {
			case "ready":
				return <CheckCircle className="h-3 w-3" />;
			case "in_progress":
				return <AlertTriangle className="h-3 w-3" />;
			default:
				return <div className="h-3 w-3 rounded-full border-2 border-current" />;
		}
	};

	const handleCompleteOrder = () => {
		if (order.can_complete && onStatusChange) {
			// Complete the entire order
			onStatusChange(order.id, 'completed');
		}
	};

	// Check if all items are ready across all kitchen zones
	const allItemsReady = order.can_complete;

	return (
		<div
			className={`transition-all duration-200 ${allItemsReady ? 'cursor-pointer hover:shadow-lg hover:scale-[1.02]' : 'cursor-default'}`}
			onClick={allItemsReady ? handleCompleteOrder : undefined}
		>
			<Card className={`${allItemsReady ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}>
				<CardHeader className="pb-2">
					<div className="flex justify-between items-start">
						<div className="flex items-center space-x-2">
							<h3 className="text-lg font-semibold">#{order.order_number}</h3>
							<span className="text-lg">{getOrderTypeIcon(order.order_type)}</span>
							{allItemsReady && (
								<span className="text-xs bg-green-500 text-white px-2 py-1 rounded-full">
									READY TO SERVE
								</span>
							)}
						</div>
						<div className="text-right text-sm text-gray-600">
							<div className="flex items-center space-x-1">
								<Clock className="h-4 w-4" />
								<span>{getOrderAge(order.created_at)}</span>
							</div>
						</div>
					</div>

					{/* Customer Info */}
					<div className="flex items-center space-x-1 text-sm text-gray-600">
						<User className="h-4 w-4" />
						<span>{order.customer_name || "Guest"}</span>
					</div>
				</CardHeader>

				<CardContent className="pt-0">
					{/* Kitchen Zones and Items */}
					<div className="space-y-3">
						<h4 className="text-sm font-medium text-gray-700">Items by Kitchen Station:</h4>

						{Object.entries(order.kitchen_zones || {}).map(([zoneName, items]) => (
							<div key={zoneName} className="bg-gray-50 rounded p-2">
								<div className="text-xs font-medium text-gray-600 mb-2">{zoneName}</div>
								<div className="space-y-1">
									{items.map((item, index) => (
										<div key={item.id || index} className="flex items-center justify-between text-xs">
											<span className="flex-1">
												{item.quantity}x {item.product_name}
											</span>
											<div className="flex items-center space-x-1">
												{getItemStatusIcon(item.status)}
												<span className={`px-2 py-1 rounded-full ${getItemStatusBadge(item.status)}`}>
													{item.status.charAt(0).toUpperCase() + item.status.slice(1)}
												</span>
											</div>
										</div>
									))}
								</div>
							</div>
						))}
					</div>

					{/* Action Indicator */}
					{allItemsReady && (
						<div className="mt-4 text-center p-3 bg-green-100 rounded border-2 border-dashed border-green-300">
							<span className="text-sm font-medium text-green-800">
								✅ Tap to Complete & Serve Order
							</span>
						</div>
					)}

					{!allItemsReady && (
						<div className="mt-4 text-center p-2 bg-yellow-50 rounded border border-yellow-200">
							<span className="text-xs text-yellow-700">
								Waiting for kitchen stations to complete items...
							</span>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}