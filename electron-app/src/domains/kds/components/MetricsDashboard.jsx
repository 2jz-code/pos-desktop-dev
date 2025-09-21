import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui";
import {
	BarChart3,
	TrendingUp,
	Clock,
	Users,
	Target,
	Activity,
	ChefHat,
	Timer
} from "lucide-react";

/**
 * Metrics Dashboard Component
 * Displays global kitchen performance metrics and key indicators
 */
export function MetricsDashboard({ metrics, isLoading }) {
	const {
		total_active_orders = 0,
		avg_prep_time_all_zones = 0,
		total_orders_per_hour = 0,
		total_completed_today = 0,
		busiest_zone = null,
		total_zones = 0,
		active_zones = 0
	} = metrics;

	const formatDuration = (minutes) => {
		if (!minutes || minutes <= 0) return 'N/A';
		if (minutes < 1) return '< 1m';
		const hours = Math.floor(minutes / 60);
		const mins = Math.floor(minutes % 60);
		return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
	};

	const getPerformanceIndicator = () => {
		if (total_active_orders === 0) return { color: 'text-gray-500', status: 'Idle' };
		if (total_active_orders <= 5) return { color: 'text-green-600', status: 'Good' };
		if (total_active_orders <= 15) return { color: 'text-yellow-600', status: 'Busy' };
		return { color: 'text-red-600', status: 'Very Busy' };
	};

	const performance = getPerformanceIndicator();

	const metricCards = [
		{
			title: "Active Orders",
			value: total_active_orders,
			icon: <ChefHat className="h-5 w-5 text-blue-600" />,
			description: "Orders in progress",
			color: performance.color
		},
		{
			title: "Orders Per Hour",
			value: total_orders_per_hour,
			icon: <TrendingUp className="h-5 w-5 text-green-600" />,
			description: "Current throughput",
			color: "text-green-600"
		},
		{
			title: "Completed Today",
			value: total_completed_today,
			icon: <Target className="h-5 w-5 text-purple-600" />,
			description: "Total orders completed",
			color: "text-purple-600"
		},
		{
			title: "Avg Prep Time",
			value: formatDuration(avg_prep_time_all_zones),
			icon: <Clock className="h-5 w-5 text-orange-600" />,
			description: "Across all zones",
			color: "text-orange-600"
		}
	];

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center space-x-3">
					<BarChart3 className="h-6 w-6 text-blue-600" />
					<div>
						<h2 className="text-xl font-semibold text-gray-900">
							Kitchen Performance
						</h2>
						<p className="text-sm text-gray-600">
							Real-time metrics and key performance indicators
						</p>
					</div>
				</div>
				<div className="flex items-center space-x-2">
					<Activity className={`h-5 w-5 ${performance.color}`} />
					<span className={`text-sm font-medium ${performance.color}`}>
						{performance.status}
					</span>
				</div>
			</div>

			{/* Metrics Grid */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				{metricCards.map((metric, index) => (
					<Card key={index} className="border-gray-200 hover:shadow-md transition-shadow duration-200">
						<CardHeader className="pb-2">
							<CardTitle className="flex items-center justify-between">
								<div className="flex items-center space-x-2">
									{metric.icon}
									<span className="text-sm font-medium text-gray-700">
										{metric.title}
									</span>
								</div>
								{isLoading && (
									<div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
								)}
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-1">
								<div className={`text-2xl font-bold ${metric.color}`}>
									{metric.value}
								</div>
								<p className="text-xs text-gray-500">
									{metric.description}
								</p>
							</div>
						</CardContent>
					</Card>
				))}
			</div>

			{/* Summary Cards */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				{/* Zone Status */}
				<Card className="border-gray-200">
					<CardHeader className="pb-3">
						<CardTitle className="flex items-center space-x-2">
							<Users className="h-5 w-5 text-blue-600" />
							<span className="text-sm font-medium text-gray-700">Zone Status</span>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<span className="text-sm text-gray-600">Active Zones</span>
								<span className="text-sm font-semibold text-green-600">
									{active_zones}
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-sm text-gray-600">Total Zones</span>
								<span className="text-sm font-semibold text-gray-900">
									{total_zones}
								</span>
							</div>
							<div className="w-full bg-gray-200 rounded-full h-2 mt-2">
								<div
									className="bg-green-600 h-2 rounded-full transition-all duration-300"
									style={{
										width: total_zones > 0 ? `${(active_zones / total_zones) * 100}%` : '0%'
									}}
								></div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Busiest Zone */}
				<Card className="border-gray-200">
					<CardHeader className="pb-3">
						<CardTitle className="flex items-center space-x-2">
							<Timer className="h-5 w-5 text-orange-600" />
							<span className="text-sm font-medium text-gray-700">Busiest Zone</span>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{busiest_zone ? (
								<>
									<div className="flex items-center justify-between">
										<span className="text-sm text-gray-600">Zone</span>
										<span className="text-sm font-semibold text-orange-600">
											{busiest_zone}
										</span>
									</div>
									<div className="text-xs text-gray-500">
										Highest active order count
									</div>
								</>
							) : (
								<div className="text-center py-2">
									<span className="text-sm text-gray-500">No active zones</span>
								</div>
							)}
						</div>
					</CardContent>
				</Card>

				{/* Performance Summary */}
				<Card className="border-gray-200">
					<CardHeader className="pb-3">
						<CardTitle className="flex items-center space-x-2">
							<Activity className="h-5 w-5 text-purple-600" />
							<span className="text-sm font-medium text-gray-700">Performance</span>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<span className="text-sm text-gray-600">Status</span>
								<span className={`text-sm font-semibold ${performance.color}`}>
									{performance.status}
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-sm text-gray-600">Load</span>
								<span className="text-sm font-semibold text-gray-900">
									{total_active_orders} orders
								</span>
							</div>
							<div className="text-xs text-gray-500">
								Kitchen operational status
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}