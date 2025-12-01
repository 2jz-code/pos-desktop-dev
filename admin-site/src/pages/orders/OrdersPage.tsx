import { useNavigate, useSearchParams } from "react-router-dom";
import { getAllOrders, voidOrder } from "@/services/api/orderService";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableHead } from "@/components/ui/table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	EllipsisVertical,
	ClipboardList,
	Eye,
	Ban,
	Filter,
	X,
	RotateCw,
	Info,
	CloudOff,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation as useStoreLocation } from "@/contexts/LocationContext";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { DualDatePicker } from "@/components/ui/dual-date-picker";
import { DomainPageLayout } from "@/components/shared/DomainPageLayout";
import { StandardTable } from "@/components/shared/StandardTable";
import { PaginationControls } from "@/components/ui/pagination";
import { format, formatDistanceToNow } from "date-fns";
import { formatCurrency } from "@ajeen/ui";
import {
	getStatusConfig,
	getPaymentStatusConfig,
	useOrdersData,
	useOrderActions,
	STATUS_FILTER_OPTIONS,
	ORDER_TYPE_FILTER_OPTIONS
} from "@ajeen/ui";

interface Order {
	id: string;
	order_number: string;
	status: string;
	payment_status: string;
	order_type: string;
	store_location: number | null;
	total_collected: number;
	total_with_tip: number;
	item_count: number;
	created_at: string;
	completed_at: string | null;
	is_offline_order?: boolean;
}

export default function OrdersPage() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { toast } = useToast();
	const { user, tenant } = useAuth();
	const tenantSlug = tenant?.slug || '';
	const [isRefreshing, setIsRefreshing] = useState(false);
	const { selectedLocationId, locations } = useStoreLocation();

	// Helper to get location name by ID
	const getLocationName = (locationId: number | null) => {
		if (!locationId) return "N/A";
		const location = locations.find(loc => loc.id === locationId);
		return location?.name || "Unknown";
	};

	// Helper to navigate to order details while preserving current search params
	const navigateToOrder = (orderId: string) => {
		// Use window.location.search to get the actual current URL params
		// This avoids issues with searchParams being stale due to async state updates
		const currentParams = window.location.search.substring(1);
		const url = `/${tenantSlug}/orders/${orderId}${currentParams ? `?${currentParams}` : ''}`;
		navigate(url);
	};

	// Additional filters (store location is now handled by middleware via X-Store-Location header)
	// Include selectedLocationId to trigger refetch when location changes
	// Note: This is not sent to the API - middleware handles it via X-Store-Location header
	// But we need it in the object so useOrdersData can detect location changes
	const additionalFilters = useMemo(() => {
		return { _locationTrigger: selectedLocationId };
	}, [selectedLocationId]);

	// Use shared orders data hook
	const {
		orders,
		loading,
		error,
		nextUrl,
		prevUrl,
		count,
		currentPage,
		filters,
		searchInput,
		hasFilters,
		handleNavigate,
		handleFilterChange,
		handleSearchChange,
		clearFilters,
		refetch
	} = useOrdersData({
		getAllOrdersService: getAllOrders,
		additionalFilters
	});

	// Use shared order actions hook
	const { handleAction } = useOrderActions({
		toast,
		refetch
	});

	// Date range state - Shows orders created OR completed in range
	const [startDate, setStartDate] = useState<Date | undefined>(() => {
		return filters.date_range_gte ? new Date(filters.date_range_gte) : undefined;
	});
	const [endDate, setEndDate] = useState<Date | undefined>(() => {
		return filters.date_range_lte ? new Date(filters.date_range_lte) : undefined;
	});

	// Handle date changes - Uses OR logic (created OR completed)
	const handleStartDateChange = (date: Date | undefined) => {
		setStartDate(date);
		handleFilterChange('date_range_gte', date ? format(date, 'yyyy-MM-dd') : '');
	};

	const handleEndDateChange = (date: Date | undefined) => {
		setEndDate(date);
		handleFilterChange('date_range_lte', date ? format(date, 'yyyy-MM-dd') : '');
	};

	const handleRefresh = async () => {
		setIsRefreshing(true);
		await refetch();
		setIsRefreshing(false);
		toast({
			title: "Refreshed",
			description: "Orders list has been updated.",
		});
	};


	// Use shared status configurations
	const getStatusBadgeVariant = (status: string) => {
		return getStatusConfig(status).variant;
	};

	const getPaymentStatusBadgeVariant = (status: string) => {
		return getPaymentStatusConfig(status).variant;
	};

	// Status dot colors
	const getStatusDotColor = (status: string) => {
		switch (status) {
			case "COMPLETED":
				return "bg-emerald-500";
			case "PENDING":
				return "bg-yellow-500";
			case "HOLD":
				return "bg-blue-500";
			case "CANCELLED":
			case "VOID":
				return "bg-red-500";
			default:
				return "bg-gray-500";
		}
	};

	const getPaymentDotColor = (status: string) => {
		switch (status) {
			case "PAID":
				return "bg-emerald-500";
			case "PARTIALLY_PAID":
				return "bg-yellow-500";
			case "UNPAID":
				return "bg-red-500";
			case "REFUNDED":
			case "PARTIALLY_REFUNDED":
				return "bg-gray-500";
			default:
				return "bg-gray-400";
		}
	};

	// Conditionally include location column when viewing all locations
	const headers = [
		{ label: "Order", className: "pl-6 w-[180px]" },
		{ label: "Source", className: "w-[100px]" },
		...((!selectedLocationId && locations.length > 1) ? [{ label: "Location", className: "w-[120px]" }] : []),
		{ label: "Customer", className: "w-[140px]" },
		{ label: "Status", className: "w-[140px]" },
		{ label: "Amount", className: "text-right w-[100px]" },
		{ label: "Created", className: "w-[130px]" },
		{ label: "Completed", className: "w-[130px]" },
		{ label: "", className: "text-right pr-6 w-[80px]" },
	];

	const renderOrderRow = (order: Order) => (
		<>
			{/* Order Number - ENLARGED */}
			<TableCell className="pl-6 py-3">
				<div className="flex flex-col gap-0.5">
					<span className="font-mono text-base font-bold text-foreground">
						#{order.order_number}
					</span>
					<span className="text-xs text-muted-foreground">
						{order.item_count} {order.item_count === 1 ? "item" : "items"}
					</span>
				</div>
			</TableCell>

			{/* Source - PROMINENT */}
			<TableCell className="py-3">
				<div className="flex flex-col gap-1">
					<Badge
						variant={order.order_type === "WEB" ? "default" : "secondary"}
						className="text-sm font-bold px-3 py-1 w-fit"
					>
						{order.order_type}
					</Badge>
					{order.is_offline_order && (
						<Badge variant="secondary" className="text-xs bg-slate-100 text-slate-600 border-slate-200 w-fit">
							<CloudOff className="h-3 w-3 mr-1" />
							Offline
						</Badge>
					)}
				</div>
			</TableCell>

			{/* Location - Only show when viewing all locations */}
			{!selectedLocationId && locations.length > 1 && (
				<TableCell className="py-3">
					<span className="text-sm text-foreground font-medium">
						{getLocationName(order.store_location)}
					</span>
				</TableCell>
			)}

			{/* Customer */}
			<TableCell className="py-3">
				<span className="text-sm text-foreground font-medium">Guest Order</span>
			</TableCell>

			{/* Status with DOTS */}
			<TableCell className="py-3">
				<div className="flex flex-col gap-1.5">
					<div className="flex items-center gap-2">
						<div className={`h-2 w-2 rounded-full ${getStatusDotColor(order.status)}`} />
						<Badge
							variant={getStatusBadgeVariant(order.status)}
							className="text-xs font-semibold"
						>
							{order.status}
						</Badge>
					</div>
					<div className="flex items-center gap-2">
						<div className={`h-2 w-2 rounded-full ${getPaymentDotColor(order.payment_status)}`} />
						<Badge
							variant={getPaymentStatusBadgeVariant(order.payment_status)}
							className="text-xs font-medium"
						>
							{order.payment_status}
						</Badge>
					</div>
				</div>
			</TableCell>

			{/* Amount */}
			<TableCell className="text-right py-3">
				<span className="text-base font-bold text-foreground">
					{formatCurrency(Number.parseFloat(order.total_collected || order.total_with_tip))}
				</span>
			</TableCell>

			{/* Created Time - When order was placed */}
			<TableCell className="py-3">
				<div className="flex flex-col gap-0.5">
					<span className="text-xs text-muted-foreground/70">
						{format(new Date(order.created_at), "MMM d")}
					</span>
					<span className="text-xs text-muted-foreground">
						{format(new Date(order.created_at), "h:mm a")}
					</span>
				</div>
			</TableCell>

			{/* Completed Time - When order was finished & paid */}
			<TableCell className="py-3">
				{order.completed_at ? (
					<div className="flex flex-col gap-0.5">
						<span className="text-xs text-muted-foreground/70">
							{format(new Date(order.completed_at), "MMM d")}
						</span>
						<span className="text-xs text-muted-foreground">
							{format(new Date(order.completed_at), "h:mm a")}
						</span>
					</div>
				) : (
					<span className="text-xs text-muted-foreground italic">
						—
					</span>
				)}
			</TableCell>

			{/* Actions */}
			<TableCell onClick={(e) => e.stopPropagation()} className="text-right pr-6">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="h-8 w-8">
							<EllipsisVertical className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-40">
						<DropdownMenuItem onClick={(e) => {
							e.stopPropagation();
							navigateToOrder(order.id);
						}}>
							<Eye className="mr-2 h-4 w-4" />
							View Details
						</DropdownMenuItem>
						{user?.role === "OWNER" &&
							(order.status === "PENDING" || order.status === "HOLD") && (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										className="text-destructive focus:text-destructive"
										onClick={() =>
											handleAction(
												order.id.toString(),
												voidOrder,
												"Order voided successfully."
											)
										}
									>
										<Ban className="mr-2 h-4 w-4" />
										Void Order
									</DropdownMenuItem>
								</>
							)}
					</DropdownMenuContent>
				</DropdownMenu>
			</TableCell>
		</>
	);

	const filterControls = (
		<div className="flex items-center w-full">
			<div className="flex items-center gap-2">
				<Select
					value={filters.status || "ALL"}
					onValueChange={(value) => handleFilterChange("status", value)}
				>
					<SelectTrigger className="w-[180px] border-border">
						<SelectValue placeholder="Filter by Status" />
					</SelectTrigger>
					<SelectContent className="border-border">
						{STATUS_FILTER_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={filters.order_type || "ALL"}
					onValueChange={(value) => handleFilterChange("order_type", value)}
				>
					<SelectTrigger className="w-[180px] border-border">
						<SelectValue placeholder="Filter by Type" />
					</SelectTrigger>
					<SelectContent className="border-border">
						{ORDER_TYPE_FILTER_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{/* Date type filter - only show when date range is selected */}
				{(startDate || endDate) && (
					<Select
						value={filters.date_filter_type || "all"}
						onValueChange={(value) => handleFilterChange("date_filter_type", value)}
					>
						<SelectTrigger className="w-[180px] border-border">
							<SelectValue placeholder="Date Filter" />
						</SelectTrigger>
						<SelectContent className="border-border">
							<SelectItem value="all">All Activity</SelectItem>
							<SelectItem value="created">Created Only</SelectItem>
							<SelectItem value="completed">Completed Only</SelectItem>
						</SelectContent>
					</Select>
				)}
			</div>
			<div className="ml-auto">
				<DualDatePicker
					startDate={startDate}
					endDate={endDate}
					onStartDateChange={handleStartDateChange}
					onEndDateChange={handleEndDateChange}
				/>
			</div>
		</div>
	);

	// Active filters - include search query and date range
	const activeFilters = Object.entries(filters)
		.filter(([key, value]) => {
			if (key === "search") {
				return value && value.trim() !== "";
			}
			// Skip individual date fields and date_filter_type - we'll show them together
			if (key === "date_range_gte" || key === "date_range_lte" || key === "date_filter_type") {
				return false;
			}
			return value && value !== "ALL" && value !== "all";
		})
		.map(([key, value]) => ({ key, value }));

	// Add date range as a single filter if either date is set
	if (filters.date_range_gte || filters.date_range_lte) {
		const dateType = filters.date_filter_type || "all";
		const dateTypeLabel = dateType === "created" ? " (Created)" : dateType === "completed" ? " (Completed)" : "";
		activeFilters.push({
			key: "dateRange",
			value: `${filters.date_range_gte || "..."} to ${filters.date_range_lte || "..."}${dateTypeLabel}`,
		});
	}

	return (
		<DomainPageLayout
			pageTitle="Orders"
			pageDescription="Manage and track all customer orders"
			pageIcon={ClipboardList}
			pageActions={
				<Button
					variant="outline"
					size="sm"
					onClick={handleRefresh}
					disabled={isRefreshing}
					className="gap-2"
				>
					<RotateCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
					{isRefreshing ? "Refreshing..." : "Refresh"}
				</Button>
			}
			title="Filters & Search"
			showSearch={false}
			filterControls={filterControls}
			error={error}
		>
			{/* Custom Search Bar with Tooltip */}
			<div className="mb-6">
				<div className="relative max-w-md flex items-center gap-2">
					<div className="relative flex-1">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground"
						>
							<circle cx="11" cy="11" r="8" />
							<path d="m21 21-4.3-4.3" />
						</svg>
						<input
							type="text"
							placeholder="Search orders..."
							value={searchInput}
							onChange={handleSearchChange}
							className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 pl-8 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
						/>
					</div>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									<Info className="h-4 w-4" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="top" align="start" className="max-w-xs bg-popover text-popover-foreground border border-border shadow-lg">
								<p className="text-xs">Search by: Order #, Customer/Guest info, Cashier, Product name, or Barcode</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			</div>
			{/* Active Filters Display */}
			{activeFilters.length > 0 && (
				<div className="flex items-center gap-2 mb-6 flex-wrap">
					<Filter className="h-4 w-4 text-muted-foreground" />
					<span className="text-sm text-muted-foreground font-medium">Filters:</span>
					{activeFilters.map(({ key, value }) => (
						<Badge
							key={key}
							variant="secondary"
							className="gap-1.5 px-3 py-1"
						>
							<span className="text-xs font-medium">
								{key === "search" ? (
									<>
										<span className="text-muted-foreground">Search:</span>{" "}
										<span className="font-semibold">{value}</span>
									</>
								) : key === "dateRange" ? (
									<>
										<span className="text-muted-foreground">Date:</span>{" "}
										<span className="font-semibold">{value}</span>
									</>
								) : (
									<span className="capitalize">
										{key === "status" ? `${value}` : value.replace("_", " ")}
									</span>
								)}
							</span>
							<button
								onClick={() => {
									if (key === "search") {
										setSearchInput("");
									} else if (key === "dateRange") {
										setStartDate(undefined);
										setEndDate(undefined);
										handleFilterChange("date_range_gte", "");
										handleFilterChange("date_range_lte", "");
										handleFilterChange("date_filter_type", "");
									} else {
										handleFilterChange(key, "ALL");
									}
								}}
								className="hover:bg-muted-foreground/20 rounded-full p-0.5 transition-colors"
							>
								<X className="h-3 w-3" />
							</button>
						</Badge>
					))}
					{activeFilters.length > 0 && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								clearFilters();
								setStartDate(undefined);
								setEndDate(undefined);
							}}
							className="h-7 text-xs"
						>
							Clear all
						</Button>
					)}
				</div>
			)}

			{/* Borderless Modern Table */}
			<StandardTable
				headers={headers}
				data={orders}
				loading={loading}
				emptyMessage="No orders found for the selected filters."
				onRowClick={(order) => navigateToOrder(order.id)}
				renderRow={renderOrderRow}
				colSpan={headers.length}
				className="border-0"
			/>

			<PaginationControls
				prevUrl={prevUrl}
				nextUrl={nextUrl}
				onNavigate={handleNavigate}
				count={count}
				currentPage={currentPage}
				pageSize={25}
			/>
		</DomainPageLayout>
	);
}
