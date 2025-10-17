import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
import { DomainPageLayout } from "@/components/shared/DomainPageLayout";
import { StandardTable } from "@/components/shared/StandardTable";
import { formatCurrency } from "@ajeen/ui";
import {
	CreditCard,
	Banknote,
	Gift,
	Split,
	RotateCw
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { PaginationControls } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";

const PaymentsPage = () => {
	const [payments, setPayments] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [nextUrl, setNextUrl] = useState(null);
	const [prevUrl, setPrevUrl] = useState(null);
	const [count, setCount] = useState(0);
	const [currentPage, setCurrentPage] = useState(1);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [filters, setFilters] = useState({
		status: "",
		method: "",
		search: "",
	});
	const navigate = useNavigate();
	const { tenant } = useAuth();
	const tenantSlug = tenant?.slug || '';
	const { selectedLocationId, locations } = useStoreLocation();

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
				// Store location is now handled by middleware via X-Store-Location header
				const data = await getPayments(filters, url);
				setPayments(data.results || []);
				setNextUrl(data.next);
				setPrevUrl(data.previous);
				setCount(data.count || 0);

				// Extract current page from URL or use page 1 as default
				if (url) {
					const urlObj = new URL(url);
					const page = parseInt(urlObj.searchParams.get("page") || "1");
					setCurrentPage(page);
				} else {
					setCurrentPage(1);
				}

				setError(null);
			} catch (err) {
				setError("Failed to fetch payments.");
				console.error("Payment fetch error:", err);
			} finally {
				setLoading(false);
			}
		},
		[filters, selectedLocationId]
	);

	useEffect(() => {
		fetchPayments();
	}, [fetchPayments]);

	const handleNavigate = (url) => {
		if (url) fetchPayments(url);
	};

	const handleFilterChange = (filterName, value) => {
		const actualValue = value === "ALL" ? "" : value;
		setFilters((prev) => ({ ...prev, [filterName]: actualValue }));
	};

	const handleSearchChange = (e) => {
		const value = e.target.value;
		setFilters((prev) => ({ ...prev, search: value }));
	};

	const handleRefresh = async () => {
		setIsRefreshing(true);
		await fetchPayments();
		setIsRefreshing(false);
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
		<>
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
		</>
	);

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
			searchPlaceholder="Search by payment number, order number, or amount..."
			searchValue={filters.search}
			onSearchChange={handleSearchChange}
			filterControls={filterControls}
			error={error}
		>
			<StandardTable
				headers={headers}
				data={payments}
				loading={loading}
				emptyMessage="No payments found for the selected filters."
				onRowClick={(payment) => navigate(`/${tenantSlug}/payments/${payment.id}`)}
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
