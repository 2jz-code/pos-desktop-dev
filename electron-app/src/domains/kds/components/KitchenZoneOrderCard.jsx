import React from "react";
import { Card, CardContent, CardHeader } from "@/shared/components/ui";
import { Clock, User, AlertTriangle } from "lucide-react";

/**
 * Kitchen Zone Order Card Component
 * Shows one order with all items for this specific kitchen zone
 * Kitchen staff can tap the card to progress all items together
 */
export function KitchenZoneOrderCard({ order, onItemStatusChange }) {

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

	const getStatusColor = (status) => {
		switch (status) {
			case "received":
				return "border-blue-200 bg-blue-50";
			case "preparing":
				return "border-yellow-200 bg-yellow-50";
			case "ready":
				return "border-green-200 bg-green-50";
			default:
				return "border-gray-200 bg-white";
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

	const getItemStatusColor = (status) => {
		switch (status) {
			case "pending":
				return "bg-blue-100 text-blue-800";
			case "in_progress":
				return "bg-yellow-100 text-yellow-800";
			case "ready":
				return "bg-green-100 text-green-800";
			default:
				return "bg-gray-100 text-gray-800";
		}
	};

	const getNextStatus = (currentStatus) => {
		switch (currentStatus) {
			case "pending":
				return "in_progress";
			case "in_progress":
				return "ready";
			default:
				return currentStatus;
		}
	};

	const getStatusActionText = (status) => {
		switch (status) {
			case "pending":
				return "Start Preparing";
			case "in_progress":
				return "Mark Ready";
			default:
				return "Update Status";
		}
	};


	const handleOrderStatusAdvance = () => {
		if (order.overall_status === 'ready') return; // Can't progress beyond ready

		const nextStatus = getNextStatus(order.overall_status);
		if (nextStatus !== order.overall_status) {
			// Progress all items in this order to the next status
			order.items.forEach(item => {
				if (onItemStatusChange) {
					onItemStatusChange(item.id, nextStatus);
				}
			});
		}
	};

	const getOrderActionText = (status) => {
		switch (status) {
			case "received":
				return "Start Preparing Order";
			case "preparing":
				return "Mark Order Ready";
			case "ready":
				return "Order Ready";
			default:
				return "Update Order";
		}
	};

	return (
		<div
			className={`mb-4 transition-all duration-200 cursor-pointer hover:shadow-lg ${order.overall_status !== 'ready' ? 'hover:scale-[1.02]' : ''}`}
			onClick={handleOrderStatusAdvance}
		>
			<Card className={getStatusColor(order.overall_status)}>
			<CardHeader className="pb-2">
				<div className="flex justify-between items-start">
					<div className="flex items-center space-x-2">
						<h3 className="text-lg font-semibold">#{order.order_number}</h3>
						<span className="text-lg">{getOrderTypeIcon(order.order_type)}</span>
						<span className={`text-xs px-2 py-1 rounded-full ${getItemStatusColor(order.overall_status)}`}>
							{order.overall_status.charAt(0).toUpperCase() + order.overall_status.slice(1)}
						</span>
					</div>
					<div className="text-right text-sm text-gray-600">
						<div className="flex items-center space-x-1">
							<Clock className="h-4 w-4" />
							<span>{getOrderAge(order.earliest_received_at || order.created_at)}</span>
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
				{/* Items for this Zone */}
				<div className="space-y-3">
					<h4 className="text-sm font-medium text-gray-700">Items for this station:</h4>

					{order.items.map((item, index) => (
						<div key={item.id} className="bg-white bg-opacity-50 rounded p-3 border">
							<div className="flex items-center justify-between mb-2">
								<div className="flex items-center space-x-2">
									<span className="font-medium">{item.quantity}x {item.product_name}</span>
									{item.is_priority && (
										<span className="text-xs bg-red-500 text-white px-2 py-1 rounded-full">
											PRIORITY
										</span>
									)}
									{item.is_overdue && (
										<AlertTriangle className="h-4 w-4 text-red-500" />
									)}
								</div>
								<span className={`text-xs px-2 py-1 rounded-full ${getItemStatusColor(item.status)}`}>
									{item.status.charAt(0).toUpperCase() + item.status.slice(1)}
								</span>
							</div>

							{/* Special Instructions */}
							{item.special_instructions && (
								<div className="mb-2 text-sm text-gray-600 bg-yellow-50 p-2 rounded">
									<strong>Instructions:</strong> {item.special_instructions}
								</div>
							)}

							{/* Kitchen Notes */}
							{item.kitchen_notes && (
								<div className="mb-2 text-sm text-blue-600 bg-blue-50 p-2 rounded">
									<strong>Notes:</strong> {item.kitchen_notes}
								</div>
							)}


							{/* Timing Info */}
							{item.status !== "received" && (
								<div className="mt-2 text-xs text-gray-600 space-y-1">
									{item.started_preparing_at && (
										<div>Started: {new Date(item.started_preparing_at).toLocaleTimeString()}</div>
									)}
									{item.ready_at && (
										<div>Ready: {new Date(item.ready_at).toLocaleTimeString()}</div>
									)}
								</div>
							)}
						</div>
					))}
				</div>

				{/* Order Action Indicator */}
				{order.overall_status !== 'ready' && (
					<div className="mt-4 text-center p-2 bg-white bg-opacity-70 rounded border-2 border-dashed border-gray-300">
						<span className="text-sm font-medium text-gray-700">
							Tap to {getOrderActionText(order.overall_status)}
						</span>
					</div>
				)}

			</CardContent>
		</Card>
		</div>
	);
}