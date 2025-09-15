import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui";
import { ChefHat, Settings, RefreshCw, ArrowLeft } from "lucide-react";
import { OrderCard } from "../components/OrderCard";
import { ZoneSwitcher } from "../components/ZoneSwitcher";

/**
 * Main KDS Display Page
 * Shows orders for the selected kitchen zone with status management
 */
export function KDSPage() {
	const navigate = useNavigate();
	const [selectedZone, setSelectedZone] = useState(() => {
		return localStorage.getItem("kds-selected-zone") || "";
	});
	const [orders, setOrders] = useState([]);
	const [isLoading, setIsLoading] = useState(true);

	// Simulate loading orders (will be replaced with real API call)
	useEffect(() => {
		const loadOrders = () => {
			setIsLoading(true);
			// Simulate API delay
			setTimeout(() => {
				// Mock orders data
				const mockOrders = [
					{
						id: "001",
						orderNumber: "POS-001",
						customerName: "John Doe",
						orderType: "dine-in",
						status: "new",
						timeReceived: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
						items: [
							{ name: "Burger", quantity: 1, specialInstructions: "No onions" },
							{ name: "Fries", quantity: 1, specialInstructions: "" },
							{ name: "Coke", quantity: 1, specialInstructions: "" }
						]
					},
					{
						id: "002",
						orderNumber: "POS-002",
						customerName: "Jane Smith",
						orderType: "takeout",
						status: "preparing",
						timeReceived: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
						items: [
							{ name: "Pizza Margherita", quantity: 1, specialInstructions: "Extra cheese" },
							{ name: "Garlic Bread", quantity: 2, specialInstructions: "" }
						]
					},
					{
						id: "003",
						orderNumber: "WEB-003",
						customerName: "Bob Wilson",
						orderType: "delivery",
						status: "ready",
						timeReceived: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
						items: [
							{ name: "Pasta Carbonara", quantity: 1, specialInstructions: "Less salt" },
							{ name: "Caesar Salad", quantity: 1, specialInstructions: "Dressing on side" }
						]
					}
				];
				setOrders(mockOrders);
				setIsLoading(false);
			}, 1000);
		};

		if (selectedZone) {
			loadOrders();
		} else {
			// If no zone selected, redirect to zone selection
			navigate("/kds-zone-selection");
		}
	}, [selectedZone, navigate]);

	const handleZoneChange = (newZone) => {
		setSelectedZone(newZone);
		localStorage.setItem("kds-selected-zone", newZone);
	};

	const handleOrderStatusChange = (orderId, newStatus) => {
		setOrders(prevOrders =>
			prevOrders.map(order =>
				order.id === orderId ? { ...order, status: newStatus } : order
			)
		);
	};

	const handleBackToZoneSelection = () => {
		navigate("/kds-zone-selection");
	};

	const handleRefresh = () => {
		// Trigger a refresh of orders
		setIsLoading(true);
		setTimeout(() => setIsLoading(false), 500);
	};

	// Filter orders by status for display organization
	const newOrders = orders.filter(order => order.status === "new");
	const preparingOrders = orders.filter(order => order.status === "preparing");
	const readyOrders = orders.filter(order => order.status === "ready");

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
							<div className="text-sm text-gray-500">
								Zone: <span className="font-medium text-gray-900">{selectedZone}</span>
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
								disabled={isLoading}
							>
								<RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
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
				{isLoading ? (
					<div className="flex items-center justify-center py-12">
						<RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
						<span className="ml-2 text-gray-600">Loading orders...</span>
					</div>
				) : (
					<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
						{/* New Orders Column */}
						<div className="space-y-4">
							<div className="bg-blue-50 p-3 rounded-lg border-l-4 border-blue-500">
								<h2 className="font-semibold text-blue-900 flex items-center">
									New Orders
									<span className="ml-2 bg-blue-200 text-blue-800 text-xs px-2 py-1 rounded-full">
										{newOrders.length}
									</span>
								</h2>
							</div>
							{newOrders.length === 0 ? (
								<Card className="p-6 text-center text-gray-500">
									No new orders
								</Card>
							) : (
								newOrders.map(order => (
									<OrderCard
										key={order.id}
										order={order}
										onStatusChange={handleOrderStatusChange}
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
										{preparingOrders.length}
									</span>
								</h2>
							</div>
							{preparingOrders.length === 0 ? (
								<Card className="p-6 text-center text-gray-500">
									No orders being prepared
								</Card>
							) : (
								preparingOrders.map(order => (
									<OrderCard
										key={order.id}
										order={order}
										onStatusChange={handleOrderStatusChange}
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
										{readyOrders.length}
									</span>
								</h2>
							</div>
							{readyOrders.length === 0 ? (
								<Card className="p-6 text-center text-gray-500">
									No orders ready
								</Card>
							) : (
								readyOrders.map(order => (
									<OrderCard
										key={order.id}
										order={order}
										onStatusChange={handleOrderStatusChange}
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