import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
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
	Warehouse,
	Search,
	Clock,
	Settings,
} from "lucide-react";
import { StandardTable } from "@/shared/components/layout/StandardTable";
import { useInventoryBarcode, useScrollToScannedItem } from "@/shared/hooks";
import { useDebounce } from "@/shared/hooks/useDebounce";
import { formatCurrency } from "@/shared/lib/utils";

// Import dialog components
import StockAdjustmentDialog from "@/domains/inventory/components/StockAdjustmentDialog";
import LocationManagementDialog from "@/domains/inventory/components/LocationManagementDialog";
import StockTransferDialog from "@/domains/inventory/components/StockTransferDialog";

// Import services
import {
	getDashboardData,
	getAllStock,
	getLocations,
	deleteLocation,
} from "@/domains/inventory/services/inventoryService";
import { useToast } from "@/shared/components/ui/use-toast";
import { useConfirmation } from "@/shared/components/ui/confirmation-dialog";

const stockTableHeaders = [
	{ key: "product", label: "Product" },
	{ key: "location", label: "Location" },
	{ key: "quantity", label: "Quantity", className: "text-right" },
	{ key: "expiration", label: "Expiration", className: "text-center" },
	{ key: "status", label: "Status", className: "text-center" },
	{ key: "actions", label: "Actions", className: "w-[50px]" },
];

const InventoryPage = () => {
	const { toast } = useToast();
	const confirmation = useConfirmation();
	const navigate = useNavigate();
	const [highlightedProductId, setHighlightedProductId] = useState(null);
	const [scannedProductId, setScannedProductId] = useState(null);
	const [currentEditingProduct, setCurrentEditingProduct] = useState(null);
	const [currentEditingLocation, setCurrentEditingLocation] = useState(null);
	const [currentLocationMode, setCurrentLocationMode] = useState("create");
	const [activeTab, setActiveTab] = useState("overview");

	// Dialog states
	const [isStockAdjustmentDialogOpen, setIsStockAdjustmentDialogOpen] = useState(false);
	const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
	const [isStockTransferDialogOpen, setIsStockTransferDialogOpen] = useState(false);

	// Filtering and search states
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedLocation, setSelectedLocation] = useState(null);
	const [stockFilter, setStockFilter] = useState("all"); // all, low_stock, expiring_soon
	const debouncedSearchQuery = useDebounce(searchQuery, 300);

	const queryClient = useQueryClient();

	// Scroll to scanned item functionality
	const { tableContainerRef, scrollToItem } = useScrollToScannedItem();

	// Barcode scanning refs
	const barcodeInputRef = React.useRef("");
	const lastKeystrokeRef = React.useRef(0);

	// Smart barcode scanning - automatically shows stock info for scanned product
	const { scanBarcode } = useInventoryBarcode((stockInfo) => {
		// Clear any active filters to ensure the scanned item is visible
		setSearchQuery("");
		setSelectedLocation(null);
		setStockFilter("all");

		// Switch to the all-stock tab to ensure the item is visible
		setActiveTab("all-stock");

		// Highlight the found product
		const productId = stockInfo.product.id;
		setHighlightedProductId(productId);
		setScannedProductId(productId); // Set state to trigger effect

		// Show stock details in a toast
		toast({
			title: `Stock Found: ${stockInfo.product.name}`,
			description: `${stockInfo.stock.quantity} units available at ${stockInfo.stock.location}`,
			duration: 5000,
		});
	});

	// Global barcode listener
	React.useEffect(() => {
		const handleKeyPress = (e) => {
			// Ignore if dialogs are open or if the user is typing in an input
			if (
				isStockAdjustmentDialogOpen ||
				isLocationDialogOpen ||
				isStockTransferDialogOpen ||
				e.target.tagName === "INPUT" ||
				e.target.tagName === "TEXTAREA"
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
		};

		document.addEventListener("keypress", handleKeyPress);
		return () => {
			document.removeEventListener("keypress", handleKeyPress);
		};
	}, [
		scanBarcode,
		isStockAdjustmentDialogOpen,
		isLocationDialogOpen,
		isStockTransferDialogOpen,
	]);

	// Effect to scroll to the item after tab change
	React.useEffect(() => {
		if (activeTab === "all-stock" && scannedProductId) {
			scrollToItem(scannedProductId, {
				dataAttribute: "data-product-id",
				delay: 100, // Delay for render
			});

			// Clear highlight after 5 seconds
			const highlightTimeout = setTimeout(
				() => setHighlightedProductId(null),
				5000
			);
			// Reset scanned product ID
			setScannedProductId(null);

			return () => clearTimeout(highlightTimeout);
		}
	}, [activeTab, scannedProductId, scrollToItem]);

	// Data fetching
	const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
		queryKey: ["inventory-dashboard"],
		queryFn: getDashboardData,
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

	const { data: stockData, isLoading: stockLoading } = useQuery({
		queryKey: ["inventory-stock", stockQueryFilters],
		queryFn: () => getAllStock(stockQueryFilters),
	});

	const { data: locations, isLoading: locationsLoading } = useQuery({
		queryKey: ["inventory-locations"],
		queryFn: getLocations,
	});

	// Delete location mutation
	const deleteLocationMutation = useMutation({
		mutationFn: (locationId) => deleteLocation(locationId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["inventory-locations"] });
			queryClient.invalidateQueries({ queryKey: ["inventory-dashboard"] });
			queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
			toast({
				title: "Location Deleted",
				description: "Location deleted successfully",
			});
		},
		onError: (error) => {
			const errorMessage = error?.response?.data?.message || "Failed to delete location";
			toast({
				title: "Location Deletion Failed",
				description: errorMessage,
				variant: "destructive",
			});
		},
	});

	// Dialog handlers
	const handleStockAdjustmentDialog = (isOpen, product) => {
		setIsStockAdjustmentDialogOpen(isOpen);
		setCurrentEditingProduct(product || null);
	};

	const handleLocationDialog = (isOpen, location, mode = "create") => {
		setIsLocationDialogOpen(isOpen);
		setCurrentEditingLocation(location || null);
		setCurrentLocationMode(mode);
	};

	const handleStockTransferDialog = (isOpen, product) => {
		setIsStockTransferDialogOpen(isOpen);
		setCurrentEditingProduct(product || null);
	};

	const handleDeleteLocation = async (location) => {
		confirmation.show({
			title: "Delete Location",
			description: `Are you sure you want to delete "${location.name}"? This action cannot be undone and will affect all inventory records for this location.`,
			confirmText: "Delete",
			cancelText: "Cancel",
			variant: "destructive",
			icon: AlertTriangle,
			onConfirm: () => {
				deleteLocationMutation.mutate(location.id);
			},
		});
	};

	const handleDialogSuccess = () => {
		queryClient.invalidateQueries({ queryKey: ["inventory-dashboard"] });
		queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
		queryClient.invalidateQueries({ queryKey: ["inventory-locations"] });
	};

	const refreshData = () => {
		queryClient.invalidateQueries({ queryKey: ["inventory-dashboard"] });
		queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
		queryClient.invalidateQueries({ queryKey: ["inventory-locations"] });
	};

	const renderStockRow = (item) => {
		const isHighlighted = highlightedProductId === item.product.id;
		const isLowStock = item.is_low_stock;
		const isExpiringSoon = item.is_expiring_soon;
		const isOutOfStock = Number(item.quantity) <= 0;

		// Determine status priority: Out of Stock > Expiring Soon > Low Stock > In Stock
		let statusVariant = "default";
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
			<>
				<td className={`py-3 px-4 font-medium ${isHighlighted ? "bg-blue-50 dark:bg-blue-900/50" : ""}`}>{item.product.name}</td>
				<td className={`py-3 px-4 text-muted-foreground ${isHighlighted ? "bg-blue-50 dark:bg-blue-900/50" : ""}`}>
					<div className="flex items-center">
						<MapPin className="h-4 w-4 mr-2" />
						{item.location.name}
					</div>
				</td>
				<td className={`py-3 px-4 text-right ${isHighlighted ? "bg-blue-50 dark:bg-blue-900/50" : ""}`}>{Number(item.quantity).toFixed(2)}</td>
				<td className={`py-3 px-4 text-center ${isHighlighted ? "bg-blue-50 dark:bg-blue-900/50" : ""}`}>
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
				</td>
				<td className={`py-3 px-4 text-center ${isHighlighted ? "bg-blue-50 dark:bg-blue-900/50" : ""}`}>
					<div className="flex flex-col gap-1 items-center justify-center">
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
						{/* Show additional status if item has multiple issues */}
						{isExpiringSoon && isLowStock && !isOutOfStock && (
							<Badge variant="secondary" className="text-xs">
								Low Stock
							</Badge>
						)}
					</div>
				</td>
				<td className={`py-3 px-4 text-right ${isHighlighted ? "bg-blue-50 dark:bg-blue-900/50" : ""}`}>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon">
								<MoreVertical className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => handleStockAdjustmentDialog(true, item.product)}>
								<Edit className="mr-2 h-4 w-4" />
								Adjust Stock
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => handleStockTransferDialog(true, item.product)}>
								<ArrowUpDown className="mr-2 h-4 w-4" />
								Transfer
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</td>
			</>
		);
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
											.map((item) => (
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
											.map((item) => (
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
																Expires: {new Date(item.expiration_date).toLocaleDateString()}
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
						<CardContent ref={tableContainerRef} className="flex-grow overflow-y-auto min-h-0">
							<StandardTable
								headers={stockTableHeaders}
								data={stockData}
								loading={stockLoading}
								emptyMessage="No stock found. Try adjusting your filters."
								renderRow={renderStockRow}
								getRowProps={(item) => ({
									'data-product-id': item.product.id,
								})}
							/>
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
														onClick={() => handleDeleteLocation(loc)}
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

			{/* Confirmation Dialog */}
			{confirmation.dialog}
		</div>
	);
};

export default InventoryPage;