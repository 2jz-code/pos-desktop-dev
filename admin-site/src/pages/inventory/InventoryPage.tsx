import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "../../components/ui/tabs";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
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
	Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import inventoryService from "../../services/api/inventoryService";
import StockAdjustmentDialog from "../../components/StockAdjustmentDialog";
import LocationManagementDialog from "../../components/LocationManagementDialog";
import StockTransferDialog from "../../components/StockTransferDialog";

interface Product {
	id: number;
	name: string;
	sku?: string;
	price: number;
}

interface Location {
	id: number;
	name: string;
	description?: string;
}

interface StockItem {
	id: number;
	product: Product;
	location: Location;
	quantity: number;
}

interface LowStockItem {
	product_id: number;
	product_name: string;
	quantity: number;
}

interface DashboardSummary {
	total_products: number;
	low_stock_count: number;
	out_of_stock_count: number;
	total_value: number;
}

interface DashboardData {
	location?: string;
	summary?: DashboardSummary;
	low_stock_items?: LowStockItem[];
}

export const InventoryPage = () => {
	const [highlightedProductId] = useState<number | null>(null);
	const [currentEditingProduct, setCurrentEditingProduct] =
		useState<Product | null>(null);
	const [currentEditingLocation, setCurrentEditingLocation] =
		useState<Location | null>(null);
	const [currentLocationMode, setCurrentLocationMode] = useState<
		"create" | "edit"
	>("create");

	// Dialog states
	const [isStockAdjustmentDialogOpen, setIsStockAdjustmentDialogOpen] =
		useState(false);
	const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
	const [isStockTransferDialogOpen, setIsStockTransferDialogOpen] =
		useState(false);

	const queryClient = useQueryClient();

	// Data fetching
	const { data: dashboardData, isLoading: dashboardLoading } =
		useQuery<DashboardData>({
			queryKey: ["inventory-dashboard"],
			queryFn: inventoryService.getDashboardData,
		});

	const { data: stockData, isLoading: stockLoading } = useQuery<StockItem[]>({
		queryKey: ["inventory-stock"],
		queryFn: inventoryService.getAllStock,
	});

	const { data: locations, isLoading: locationsLoading } = useQuery<Location[]>(
		{
			queryKey: ["inventory-locations"],
			queryFn: inventoryService.getLocations,
		}
	);

	// Delete location mutation
	const deleteLocationMutation = useMutation({
		mutationFn: (locationId: number) =>
			inventoryService.deleteLocation(locationId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["inventory-locations"] });
			queryClient.invalidateQueries({ queryKey: ["inventory-dashboard"] });
			queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
			toast.success("Location Deleted", {
				description: "Location deleted successfully",
			});
		},
		onError: (error: unknown) => {
			const errorMessage =
				(error as { response?: { data?: { message?: string } } })?.response
					?.data?.message || "Failed to delete location";
			toast.error("Location Deletion Failed", {
				description: errorMessage,
			});
		},
	});

	// Dialog handlers
	const handleStockAdjustmentDialog = (isOpen: boolean, product?: Product) => {
		setIsStockAdjustmentDialogOpen(isOpen);
		setCurrentEditingProduct(product || null);
	};

	const handleLocationDialog = (
		isOpen: boolean,
		location?: Location,
		mode: "create" | "edit" = "create"
	) => {
		setIsLocationDialogOpen(isOpen);
		setCurrentEditingLocation(location || null);
		setCurrentLocationMode(mode);
	};

	const handleStockTransferDialog = (isOpen: boolean, product?: Product) => {
		setIsStockTransferDialogOpen(isOpen);
		setCurrentEditingProduct(product || null);
	};

	const handleDeleteLocation = async (locationId: number) => {
		if (
			!confirm(
				"Are you sure you want to delete this location? This action cannot be undone."
			)
		) {
			return;
		}
		deleteLocationMutation.mutate(locationId);
	};

	const handleDialogSuccess = () => {
		queryClient.invalidateQueries({ queryKey: ["inventory-dashboard"] });
		queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
		queryClient.invalidateQueries({ queryKey: ["inventory-locations"] });
	};

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
		}).format(amount);
	};

	const refreshData = () => {
		queryClient.invalidateQueries({ queryKey: ["inventory-dashboard"] });
		queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
		queryClient.invalidateQueries({ queryKey: ["inventory-locations"] });
	};

	const isLoading = dashboardLoading || stockLoading || locationsLoading;

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
								<span className="font-medium">
									{dashboardData?.location || "Default"}
								</span>
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
							<Button
								onClick={() => handleStockTransferDialog(true)}
								variant="outline"
							>
								<ArrowUpDown className="h-4 w-4 mr-2" />
								Transfer Stock
							</Button>
							<Button onClick={() => handleStockAdjustmentDialog(true)}>
								<Plus className="h-4 w-4 mr-2" />
								Adjust Stock
							</Button>
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
										<DollarSign className="h-4 w-4 text-green-500" />
									</CardHeader>
									<CardContent>
										<div className="text-2xl font-bold text-green-600">
											{formatCurrency(dashboardData?.summary?.total_value || 0)}
										</div>
									</CardContent>
								</Card>
							</div>

							{/* Low Stock Items Alert */}
							{dashboardData?.low_stock_items &&
								dashboardData.low_stock_items.length > 0 && (
									<Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/20">
										<CardHeader>
											<CardTitle className="text-amber-800 dark:text-amber-200 flex items-center gap-2">
												<AlertTriangle className="h-5 w-5" />
												Low Stock Alert
											</CardTitle>
											<CardDescription>
												Items that need restocking soon
											</CardDescription>
										</CardHeader>
										<CardContent className="space-y-3">
											{dashboardData.low_stock_items
												.slice(0, 5)
												.map((item: any) => (
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
															<Button
																size="sm"
																variant="outline"
																className="h-8 px-3 text-xs border-amber-200 hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900/50"
																onClick={() =>
																	handleStockAdjustmentDialog(true, {
																		id: item.product_id,
																		name: item.product_name,
																	})
																}
															>
																<Plus className="h-3 w-3 mr-1" />
																Restock
															</Button>
														</div>
													</div>
												))}
										</CardContent>
									</Card>
								)}
						</TabsContent>

						{/* Stock Management Tab */}
						<TabsContent
							value="stock"
							className="space-y-6 mt-6"
						>
							<Card>
								<CardHeader>
									<CardTitle>Stock Levels</CardTitle>
									<CardDescription>
										Current inventory levels across all locations
									</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="space-y-4">
										{!stockData || stockData.length === 0 ? (
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
														{stockData.map((stock: any) => {
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
																			SKU: {stock.product?.sku || "N/A"}
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
																						handleStockAdjustmentDialog(
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
																						handleStockTransferDialog(
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
							className="space-y-6 mt-6"
						>
							<Card>
								<CardHeader>
									<div className="flex items-center justify-between">
										<div>
											<CardTitle>Storage Locations</CardTitle>
											<CardDescription>
												Manage inventory storage locations
											</CardDescription>
										</div>
										<Button onClick={() => handleLocationDialog(true)}>
											<Building className="h-4 w-4 mr-2" />
											Add Location
										</Button>
									</div>
								</CardHeader>
								<CardContent>
									<div className="space-y-4">
										{!locations || locations.length === 0 ? (
											<div className="text-center py-8 text-muted-foreground">
												No locations found. Create your first storage location.
											</div>
										) : (
											<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
												{locations.map((location: any) => (
													<Card
														key={location.id}
														className="relative"
													>
														<CardHeader>
															<div className="flex items-center justify-between">
																<div className="flex items-center gap-2">
																	<Warehouse className="h-5 w-5 text-muted-foreground" />
																	<CardTitle className="text-lg">
																		{location.name}
																	</CardTitle>
																</div>
																<DropdownMenu>
																	<DropdownMenuTrigger asChild>
																		<Button
																			variant="ghost"
																			className="h-8 w-8 p-0"
																		>
																			<span className="sr-only">Open menu</span>
																			<MoreVertical className="h-4 w-4" />
																		</Button>
																	</DropdownMenuTrigger>
																	<DropdownMenuContent align="end">
																		<DropdownMenuItem
																			onClick={() =>
																				handleLocationDialog(
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
																			className="text-red-600"
																		>
																			<Trash2 className="mr-2 h-4 w-4" />
																			Delete
																		</DropdownMenuItem>
																	</DropdownMenuContent>
																</DropdownMenu>
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
				onClose={() => handleStockAdjustmentDialog(false)}
				product={currentEditingProduct}
				onSuccess={handleDialogSuccess}
			/>
			<LocationManagementDialog
				isOpen={isLocationDialogOpen}
				onClose={() => handleLocationDialog(false)}
				location={currentEditingLocation}
				mode={currentLocationMode}
				onSuccess={handleDialogSuccess}
			/>
			<StockTransferDialog
				isOpen={isStockTransferDialogOpen}
				onClose={() => handleStockTransferDialog(false)}
				product={currentEditingProduct}
				onSuccess={handleDialogSuccess}
			/>
		</div>
	);
};
