import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRolePermissions } from "@/shared/hooks/useRolePermissions";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/shared/components/ui/tabs";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
	Package,
	AlertTriangle,
	TrendingDown,
	DollarSign,
	Plus,
	RefreshCw,
	ArrowUpDown,
	MapPin,
	MoreVertical,
	Edit,
	Trash2,
	Building,
} from "lucide-react";
import { usePosStore } from "@/domains/pos/store/posStore";
import StockAdjustmentDialog from "@/domains/inventory/components/StockAdjustmentDialog";
import LocationManagementDialog from "@/domains/inventory/components/LocationManagementDialog";
import StockTransferDialog from "@/domains/inventory/components/StockTransferDialog";
import { useInventoryBarcode } from "@/shared/hooks";
import { toast } from "@/shared/components/ui/use-toast";

const InventoryPage = () => {
	const { user: _user } = useAuth();
	const permissions = useRolePermissions();
	const [highlightedProductId, setHighlightedProductId] = useState(null);

	// Barcode scanning refs
	const barcodeInputRef = useRef("");
	const lastKeystrokeRef = useRef(0);

	// Get inventory state and actions from the store
	const {
		dashboardData,
		stockData,
		locations,
		isLoading,
		error,
		loadInventoryData,
		refreshData,
		deleteLocation,
		clearError,
		setStockAdjustmentDialog,
		setLocationDialog,
		setStockTransferDialog,
		isStockAdjustmentDialogOpen,
		isLocationDialogOpen,
		isStockTransferDialogOpen,
		currentEditingLocation,
		currentLocationMode,
		// Product slice actions
		fetchProducts,
	} = usePosStore((state) => ({
		dashboardData: state.dashboardData,
		stockData: state.stockData,
		locations: state.locations,
		isLoading: state.isLoading,
		error: state.error,
		loadInventoryData: state.loadInventoryData,
		refreshData: state.refreshData,
		deleteLocation: state.deleteLocation,
		clearError: state.clearError,
		setStockAdjustmentDialog: state.setStockAdjustmentDialog,
		setLocationDialog: state.setLocationDialog,
		setStockTransferDialog: state.setStockTransferDialog,
		isStockAdjustmentDialogOpen: state.isStockAdjustmentDialogOpen,
		isLocationDialogOpen: state.isLocationDialogOpen,
		isStockTransferDialogOpen: state.isStockTransferDialogOpen,
		currentEditingLocation: state.currentEditingLocation,
		currentLocationMode: state.currentLocationMode,
		// Product slice
		fetchProducts: state.fetchProducts,
	}));

	// Smart barcode scanning - automatically shows stock info for scanned product
	const { scanBarcode, isScanning } = useInventoryBarcode((stockInfo) => {
		// Highlight the found product
		const productId = stockInfo.product.id;
		setHighlightedProductId(productId);

		// Show stock details in a toast
		toast({
			title: `Stock Found: ${stockInfo.product.name}`,
			description: `${stockInfo.stock.quantity} units available at ${stockInfo.stock.location}`,
			duration: 5000,
		});

		// Clear highlight after 5 seconds
		setTimeout(() => setHighlightedProductId(null), 5000);
	});

	useEffect(() => {
		// Load both inventory data and products
		loadInventoryData();
		fetchProducts();
	}, [loadInventoryData, fetchProducts]);

	// Global barcode listener for inventory page
	useEffect(() => {
		const handleKeyPress = (e) => {
			// Don't capture if user is typing in inputs or dialogs are open
			if (
				e.target.tagName === "INPUT" ||
				e.target.tagName === "TEXTAREA" ||
				isStockAdjustmentDialogOpen ||
				isLocationDialogOpen ||
				isStockTransferDialogOpen
			) {
				return;
			}

			const now = Date.now();
			const timeDiff = now - lastKeystrokeRef.current;

			if (timeDiff < 100) {
				barcodeInputRef.current += e.key;
			} else {
				barcodeInputRef.current = e.key;
			}

			lastKeystrokeRef.current = now;

			if (e.key === "Enter" && barcodeInputRef.current.length > 1) {
				const barcode = barcodeInputRef.current.replace("Enter", "");
				if (barcode.length >= 3) {
					e.preventDefault();
					scanBarcode(barcode);
				}
				barcodeInputRef.current = "";
			}

			setTimeout(() => {
				if (
					Date.now() - lastKeystrokeRef.current > 500 &&
					barcodeInputRef.current.length >= 8
				) {
					const barcode = barcodeInputRef.current;
					if (barcode.length >= 3) {
						scanBarcode(barcode);
					}
					barcodeInputRef.current = "";
				}
			}, 600);
		};

		document.addEventListener("keypress", handleKeyPress);
		return () => document.removeEventListener("keypress", handleKeyPress);
	}, [
		scanBarcode,
		isStockAdjustmentDialogOpen,
		isLocationDialogOpen,
		isStockTransferDialogOpen,
	]);

	// Check if user has permission to access inventory
	if (!permissions.canAccessProducts()) {
		return (
			<div className="flex items-center justify-center h-full">
				<Alert className="max-w-md">
					<AlertTriangle className="h-4 w-4" />
					<AlertDescription>
						You don't have permission to access inventory management.
					</AlertDescription>
				</Alert>
			</div>
		);
	}

	const handleDeleteLocation = async (locationId) => {
		if (
			!confirm(
				"Are you sure you want to delete this location? This action cannot be undone."
			)
		) {
			return;
		}

		await deleteLocation(locationId);
	};

	const formatCurrency = (amount) => {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
		}).format(amount);
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="flex items-center gap-2">
					<RefreshCw className="h-4 w-4 animate-spin" />
					<span>Loading inventory data...</span>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="p-6">
				<Alert variant="destructive">
					<AlertTriangle className="h-4 w-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
				<div className="flex gap-2 mt-4">
					<Button onClick={refreshData}>
						<RefreshCw className="h-4 w-4 mr-2" />
						Retry
					</Button>
					<Button
						onClick={clearError}
						variant="outline"
					>
						Dismiss
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
			{/* Header */}
			<div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b">
				<div className="p-6">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-3xl font-bold">Inventory Management</h1>
							<p className="text-muted-foreground">
								Location:{" "}
								<span className="font-medium">{dashboardData?.location}</span>
							</p>
						</div>
						<div className="flex gap-2">
							<Button
								onClick={refreshData}
								variant="outline"
							>
								<RefreshCw className="h-4 w-4 mr-2" />
								Refresh
							</Button>
							{permissions.canAccessSettings() && (
								<>
									<Button
										onClick={() => setStockTransferDialog(true)}
										variant="outline"
									>
										<ArrowUpDown className="h-4 w-4 mr-2" />
										Transfer Stock
									</Button>
									<Button onClick={() => setStockAdjustmentDialog(true)}>
										<Plus className="h-4 w-4 mr-2" />
										Adjust Stock
									</Button>
								</>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-hidden">
				<Tabs
					defaultValue="overview"
					className="h-full flex flex-col"
				>
					<div className="flex-shrink-0 px-6 pt-6">
						<TabsList className="grid w-full grid-cols-3">
							<TabsTrigger value="overview">Overview</TabsTrigger>
							<TabsTrigger value="stock">Stock Management</TabsTrigger>
							<TabsTrigger value="locations">Locations</TabsTrigger>
						</TabsList>
					</div>

					<div className="flex-1 overflow-auto px-6 pb-6">
						{/* Overview Tab */}
						<TabsContent
							value="overview"
							className="space-y-6 mt-6"
						>
							{/* Summary Cards */}
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
								<Card>
									<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
										<CardTitle className="text-sm font-medium">
											Total Products
										</CardTitle>
										<Package className="h-4 w-4 text-muted-foreground" />
									</CardHeader>
									<CardContent>
										<div className="text-2xl font-bold">
											{dashboardData?.summary?.total_products || 0}
										</div>
									</CardContent>
								</Card>

								<Card>
									<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
										<CardTitle className="text-sm font-medium">
											Low Stock Items
										</CardTitle>
										<AlertTriangle className="h-4 w-4 text-amber-500" />
									</CardHeader>
									<CardContent>
										<div className="text-2xl font-bold text-amber-600">
											{dashboardData?.summary?.low_stock_count || 0}
										</div>
									</CardContent>
								</Card>

								<Card>
									<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
										<CardTitle className="text-sm font-medium">
											Out of Stock
										</CardTitle>
										<TrendingDown className="h-4 w-4 text-red-500" />
									</CardHeader>
									<CardContent>
										<div className="text-2xl font-bold text-red-600">
											{dashboardData?.summary?.out_of_stock_count || 0}
										</div>
									</CardContent>
								</Card>

								<Card>
									<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
										<CardTitle className="text-sm font-medium">
											Total Value
										</CardTitle>
										<DollarSign className="h-4 w-4 text-muted-foreground" />
									</CardHeader>
									<CardContent>
										<div className="text-2xl font-bold">
											{formatCurrency(dashboardData?.summary?.total_value || 0)}
										</div>
									</CardContent>
								</Card>
							</div>

							{/* Low Stock Alert */}
							{dashboardData?.low_stock_items?.length > 0 && (
								<Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50">
									<CardHeader className="pb-3">
										<div className="flex items-center gap-2">
											<AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
											<CardTitle className="text-lg text-amber-800 dark:text-amber-200">
												Low Stock Alert
											</CardTitle>
										</div>
										<CardDescription className="text-amber-700 dark:text-amber-300">
											{dashboardData.low_stock_items.length} items are running
											low on stock and need attention
										</CardDescription>
									</CardHeader>
									<CardContent className="space-y-3">
										{dashboardData.low_stock_items.slice(0, 5).map((item) => (
											<div
												key={item.product_id}
												className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-amber-100 dark:border-amber-800/50 shadow-sm"
											>
												<div className="flex items-center gap-3">
													<div className="w-2 h-2 bg-amber-500 rounded-full"></div>
													<div>
														<div className="font-medium text-gray-900 dark:text-gray-100">
															{item.product_name}
														</div>
														<div className="text-sm text-gray-500 dark:text-gray-400">
															{item.quantity} units remaining
														</div>
													</div>
												</div>
												<div className="flex items-center gap-2">
													<Badge
														variant="secondary"
														className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
													>
														{item.quantity} left
													</Badge>
													{permissions.canAccessSettings() && (
														<Button
															size="sm"
															variant="outline"
															className="h-8 px-3 text-xs border-amber-200 hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900/50"
															onClick={() =>
																setStockAdjustmentDialog(true, {
																	id: item.product_id,
																	name: item.product_name,
																})
															}
														>
															<Plus className="h-3 w-3 mr-1" />
															Restock
														</Button>
													)}
												</div>
											</div>
										))}
										{dashboardData.low_stock_items.length > 5 && (
											<div className="text-center pt-2">
												<div className="text-sm text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 rounded-lg py-2 px-3">
													... and {dashboardData.low_stock_items.length - 5}{" "}
													more items need restocking
												</div>
											</div>
										)}
									</CardContent>
								</Card>
							)}
						</TabsContent>

						{/* Stock Management Tab */}
						<TabsContent
							value="stock"
							className="mt-6"
						>
							<Card>
								<CardHeader>
									<CardTitle>Current Stock Levels</CardTitle>
									<CardDescription>
										Monitor and adjust your inventory levels
									</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="space-y-4">
										{stockData.length === 0 ? (
											<div className="text-center py-8 text-muted-foreground">
												No stock data available
											</div>
										) : (
											<div className="rounded-md border">
												<table className="w-full">
													<thead>
														<tr className="border-b bg-muted/50">
															<th className="p-4 text-left font-medium">
																Product
															</th>
															<th className="p-4 text-left font-medium">
																Location
															</th>
															<th className="p-4 text-left font-medium">
																Stock Level
															</th>
															<th className="p-4 text-left font-medium">
																Status
															</th>
															<th className="p-4 text-left font-medium">
																Actions
															</th>
														</tr>
													</thead>
													<tbody>
														{stockData.map((stock) => {
															const isHighlighted =
																highlightedProductId === stock.product?.id;
															return (
																<tr
																	key={stock.id}
																	className={`border-b ${
																		isHighlighted ? "bg-orange-100" : ""
																	}`}
																>
																	<td className="p-4">
																		<div className="font-medium">
																			{stock.product?.name}
																		</div>
																		<div className="text-sm text-muted-foreground">
																			SKU: {stock.product?.sku}
																		</div>
																	</td>
																	<td className="p-4">
																		<div className="flex items-center gap-2">
																			<MapPin className="h-4 w-4 text-muted-foreground" />
																			{stock.location?.name}
																		</div>
																	</td>
																	<td className="p-4">
																		<div className="font-medium">
																			{stock.quantity}
																		</div>
																	</td>
																	<td className="p-4">
																		<Badge
																			variant={
																				stock.quantity === 0
																					? "destructive"
																					: stock.quantity <= 10
																					? "secondary"
																					: "default"
																			}
																		>
																			{stock.quantity === 0
																				? "Out of Stock"
																				: stock.quantity <= 10
																				? "Low Stock"
																				: "In Stock"}
																		</Badge>
																	</td>
																	<td className="p-4">
																		{permissions.canAccessSettings() && (
																			<DropdownMenu>
																				<DropdownMenuTrigger asChild>
																					<Button
																						variant="ghost"
																						className="h-8 w-8 p-0"
																					>
																						<span className="sr-only">
																							Open menu
																						</span>
																						<MoreVertical className="h-4 w-4" />
																					</Button>
																				</DropdownMenuTrigger>
																				<DropdownMenuContent align="end">
																					<DropdownMenuItem
																						onClick={() =>
																							setStockAdjustmentDialog(
																								true,
																								stock.product
																							)
																						}
																					>
																						<Plus className="mr-2 h-4 w-4" />
																						Adjust Stock
																					</DropdownMenuItem>
																					<DropdownMenuItem
																						onClick={() =>
																							setStockTransferDialog(
																								true,
																								stock.product
																							)
																						}
																					>
																						<ArrowUpDown className="mr-2 h-4 w-4" />
																						Transfer
																					</DropdownMenuItem>
																				</DropdownMenuContent>
																			</DropdownMenu>
																		)}
																	</td>
																</tr>
															);
														})}
													</tbody>
												</table>
											</div>
										)}
									</div>
								</CardContent>
							</Card>
						</TabsContent>

						{/* Locations Tab */}
						<TabsContent
							value="locations"
							className="mt-6"
						>
							<Card>
								<CardHeader>
									<div className="flex items-center justify-between">
										<div>
											<CardTitle>Inventory Locations</CardTitle>
											<CardDescription>
												Manage your inventory storage locations
											</CardDescription>
										</div>
										{permissions.canAccessSettings() && (
											<Button onClick={() => setLocationDialog(true)}>
												<Plus className="h-4 w-4 mr-2" />
												Add Location
											</Button>
										)}
									</div>
								</CardHeader>
								<CardContent>
									<div className="space-y-4">
										{locations.length === 0 ? (
											<div className="text-center py-8 text-muted-foreground">
												No locations configured
											</div>
										) : (
											<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
												{locations.map((location) => (
													<Card
														key={location.id}
														className="relative"
													>
														<CardHeader className="pb-3">
															<div className="flex items-start justify-between">
																<div className="flex items-center gap-2">
																	<Building className="h-5 w-5 text-muted-foreground" />
																	<CardTitle className="text-lg">
																		{location.name}
																	</CardTitle>
																</div>
																{permissions.canAccessSettings() && (
																	<DropdownMenu>
																		<DropdownMenuTrigger asChild>
																			<Button
																				variant="ghost"
																				className="h-8 w-8 p-0"
																			>
																				<span className="sr-only">
																					Open menu
																				</span>
																				<MoreVertical className="h-4 w-4" />
																			</Button>
																		</DropdownMenuTrigger>
																		<DropdownMenuContent align="end">
																			<DropdownMenuItem
																				onClick={() =>
																					setLocationDialog(
																						true,
																						location,
																						"edit"
																					)
																				}
																			>
																				<Edit className="mr-2 h-4 w-4" />
																				Edit
																			</DropdownMenuItem>
																			<DropdownMenuItem
																				onClick={() =>
																					handleDeleteLocation(location.id)
																				}
																				className="text-destructive"
																			>
																				<Trash2 className="mr-2 h-4 w-4" />
																				Delete
																			</DropdownMenuItem>
																		</DropdownMenuContent>
																	</DropdownMenu>
																)}
															</div>
														</CardHeader>
														<CardContent>
															<p className="text-sm text-muted-foreground">
																{location.description ||
																	"No description provided"}
															</p>
														</CardContent>
													</Card>
												))}
											</div>
										)}
									</div>
								</CardContent>
							</Card>
						</TabsContent>
					</div>
				</Tabs>
			</div>

			{/* Dialogs */}
			<StockAdjustmentDialog
				isOpen={isStockAdjustmentDialogOpen}
				onClose={() => setStockAdjustmentDialog(false)}
			/>
			<LocationManagementDialog
				isOpen={isLocationDialogOpen}
				onClose={() => setLocationDialog(false)}
				location={currentEditingLocation}
				mode={currentLocationMode}
			/>
			<StockTransferDialog
				isOpen={isStockTransferDialogOpen}
				onClose={() => setStockTransferDialog(false)}
			/>

			{/* Visual indicator when scanning */}
			{isScanning && (
				<div className="fixed top-4 right-4 bg-orange-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center gap-2">
					<div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
					Checking inventory...
				</div>
			)}
		</div>
	);
};

export default InventoryPage;
