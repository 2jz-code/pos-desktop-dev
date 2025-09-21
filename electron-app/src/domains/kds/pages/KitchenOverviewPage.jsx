import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui";
import {
	ArrowLeft,
	RefreshCw,
	Monitor,
	Wifi,
	WifiOff,
	BarChart3,
	TrendingUp,
	Clock,
	Users
} from "lucide-react";
import { OverviewZoneCard } from "../components/OverviewZoneCard";
import { MetricsDashboard } from "../components/MetricsDashboard";
import { useKitchenOverview } from "../hooks/useKitchenOverview";

/**
 * Kitchen Overview Page
 * Displays a bird's-eye view of all kitchen zones with real-time metrics
 */
export function KitchenOverviewPage() {
	const navigate = useNavigate();
	const [isRealTime, setIsRealTime] = useState(true);

	const {
		overviewData,
		connectionStatus,
		isLoading,
		error,
		refreshOverview,
		disconnect
	} = useKitchenOverview();

	// No polling needed - using real-time WebSocket updates

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			disconnect();
		};
	}, [disconnect]);

	const handleBackToZoneSelection = () => {
		navigate("/kds-zone-selection");
	};

	const handleManualRefresh = () => {
		refreshOverview();
	};

	const handleZoneClick = (zoneId) => {
		// Store selected zone and navigate to individual zone view
		localStorage.setItem("kds-selected-zone", zoneId);
		navigate("/kds");
	};

	// Get connection status indicator
	const getConnectionStatusIcon = () => {
		switch (connectionStatus) {
			case 'connected':
				return <Wifi className="h-4 w-4 text-green-500" />;
			case 'connecting':
				return <RefreshCw className="h-4 w-4 text-yellow-500 animate-spin" />;
			case 'disconnected':
			case 'error':
				return <WifiOff className="h-4 w-4 text-red-500" />;
			default:
				return <WifiOff className="h-4 w-4 text-gray-500" />;
		}
	};

	const zones = overviewData?.zones || [];
	const globalMetrics = overviewData?.global_metrics || {};

	return (
		<div className="min-h-screen" style={{ backgroundColor: '#FFFFF0' }}>
			{/* Header */}
			<div className="bg-white/80 backdrop-blur-sm shadow-sm border-b border-gray-200/50">
				<div className="px-6 py-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center space-x-4">
							<div className="flex items-center space-x-3">
								<Monitor className="h-6 w-6 text-blue-600" />
								<div>
									<h1 className="text-xl font-semibold text-gray-900">
										Kitchen Overview
									</h1>
									<p className="text-sm text-gray-600">
										Real-time monitoring of all kitchen zones
									</p>
								</div>
							</div>
							<div className="flex items-center space-x-2 text-sm text-gray-500">
								{getConnectionStatusIcon()}
								<span className="capitalize">{connectionStatus}</span>
							</div>
						</div>

						<div className="flex items-center space-x-3">
							{/* Real-time Status Indicator */}
							<div className="flex items-center space-x-2">
								<div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-sm font-medium ${
									connectionStatus === 'connected'
										? 'bg-green-100 text-green-800 border border-green-200'
										: connectionStatus === 'connecting'
										? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
										: 'bg-red-100 text-red-800 border border-red-200'
								}`}>
									{connectionStatus === 'connected' ? (
										<>
											<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
											<span>Live</span>
										</>
									) : connectionStatus === 'connecting' ? (
										<>
											<RefreshCw className="w-3 h-3 animate-spin" />
											<span>Connecting</span>
										</>
									) : (
										<>
											<div className="w-2 h-2 bg-red-500 rounded-full" />
											<span>Offline</span>
										</>
									)}
								</div>
							</div>

							<Button
								onClick={handleManualRefresh}
								variant="outline"
								size="sm"
								disabled={isLoading || connectionStatus !== 'connected'}
								className="hover:bg-blue-50"
							>
								<RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
								{isLoading ? 'Refreshing...' : 'Refresh Now'}
							</Button>

							<Button
								onClick={handleBackToZoneSelection}
								variant="outline"
								size="sm"
							>
								<ArrowLeft className="h-4 w-4 mr-2" />
								Zone Selection
							</Button>
						</div>
					</div>
				</div>
			</div>

			{/* Main Content */}
			<div className="p-6">
				{isLoading && zones.length === 0 ? (
					<div className="flex items-center justify-center py-12">
						<RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
						<span className="ml-2 text-gray-600">Loading kitchen overview...</span>
					</div>
				) : error ? (
					<div className="flex items-center justify-center py-12">
						<WifiOff className="h-8 w-8 text-red-400" />
						<div className="ml-3 text-center">
							<h3 className="text-lg font-medium text-gray-900 mb-2">
								Connection Error
							</h3>
							<p className="text-gray-500 mb-4">{error}</p>
							<Button onClick={handleManualRefresh} size="sm">
								<RefreshCw className="h-4 w-4 mr-2" />
								Try Again
							</Button>
						</div>
					</div>
				) : (
					<div className="space-y-6">
						{/* Global Metrics Dashboard */}
						<MetricsDashboard
							metrics={globalMetrics}
							isLoading={isLoading}
						/>

						{/* Zones Grid */}
						<div>
							<div className="flex items-center justify-between mb-4">
								<div className="flex items-center space-x-3">
									<h2 className="text-lg font-semibold text-gray-900">
										Kitchen Zones ({globalMetrics.active_zones}/{globalMetrics.total_zones} active)
									</h2>
									{connectionStatus === 'connected' && (
										<div className="flex items-center space-x-1 text-sm text-green-600">
											<div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
											<span>Real-time updates</span>
										</div>
									)}
								</div>
								{overviewData?.timestamp && (
									<p className="text-sm text-gray-500">
										<Clock className="h-4 w-4 inline mr-1" />
										Last updated: {new Date(overviewData.timestamp).toLocaleTimeString()}
									</p>
								)}
							</div>

							{zones.length === 0 ? (
								<Card>
									<CardContent className="py-12 text-center">
										<Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
										<h3 className="text-lg font-medium text-gray-900 mb-2">
											No Kitchen Zones Configured
										</h3>
										<p className="text-gray-500">
											Configure kitchen zones in settings to see the overview
										</p>
									</CardContent>
								</Card>
							) : (
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
									{zones.map((zone) => (
										<OverviewZoneCard
											key={zone.zone_id}
											zone={zone}
											onClick={() => handleZoneClick(zone.zone_id)}
											isLoading={isLoading}
										/>
									))}
								</div>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}