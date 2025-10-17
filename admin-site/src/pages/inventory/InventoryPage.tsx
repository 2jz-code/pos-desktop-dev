import { useState, useMemo, useRef, useEffect } from "react";
import { formatCurrency, useScrollToScannedItem } from "@ajeen/ui";
import { useInventoryBarcodeWithScroll } from "@/hooks/useBarcode";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation as useStoreLocation } from "@/contexts/LocationContext";
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
	DropdownMenuLabel,
	DropdownMenuSeparator,
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
// @ts-expect-error - No types for JS file
import { StockMetadataEditDialog } from "@/components/StockMetadataEditDialog";
import { useDebounce } from "@ajeen/ui";
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
	const { tenant } = useAuth();
	const tenantSlug = tenant?.slug || '';
	const { selectedLocationId } = useStoreLocation();
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
	const [isStockMetadataEditDialogOpen, setIsStockMetadataEditDialogOpen] =
		useState(false);

	// Filtering and search states
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
	const [stockFilter, setStockFilter] = useState("all"); // all, low_stock, expiring_soon
	const debouncedSearchQuery = useDebounce(searchQuery, 300);

	// Barcode scanning refs and state
	const barcodeInputRef = useRef("");
	const lastKeystrokeRef = useRef(0);
	const [highlightedStockId, setHighlightedStockId] = useState<number | null>(null);
	const [scannedProductId, setScannedProductId] = useState<number | null>(null);
	const [selectedStockItem, setSelectedStockItem] = useState<StockItem | null>(null);

	const queryClient = useQueryClient();

	// Scroll to scanned item functionality
	const { tableContainerRef, scrollToItem } = useScrollToScannedItem();

	// Smart barcode scanning for inventory
	const { scanBarcode, isScanning } = useInventoryBarcodeWithScroll((stockData) => {
		// Highlight the found product
		const productId = stockData.product?.id;
		if (productId) {
			setHighlightedStockId(productId);

			// Clear any active filters to ensure the scanned item is visible
			setSearchQuery("");
			setSelectedLocation(null);
			setStockFilter("all");

			// Switch to the stock tab to ensure the item is visible
			setActiveTab("all-stock");

			// Set scanned product ID after a delay to allow filters to clear and query to refetch
			setTimeout(() => {
				setScannedProductId(productId);
			}, 600); // Wait for debounce + query refetch
		}
	}, (productId) => {
		scrollToItem(productId, {
			dataAttribute: "data-product-id",
			delay: 200,
		});
	});

	// Global barcode listener
	useEffect(() => {
		const handleKeyPress = (e: KeyboardEvent) => {
			if (
				(e.target as HTMLElement).tagName === "INPUT" ||
				(e.target as HTMLElement).tagName === "TEXTAREA" ||
				isStockAdjustmentDialogOpen ||
				isLocationDialogOpen ||
				isStockTransferDialogOpen ||
				isStockMetadataEditDialogOpen
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
		isStockMetadataEditDialogOpen,
	]);


	// Data fetching (store location is now handled by middleware via X-Store-Location header)
	// Keep selectedLocationId in deps to trigger refetch when location changes
	const dashboardFilters = useMemo(
		() => ({}),
		[selectedLocationId]
	);

	const { data: dashboardData, isLoading: dashboardLoading } =
		useQuery<DashboardData>({
			queryKey: ["inventory-dashboard", selectedLocationId, dashboardFilters],
			queryFn: () => inventoryService.getDashboardData(dashboardFilters),
		});

	const stockQueryFilters = useMemo(
		() => ({
			location: selectedLocation,
			search: debouncedSearchQuery,
			is_low_stock: stockFilter === "low_stock" ? "true" : undefined,
			is_expiring_soon: stockFilter === "expiring_soon" ? "true" : undefined,
		}),
		[selectedLocationId, selectedLocation, debouncedSearchQuery, stockFilter]
	);

	const { data: stockData, isLoading: stockLoading } = useQuery<StockItem[]>({
		queryKey: ["inventory-stock", selectedLocationId, stockQueryFilters],
		queryFn: () => inventoryService.getAllStock(stockQueryFilters),
	});

	const locationsFilters = useMemo(
		() => ({}),
		[selectedLocationId]
	);

	const { data: locations, isLoading: locationsLoading } = useQuery<Location[]>(
		{
			queryKey: ["inventory-locations", selectedLocationId, locationsFilters],
			queryFn: () => inventoryService.getLocations(locationsFilters),
			select: (data) => data.results,
		}
	);

	// Effect to scroll to the item after tab change
	useEffect(() => {
		if (activeTab === "all-stock" && scannedProductId && stockData && !stockLoading) {
			// Check if the item exists in current data
			const itemExists = stockData.some(item => item.product.id === scannedProductId);

			if (itemExists) {
				// Use requestAnimationFrame to ensure DOM has updated after React render
				requestAnimationFrame(() => {
					setTimeout(() => {
						const container = tableContainerRef.current;
						const allElements = container ? container.querySelectorAll('[data-product-id]') : document.querySelectorAll('[data-product-id]');

						if (allElements.length > 0) {
							scrollToItem(scannedProductId.toString(), {
								dataAttribute: "data-product-id",
								delay: 100,
							});
						} else {
							setTimeout(() => {
								scrollToItem(scannedProductId.toString(), {
									dataAttribute: "data-product-id",
									delay: 100,
								});
							}, 200);
						}
					}, 50);
				});

				// Clear highlight after 5 seconds
				const highlightTimeout = setTimeout(
					() => setHighlightedStockId(null),
					5000
				);
				// Reset scanned product ID
				setScannedProductId(null);

				return () => clearTimeout(highlightTimeout);
			}
		}
	}, [activeTab, scannedProductId, scrollToItem, stockData, stockLoading]);

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

	const handleStockMetadataEditDialog = (isOpen: boolean, stockItem?: StockItem) => {
		setIsStockMetadataEditDialogOpen(isOpen);
		setSelectedStockItem(stockItem || null);
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
		const locationToDelete = locations?.find((loc) => loc.id === locationId);
		if (!locationToDelete) return;

		confirmation.show({
			title: "Delete Location",
			description: `Are you sure you want to delete "${locationToDelete.name}"? This action cannot be undone and will affect all inventory records for this location.`,
			variant: "destructive",
			confirmText: "Delete",
			onConfirm: () => {
				deleteLocationMutation.mutate(locationId);
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

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button size="sm">
								<Settings className="mr-2 h-4 w-4" />
								Actions
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel>Inventory Actions</DropdownMenuLabel>
							<DropdownMenuItem
								onClick={() => handleStockAdjustmentDialog(true)}
							>
								<Plus className="mr-2 h-4 w-4" />
								New Adjustment
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => handleStockTransferDialog(true)}>
								<ArrowUpDown className="mr-2 h-4 w-4" />
								Transfer Stock
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => handleStockMetadataEditDialog(true)}>
								<Settings className="mr-2 h-4 w-4" />
								Edit Stock Record
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => navigate(`/${tenantSlug}/inventory/bulk-operations`)}
							>
								<Warehouse className="mr-2 h-4 w-4" />
								Bulk Operations
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => navigate(`/${tenantSlug}/inventory/stock-history`)}
							>
								<Clock className="mr-2 h-4 w-4" />
								Stock History
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => navigate(`/${tenantSlug}/settings?tab=inventory`)}
							>
								<Settings className="mr-2 h-4 w-4" />
								Configure Defaults
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</header>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 flex-shrink-0">
				<Card className="border-border bg-card">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Total Products
						</CardTitle>
						<div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
							<Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-foreground">
							{dashboardData?.summary?.total_products || 0}
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							Items tracked
						</p>
					</CardContent>
				</Card>
				<Card className="border-border bg-card">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Low Stock Items
						</CardTitle>
						<div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
							<AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
							{dashboardData?.summary?.low_stock_count || 0}
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							Need restocking
						</p>
					</CardContent>
				</Card>
				<Card className="border-border bg-card">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Expiring Soon
						</CardTitle>
						<div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
							<Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
							{dashboardData?.summary?.expiring_soon_count || 0}
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							Within threshold
						</p>
					</CardContent>
				</Card>
				<Card className="border-border bg-card">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Out of Stock
						</CardTitle>
						<div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
							<TrendingDown className="h-4 w-4 text-destructive" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-destructive">
							{dashboardData?.summary?.out_of_stock_count || 0}
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							Require immediate action
						</p>
					</CardContent>
				</Card>
				<Card className="border-border bg-card">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Total Inventory Value
						</CardTitle>
						<div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
							<DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-foreground">
							{formatCurrency(dashboardData?.summary?.total_value || 0)}
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							Stock valuation
						</p>
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
								<Card className="mt-4 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
									<CardHeader className="pb-3">
										<div className="flex items-start gap-3">
											<div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-lg flex-shrink-0">
												<AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
											</div>
											<div className="flex-1">
												<CardTitle className="text-base font-semibold text-amber-900 dark:text-amber-100">
													Low Stock Alert
												</CardTitle>
												<CardDescription className="text-amber-700 dark:text-amber-300 text-sm mt-1">
													{dashboardData.low_stock_items.length} item{dashboardData.low_stock_items.length !== 1 ? 's' : ''} need restocking soon
												</CardDescription>
											</div>
										</div>
									</CardHeader>
									<CardContent className="space-y-2.5">
										{dashboardData.low_stock_items
											.slice(0, 5)
											.map((item: LowStockItem) => (
												<div
													key={item.product_id}
													className="flex items-center justify-between p-3 bg-card rounded-lg border border-amber-100 dark:border-amber-800/50 shadow-sm hover:shadow-md transition-shadow"
												>
													<div className="flex items-center gap-3 flex-1 min-w-0">
														<div className="w-2 h-2 bg-amber-500 rounded-full flex-shrink-0"></div>
														<div className="min-w-0 flex-1">
															<div className="font-semibold text-foreground truncate">
																{item.product_name}
															</div>
															<div className="text-xs text-muted-foreground">
																{Number(item.quantity).toFixed(1)} units remaining
															</div>
														</div>
													</div>
													<div className="flex items-center gap-2 flex-shrink-0">
														<Badge
															variant="outline"
															className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700"
														>
															{Number(item.quantity).toFixed(1)} left
														</Badge>
														<Button
															size="sm"
															variant="outline"
															className="h-8 px-3 text-xs border-amber-200 hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/50"
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
								<Card className="mt-4 border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20">
									<CardHeader className="pb-3">
										<div className="flex items-start gap-3">
											<div className="p-2 bg-orange-100 dark:bg-orange-900/40 rounded-lg flex-shrink-0">
												<Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
											</div>
											<div className="flex-1">
												<CardTitle className="text-base font-semibold text-orange-900 dark:text-orange-100">
													Expiring Soon Alert
												</CardTitle>
												<CardDescription className="text-orange-700 dark:text-orange-300 text-sm mt-1">
													{dashboardData.expiring_soon_items.length} item{dashboardData.expiring_soon_items.length !== 1 ? 's' : ''} expiring within threshold
												</CardDescription>
											</div>
										</div>
									</CardHeader>
									<CardContent className="space-y-2.5">
										{dashboardData.expiring_soon_items
											.slice(0, 5)
											.map((item: LowStockItem) => (
												<div
													key={item.product_id}
													className="flex items-center justify-between p-3 bg-card rounded-lg border border-orange-100 dark:border-orange-800/50 shadow-sm hover:shadow-md transition-shadow"
												>
													<div className="flex items-center gap-3 flex-1 min-w-0">
														<div className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0"></div>
														<div className="min-w-0 flex-1">
															<div className="font-semibold text-foreground truncate">
																{item.product_name}
															</div>
															<div className="text-xs text-muted-foreground">
																{Number(item.quantity).toFixed(1)} units in stock
															</div>
														</div>
													</div>
													<div className="flex items-center gap-2 flex-shrink-0">
														<Badge
															variant="outline"
															className="bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700"
														>
															{Number(item.quantity).toFixed(1)} units
														</Badge>
														<Button
															size="sm"
															variant="outline"
															className="h-8 px-3 text-xs border-orange-200 hover:bg-orange-100 dark:border-orange-700 dark:hover:bg-orange-900/50"
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
											<SelectItem value="expiring_soon">
												Expiring Soon
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
						</CardHeader>
						<CardContent className="flex-grow overflow-hidden min-h-0">
							<div className="h-full flex flex-col">
								{/* Table Header */}
								<div className="grid grid-cols-12 gap-4 px-4 py-3 bg-muted/50 font-medium text-sm text-muted-foreground rounded-t-lg flex-shrink-0 border-b border-border">
									<div className="col-span-3">Product</div>
									<div className="col-span-2">Location</div>
									<div className="col-span-2 text-right">Quantity</div>
									<div className="col-span-2">Expiration</div>
									<div className="col-span-2">Status</div>
									<div className="col-span-1 text-right">Actions</div>
								</div>

								{/* Table Body */}
								<div ref={tableContainerRef} className="overflow-y-auto flex-grow min-h-0 divide-y divide-border">
									{stockLoading ? (
										<div className="flex justify-center items-center h-full">
											<RefreshCw className="h-6 w-6 animate-spin" />
										</div>
									) : stockData && stockData.length > 0 ? (
										stockData.map((item) => {
											const isHighlighted =
												highlightedStockId === item.product.id;
											const isLowStock = item.is_low_stock;
											const isExpiringSoon = item.is_expiring_soon;
											const isOutOfStock = Number(item.quantity) <= 0;

											// Determine status priority: Out of Stock > Expiring Soon > Low Stock > In Stock
											let statusVariant:
												| "default"
												| "secondary"
												| "destructive"
												| "outline" = "default";
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

											// Determine status dot color
											const statusDotColor = isOutOfStock
												? "bg-red-500"
												: isExpiringSoon
												? "bg-orange-500"
												: isLowStock
												? "bg-amber-500"
												: "bg-emerald-500";

											return (
												<div
													key={item.id}
													data-product-id={item.product.id}
													className={`grid grid-cols-12 gap-4 px-4 py-4 items-center hover:bg-muted/50 transition-colors ${
														isHighlighted
															? "bg-yellow-100 dark:bg-yellow-900/20 animate-pulse"
															: ""
													}`}
												>
													{/* Product with status dot */}
													<div className="col-span-3">
														<div className="flex items-center gap-2.5">
															<div className={`h-2 w-2 rounded-full ${statusDotColor} flex-shrink-0`} />
															<div className="min-w-0 flex-1">
																<div className="font-semibold text-foreground truncate">
																	{item.product.name}
																</div>
																{item.product.sku && (
																	<div className="text-xs text-muted-foreground font-mono">
																		{item.product.sku}
																	</div>
																)}
															</div>
														</div>
													</div>

													{/* Location */}
													<div className="col-span-2">
														<div className="flex items-center gap-1.5 text-sm text-muted-foreground">
															<MapPin className="h-3.5 w-3.5 flex-shrink-0" />
															<span className="truncate">{item.location.name}</span>
														</div>
													</div>

													{/* Quantity */}
													<div className="col-span-2 text-right">
														<div className="font-bold text-lg text-foreground">
															{Number(item.quantity).toFixed(1)}
														</div>
														{item.low_stock_threshold && (
															<div className="text-xs text-muted-foreground">
																Min: {item.effective_low_stock_threshold}
															</div>
														)}
													</div>

													{/* Expiration */}
													<div className="col-span-2">
														{item.expiration_date ? (
															<div className="space-y-0.5">
																<div className="text-sm font-medium text-foreground">
																	{new Date(
																		item.expiration_date
																	).toLocaleDateString()}
																</div>
																{isExpiringSoon && (
																	<div className="text-xs text-orange-600 dark:text-orange-400 font-medium">
																		⚠ Within {item.effective_expiration_threshold}d threshold
																	</div>
																)}
															</div>
														) : (
															<span className="text-sm text-muted-foreground">
																No expiration
															</span>
														)}
													</div>

													{/* Status */}
													<div className="col-span-2">
														<div className="flex flex-col gap-1.5">
															<Badge
																variant={statusVariant}
																className={
																	isOutOfStock
																		? ""
																		: isExpiringSoon
																		? "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700"
																		: isLowStock
																		? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700"
																		: ""
																}
															>
																{statusText}
															</Badge>
															{/* Show additional status if item has multiple issues */}
															{isExpiringSoon &&
																isLowStock &&
																!isOutOfStock && (
																	<Badge
																		variant="outline"
																		className="text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700"
																	>
																		Also Low Stock
																	</Badge>
																)}
														</div>
													</div>

													{/* Actions */}
													<div className="col-span-1 flex justify-end">
														<DropdownMenu>
															<DropdownMenuTrigger asChild>
																<Button
																	variant="ghost"
																	size="icon"
																	className="h-8 w-8"
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
																		handleStockTransferDialog(
																			true,
																			item.product
																		)
																	}
																>
																	<ArrowUpDown className="mr-2 h-4 w-4" />
																	Transfer
																</DropdownMenuItem>
																<DropdownMenuItem
																	onClick={() =>
																		handleStockMetadataEditDialog(
																			true,
																			item
																		)
																	}
																>
																	<Settings className="mr-2 h-4 w-4" />
																	Edit Stock Record
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
							<div className="grid gap-4 md:grid-cols-2">
								{locationsLoading ? (
									<div className="col-span-full flex justify-center py-8">
										<RefreshCw className="h-6 w-6 animate-spin" />
									</div>
								) : locations && locations.length > 0 ? (
									locations.map((loc) => (
										<Card
											key={loc.id}
											className="border-border bg-card hover:shadow-md transition-all duration-200"
										>
											<CardHeader className="pb-3">
												<div className="flex items-start justify-between gap-3">
													<div className="flex items-start gap-3 flex-1 min-w-0">
														<div className={`p-2.5 rounded-lg flex-shrink-0 ${
															loc.name.toLowerCase().includes("store")
																? "bg-blue-50 dark:bg-blue-900/20"
																: "bg-purple-50 dark:bg-purple-900/20"
														}`}>
															{loc.name.toLowerCase().includes("store") ? (
																<Building className={`h-5 w-5 ${
																	loc.name.toLowerCase().includes("store")
																		? "text-blue-600 dark:text-blue-400"
																		: "text-purple-600 dark:text-purple-400"
																}`} />
															) : (
																<Warehouse className="h-5 w-5 text-purple-600 dark:text-purple-400" />
															)}
														</div>
														<div className="flex-1 min-w-0">
															<div className="flex items-center gap-2 mb-1">
																<div className="h-2 w-2 rounded-full bg-emerald-500 flex-shrink-0" />
																<CardTitle className="text-base font-bold text-foreground truncate">
																	{loc.name}
																</CardTitle>
															</div>
															<CardDescription className="text-sm text-muted-foreground line-clamp-2">
																{loc.description || "No description provided"}
															</CardDescription>
														</div>
													</div>
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button
																variant="ghost"
																size="icon"
																className="h-8 w-8 flex-shrink-0"
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
																Edit Location
															</DropdownMenuItem>
															<DropdownMenuItem
																onClick={() => handleDeleteLocation(loc.id)}
																className="text-destructive"
																disabled={deleteLocationMutation.isPending}
															>
																<Trash2 className="mr-2 h-4 w-4" />
																Delete Location
															</DropdownMenuItem>
														</DropdownMenuContent>
													</DropdownMenu>
												</div>
											</CardHeader>
										</Card>
									))
								) : (
									<div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
										<div className="p-4 bg-muted rounded-full mb-4">
											<Warehouse className="h-8 w-8 text-muted-foreground" />
										</div>
										<h3 className="text-lg font-semibold mb-2">No locations yet</h3>
										<p className="text-sm text-muted-foreground mb-4 max-w-sm">
											Create your first location to start tracking inventory across different areas.
										</p>
										<Button
											onClick={() => handleLocationDialog(true, undefined, "create")}
										>
											<Plus className="mr-2 h-4 w-4" />
											Add First Location
										</Button>
									</div>
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

			{isStockMetadataEditDialogOpen && (
				<StockMetadataEditDialog
					open={isStockMetadataEditDialogOpen}
					onOpenChange={setIsStockMetadataEditDialogOpen}
					stockItem={selectedStockItem}
					onSuccess={handleDialogSuccess}
				/>
			)}

			{confirmation.dialog}
		</div>
	);
};
