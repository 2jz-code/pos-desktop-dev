import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getPayments } from "@/domains/payments/services/paymentService";
import { useOnlineStatus } from "@/shared/hooks";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Badge } from "@/shared/components/ui/badge";
import {
  CreditCard,
  Search,
  Filter,
  CheckCircle,
  Clock,
  XCircle,
  DollarSign,
  RefreshCw,
  LayoutGrid,
  List,
  CloudOff,
} from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@ajeen/ui";
import { PageHeader } from "@/shared/components/layout/PageHeader";
import { PaginationControls } from "@/shared/components/ui/PaginationControls";
import { OfflineBanner } from "@/shared/components/ui/OfflineBanner";
import { FilterPill } from "@/domains/orders/components/FilterPill";
import { PaymentsTableView } from "../components/PaymentsTableView";

export default function PaymentsPage() {
	const [onlinePayments, setOnlinePayments] = useState([]);
	const [offlinePayments, setOfflinePayments] = useState([]);
	const [onlineLoading, setOnlineLoading] = useState(true);
	const [offlineLoading, setOfflineLoading] = useState(false);
	const [error, setError] = useState(null);
	const [nextUrl, setNextUrl] = useState(null);
	const [prevUrl, setPrevUrl] = useState(null);
	const [onlineCount, setOnlineCount] = useState(0);
	const [currentPage, setCurrentPage] = useState(1);
	const [filters, setFilters] = useState({
		status: "",
		method: "",
		search: "",
	});
	const [showFilters, setShowFilters] = useState(false);
	const [viewMode, setViewMode] = useState(() => {
		return localStorage.getItem('paymentsViewMode') || 'cards';
	});
	const navigate = useNavigate();
	const isOnline = useOnlineStatus();

	// Use offline or online payments based on connectivity
	const payments = isOnline ? onlinePayments : offlinePayments;
	const loading = isOnline ? onlineLoading : offlineLoading;
	const count = isOnline ? onlineCount : offlinePayments.length;

	// Fetch offline payments from orders
	const fetchOfflinePayments = useCallback(async () => {
		if (!window.offlineAPI?.listOfflineOrders) return;

		setOfflineLoading(true);
		try {
			const orders = await window.offlineAPI.listOfflineOrders();
			// Extract payment data from offline orders
			const payments = orders
				.filter(order => order.payload?.payment_status === 'PAID' || order.payload?.total_collected > 0)
				.map(order => ({
					id: `offline-${order.local_id}`,
					local_id: order.local_id,
					payment_number: `OFF-${order.local_id.slice(0, 6).toUpperCase()}`,
					order: order.local_id,
					order_number: order.server_order_number || `OFF-${order.local_id.slice(0, 6).toUpperCase()}`,
					status: order.payload?.payment_status || 'PAID',
					total_collected: order.payload?.total_collected || order.payload?.total || 0,
					total_due: order.payload?.total || 0,
					tip: order.payload?.tip || 0,
					created_at: order.created_at,
					transactions: order.payload?.transactions || [{
						method: order.payload?.payment_method || 'CASH',
						status: 'SUCCESSFUL',
						amount: order.payload?.total_collected || order.payload?.total || 0,
					}],
					is_offline: true,
					sync_status: order.status,
				}));
			setOfflinePayments(payments);
		} catch (err) {
			console.error('Error fetching offline payments:', err);
		} finally {
			setOfflineLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!isOnline) {
			fetchOfflinePayments();
		}
	}, [isOnline, fetchOfflinePayments]);

	const fetchPayments = useCallback(
		async (url = null) => {
			try {
				setOnlineLoading(true);
				const data = await getPayments(filters, url);
				setOnlinePayments(data.results || []);
				setNextUrl(data.next);
				setPrevUrl(data.previous);
				setOnlineCount(data.count || 0);

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
				setOnlineLoading(false);
			}
		},
		[filters]
	);

	// Fetch payments when online
	useEffect(() => {
		if (isOnline) {
			fetchPayments();
		}
	}, [fetchPayments, isOnline]);

	// Refetch function that works for both online and offline
	const refetch = isOnline ? fetchPayments : fetchOfflinePayments;

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

	const clearFilters = () => {
		setFilters({
			status: "",
			method: "",
			search: "",
		});
	};

	const hasFilters = filters.status || filters.method || filters.search;

	const handleViewModeChange = (mode) => {
		setViewMode(mode);
		localStorage.setItem('paymentsViewMode', mode);
	};

	const handleCardClick = (payment) => {
		navigate(`/payments/${payment.id}`);
	};

	const getPaymentStatusConfig = (status) => {
		switch (status?.toUpperCase()) {
			case "PAID":
				return {
					variant: "default",
					icon: CheckCircle,
					color: "text-primary",
					label: "Paid"
				};
			case "PARTIALLY_PAID":
				return {
					variant: "secondary",
					icon: DollarSign,
					color: "text-accent-foreground",
					label: "Partially Paid"
				};
			case "REFUNDED":
			case "PARTIALLY_REFUNDED":
				return {
					variant: "destructive",
					icon: RefreshCw,
					color: "text-destructive",
					label: status === "REFUNDED" ? "Refunded" : "Partial Refund"
				};
			case "PENDING":
				return {
					variant: "secondary",
					icon: Clock,
					color: "text-accent-foreground",
					label: "Pending"
				};
			case "UNPAID":
				return {
					variant: "outline",
					icon: XCircle,
					color: "text-muted-foreground",
					label: "Unpaid"
				};
			default:
				return {
					variant: "outline",
					icon: Clock,
					color: "text-muted-foreground",
					label: status
				};
		}
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

	const PaymentsView = () => {
		if (viewMode === 'list') {
			return (
				<PaymentsTableView
					payments={payments}
					loading={loading}
					error={error}
					hasFilters={hasFilters}
					clearFilters={clearFilters}
					fetchPayments={refetch}
					onCardClick={handleCardClick}
					getPaymentStatusConfig={getPaymentStatusConfig}
					getPaymentMethod={getPaymentMethod}
					isOnline={isOnline}
				/>
			);
		}

		// Cards view
		if (loading) {
			return (
				<div className="space-y-4">
					{Array.from({ length: 6 }).map((_, i) => (
						<Card key={i} className="p-4">
							<div className="flex items-start justify-between gap-4">
								<div className="flex-1 space-y-3">
									<div className="flex items-center gap-3">
										<Skeleton className="h-6 w-20" />
										<Skeleton className="h-4 w-24" />
									</div>
									<Skeleton className="h-4 w-32" />
									<div className="flex gap-4">
										<Skeleton className="h-3 w-16" />
										<Skeleton className="h-3 w-24" />
									</div>
								</div>
								<div className="text-right space-y-2">
									<Skeleton className="h-6 w-16" />
									<Skeleton className="h-4 w-12" />
								</div>
							</div>
						</Card>
					))}
				</div>
			);
		}

		if (error) {
			return (
				<Card className="p-8 text-center">
					<CardContent>
						<p className="text-destructive mb-4">{error}</p>
						<Button onClick={() => fetchPayments()} variant="outline">
							Try Again
						</Button>
					</CardContent>
				</Card>
			);
		}

		if (payments.length === 0) {
			return (
				<Card className="p-8 text-center">
					<CardContent className="space-y-4">
						<CreditCard className="h-12 w-12 text-muted-foreground mx-auto" />
						<div>
							<h3 className="font-medium text-foreground mb-2">No payments found</h3>
							<p className="text-sm text-muted-foreground">
								{hasFilters
									? "Try adjusting your search or filter criteria"
									: "Payments will appear here once transactions are processed"
								}
							</p>
						</div>
						{hasFilters && (
							<Button variant="outline" onClick={clearFilters}>
								Clear Filters
							</Button>
						)}
					</CardContent>
				</Card>
			);
		}

		return (
			<div className="space-y-4">
				{payments.map((payment) => (
					<Card
						key={payment.id}
						className="p-4 cursor-pointer hover:shadow-md transition-shadow"
						onClick={() => handleCardClick(payment)}
					>
						<div className="flex items-start justify-between gap-4">
							<div className="flex-1 space-y-3">
								<div className="flex items-center gap-3 flex-wrap">
									<span className="font-mono text-sm font-medium">
										{payment.payment_number}
									</span>
									<Badge
										variant={getPaymentStatusConfig(payment.status).variant}
										className="text-xs"
									>
										{payment.status}
									</Badge>
									{payment.is_offline && (
										<Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 border-amber-200">
											<CloudOff className="h-3 w-3 mr-1" />
											{payment.sync_status === 'SYNCED' ? 'Synced' : 'Pending Sync'}
										</Badge>
									)}
								</div>
								<div className="text-sm text-muted-foreground">
									Order: {payment.order ? payment.order_number : "N/A"}
								</div>
								<div className="flex gap-4 text-xs text-muted-foreground">
									<span>Method: {getPaymentMethod(payment.transactions)}</span>
									<span>{format(new Date(payment.created_at), "MMM d, yyyy 'at' h:mm a")}</span>
								</div>
							</div>
							<div className="text-right">
								<div className="text-lg font-bold text-foreground">
									{formatCurrency(payment.total_collected)}
								</div>
								<div className="text-xs text-muted-foreground">
									Total
								</div>
							</div>
						</div>
					</Card>
				))}
			</div>
		);
	};

	return (
		<div className="flex flex-col h-full">
			{/* Page Header */}
			<PageHeader
				icon={CreditCard}
				title="Payments"
				description="Manage and track all payment transactions"
				className="shrink-0"
			/>

			<OfflineBanner dataType="payments" />

			{/* Search and Filters */}
			<div className="border-b bg-background/95 backdrop-blur-sm p-4 space-y-4">
				{/* Controls Row */}
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Button
							variant={showFilters ? "default" : "outline"}
							size="sm"
							onClick={() => setShowFilters(!showFilters)}
							className="shrink-0"
							disabled={!isOnline}
						>
							<Filter className="h-3 w-3 mr-1" />
							{showFilters ? "Hide Filters" : "Show Filters"}
						</Button>
					</div>

					<div className="flex items-center gap-4">
						<span className="text-sm text-muted-foreground">
							{isOnline
								? `Displaying ${payments.length} of ${count} payments`
								: `${payments.length} offline payment${payments.length !== 1 ? 's' : ''}`
							}
						</span>

						{/* View Toggle */}
						<div className="flex items-center gap-1 border rounded-md p-1">
							<Button
								variant={viewMode === 'cards' ? 'default' : 'ghost'}
								size="sm"
								onClick={() => handleViewModeChange('cards')}
								className="px-2 py-1 h-8"
							>
								<LayoutGrid className="h-3 w-3 mr-1" />
								Cards
							</Button>
							<Button
								variant={viewMode === 'list' ? 'default' : 'ghost'}
								size="sm"
								onClick={() => handleViewModeChange('list')}
								className="px-2 py-1 h-8"
							>
								<List className="h-3 w-3 mr-1" />
								List
							</Button>
						</div>
					</div>
				</div>

				{/* Search */}
				<div className="relative max-w-md">
					<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Search payments, transactions, amounts..."
						className="pl-10 h-11"
						value={filters.search}
						onChange={handleSearchChange}
					/>
				</div>

				{/* Filter Pills */}
				{showFilters && (
					<div className="flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
						<div className="flex items-center gap-2 flex-wrap">
							<FilterPill
								label="All"
								active={!hasFilters}
								onClick={clearFilters}
							/>
							<FilterPill
								label="Paid"
								active={filters.status === "PAID"}
								onClick={() => handleFilterChange("status", filters.status === "PAID" ? "ALL" : "PAID")}
								icon={CheckCircle}
							/>
							<FilterPill
								label="Pending"
								active={filters.status === "PENDING"}
								onClick={() => handleFilterChange("status", filters.status === "PENDING" ? "ALL" : "PENDING")}
								icon={Clock}
							/>
							<FilterPill
								label="Unpaid"
								active={filters.status === "UNPAID"}
								onClick={() => handleFilterChange("status", filters.status === "UNPAID" ? "ALL" : "UNPAID")}
								icon={XCircle}
							/>
							<FilterPill
								label="Refunded"
								active={filters.status === "REFUNDED"}
								onClick={() => handleFilterChange("status", filters.status === "REFUNDED" ? "ALL" : "REFUNDED")}
								icon={RefreshCw}
							/>
						</div>
					</div>
				)}

				{/* Extended Filters */}
				{showFilters && (
					<Card className="p-4">
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							<div>
								<label className="text-sm font-medium mb-2 block">Payment Method</label>
								<div className="flex flex-wrap gap-2">
									<FilterPill
										label="Cash"
										active={filters.method === "CASH"}
										onClick={() => handleFilterChange("method", filters.method === "CASH" ? "ALL" : "CASH")}
									/>
									<FilterPill
										label="Card"
										active={filters.method === "CARD_TERMINAL"}
										onClick={() => handleFilterChange("method", filters.method === "CARD_TERMINAL" ? "ALL" : "CARD_TERMINAL")}
									/>
									<FilterPill
										label="Gift Card"
										active={filters.method === "GIFT_CARD"}
										onClick={() => handleFilterChange("method", filters.method === "GIFT_CARD" ? "ALL" : "GIFT_CARD")}
									/>
									<FilterPill
										label="Split"
										active={filters.method === "SPLIT"}
										onClick={() => handleFilterChange("method", filters.method === "SPLIT" ? "ALL" : "SPLIT")}
									/>
								</div>
							</div>
						</div>
					</Card>
				)}
			</div>

			{/* Main Content */}
			<div className="flex-1 min-h-0 p-4">
				<ScrollArea className="h-full">
					<div className="pb-6">
						<PaymentsView />

						{/* Pagination */}
						{(prevUrl || nextUrl) && (
							<div className="mt-8">
								<PaginationControls
									prevUrl={prevUrl}
									nextUrl={nextUrl}
									onNavigate={handleNavigate}
									count={count}
									currentPage={currentPage}
									pageSize={25}
								/>
							</div>
						)}
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}