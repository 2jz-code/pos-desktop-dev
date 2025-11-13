import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation as useStoreLocation } from "@/contexts/LocationContext";
import { getPayments } from "@/services/api/paymentService";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { DomainPageLayout } from "@/components/shared/DomainPageLayout";
import { StandardTable } from "@/components/shared/StandardTable";
import { formatCurrency, usePaymentsData } from "@ajeen/ui";
import {
	CreditCard,
	Banknote,
	Gift,
	Split,
	RotateCw,
	Info,
	Filter,
	X
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { PaginationControls } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { DualDatePicker } from "@/components/ui/dual-date-picker";

const PaymentsPage = () => {
	const [payments, setPayments] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [nextUrl, setNextUrl] = useState(null);
	const [prevUrl, setPrevUrl] = useState(null);
	const [count, setCount] = useState(0);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { tenant } = useAuth();
	const tenantSlug = tenant?.slug || '';
	const { selectedLocationId, locations } = useStoreLocation();

	// Use the payments data hook with URL persistence
	const {
		filters,
		searchInput,
		currentPage,
		setSearchInput,
		updateFilter,
		setCurrentPage,
		filtersRef,
		currentPageRef,
	} = usePaymentsData({
		additionalFilters: selectedLocationId ? { store_location: selectedLocationId } : {},
	});

	// Helper to get location name by ID
	const getLocationName = (locationId) => {
		if (!locationId) return "N/A";
		const location = locations.find(loc => loc.id === locationId);
		return location?.name || "Unknown";
	};

	const fetchPayments = useCallback(
		async (url = null) => {
			try {
				setLoading(true);

				// Build merged filters using refs for stable async access
				const mergedFilters = { ...filtersRef.current };

				// Add page parameter if not using a pagination URL
				if (!url && currentPageRef.current > 1) {
					mergedFilters.page = currentPageRef.current;
				}

				// Store location is now handled by middleware via X-Store-Location header
				const data = await getPayments(mergedFilters, url);
				setPayments(data.results || []);
				setNextUrl(data.next);
				setPrevUrl(data.previous);
				setCount(data.count || 0);

				// Only update currentPage if we used a pagination URL
				if (url) {
					const urlObj = new URL(url);
					const page = parseInt(urlObj.searchParams.get("page") || "1", 10);
					setCurrentPage(page);
				}
				// Don't reset to 1 - currentPage already has the right value from state

				setError(null);
			} catch (err) {
				setError("Failed to fetch payments.");
				console.error("Payment fetch error:", err);
			} finally {
				setLoading(false);
			}
		},
		[filters, currentPage] // Dependencies to trigger refetch when filters/page change
	);

	useEffect(() => {
		fetchPayments();
	}, [fetchPayments]);

	const handleNavigate = (url) => {
		if (url) fetchPayments(url);
	};

	const handleFilterChange = (filterName, value) => {
		const actualValue = value === "ALL" ? "" : value;
		updateFilter(filterName, actualValue);
	};

	const handleSearchChange = (e) => {
		const value = e.target.value;
		setSearchInput(value);
	};

	const handleRefresh = async () => {
		setIsRefreshing(true);
		await fetchPayments();
		setIsRefreshing(false);
	};

	// Date range state
	const [startDate, setStartDate] = useState(() => {
		return filters.created_at__gte ? new Date(filters.created_at__gte) : undefined;
	});
	const [endDate, setEndDate] = useState(() => {
		return filters.created_at__lte ? new Date(filters.created_at__lte) : undefined;
	});

	// Handle date changes
	const handleStartDateChange = (date) => {
		setStartDate(date);
		handleFilterChange('created_at__gte', date ? format(date, 'yyyy-MM-dd') : '');
	};

	const handleEndDateChange = (date) => {
		setEndDate(date);
		handleFilterChange('created_at__lte', date ? format(date, 'yyyy-MM-dd') : '');
	};

	const getStatusVariant = (status) => {
		switch (status?.toUpperCase()) {
			case "PAID":
			case "PARTIALLY_PAID":
				return "default";
			case "REFUNDED":
			case "PARTIALLY_REFUNDED":
				return "destructive";
			case "PENDING":
				return "secondary";
			case "UNPAID":
				return "outline";
			default:
				return "outline";
		}
	};

	// Status dot colors
	const getStatusDotColor = (status) => {
		switch (status?.toUpperCase()) {
			case "PAID":
				return "bg-emerald-500";
			case "PARTIALLY_PAID":
				return "bg-yellow-500";
			case "PENDING":
				return "bg-blue-500";
			case "UNPAID":
				return "bg-red-500";
			case "REFUNDED":
			case "PARTIALLY_REFUNDED":
				return "bg-gray-500";
			default:
				return "bg-gray-400";
		}
	};

	// Payment method icons
	const getMethodIcon = (method) => {
		const methodStr = method?.toUpperCase();
		if (methodStr === "CASH") {
			return <Banknote className="h-3.5 w-3.5" />;
		}
		if (methodStr === "GIFT CARD") {
			return <Gift className="h-3.5 w-3.5" />;
		}
		if (methodStr === "SPLIT") {
			return <Split className="h-3.5 w-3.5" />;
		}
		return <CreditCard className="h-3.5 w-3.5" />;
	};

	const getPaymentMethod = (transactions) => {
		if (!transactions || transactions.length === 0) {
			return "N/A";
		}
		
		// Find transactions that actually processed payment (successful or refunded)
		const processedTransactions = transactions.filter(
			transaction => transaction.status === "SUCCESSFUL" || transaction.status === "REFUNDED"
		);
		
		if (processedTransactions.length === 0) {
			// No successful payments, show method of any attempted transaction
			return transactions[0].method.replace("_", " ") || "N/A";
		}
		
		// Only count successful transactions for split determination
		const successfulTransactions = processedTransactions.filter(
			transaction => transaction.status === "SUCCESSFUL"
		);
		
		if (successfulTransactions.length > 1) {
			return "SPLIT";
		}
		
		// Return the method of the processed payment (successful or refunded)
		return processedTransactions[0].method.replace("_", " ") || "N/A";
	};

	// Conditionally include location column when viewing all locations
	const headers = [
		{ label: "Payment", className: "pl-6 w-[200px]" },
		{ label: "Order", className: "w-[140px]" },
		...((!selectedLocationId && locations.length > 1) ? [{ label: "Location", className: "w-[140px]" }] : []),
		{ label: "Method", className: "w-[140px]" },
		{ label: "Status", className: "w-[140px]" },
		{ label: "Amount", className: "text-right w-[120px]" },
		{ label: "Time", className: "w-[160px]" },
	];

	const renderPaymentRow = (payment) => {
		const transactionCount = payment.transactions?.length || 0;
		const method = getPaymentMethod(payment.transactions);

		return (
			<>
				{/* Payment Number - ENLARGED */}
				<TableCell className="pl-6 py-3">
					<div className="flex flex-col gap-0.5">
						<span className="font-mono text-base font-bold text-foreground">
							#{payment.payment_number}
						</span>
						<span className="text-xs text-muted-foreground">
							{transactionCount} {transactionCount === 1 ? "transaction" : "transactions"}
						</span>
					</div>
				</TableCell>

				{/* Order Link */}
				<TableCell className="py-3">
					<span className="font-mono text-sm text-foreground font-medium">
						{payment.order ? `#${payment.order_number}` : "N/A"}
					</span>
				</TableCell>

				{/* Location - Only show when viewing all locations */}
				{!selectedLocationId && locations.length > 1 && (
					<TableCell className="py-3">
						<span className="text-sm text-foreground font-medium">
							{getLocationName(payment.order?.store_location)}
						</span>
					</TableCell>
				)}

				{/* Payment Method with Icon */}
				<TableCell className="py-3">
					<div className="flex items-center gap-2">
						{getMethodIcon(method)}
						<Badge
							variant="outline"
							className="border-border capitalize text-xs"
						>
							{method}
						</Badge>
					</div>
				</TableCell>

				{/* Status with DOT */}
				<TableCell className="py-3">
					<div className="flex items-center gap-2">
						<div className={`h-2 w-2 rounded-full ${getStatusDotColor(payment.status)}`} />
						<Badge
							variant={getStatusVariant(payment.status)}
							className="font-semibold text-xs"
						>
							{payment.status}
						</Badge>
					</div>
				</TableCell>

				{/* Amount - PROMINENT */}
				<TableCell className="text-right py-3">
					<span className="text-base font-bold text-foreground">
						{formatCurrency(payment.total_collected)}
					</span>
				</TableCell>

				{/* Time - RELATIVE */}
				<TableCell className="py-3">
					<div className="flex flex-col gap-0.5">
						<span className="text-sm text-muted-foreground">
							{formatDistanceToNow(new Date(payment.created_at), { addSuffix: true })}
						</span>
						<span className="text-xs text-muted-foreground/70">
							{format(new Date(payment.created_at), "MMM d, h:mm a")}
						</span>
					</div>
				</TableCell>
			</>
		);
	};

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
						<SelectItem value="ALL">All Statuses</SelectItem>
						<SelectItem value="PENDING">Pending</SelectItem>
						<SelectItem value="UNPAID">Unpaid</SelectItem>
						<SelectItem value="PAID">Paid</SelectItem>
						<SelectItem value="PARTIALLY_PAID">Partially Paid</SelectItem>
						<SelectItem value="REFUNDED">Refunded</SelectItem>
						<SelectItem value="PARTIALLY_REFUNDED">Partially Refunded</SelectItem>
					</SelectContent>
				</Select>
				<Select
					value={filters.method || "ALL"}
					onValueChange={(value) => handleFilterChange("method", value)}
				>
					<SelectTrigger className="w-[180px] border-border">
						<SelectValue placeholder="Filter by Method" />
					</SelectTrigger>
					<SelectContent className="border-border">
						<SelectItem value="ALL">All Methods</SelectItem>
						<SelectItem value="CASH">Cash</SelectItem>
						<SelectItem value="CARD_TERMINAL">Card</SelectItem>
						<SelectItem value="GIFT_CARD">Gift Card</SelectItem>
						<SelectItem value="SPLIT">Split Payment</SelectItem>
					</SelectContent>
				</Select>
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
			// Skip individual date fields, we'll show them as one "Date Range" filter
			if (key === "created_at__gte" || key === "created_at__lte") {
				return false;
			}
			return value && value !== "ALL";
		})
		.map(([key, value]) => ({ key, value }));

	// Add date range as a single filter if either date is set
	if (filters.created_at__gte || filters.created_at__lte) {
		activeFilters.push({
			key: "dateRange",
			value: `${filters.created_at__gte || "..."} to ${filters.created_at__lte || "..."}`,
		});
	}

	return (
		<DomainPageLayout
			pageTitle="Payments"
			pageDescription="Manage and track all payment transactions"
			pageIcon={CreditCard}
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
							placeholder="Search payments..."
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
								<p className="text-xs">Search by: Payment #, Order #, Card Last 4, Card Brand, or Amount</p>
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
										handleFilterChange("created_at__gte", "");
										handleFilterChange("created_at__lte", "");
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
								// Clear all filters and search
								setSearchInput("");
								setStartDate(undefined);
								setEndDate(undefined);
								handleFilterChange("status", "ALL");
								handleFilterChange("method", "ALL");
								handleFilterChange("created_at__gte", "");
								handleFilterChange("created_at__lte", "");
							}}
							className="h-7 text-xs"
						>
							Clear all
						</Button>
					)}
				</div>
			)}

			<StandardTable
				headers={headers}
				data={payments}
				loading={loading}
				emptyMessage="No payments found for the selected filters."
				onRowClick={(payment) => {
					// Preserve URL parameters when navigating to payment details
					const currentParams = window.location.search.substring(1);
					const url = `/${tenantSlug}/payments/${payment.id}${currentParams ? `?${currentParams}` : ''}`;
					navigate(url);
				}}
				renderRow={renderPaymentRow}
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
};

export default PaymentsPage;
