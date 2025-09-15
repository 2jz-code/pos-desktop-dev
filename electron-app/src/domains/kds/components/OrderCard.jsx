import React from "react";
import { Button, Card, CardContent, CardHeader } from "@/shared/components/ui";
import { Clock, User, MapPin, FileText } from "lucide-react";

/**
 * Order Card Component
 * Displays individual order information with status management
 */
export function OrderCard({ order, onStatusChange }) {
	const getOrderAge = (receivedAt) => {
		const now = new Date();
		const timeReceived = new Date(receivedAt);
		const diffInMinutes = Math.floor((now - timeReceived) / (1000 * 60));

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

	const getNextStatus = (currentStatus) => {
		switch (currentStatus) {
			case "received":
				return "preparing";
			case "preparing":
				return "ready";
			case "ready":
				return "completed";
			default:
				return currentStatus;
		}
	};

	const getStatusActionText = (status) => {
		switch (status) {
			case "received":
				return "Start Preparing";
			case "preparing":
				return "Mark Ready";
			case "ready":
				return "Complete Order";
			default:
				return "Update Status";
		}
	};

	const handleStatusAdvance = () => {
		const nextStatus = getNextStatus(order.status);
		if (nextStatus === "completed") {
			// Remove completed orders from display
			onStatusChange(order.id, "completed");
		} else {
			onStatusChange(order.id, nextStatus);
		}
	};

	const orderAge = getOrderAge(order.received_at);
	const isOverdue = order.is_overdue;

	return (
		<Card className={`${getStatusColor(order.status)} ${isOverdue ? 'ring-2 ring-red-400' : ''} hover:shadow-md transition-shadow`}>
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between">
					<div>
						<h3 className="font-bold text-lg text-gray-900">
							#{order.order_number}
						</h3>
						<div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
							<div className="flex items-center space-x-1">
								<User className="h-4 w-4" />
								<span>{order.customer_name}</span>
							</div>
							<div className="flex items-center space-x-1">
								<span>{getOrderTypeIcon(order.order_type)}</span>
								<span className="capitalize">{order.order_type}</span>
							</div>
						</div>
						{order.is_priority && (
							<div className="mt-1">
								<span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full font-medium">
									PRIORITY
								</span>
							</div>
						)}
						{order.is_addition && (
							<div className="mt-1">
								<span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full font-medium">
									ORDER ADDITION
								</span>
							</div>
						)}
					</div>
					<div className="text-right">
						<div className={`flex items-center space-x-1 text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
							<Clock className="h-4 w-4" />
							<span>{orderAge}</span>
						</div>
						{isOverdue && (
							<div className="text-xs text-red-600 font-medium mt-1">
								OVERDUE
							</div>
						)}
					</div>
				</div>
			</CardHeader>

			<CardContent className="space-y-4">
				{/* Order Items */}
				<div className="space-y-2">
					<div className="flex justify-between items-start text-sm">
						<div className="flex-1">
							<div className="font-medium text-gray-900">
								{order.order_item.quantity}x {order.order_item.product_name}
							</div>
							{order.order_item.special_instructions && (
								<div className="text-amber-700 bg-amber-50 px-2 py-1 rounded text-xs mt-1 flex items-center">
									<FileText className="h-3 w-3 mr-1" />
									{order.order_item.special_instructions}
								</div>
							)}
							{order.order_item.modifiers && order.order_item.modifiers.length > 0 && (
								<div className="text-xs text-gray-600 mt-1">
									{order.order_item.modifiers.map((modifier, idx) => (
										<span key={idx} className="mr-2">
											{modifier.name}
										</span>
									))}
								</div>
							)}
						</div>
					</div>
				</div>

				{/* Kitchen Notes */}
				{order.kitchen_notes && (
					<div className="text-xs bg-gray-100 p-2 rounded">
						<strong>Kitchen Notes:</strong> {order.kitchen_notes}
					</div>
				)}

				{/* Prep Time Info */}
				{order.estimated_prep_time && (
					<div className="text-xs text-gray-500">
						Est. prep time: {order.estimated_prep_time} min
						{order.prep_time_minutes && (
							<span className="ml-2">
								(Actual: {order.prep_time_minutes} min)
							</span>
						)}
					</div>
				)}

				{/* Action Button */}
				<div className="pt-2">
					<Button
						onClick={handleStatusAdvance}
						className="w-full"
						size="sm"
						variant={order.status === "ready" ? "default" : "outline"}
					>
						{getStatusActionText(order.status)}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}