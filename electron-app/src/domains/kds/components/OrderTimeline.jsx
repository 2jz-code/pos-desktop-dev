import React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui";
import {
	ArrowLeft,
	Clock,
	CheckCircle,
	Play,
	Eye,
	Star,
	User,
	Phone,
	Mail,
	MapPin,
	RefreshCw,
	Utensils,
	Package
} from "lucide-react";

/**
 * Order Timeline Component
 * Detailed view of order progression with timeline events
 */
export function OrderTimeline({ orderData, onBack, isLoading }) {
	const formatTime = (timeString) => {
		if (!timeString) return 'N/A';
		try {
			const date = new Date(timeString);
			return date.toLocaleString('en-US', {
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit'
			});
		} catch {
			return 'N/A';
		}
	};

	const formatDuration = (minutes) => {
		if (!minutes || minutes <= 0) return 'N/A';
		if (minutes < 1) return '< 1m';
		const hours = Math.floor(minutes / 60);
		const mins = Math.floor(minutes % 60);
		return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
	};

	const getEventIcon = (eventType) => {
		switch (eventType) {
			case 'order_created':
				return <Package className="h-5 w-5 text-blue-500" />;
			case 'order_started':
				return <Play className="h-5 w-5 text-orange-500" />;
			case 'zone_started':
				return <Play className="h-5 w-5 text-orange-500" />;
			case 'zone_ready_for_qc':
				return <Eye className="h-5 w-5 text-purple-500" />;
			case 'all_zones_ready_for_qc':
				return <Eye className="h-5 w-5 text-purple-600" />;
			case 'order_ready':
				return <Eye className="h-5 w-5 text-purple-500" />;
			case 'order_completed':
				return <CheckCircle className="h-5 w-5 text-emerald-600" />;
			case 'item_started':
				return <Utensils className="h-4 w-4 text-orange-400" />;
			case 'item_completed':
				return <CheckCircle className="h-4 w-4 text-green-400" />;
			default:
				return <Clock className="h-4 w-4 text-gray-400" />;
		}
	};

	const getEventTitle = (event) => {
		switch (event.event) {
			case 'order_created':
				return 'Order Received';
			case 'order_started':
				return 'Kitchen Started';
			case 'order_ready':
				return 'Ready for QC';
			case 'order_completed':
				return 'Order Completed';
			case 'zone_started':
				return `${event.zone} Started`;
			case 'zone_ready_for_qc':
				return `${event.zone} Ready for QC`;
			case 'all_zones_ready_for_qc':
				return 'All Zones Ready for QC';
			case 'item_started':
				return 'Item Started';
			case 'item_completed':
				return 'Item Completed';
			default:
				return event.event.replace('_', ' ');
		}
	};

	const isOrderEvent = (eventType) => {
		return ['order_created', 'order_started', 'order_ready', 'order_completed', 'zone_started', 'zone_ready_for_qc', 'all_zones_ready_for_qc'].includes(eventType);
	};

	if (isLoading) {
		return (
			<div className="flex flex-col h-full">
				<div className="p-6 border-b border-gray-200 bg-gray-50">
					<div className="flex items-center space-x-3">
						<Button
							onClick={onBack}
							variant="ghost"
							size="sm"
						>
							<ArrowLeft className="h-4 w-4 mr-2" />
							Back to History
						</Button>
					</div>
				</div>
				<div className="flex-1 flex items-center justify-center">
					<RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
					<span className="ml-2 text-gray-600">Loading timeline...</span>
				</div>
			</div>
		);
	}

	if (!orderData || orderData.error) {
		return (
			<div className="flex flex-col h-full">
				<div className="p-6 border-b border-gray-200 bg-gray-50">
					<div className="flex items-center space-x-3">
						<Button
							onClick={onBack}
							variant="ghost"
							size="sm"
						>
							<ArrowLeft className="h-4 w-4 mr-2" />
							Back to History
						</Button>
					</div>
				</div>
				<div className="flex-1 flex items-center justify-center">
					<div className="text-center">
						<h3 className="text-lg font-medium text-gray-900 mb-2">
							Could not load timeline
						</h3>
						<p className="text-gray-500">
							{orderData?.error || 'Unknown error occurred'}
						</p>
					</div>
				</div>
			</div>
		);
	}

	const { order, timeline, items } = orderData;
	const customerInfo = order?.customer_info || {};

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="p-6 border-b border-gray-200 bg-gray-50">
				<div className="flex items-center space-x-3 mb-4">
					<Button
						onClick={onBack}
						variant="ghost"
						size="sm"
					>
						<ArrowLeft className="h-4 w-4 mr-2" />
						Back to History
					</Button>
				</div>

				{/* Order Summary */}
				<div className="bg-white rounded-lg p-4 shadow-sm">
					<div className="flex items-start justify-between mb-4">
						<div>
							<div className="flex items-center space-x-3 mb-2">
								<h2 className="text-xl font-semibold text-gray-900">
									Order #{order.order_number}
								</h2>
								{order.is_priority && (
									<Star className="h-5 w-5 text-yellow-500 fill-current" />
								)}
							</div>
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

					{/* Timing Summary */}
					<div className="grid grid-cols-3 gap-4 text-center border-t pt-3">
						<div>
							<div className="text-xs text-gray-500 mb-1">Total Time</div>
							<div className="font-semibold">
								{order.total_time_minutes && order.total_time_minutes > 0
									? formatDuration(order.total_time_minutes)
									: '< 1m'}
							</div>
						</div>
						<div>
							<div className="text-xs text-gray-500 mb-1">Prep Time</div>
							<div className="font-semibold">
								{order.prep_time_minutes && order.prep_time_minutes > 0
									? formatDuration(order.prep_time_minutes)
									: '< 1m'}
							</div>
						</div>
						<div>
							<div className="text-xs text-gray-500 mb-1">Completed</div>
							<div className="font-semibold text-green-600">
								{formatTime(order.completed_at)}
							</div>
						</div>
					</div>

					{/* Zones */}
					{order.assigned_zones && order.assigned_zones.length > 0 && (
						<div className="mt-3 pt-3 border-t">
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
				</div>
			</div>

			{/* Timeline Content */}
			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-3xl mx-auto">
					{/* Timeline */}
					<div className="mb-8">
						<h3 className="text-lg font-semibold text-gray-900 mb-4">Order Timeline</h3>
						<div className="relative">
							{/* Timeline line */}
							<div className="absolute left-6 top-0 bottom-0 w-px bg-gray-200"></div>

							{/* Timeline events */}
							<div className="space-y-4">
								{timeline && timeline.length > 0 ? timeline.map((event, index) => (
									<div key={index} className="relative flex items-start space-x-4">
										{/* Event icon */}
										<div className={`relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-2 border-white shadow-sm ${
											isOrderEvent(event.event) ? 'bg-blue-50' : 'bg-gray-50'
										}`}>
											{getEventIcon(event.event)}
										</div>

										{/* Event content */}
										<div className="flex-1 pb-4">
											<Card className={`${isOrderEvent(event.event) ? 'border-blue-200' : 'border-gray-200'}`}>
												<CardContent className="p-4">
													<div className="flex items-start justify-between mb-2">
														<div>
															<h4 className="font-medium text-gray-900">
																{getEventTitle(event)}
															</h4>
															<p className="text-sm text-gray-600">
																{event.description}
															</p>
														</div>
														<div className="text-right text-sm text-gray-500">
															{formatTime(event.timestamp)}
														</div>
													</div>

													{/* Event details */}
													<div className="space-y-3">
														{/* Zone badges */}
														<div className="flex flex-wrap gap-2 text-xs">
															{event.zone && (
																<span className="px-2 py-1 bg-purple-100 text-purple-800 rounded">
																	{event.zone}
																</span>
															)}
															{event.zones && event.zones.length > 0 && (
																event.zones.map((zone, zoneIndex) => (
																	<span
																		key={zoneIndex}
																		className="px-2 py-1 bg-blue-100 text-blue-800 rounded"
																	>
																		{zone}
																	</span>
																))
															)}
														</div>

														{/* Consolidated items for zone events */}
														{(event.event === 'zone_started' || event.event === 'zone_ready_for_qc') && event.items && event.items.length > 0 && (
															<div className="border-t pt-3">
																<h5 className="text-xs font-medium text-gray-700 mb-2">
																	Items {event.event === 'zone_started' ? 'Started' : 'Ready'}:
																</h5>
																<div className="space-y-1">
																	{event.items.map((item, itemIndex) => (
																		<div key={itemIndex} className="flex items-center justify-between text-xs bg-gray-50 p-2 rounded">
																			<div className="flex items-center space-x-2">
																				<span className="w-6 h-6 flex items-center justify-center bg-gray-200 rounded-full text-xs font-medium">
																					{item.quantity || 1}
																				</span>
																				<span className="text-gray-800">{item.name || 'Unknown Item'}</span>
																			</div>
																			<span className="text-gray-500">
																				{item.prep_time_minutes && item.prep_time_minutes > 0
																					? formatDuration(item.prep_time_minutes)
																					: '< 1m'}
																			</span>
																		</div>
																	))}
																</div>
															</div>
														)}
													</div>
												</CardContent>
											</Card>
										</div>
									</div>
								)) : (
									<div className="text-center py-8">
										<Clock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
										<p className="text-gray-500">No timeline events available</p>
									</div>
								)}
							</div>
						</div>
					</div>

					{/* Items Detail */}
					{items && items.length > 0 && (
						<div>
							<h3 className="text-lg font-semibold text-gray-900 mb-4">Order Items</h3>
							<div className="space-y-3">
								{items.map((item, index) => (
									<Card key={index} className="border-gray-200">
										<CardContent className="p-4">
											<div className="flex items-start justify-between mb-2">
												<div className="flex items-center space-x-3">
													<span className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full text-sm font-medium">
														{item.quantity}
													</span>
													<div>
														<h4 className="font-medium text-gray-900">
															{item.product_name}
														</h4>
														{item.special_instructions && (
															<p className="text-sm text-gray-600 italic">
																{item.special_instructions}
															</p>
														)}
														{item.notes && (
															<p className="text-sm text-blue-600">
																Note: {item.notes}
															</p>
														)}
													</div>
												</div>
												<div className="text-right">
													<span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded">
														{item.assigned_zone}
													</span>
													<div className="text-xs text-gray-500 mt-1">
														{item.prep_time_minutes && item.prep_time_minutes > 0
															? `${formatDuration(item.prep_time_minutes)} prep`
															: '< 1m prep'}
													</div>
												</div>
											</div>

											{/* Item timeline */}
											{(item.started_at || item.completed_at) && (
												<div className="mt-3 pt-3 border-t border-gray-100">
													<div className="flex justify-between text-xs text-gray-500">
														{item.started_at && (
															<span>Started: {formatTime(item.started_at)}</span>
														)}
														{item.completed_at && (
															<span>Completed: {formatTime(item.completed_at)}</span>
														)}
													</div>
												</div>
											)}
										</CardContent>
									</Card>
								))}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}