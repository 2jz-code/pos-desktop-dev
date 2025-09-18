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
				return "bg-blue-100 text-blue-800 border-blue-200/50";
			case "in_progress":
				return "bg-amber-100 text-amber-800 border-amber-200/50";
			case "ready":
				return "bg-emerald-100 text-emerald-800 border-emerald-200/50";
			case "completed":
				return "bg-gray-100 text-gray-800 border-gray-200/50";
			default:
				return "bg-gray-100 text-gray-800 border-gray-200/50";
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
	const hasStartedItems = order.has_started_items;

	// Determine card styling based on order state
	const getCardStyling = () => {
		if (allItemsReady) {
			return 'border-emerald-200/50 bg-gradient-to-br from-emerald-50 to-emerald-100/30';
		} else if (hasStartedItems) {
			return 'border-amber-200/50 bg-gradient-to-br from-amber-50 to-amber-100/30';
		} else {
			return 'border-gray-200/50 bg-gradient-to-br from-white to-gray-50/30';
		}
	};

	return (
		<div
			className={allItemsReady ? 'cursor-pointer' : 'cursor-default'}
			onClick={allItemsReady ? handleCompleteOrder : undefined}
		>
			<Card className={`${getCardStyling()} shadow-sm border border-gray-300/30 overflow-hidden`}>
				<CardHeader className="pb-1 px-3 pt-3">
					<div className="flex justify-between items-center">
						<div>
							<h3 className="text-base font-bold text-gray-800">#{order.order_number}</h3>
							{allItemsReady ? (
								<span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full font-medium border border-emerald-600 inline-block mt-1">
									READY
								</span>
							) : hasStartedItems ? (
								<span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-medium border border-amber-600 inline-block mt-1">
									IN PROGRESS
								</span>
							) : (
								<span className="text-xs bg-gray-500 text-white px-2 py-0.5 rounded-full font-medium border border-gray-600 inline-block mt-1">
									PENDING
								</span>
							)}
						</div>
						<div className="text-right">
							<div className="text-xs text-gray-500 flex items-center space-x-1 justify-end">
								<Clock className="h-3 w-3" />
								<span>{getOrderAge(order.created_at)}</span>
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
					{/* Kitchen Zones and Items */}
					<div className="space-y-2 mt-2">
						{Object.entries(order.kitchen_zones || {}).map(([zoneName, items]) => (
							<div key={zoneName} className="bg-white/70 backdrop-blur-sm rounded-lg p-2.5 border border-gray-200/50">
								<div className="text-xs font-semibold text-gray-700 mb-2">{zoneName}</div>
								<div className="space-y-1.5">
									{items.map((item, index) => (
										<div key={item.id || index} className="flex items-center justify-between text-xs">
											<span className="flex-1">
												<span className="font-semibold text-gray-800">{item.quantity}×</span>
												<span className="font-medium text-gray-800 ml-1">{item.product_name}</span>
											</span>
											<div className="flex items-center space-x-1">
												{getItemStatusIcon(item.status)}
												<span className={`px-2 py-0.5 rounded-full font-medium border ${getItemStatusBadge(item.status)} border-opacity-50`}>
													{item.status === 'in_progress' ? 'Preparing' : item.status.charAt(0).toUpperCase() + item.status.slice(1)}
												</span>
											</div>
										</div>
									))}
								</div>
							</div>
						))}
					</div>

				</CardContent>
			</Card>
		</div>
	);
}