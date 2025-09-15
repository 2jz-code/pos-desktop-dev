import React from "react";
import { Button, Card, CardContent, CardHeader } from "@/shared/components/ui";
import { Clock, User, MapPin, FileText } from "lucide-react";

/**
 * Order Card Component
 * Displays individual order information with status management
 */
export function OrderCard({ order, onStatusChange }) {
	const getOrderAge = (timeReceived) => {
		const now = new Date();
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
			case "new":
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
			case "new":
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
			case "new":
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

	const orderAge = getOrderAge(order.timeReceived);
	const isOverdue = (new Date() - order.timeReceived) > (20 * 60 * 1000); // 20 minutes

	return (
		<Card className={`${getStatusColor(order.status)} ${isOverdue ? 'ring-2 ring-red-400' : ''} hover:shadow-md transition-shadow`}>
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between">
					<div>
						<h3 className="font-bold text-lg text-gray-900">
							{order.orderNumber}
						</h3>
						<div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
							<div className="flex items-center space-x-1">
								<User className="h-4 w-4" />
								<span>{order.customerName}</span>
							</div>
							<div className="flex items-center space-x-1">
								<span>{getOrderTypeIcon(order.orderType)}</span>
								<span className="capitalize">{order.orderType}</span>
							</div>
						</div>
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
					{order.items.map((item, index) => (
						<div key={index} className="flex justify-between items-start text-sm">
							<div className="flex-1">
								<div className="font-medium text-gray-900">
									{item.quantity}x {item.name}
								</div>
								{item.specialInstructions && (
									<div className="text-amber-700 bg-amber-50 px-2 py-1 rounded text-xs mt-1 flex items-center">
										<FileText className="h-3 w-3 mr-1" />
										{item.specialInstructions}
									</div>
								)}
							</div>
						</div>
					))}
				</div>

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