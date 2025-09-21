import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui";
import {
	ChefHat,
	Eye,
	Clock,
	Star,
	TrendingUp,
	Package,
	AlertCircle,
	CheckCircle2,
	Activity
} from "lucide-react";

/**
 * Overview Zone Card Component
 * Displays a compact overview of a kitchen zone's status and metrics
 */
export function OverviewZoneCard({ zone, onClick, isLoading }) {
	const {
		zone_id,
		zone_type,
		zone_name,
		is_active,
		orders = [],
		metrics = {}
	} = zone;

	// Calculate order status counts
	const statusCounts = orders.reduce((acc, order) => {
		const status = order.status || 'unknown';
		acc[status] = (acc[status] || 0) + 1;
		return acc;
	}, {});

	const pendingCount = statusCounts.PENDING || 0;
	const inProgressCount = statusCounts.IN_PROGRESS || 0;
	const readyCount = statusCounts.READY || 0;
	const priorityCount = orders.filter(order => order.is_priority).length;

	// Calculate load level for visual indication
	const getLoadLevel = () => {
		const totalOrders = orders.length;
		if (totalOrders === 0) return 'idle';
		if (totalOrders <= 2) return 'light';
		if (totalOrders <= 5) return 'moderate';
		return 'heavy';
	};

	// Get appropriate colors based on load and status
	const getCardColors = () => {
		if (!is_active) {
			return {
				border: 'border-gray-300',
				header: 'bg-gray-100',
				text: 'text-gray-500'
			};
		}

		const loadLevel = getLoadLevel();
		switch (loadLevel) {
			case 'idle':
				return {
					border: 'border-green-200 hover:border-green-300',
					header: 'bg-green-50',
					text: 'text-green-700'
				};
			case 'light':
				return {
					border: 'border-blue-200 hover:border-blue-300',
					header: 'bg-blue-50',
					text: 'text-blue-700'
				};
			case 'moderate':
				return {
					border: 'border-yellow-200 hover:border-yellow-300',
					header: 'bg-yellow-50',
					text: 'text-yellow-700'
				};
			case 'heavy':
				return {
					border: 'border-red-200 hover:border-red-300',
					header: 'bg-red-50',
					text: 'text-red-700'
				};
			default:
				return {
					border: 'border-gray-200 hover:border-gray-300',
					header: 'bg-gray-50',
					text: 'text-gray-700'
				};
		}
	};

	const formatDuration = (minutes) => {
		if (!minutes || minutes <= 0) return 'N/A';
		if (minutes < 1) return '< 1m';
		const hours = Math.floor(minutes / 60);
		const mins = Math.floor(minutes % 60);
		return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
	};

	const colors = getCardColors();

	return (
		<Card
			className={`${colors.border} transition-all duration-200 hover:shadow-md cursor-pointer ${
				isLoading ? 'opacity-75' : ''
			}`}
			onClick={() => onClick && onClick(zone_id)}
		>
			<CardHeader className={`${colors.header} pb-3`}>
				<CardTitle className="flex items-center justify-between">
					<div className="flex items-center space-x-2">
						{zone_type === 'qc' ? (
							<Eye className="h-5 w-5 text-purple-600" />
						) : (
							<ChefHat className="h-5 w-5 text-blue-600" />
						)}
						<span className="text-sm font-medium text-gray-900">
							{zone_name || zone_id}
						</span>
					</div>
					<div className="flex items-center space-x-1">
						{!is_active && (
							<AlertCircle className="h-4 w-4 text-gray-400" />
						)}
						{priorityCount > 0 && (
							<div className="flex items-center space-x-1">
								<Star className="h-4 w-4 text-yellow-500 fill-current" />
								<span className="text-xs font-medium text-yellow-600">
									{priorityCount}
								</span>
							</div>
						)}
					</div>
				</CardTitle>
			</CardHeader>

			<CardContent className="space-y-4">
				{/* Order Status Overview */}
				<div>
					<div className="flex items-center justify-between mb-2">
						<span className="text-xs text-gray-600">Active Orders</span>
						<span className={`text-sm font-semibold ${colors.text}`}>
							{orders.length}
						</span>
					</div>

					{orders.length > 0 && (
						<div className="space-y-1">
							{pendingCount > 0 && (
								<div className="flex items-center justify-between text-xs">
									<span className="text-gray-600">New</span>
									<span className="text-blue-600 font-medium">{pendingCount}</span>
								</div>
							)}
							{inProgressCount > 0 && (
								<div className="flex items-center justify-between text-xs">
									<span className="text-gray-600">Preparing</span>
									<span className="text-orange-600 font-medium">{inProgressCount}</span>
								</div>
							)}
							{readyCount > 0 && (
								<div className="flex items-center justify-between text-xs">
									<span className="text-gray-600">Ready</span>
									<span className="text-green-600 font-medium">{readyCount}</span>
								</div>
							)}
						</div>
					)}
				</div>

				{/* Zone Metrics */}
				<div className="pt-2 border-t border-gray-100">
					<div className="grid grid-cols-2 gap-3 text-xs">
						<div className="text-center">
							<div className="text-gray-500 mb-1">Today</div>
							<div className="font-semibold text-gray-900">
								{metrics.completed_today || 0}
							</div>
						</div>
						<div className="text-center">
							<div className="text-gray-500 mb-1">Per Hour</div>
							<div className="font-semibold text-gray-900">
								{metrics.orders_per_hour || 0}
							</div>
						</div>
					</div>

					{metrics.avg_prep_time > 0 && (
						<div className="mt-2 text-center">
							<div className="text-gray-500 text-xs mb-1">Avg Prep Time</div>
							<div className="flex items-center justify-center space-x-1">
								<Clock className="h-3 w-3 text-gray-400" />
								<span className="text-xs font-medium text-gray-700">
									{formatDuration(metrics.avg_prep_time)}
								</span>
							</div>
						</div>
					)}
				</div>

				{/* Status Indicator */}
				<div className="flex items-center justify-center pt-2">
					<div className={`flex items-center space-x-1 text-xs ${colors.text}`}>
						{is_active ? (
							<>
								<Activity className="h-3 w-3" />
								<span className="font-medium">
									{getLoadLevel() === 'idle' ? 'Idle' :
									 getLoadLevel() === 'light' ? 'Light Load' :
									 getLoadLevel() === 'moderate' ? 'Moderate Load' :
									 'Heavy Load'}
								</span>
							</>
						) : (
							<>
								<AlertCircle className="h-3 w-3" />
								<span className="font-medium">Inactive</span>
							</>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}