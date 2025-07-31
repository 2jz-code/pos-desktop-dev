import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
	Search,
	Clock,
	Settings,
} from "lucide-react";
import { toast } from "sonner";
// @ts-expect-error - No types for JS file
import inventoryService from "@/services/api/inventoryService";
// @ts-expect-error - No types for JS file
import StockAdjustmentDialog from "@/components/StockAdjustmentDialog";
// @ts-expect-error - No types for JS file
import LocationManagementDialog from "@/components/LocationManagementDialog";
// @ts-expect-error - No types for JS file
import StockTransferDialog from "@/components/StockTransferDialog";
import { useDebounce } from "@/hooks/useDebounce";
import { useConfirmation } from "@/components/ui/confirmation-dialog";

interface Product {
	id: number;
	name: string;
	sku?: string;
	barcode?: string;
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
	expiration_date?: string;
	low_stock_threshold?: number;
	expiration_threshold?: number;
	effective_low_stock_threshold: number;
	effective_expiration_threshold: number;
	is_low_stock: boolean;
	is_expiring_soon: boolean;
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
	expiring_soon_count: number;
	total_value: number;
}

interface DashboardData {
	location?: string;
	summary?: DashboardSummary;
	low_stock_items?: LowStockItem[];
	expiring_soon_items?: LowStockItem[];
}

export const InventoryPage = () => {
	const navigate = useNavigate();
	const [highlightedProductId] = useState<number | null>(null);
	const [currentEditingProduct, setCurrentEditingProduct] =
		useState<Product | null>(null);
	const [currentEditingLocation, setCurrentEditingLocation] =
		useState<Location | null>(null);
	const [currentLocationMode, setCurrentLocationMode] = useState<
		"create" | "edit"
	>("create");
	const [activeTab, setActiveTab] = useState("overview");
	const confirmation = useConfirmation();

	// Dialog states
	const [isStockAdjustmentDialogOpen, setIsStockAdjustmentDialogOpen] =
		useState(false);
	const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
	const [isStockTransferDialogOpen, setIsStockTransferDialogOpen] =
		useState(false);

	// Filtering and search states
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
	const [stockFilter, setStockFilter] = useState("all"); // all, low_stock, expiring_soon
	const debouncedSearchQuery = useDebounce(searchQuery, 300);

	const queryClient = useQueryClient();

	// Data fetching
	const { data: dashboardData, isLoading: dashboardLoading } =
		useQuery<DashboardData>({
			queryKey: ["inventory-dashboard"],
			queryFn: inventoryService.getDashboardData,
		});

	const stockQueryFilters = useMemo(
		() => ({
			location: selectedLocation,
			search: debouncedSearchQuery,
			is_low_stock: stockFilter === "low_stock" ? "true" : undefined,
			is_expiring_soon: stockFilter === "expiring_soon" ? "true" : undefined,
		}),
		[selectedLocation, debouncedSearchQuery, stockFilter]
	);

	const { data: stockData, isLoading: stockLoading } = useQuery<StockItem[]>({
		queryKey: ["inventory-stock", stockQueryFilters],
		queryFn: () => inventoryService.getAllStock(stockQueryFilters),
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
		const locationToDelete = locations?.find(loc => loc.id === locationId);
		if (!locationToDelete) return;

		confirmation.show({
			title: "Delete Location",
			description: `Are you sure you want to delete "${locationToDelete.name}"? This action cannot be undone and will affect all inventory records for this location.`,
			variant: "destructive",
			confirmText: "Delete",
			onConfirm: () => {
				deleteLocationMutation.mutate(locationId);
			}
		});
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

	const isInitialLoading = dashboardLoading || locationsLoading;

	if (isInitialLoading) {
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
		<div className="flex flex-col h-[calc(100vh-4rem)] bg-muted/40 p-4 gap-4">
			<header className="flex items-center justify-between flex-shrink-0">
				<div>
					<h1 className="text-2xl font-semibold">Inventory Management</h1>
					<p className="text-sm text-muted-foreground">
						Track and manage your product stock across all locations.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={refreshData}
					>
						<RefreshCw className="h-4 w-4 mr-2" />
						Refresh Data
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => navigate('/settings?tab=inventory')}
					>
						<Settings className="h-4 w-4 mr-2" />
						Configure Defaults
					</Button>

					<Button
						size="sm"
						onClick={() => handleStockTransferDialog(true)}
					>
						<ArrowUpDown className="h-4 w-4 mr-2" />
						Transfer Stock
					</Button>
					<Button
						size="sm"
						onClick={() => handleStockAdjustmentDialog(true)}
					>
						<Plus className="h-4 w-4 mr-2" />
						New Adjustment
					</Button>
				</div>
			</header>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 flex-shrink-0">
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
							Expiring Soon
						</CardTitle>
						<Clock className="h-4 w-4 text-orange-500" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold text-orange-600">
							{dashboardData?.summary?.expiring_soon_count || 0}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Out of Stock</CardTitle>
						<TrendingDown className="h-4 w-4 text-destructive" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold text-destructive">
							{dashboardData?.summary?.out_of_stock_count || 0}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Total Inventory Value
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

			<Tabs
				value={activeTab}
				onValueChange={setActiveTab}
				className="flex-1 flex flex-col min-h-0"
			>
				<TabsList className="grid w-full grid-cols-3 flex-shrink-0">
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="all-stock">All Stock</TabsTrigger>
					<TabsTrigger value="locations">Locations</TabsTrigger>
				</TabsList>

				<TabsContent
					value="overview"
					className="flex-grow overflow-y-auto min-h-0"
				>
					{/* Placeholder for overview content if needed */}
					<div className="p-4">
						<h2 className="text-lg font-semibold">Inventory Overview</h2>
						<p className="text-muted-foreground">
							This section provides an overview of your inventory status.
						</p>
						{dashboardData?.low_stock_items &&
							dashboardData.low_stock_items.length > 0 && (
								<Card className="mt-4 border-amber-200 bg-amber-50 dark:bg-amber-900/20">
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
											.map((item: LowStockItem) => (
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
																{Number(item.quantity)} units remaining
															</div>
														</div>
													</div>
													<div className="flex items-center gap-2">
														<Badge
															variant="secondary"
															className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
														>
															{Number(item.quantity)} left
														</Badge>
														<Button
															size="sm"
															variant="outline"
															className="h-8 px-3 text-xs border-amber-200 hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900/50"
															onClick={() =>
																handleStockAdjustmentDialog(true, {
																	id: item.product_id,
																	name: item.product_name,
																	price: 0,
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

						{dashboardData?.expiring_soon_items &&
							dashboardData.expiring_soon_items.length > 0 && (
								<Card className="mt-4 border-orange-200 bg-orange-50 dark:bg-orange-900/20">
									<CardHeader>
										<CardTitle className="text-orange-800 dark:text-orange-200 flex items-center gap-2">
											<Clock className="h-5 w-5" />
											Expiring Soon Alert
										</CardTitle>
										<CardDescription>
											Items that will expire within their warning threshold
										</CardDescription>
									</CardHeader>
									<CardContent className="space-y-3">
										{dashboardData.expiring_soon_items
											.slice(0, 5)
											.map((item: LowStockItem) => (
												<div
													key={item.product_id}
													className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-orange-100 dark:border-orange-800/50 shadow-sm"
												>
													<div className="flex items-center gap-3">
														<div className="w-2 h-2 bg-orange-500 rounded-full"></div>
														<div>
															<div className="font-medium text-gray-900 dark:text-gray-100">
																{item.product_name}
															</div>
															<div className="text-sm text-gray-500 dark:text-gray-400">
																{Number(item.quantity)} units
															</div>
														</div>
													</div>
													<div className="flex items-center gap-2">
														<Badge
															variant="secondary"
															className="bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200"
														>
															{Number(item.quantity)} units
														</Badge>
														<Button
															size="sm"
															variant="outline"
															className="h-8 px-3 text-xs border-orange-200 hover:bg-orange-100 dark:border-orange-800 dark:hover:bg-orange-900/50"
															onClick={() =>
																handleStockAdjustmentDialog(true, {
																	id: item.product_id,
																	name: item.product_name,
																	price: 0,
																})
															}
														>
															<Edit className="h-3 w-3 mr-1" />
															Update
														</Button>
													</div>
												</div>
											))}
									</CardContent>
								</Card>
							)}
					</div>
				</TabsContent>

				<TabsContent
					value="all-stock"
					className="flex flex-col min-h-0 flex-grow"
				>
					<Card className="flex-grow flex flex-col min-h-0">
						<CardHeader className="px-7 flex-shrink-0">
							<div className="flex items-center justify-between">
								<div>
									<CardTitle>All Stock</CardTitle>
									<CardDescription>
										A complete list of all your inventory items.
									</CardDescription>
								</div>
								<div className="flex items-center gap-2">
									<div className="relative">
										<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
										<Input
											type="search"
											placeholder="Search products..."
											className="w-full appearance-none bg-background pl-8 shadow-none md:w-[250px] lg:w-[300px]"
											value={searchQuery}
											onChange={(e) => setSearchQuery(e.target.value)}
										/>
									</div>
									<Select
										value={selectedLocation || "all"}
										onValueChange={(value) =>
											setSelectedLocation(value === "all" ? null : value)
										}
									>
										<SelectTrigger className="w-[180px]">
											<SelectValue placeholder="All Locations" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Locations</SelectItem>
											{locations?.map((loc) => (
												<SelectItem
													key={loc.id}
													value={loc.id.toString()}
												>
													{loc.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<Select
										value={stockFilter}
										onValueChange={setStockFilter}
									>
										<SelectTrigger className="w-[180px]">
											<SelectValue placeholder="All Items" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Items</SelectItem>
											<SelectItem value="low_stock">Low Stock</SelectItem>
											<SelectItem value="expiring_soon">Expiring Soon</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
						</CardHeader>
						<CardContent className="flex-grow overflow-hidden min-h-0">
							<div className="h-full flex flex-col">
								{/* Table Header */}
								<div className="grid grid-cols-12 gap-4 px-4 py-2 bg-gray-100 dark:bg-gray-800 font-medium rounded-t-lg flex-shrink-0">
									<div className="col-span-3">Product</div>
									<div className="col-span-2">Location</div>
									<div className="col-span-2 text-right">Quantity</div>
									<div className="col-span-2 text-center">Expiration</div>
									<div className="col-span-2 text-center">Status</div>
									<div className="col-span-1 text-right">Actions</div>
								</div>

								{/* Table Body */}
								<div className="overflow-y-auto flex-grow min-h-0">
									{stockLoading ? (
										<div className="flex justify-center items-center h-full">
											<RefreshCw className="h-6 w-6 animate-spin" />
										</div>
									) : stockData && stockData.length > 0 ? (
										stockData.map((item) => {
											const isHighlighted = highlightedProductId === item.product.id;
											const isLowStock = item.is_low_stock;
											const isExpiringSoon = item.is_expiring_soon;
											const isOutOfStock = Number(item.quantity) <= 0;

											// Determine status priority: Out of Stock > Expiring Soon > Low Stock > In Stock
											let statusVariant: "default" | "secondary" | "destructive" | "outline" = "default";
											let statusText = "In Stock";

											if (isOutOfStock) {
												statusVariant = "destructive";
												statusText = "Out of Stock";
											} else if (isExpiringSoon) {
												statusVariant = "outline";
												statusText = "Expiring Soon";
											} else if (isLowStock) {
												statusVariant = "secondary";
												statusText = "Low Stock";
											}

											return (
												<div
													key={item.id}
													className={`grid grid-cols-12 gap-4 px-4 py-3 items-center border-b last:border-b-0 ${
														isHighlighted ? "bg-blue-50 dark:bg-blue-900/50" : ""
													}`}
												>
													<div className={`col-span-3 font-medium ${isHighlighted ? "bg-blue-50 dark:bg-blue-900/50" : ""}`}>
														{item.product.name}
													</div>
													<div className={`col-span-2 text-muted-foreground flex items-center ${isHighlighted ? "bg-blue-50 dark:bg-blue-900/50" : ""}`}>
														<MapPin className="h-4 w-4 mr-2" />
														{item.location.name}
													</div>
													<div className={`col-span-2 text-right ${isHighlighted ? "bg-blue-50 dark:bg-blue-900/50" : ""}`}>
														{Number(item.quantity).toFixed(2)}
													</div>
													<div className={`col-span-2 ${isHighlighted ? "bg-blue-50 dark:bg-blue-900/50" : ""}`}>
														<div className="text-center">
															{item.expiration_date ? (
																<div className="text-sm">
																	<div>{new Date(item.expiration_date).toLocaleDateString()}</div>
																	{isExpiringSoon && (
																		<div className="text-xs text-orange-600 dark:text-orange-400">
																			{item.effective_expiration_threshold} day threshold
																		</div>
																	)}
																</div>
															) : (
																<span className="text-muted-foreground text-sm">No expiration</span>
															)}
														</div>
													</div>
													<div className={`col-span-2 ${isHighlighted ? "bg-blue-50 dark:bg-blue-900/50" : ""}`}>
														<div className="text-center space-y-1">
															<div>
																<Badge
																	variant={statusVariant}
																	className={
																		isExpiringSoon && !isOutOfStock
																			? "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/50 dark:text-orange-200"
																			: ""
																	}
																>
																	{statusText}
																</Badge>
															</div>
															{/* Show additional status if item has multiple issues */}
															{isExpiringSoon && isLowStock && !isOutOfStock && (
																<div>
																	<Badge variant="secondary" className="text-xs">
																		Low Stock
																	</Badge>
																</div>
															)}
														</div>
													</div>
													<div className={`col-span-1 flex justify-end ${isHighlighted ? "bg-blue-50 dark:bg-blue-900/50" : ""}`}>
														<DropdownMenu>
															<DropdownMenuTrigger asChild>
																<Button
																	variant="ghost"
																	size="icon"
																>
																	<MoreVertical className="h-4 w-4" />
																</Button>
															</DropdownMenuTrigger>
															<DropdownMenuContent align="end">
																<DropdownMenuItem
																	onClick={() =>
																		handleStockAdjustmentDialog(
																			true,
																			item.product
																		)
																	}
																>
																	<Edit className="mr-2 h-4 w-4" />
																	Adjust Stock
																</DropdownMenuItem>
																<DropdownMenuItem
																	onClick={() =>
																		handleStockTransferDialog(true, item.product)
																	}
																>
																	<ArrowUpDown className="mr-2 h-4 w-4" />
																	Transfer
																</DropdownMenuItem>
															</DropdownMenuContent>
														</DropdownMenu>
													</div>
												</div>
											);
										})
									) : (
										<div className="flex flex-col items-center justify-center h-full text-center py-10">
											<Package className="h-12 w-12 text-muted-foreground" />
											<h3 className="mt-4 text-lg font-semibold">
												No stock found
											</h3>
											<p className="mt-2 text-sm text-muted-foreground">
												Try adjusting your filters or adding new stock.
											</p>
										</div>
									)}
								</div>
							</div>
						</CardContent>
					</Card>
				</TabsContent>
				<TabsContent
					value="locations"
					className="flex flex-col min-h-0 flex-grow"
				>
					<Card className="flex-grow flex flex-col min-h-0">
						<CardHeader className="flex-shrink-0">
							<div className="flex items-center justify-between">
								<div>
									<CardTitle>Locations</CardTitle>
									<CardDescription>
										Manage your stock rooms, warehouses, and other locations.
									</CardDescription>
								</div>
								<Button
									onClick={() =>
										handleLocationDialog(true, undefined, "create")
									}
								>
									<Plus className="mr-2 h-4 w-4" /> Add Location
								</Button>
							</div>
						</CardHeader>
						<CardContent className="flex-grow overflow-y-auto min-h-0">
							<div className="grid gap-4">
								{locationsLoading ? (
									<p>Loading locations...</p>
								) : (
									locations?.map((loc) => (
										<div
											key={loc.id}
											className="flex items-center justify-between p-4 border rounded-lg"
										>
											<div className="flex items-center gap-4">
												<div className="p-2 bg-muted rounded-md">
													{loc.name.toLowerCase().includes("store") ? (
														<Building className="h-5 w-5" />
													) : (
														<Warehouse className="h-5 w-5" />
													)}
												</div>
												<div>
													<p className="font-semibold">{loc.name}</p>
													<p className="text-sm text-muted-foreground">
														{loc.description || "No description"}
													</p>
												</div>
											</div>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
													>
														<MoreVertical className="h-4 w-4" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem
														onClick={() =>
															handleLocationDialog(true, loc, "edit")
														}
													>
														<Edit className="mr-2 h-4 w-4" />
														Edit
													</DropdownMenuItem>
													<DropdownMenuItem
														onClick={() => handleDeleteLocation(loc.id)}
														className="text-red-600"
														disabled={deleteLocationMutation.isPending}
													>
														<Trash2 className="mr-2 h-4 w-4" />
														Delete
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</div>
									))
								)}
							</div>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>

			{/* Dialogs */}
			{isStockAdjustmentDialogOpen && (
				<StockAdjustmentDialog
					isOpen={isStockAdjustmentDialogOpen}
					onOpenChange={setIsStockAdjustmentDialogOpen}
					product={currentEditingProduct}
					onSuccess={handleDialogSuccess}
				/>
			)}
			{isLocationDialogOpen && (
				<LocationManagementDialog
					isOpen={isLocationDialogOpen}
					onOpenChange={setIsLocationDialogOpen}
					location={currentEditingLocation}
					mode={currentLocationMode}
					onSuccess={handleDialogSuccess}
				/>
			)}
			{isStockTransferDialogOpen && (
				<StockTransferDialog
					isOpen={isStockTransferDialogOpen}
					onOpenChange={setIsStockTransferDialogOpen}
					product={currentEditingProduct}
					onSuccess={handleDialogSuccess}
				/>
			)}

			{confirmation.dialog}
		</div>
	);
};
