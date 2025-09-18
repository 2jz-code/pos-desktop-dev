import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui";
import { ChefHat, Settings, RefreshCw, ArrowLeft, Wifi, WifiOff } from "lucide-react";
import { KitchenOrderCard } from "../components/KitchenOrderCard";
import { KitchenZoneOrderCard } from "../components/KitchenZoneOrderCard";
import { QCOrderCard } from "../components/QCOrderCard";
import { ZoneSwitcher } from "../components/ZoneSwitcher";
import { useKDSWebSocket } from "../hooks/useKDSWebSocket";

/**
 * Main KDS Display Page
 * Shows orders for the selected kitchen zone with status management
 */
export function KDSPage() {
	const navigate = useNavigate();
	const [selectedZone, setSelectedZone] = useState(() => {
		return localStorage.getItem("kds-selected-zone") || "";
	});

	// Use WebSocket hook for real-time KDS data
	const {
		zoneData,
		categorizedData,
		zoneType,
		isQCStation,
		alerts,
		connectionStatus,
		isConnected,
		updateItemStatus,
		markItemPriority,
		addKitchenNote,
		updateQCStatus,
		addQCNote,
		reconnect
	} = useKDSWebSocket(selectedZone);

	// Redirect to zone selection if no zone is selected
	useEffect(() => {
		if (!selectedZone) {
			navigate("/kds-zone-selection");
		}
	}, [selectedZone, navigate]);

	const handleZoneChange = (newZone) => {
		setSelectedZone(newZone);
		localStorage.setItem("kds-selected-zone", newZone);
	};

	const handleItemStatusChange = (itemId, newStatus) => {
		// For kitchen zones - update individual item status
		updateItemStatus(itemId, newStatus);
	};

	const handleQCStatusChange = (qcViewId, newStatus, notes = null) => {
		// For QC zones - update order QC status
		updateQCStatus(qcViewId, newStatus, notes);
	};

	const handleAddNote = (id, note) => {
		if (zoneType === "qc") {
			addQCNote(id, note);
		} else {
			addKitchenNote(id, note);
		}
	};

	const handleBackToZoneSelection = () => {
		navigate("/kds-zone-selection");
	};

	const handleRefresh = () => {
		// Reconnect WebSocket to refresh data
		reconnect();
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

	return (
		<div className="min-h-screen bg-gray-50">
			{/* Header */}
			<div className="bg-white shadow-sm border-b">
				<div className="px-6 py-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center space-x-4">
							<div className="flex items-center space-x-2">
								<ChefHat className="h-8 w-8 text-green-600" />
								<h1 className="text-2xl font-bold text-gray-900">
									Kitchen Display System
								</h1>
							</div>
							<div className="flex items-center space-x-4">
								<div className="text-sm text-gray-500">
									Zone: <span className="font-medium text-gray-900">{selectedZone}</span>
									<span className={`ml-2 text-xs px-2 py-1 rounded-full ${
										zoneType === 'qc'
											? 'bg-purple-100 text-purple-800'
											: 'bg-blue-100 text-blue-800'
									}`}>
										{zoneType === 'qc' ? 'QC Station' : 'Kitchen Station'}
									</span>
								</div>
								<div className="flex items-center space-x-2 text-sm text-gray-500">
									{getConnectionStatusIcon()}
									<span className="capitalize">{connectionStatus}</span>
								</div>
							</div>
						</div>

						<div className="flex items-center space-x-3">
							<ZoneSwitcher
								selectedZone={selectedZone}
								onZoneChange={handleZoneChange}
							/>
							<Button
								onClick={handleRefresh}
								variant="outline"
								size="sm"
								disabled={connectionStatus === 'connecting'}
							>
								<RefreshCw className={`h-4 w-4 mr-2 ${connectionStatus === 'connecting' ? 'animate-spin' : ''}`} />
								Refresh
							</Button>
							<Button
								onClick={handleBackToZoneSelection}
								variant="outline"
								size="sm"
							>
								<ArrowLeft className="h-4 w-4 mr-2" />
								Change Zone
							</Button>
						</div>
					</div>
				</div>
			</div>

			{/* Main Content */}
			<div className="p-6">
				{connectionStatus === 'connecting' ? (
					<div className="flex items-center justify-center py-12">
						<RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
						<span className="ml-2 text-gray-600">Connecting to kitchen display...</span>
					</div>
				) : connectionStatus === 'disconnected' || connectionStatus === 'error' ? (
					<div className="flex items-center justify-center py-12">
						<WifiOff className="h-8 w-8 text-red-400" />
						<span className="ml-2 text-gray-600">
							Connection lost.
							<button
								onClick={handleRefresh}
								className="ml-2 text-blue-600 hover:text-blue-800 underline"
							>
								Reconnect
							</button>
						</span>
					</div>
				) : zoneType === 'qc' ? (
						/* QC Zone Layout - Single grid with all orders (watcher mode) */
						<div>
							<div className="mb-6 bg-purple-50 p-3 rounded-lg border-l-4 border-purple-500">
								<h2 className="font-semibold text-purple-900 flex items-center">
									Quality Control Station - Watcher Mode
									<span className="ml-2 bg-purple-200 text-purple-800 text-xs px-2 py-1 rounded-full">
										{(categorizedData.ready_for_qc?.length || 0) + (categorizedData.waiting?.length || 0)} orders
									</span>
									<span className="ml-2 bg-green-200 text-green-800 text-xs px-2 py-1 rounded-full">
										{categorizedData.ready_for_qc?.length || 0} ready
									</span>
								</h2>
								<p className="text-sm text-purple-700 mt-1">Monitoring all orders - tap ready orders to complete and serve</p>
							</div>

							<div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-4">
								{/* Show all orders: both waiting and ready */}
								{[...(categorizedData.waiting || []), ...(categorizedData.ready_for_qc || [])].length === 0 ? (
									<Card className="p-6 text-center text-gray-500 col-span-full">
										No active orders to monitor
									</Card>
								) : (
									<>
										{/* Waiting Orders First */}
										{(categorizedData.waiting || []).map(order => (
											<QCOrderCard
												key={order.id}
												order={order}
												onStatusChange={handleQCStatusChange}
											/>
										))}
										{/* Ready Orders */}
										{(categorizedData.ready_for_qc || []).map(order => (
											<QCOrderCard
												key={order.id}
												order={order}
												onStatusChange={handleQCStatusChange}
											/>
										))}
									</>
								)}
							</div>
						</div>
				) : (
						/* Kitchen Zone Layout - Order-level cards with item management */
						<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
							{/* New Orders Column */}
							<div className="space-y-4">
								<div className="bg-blue-50 p-3 rounded-lg border-l-4 border-blue-500">
									<h2 className="font-semibold text-blue-900 flex items-center">
										New Orders
										<span className="ml-2 bg-blue-200 text-blue-800 text-xs px-2 py-1 rounded-full">
											{categorizedData.new?.length || 0}
										</span>
									</h2>
								</div>
								{!categorizedData.new?.length ? (
									<Card className="p-6 text-center text-gray-500">
										No new orders
									</Card>
								) : (
									categorizedData.new.map(order => (
										<KitchenZoneOrderCard
											key={order.id}
											order={order}
											onItemStatusChange={handleItemStatusChange}
											onAddNote={handleAddNote}
										/>
									))
								)}
							</div>

							{/* Preparing Orders Column */}
							<div className="space-y-4">
								<div className="bg-yellow-50 p-3 rounded-lg border-l-4 border-yellow-500">
									<h2 className="font-semibold text-yellow-900 flex items-center">
										Preparing
										<span className="ml-2 bg-yellow-200 text-yellow-800 text-xs px-2 py-1 rounded-full">
											{categorizedData.preparing?.length || 0}
										</span>
									</h2>
								</div>
								{!categorizedData.preparing?.length ? (
									<Card className="p-6 text-center text-gray-500">
										No orders being prepared
									</Card>
								) : (
									categorizedData.preparing.map(order => (
										<KitchenZoneOrderCard
											key={order.id}
											order={order}
											onItemStatusChange={handleItemStatusChange}
											onAddNote={handleAddNote}
										/>
									))
								)}
							</div>

							{/* Ready Orders Column */}
							<div className="space-y-4">
								<div className="bg-green-50 p-3 rounded-lg border-l-4 border-green-500">
									<h2 className="font-semibold text-green-900 flex items-center">
										Ready
										<span className="ml-2 bg-green-200 text-green-800 text-xs px-2 py-1 rounded-full">
											{categorizedData.ready?.length || 0}
										</span>
									</h2>
								</div>
								{!categorizedData.ready?.length ? (
									<Card className="p-6 text-center text-gray-500">
										No orders ready
									</Card>
								) : (
									categorizedData.ready.map(order => (
										<KitchenZoneOrderCard
											key={order.id}
											order={order}
											onItemStatusChange={handleItemStatusChange}
											onAddNote={handleAddNote}
										/>
									))
								)}
							</div>
						</div>
				)}
			</div>
		</div>
	);
}