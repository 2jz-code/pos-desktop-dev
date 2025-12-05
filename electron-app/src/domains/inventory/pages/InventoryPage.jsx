import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
	DropdownMenuLabel,
	DropdownMenuSeparator,
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
	History,
} from "lucide-react";
import { StandardTable } from "@/shared/components/layout/StandardTable";
import { useInventoryBarcode, useOnlineStatus, useOfflineInventory, useOfflineInventoryLocations } from "@/shared/hooks";
import { PageHeader } from "@/shared/components/layout/PageHeader";
import { useDebounce, useScrollToScannedItem } from "@ajeen/ui";
import { formatCurrency } from "@ajeen/ui";
import { PaginationControls } from "@/shared/components/ui/PaginationControls";
import { OfflineBanner } from "@/shared/components/ui/OfflineBanner";

// Import dialog components
import StockAdjustmentDialog from "@/domains/inventory/components/StockAdjustmentDialog";
import LocationManagementDialog from "@/domains/inventory/components/LocationManagementDialog";
import StockTransferDialog from "@/domains/inventory/components/StockTransferDialog";
import { StockMetadataEditDialog } from "@/domains/inventory/components/dialogs/StockMetadataEditDialog";

// Import services
import {
	getDashboardData,
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
	const isOnline = useOnlineStatus();
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
	const [isStockMetadataEditDialogOpen, setIsStockMetadataEditDialogOpen] = useState(false);
	const [selectedStockItem, setSelectedStockItem] = useState(null);

	// Filtering and search states
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedLocation, setSelectedLocation] = useState(null);
	const [stockFilter, setStockFilter] = useState("all"); // all, low_stock, expiring_soon
	const debouncedSearchQuery = useDebounce(searchQuery, 300);

	// Pagination state
	const [stockPage, setStockPage] = useState(1);
	const stockPageSize = 25;

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
		isStockMetadataEditDialogOpen,
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

	// Data fetching - LOCAL-FIRST: Always use cache, API is for sync only
	const {
		data: cachedStock,
		loading: cachedStockLoading,
		refetch: refetchStock,
	} = useOfflineInventory();

	const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
		queryKey: ["inventory-dashboard"],
		queryFn: getDashboardData,
		enabled: isOnline,
	});

	// Compute low stock and expiring indicators locally
	const enrichedStock = useMemo(() => {
		if (!cachedStock || cachedStock.length === 0) return [];

		const now = new Date();
		const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

		return cachedStock.map(item => {
			const quantity = Number(item.quantity) || 0;
			const threshold = item.low_stock_threshold || 10;

			// Compute is_low_stock locally
			const is_low_stock = quantity > 0 && quantity <= threshold;

			// Compute is_expiring_soon locally (within 7 days)
			let is_expiring_soon = false;
			if (item.expiration_date) {
				const expDate = new Date(item.expiration_date);
				is_expiring_soon = expDate > now && expDate <= sevenDaysFromNow;
			}

			return {
				...item,
				is_low_stock: item.is_low_stock ?? is_low_stock,
				is_expiring_soon: item.is_expiring_soon ?? is_expiring_soon,
			};
		});
	}, [cachedStock]);

	// Apply local filtering
	const filteredStock = useMemo(() => {
		let result = enrichedStock;

		// Filter by location
		if (selectedLocation) {
			result = result.filter(item =>
				String(item.location?.id) === String(selectedLocation) ||
				String(item.location_id) === String(selectedLocation)
			);
		}

		// Filter by search query
		if (debouncedSearchQuery) {
			const query = debouncedSearchQuery.toLowerCase();
			result = result.filter(item =>
				item.product?.name?.toLowerCase().includes(query) ||
				item.product?.barcode?.toLowerCase().includes(query)
			);
		}

		// Filter by stock status
		if (stockFilter === "low_stock") {
			result = result.filter(item => item.is_low_stock);
		} else if (stockFilter === "expiring_soon") {
			result = result.filter(item => item.is_expiring_soon);
		}

		return result;
	}, [enrichedStock, selectedLocation, debouncedSearchQuery, stockFilter]);

	// Paginate locally
	const paginatedStock = useMemo(() => {
		const startIdx = (stockPage - 1) * stockPageSize;
		const endIdx = startIdx + stockPageSize;
		return filteredStock.slice(startIdx, endIdx);
	}, [filteredStock, stockPage, stockPageSize]);

	// Stock data and pagination
	const stockData = paginatedStock;
	const stockLoading = cachedStockLoading;
	const stockCount = filteredStock.length;
	const totalPages = Math.ceil(stockCount / stockPageSize);
	const stockNextUrl = stockPage < totalPages ? `?page=${stockPage + 1}` : null;
	const stockPrevUrl = stockPage > 1 ? `?page=${stockPage - 1}` : null;

	// Compute dashboard data from enriched stock (local-first)
	// Use enrichedStock which already has is_low_stock and is_expiring_soon computed
	const localDashboardData = useMemo(() => {
		if (!enrichedStock || enrichedStock.length === 0) return null;

		// Get unique products
		const uniqueProductIds = new Set(enrichedStock.map(s => s.product?.id));

		// Calculate stats using pre-computed flags
		const outOfStockItems = enrichedStock.filter(s => Number(s.quantity) <= 0);
		const lowStockItems = enrichedStock.filter(s => s.is_low_stock);
		const expiringItems = enrichedStock.filter(s => s.is_expiring_soon);

		// Calculate total value
		const totalValue = enrichedStock.reduce((sum, s) => {
			const qty = Number(s.quantity) || 0;
			const price = Number(s.product?.price) || 0;
			return sum + (qty * price);
		}, 0);

		return {
			summary: {
				total_products: uniqueProductIds.size,
				low_stock_count: lowStockItems.length,
				expiring_soon_count: expiringItems.length,
				out_of_stock_count: outOfStockItems.length,
				total_value: totalValue,
			},
			low_stock_items: lowStockItems.slice(0, 10).map(s => ({
				product_id: s.product?.id,
				product_name: s.product?.name || 'Unknown',
				quantity: s.quantity,
			})),
			expiring_soon_items: expiringItems.slice(0, 10).map(s => ({
				product_id: s.product?.id,
				product_name: s.product?.name || 'Unknown',
				quantity: s.quantity,
				expiration_date: s.expiration_date,
			})),
		};
	}, [enrichedStock]);

	// LOCAL-FIRST: Use locally computed dashboard data, API data is enhancement only
	// Local data is always available from cache; API data may provide more accurate counts
	const effectiveDashboardData = localDashboardData || dashboardData;

	// Reset page to 1 when filters change
	React.useEffect(() => {
		setStockPage(1);
	}, [selectedLocation, debouncedSearchQuery, stockFilter]);

	// Handle pagination navigation (works with both full URLs and local query strings)
	const handleStockNavigate = async (url) => {
		try {
			let page = 1;

			// Handle simple query string format (local pagination: "?page=2")
			if (url.startsWith('?')) {
				const params = new URLSearchParams(url);
				page = parseInt(params.get("page") || "1", 10);
			} else {
				// Handle full URL format (API pagination)
				const urlObj = new URL(url);
				page = parseInt(urlObj.searchParams.get("page") || "1", 10);
			}

			setStockPage(page);
		} catch (e) {
			console.error("Error parsing pagination URL:", e);
		}
	};

	// Load locations from offline cache (or API fallback)
	const {
		data: locations,
		loading: locationsLoading,
		refetch: refetchLocations,
	} = useOfflineInventoryLocations();

	// Delete location mutation
	const deleteLocationMutation = useMutation({
		mutationFn: (locationId) => deleteLocation(locationId),
		onSuccess: () => {
			refetchLocations({ forceApi: true });
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

	const handleStockMetadataEditDialog = (isOpen, stockItem) => {
		setIsStockMetadataEditDialogOpen(isOpen);
		setSelectedStockItem(stockItem || null);
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
		refetchStock({ forceApi: true });
		refetchLocations({ forceApi: true });
	};

	const refreshData = () => {
		queryClient.invalidateQueries({ queryKey: ["inventory-dashboard"] });
		queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
		refetchStock({ forceApi: true });
		refetchLocations({ forceApi: true });
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
							<DropdownMenuItem
								onClick={() => handleStockAdjustmentDialog(true, item.product)}
								disabled={!isOnline}
							>
								<Edit className="mr-2 h-4 w-4" />
								Adjust Stock
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => handleStockTransferDialog(true, item.product)}
								disabled={!isOnline}
							>
								<ArrowUpDown className="mr-2 h-4 w-4" />
								Transfer
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => handleStockMetadataEditDialog(true, item)}
								disabled={!isOnline}
							>
								<Settings className="mr-2 h-4 w-4" />
								Edit Stock Record
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

	// Define header actions
	const headerActions = (
		<div className="flex items-center gap-3">
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
						disabled={!isOnline}
					>
						<Plus className="mr-2 h-4 w-4" />
						New Adjustment
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => handleStockTransferDialog(true)}
						disabled={!isOnline}
					>
						<ArrowUpDown className="mr-2 h-4 w-4" />
						Transfer Stock
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => handleStockMetadataEditDialog(true)}
						disabled={!isOnline}
					>
						<Edit className="mr-2 h-4 w-4" />
						Edit Stock Record
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => navigate('/inventory/history')}
						disabled={!isOnline}
					>
						<History className="mr-2 h-4 w-4" />
						Stock History
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => navigate('/settings?tab=inventory')}>
						<Settings className="mr-2 h-4 w-4" />
						Configure Defaults
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);

	return (
		<div className="flex flex-col h-full">
			{/* Page Header */}
			<PageHeader
				icon={Warehouse}
				title="Inventory Management"
				description="Track and manage your product stock across all locations"
				actions={headerActions}
				className="shrink-0"
			/>

			<OfflineBanner dataType="inventory" />

			{/* Dashboard Cards */}
			<div className="border-b bg-background/95 backdrop-blur-sm p-4">
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Total Products
						</CardTitle>
						<Package className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{effectiveDashboardData?.summary?.total_products || 0}
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
							{effectiveDashboardData?.summary?.low_stock_count || 0}
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
							{effectiveDashboardData?.summary?.expiring_soon_count || 0}
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
							{effectiveDashboardData?.summary?.out_of_stock_count || 0}
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
							{formatCurrency(effectiveDashboardData?.summary?.total_value || 0)}
						</div>
					</CardContent>
				</Card>
				</div>
			</div>

			{/* Main Content */}
			<div className="flex-1 min-h-0 p-4">
				<Tabs
					value={activeTab}
					onValueChange={setActiveTab}
					className="h-full flex flex-col"
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
						{effectiveDashboardData?.low_stock_items &&
							effectiveDashboardData.low_stock_items.length > 0 && (
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
										{effectiveDashboardData.low_stock_items
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
															disabled={!isOnline}
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

						{effectiveDashboardData?.expiring_soon_items &&
							effectiveDashboardData.expiring_soon_items.length > 0 && (
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
										{effectiveDashboardData.expiring_soon_items
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
															disabled={!isOnline}
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
						<CardContent className="flex-grow flex flex-col overflow-hidden min-h-0">
							<div ref={tableContainerRef} className="flex-grow overflow-y-auto min-h-0">
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
							</div>

							{/* Pagination Controls */}
							<div className="flex-shrink-0 border-t border-border pt-4">
								<PaginationControls
									prevUrl={stockPrevUrl}
									nextUrl={stockNextUrl}
									onNavigate={handleStockNavigate}
									count={stockCount}
									currentPage={stockPage}
									pageSize={stockPageSize}
								/>
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
									disabled={!isOnline}
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
														disabled={!isOnline}
													>
														<Edit className="mr-2 h-4 w-4" />
														Edit
													</DropdownMenuItem>
													<DropdownMenuItem
														onClick={() => handleDeleteLocation(loc)}
														className="text-red-600"
														disabled={!isOnline || deleteLocationMutation.isPending}
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
			</div>

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

			{/* Confirmation Dialog */}
			{confirmation.dialog}
		</div>
	);
};

export default InventoryPage;