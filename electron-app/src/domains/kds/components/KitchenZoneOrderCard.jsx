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
				return "border-blue-200/50 bg-gradient-to-br from-blue-50 to-blue-100/30";
			case "preparing":
				return "border-amber-200/50 bg-gradient-to-br from-amber-50 to-amber-100/30";
			case "ready":
				return "border-emerald-200/50 bg-gradient-to-br from-emerald-50 to-emerald-100/30";
			default:
				return "border-gray-200/50 bg-gradient-to-br from-white to-gray-50/30";
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
				return "bg-blue-100 text-blue-800 border border-blue-200/50";
			case "in_progress":
				return "bg-amber-100 text-amber-800 border border-amber-200/50";
			case "ready":
				return "bg-emerald-100 text-emerald-800 border border-emerald-200/50";
			default:
				return "bg-gray-100 text-gray-800 border border-gray-200/50";
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
			className="cursor-pointer"
			onClick={handleOrderStatusAdvance}
		>
			<Card className={`${getStatusColor(order.overall_status)} shadow-sm border border-gray-300/30 overflow-hidden`}>
			<CardHeader className="pb-1 px-3 pt-3">
				<div className="flex justify-between items-start">
					<div>
						<h3 className="text-base font-bold text-gray-800">#{order.order_number}</h3>
						<span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getItemStatusColor(order.overall_status)} inline-block mt-1`}>
							{order.overall_status === 'in_progress' ? 'Preparing' : order.overall_status.charAt(0).toUpperCase() + order.overall_status.slice(1)}
						</span>
					</div>
					<div className="text-right">
						<div className="text-xs text-gray-500 flex items-center space-x-1 justify-end">
							<Clock className="h-3 w-3" />
							<span>{getOrderAge(order.earliest_received_at || order.created_at)}</span>
						</div>
						<div className="mt-1">
							<span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${
								order.dining_preference === 'DINE_IN'
									? 'bg-slate-600 text-white border-slate-700'
									: 'bg-orange-500 text-white border-orange-600'
							}`}>
								{order.dining_preference === 'DINE_IN' ? 'DINE IN' : 'TAKE OUT'}
							</span>
						</div>
					</div>
				</div>

				{/* Customer Info */}
				<div className="flex items-center space-x-1 text-xs text-gray-600 mt-1">
					<User className="h-3 w-3" />
					<span className="font-medium">{order.customer_name || "Guest"}</span>
				</div>
			</CardHeader>

			<CardContent className="pt-0 px-3 pb-3">
				{/* Items for this Zone */}
				<div className="space-y-2 mt-2">

					{order.items.map((item, index) => (
						<div key={item.id} className="bg-white/70 backdrop-blur-sm rounded-lg p-2.5 border border-gray-200/50">
							<div className="flex items-center justify-between">
								<div className="flex items-center space-x-2">
									<span className="font-semibold text-gray-800 text-sm">{item.quantity}×</span>
									<span className="font-medium text-gray-800 text-sm">{item.product_name}</span>
									{item.is_priority && (
										<span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full font-medium">
											PRIORITY
										</span>
									)}
									{item.is_overdue && (
										<AlertTriangle className="h-3 w-3 text-red-500" />
									)}
								</div>
								<span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getItemStatusColor(item.status)}`}>
									{item.status === 'in_progress' ? 'Preparing' : item.status.charAt(0).toUpperCase() + item.status.slice(1)}
								</span>
							</div>

							{/* Special Instructions */}
							{item.special_instructions && (
								<div className="mt-2 text-xs text-amber-700 bg-amber-50/50 p-1.5 rounded border-l-2 border-amber-200">
									<span className="font-medium">Instructions:</span> {item.special_instructions}
								</div>
							)}

							{/* Kitchen Notes */}
							{item.kitchen_notes && (
								<div className="mt-2 text-xs text-blue-700 bg-blue-50/50 p-1.5 rounded border-l-2 border-blue-200">
									<span className="font-medium">Notes:</span> {item.kitchen_notes}
								</div>
							)}


							{/* Timing Info */}
							{item.status !== "pending" && (
								<div className="mt-2 flex space-x-3 text-xs text-gray-500">
									{item.started_preparing_at && (
										<span>Started: {new Date(item.started_preparing_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
									)}
									{item.ready_at && (
										<span>Ready: {new Date(item.ready_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
									)}
								</div>
							)}
						</div>
					))}
				</div>


			</CardContent>
		</Card>
		</div>
	);
}