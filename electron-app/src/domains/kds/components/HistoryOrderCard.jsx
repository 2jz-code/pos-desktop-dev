import React from "react";
import { Card, CardContent, CardHeader } from "@/shared/components/ui";
import { Clock, User, Phone, Mail, CheckCircle, Star, MapPin } from "lucide-react";

/**
 * History Order Card Component
 * Read-only display of completed orders for history view
 */
export function HistoryOrderCard({ order, onClick, zoneId, isQCStation }) {
	const formatTime = (timeString) => {
		if (!timeString) return 'N/A';
		try {
			return new Date(timeString).toLocaleString('en-US', {
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return 'N/A';
		}
	};

	const formatDuration = (minutes) => {
		if (!minutes || minutes <= 0) return 'N/A';
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
	};

	const getStatusBadgeColor = (status) => {
		switch (status) {
			case 'completed':
				return 'bg-green-100 text-green-800 border-green-200';
			case 'ready':
				return 'bg-blue-100 text-blue-800 border-blue-200';
			case 'in_progress':
				return 'bg-yellow-100 text-yellow-800 border-yellow-200';
			default:
				return 'bg-gray-100 text-gray-800 border-gray-200';
		}
	};

	const customerInfo = order.customer_info || {};
	const displayItems = isQCStation ? order.items_by_zone : order.zone_items;

	return (
		<Card
			className="cursor-pointer hover:shadow-md transition-shadow duration-200 border-l-4 border-l-green-400"
			onClick={onClick}
		>
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between">
					<div className="flex-1">
						{/* Order Number and Status */}
						<div className="flex items-center space-x-3 mb-2">
							<h3 className="text-lg font-semibold text-gray-900">
								#{order.order_number}
							</h3>
							<span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusBadgeColor(order.status)}`}>
								{order.status === 'completed' ? 'Completed' : order.status}
							</span>
							{order.is_priority && (
								<Star className="h-4 w-4 text-yellow-500 fill-current" />
							)}
						</div>

						{/* Customer Info */}
						<div className="flex items-center space-x-4 text-sm text-gray-600">
							<div className="flex items-center space-x-1">
								<User className="h-4 w-4" />
								<span>{customerInfo.name}</span>
								{customerInfo.type === 'guest' && (
									<span className="text-xs bg-gray-100 px-1 rounded">Guest</span>
								)}
							</div>
							{customerInfo.phone && (
								<div className="flex items-center space-x-1">
									<Phone className="h-4 w-4" />
									<span>{customerInfo.phone}</span>
								</div>
							)}
						</div>
					</div>

					{/* Order Total */}
					{order.order_total && (
						<div className="text-right">
							<div className="text-lg font-semibold text-gray-900">
								${order.order_total}
							</div>
							<div className="text-xs text-gray-500">
								{order.item_count} item{order.item_count !== 1 ? 's' : ''}
							</div>
						</div>
					)}
				</div>
			</CardHeader>

			<CardContent className="pt-0">
				{/* Zone Display for QC */}
				{isQCStation && order.assigned_zones && (
					<div className="mb-3">
						<div className="flex items-center space-x-2 mb-2">
							<MapPin className="h-4 w-4 text-gray-500" />
							<span className="text-sm font-medium text-gray-700">Zones:</span>
						</div>
						<div className="flex flex-wrap gap-1">
							{order.assigned_zones.map((zone, index) => (
								<span
									key={index}
									className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full"
								>
									{zone}
								</span>
							))}
						</div>
					</div>
				)}

				{/* Items */}
				<div className="space-y-2 mb-4">
					{isQCStation && displayItems ? (
						/* QC View: Group by zones */
						Object.entries(displayItems).map(([zone, items]) => (
							<div key={zone} className="border rounded-md p-2 bg-gray-50">
								<div className="text-xs font-medium text-gray-600 mb-1">{zone}</div>
								<div className="space-y-1">
									{items.map((item, index) => (
										<div
											key={index}
											className="flex items-center justify-between text-sm"
										>
											<div className="flex items-center space-x-2">
												<span className="w-6 h-6 flex items-center justify-center bg-white rounded text-xs font-medium">
													{item.quantity}
												</span>
												<span className="font-medium">{item.product_name}</span>
												{item.special_instructions && (
													<span className="text-xs text-gray-500 italic">
														({item.special_instructions})
													</span>
												)}
											</div>
											<CheckCircle className="h-4 w-4 text-green-500" />
										</div>
									))}
								</div>
							</div>
						))
					) : (
						/* Kitchen View: Just items for this zone */
						displayItems && displayItems.map((item, index) => (
							<div
								key={index}
								className="flex items-center justify-between p-2 bg-gray-50 rounded-md"
							>
								<div className="flex items-center space-x-2">
									<span className="w-6 h-6 flex items-center justify-center bg-white rounded text-xs font-medium">
										{item.quantity}
									</span>
									<div>
										<span className="font-medium text-sm">{item.product_name}</span>
										{item.special_instructions && (
											<div className="text-xs text-gray-500 italic">
												{item.special_instructions}
											</div>
										)}
										{item.notes && (
											<div className="text-xs text-blue-600">
												Note: {item.notes}
											</div>
										)}
									</div>
								</div>
								<CheckCircle className="h-4 w-4 text-green-500" />
							</div>
						))
					)}
				</div>

				{/* Timing Information */}
				<div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-200">
					<div>
						<div className="text-xs text-gray-500 mb-1">Completed</div>
						<div className="flex items-center space-x-1 text-sm">
							<Clock className="h-4 w-4 text-gray-400" />
							<span>{formatTime(order.completed_at)}</span>
						</div>
					</div>
					<div>
						<div className="text-xs text-gray-500 mb-1">Total Time</div>
						<div className="text-sm font-medium">
							{formatDuration(order.total_time_minutes)}
						</div>
					</div>
				</div>

				{/* Additional timing details */}
				{order.prep_time_minutes > 0 && (
					<div className="mt-2 pt-2 border-t border-gray-100">
						<div className="flex justify-between text-xs text-gray-500">
							<span>Prep Time: {formatDuration(order.prep_time_minutes)}</span>
							{order.started_at && (
								<span>Started: {formatTime(order.started_at)}</span>
							)}
						</div>
					</div>
				)}

				{/* Click hint */}
				<div className="mt-3 pt-2 border-t border-gray-100">
					<div className="text-xs text-gray-400 text-center">
						Click to view detailed timeline
					</div>
				</div>
			</CardContent>
		</Card>
	);
}