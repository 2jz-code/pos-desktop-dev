import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
import { CreditCard } from "lucide-react";
import { format } from "date-fns";
import { PaginationControls } from "@/components/ui/pagination";

const PaymentsPage = () => {
	const [payments, setPayments] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [nextUrl, setNextUrl] = useState(null);
	const [prevUrl, setPrevUrl] = useState(null);
	const [count, setCount] = useState(0);
	const [currentPage, setCurrentPage] = useState(1);
	const [filters, setFilters] = useState({
		status: "",
		method: "",
		search: "",
	});
	const navigate = useNavigate();

	const fetchPayments = useCallback(
		async (url = null) => {
			try {
				setLoading(true);
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
		[filters]
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

	const headers = [
		{ label: "Payment ID" },
		{ label: "Order ID" },
		{ label: "Amount", className: "text-right" },
		{ label: "Method" },
		{ label: "Status" },
		{ label: "Date" },
	];

	const renderPaymentRow = (payment) => (
		<>
			<TableCell className="font-mono text-xs text-foreground">
				{payment.payment_number}
			</TableCell>
			<TableCell className="font-mono text-xs text-foreground">
				{payment.order ? `${payment.order_number}` : "N/A"}
			</TableCell>
			<TableCell className="text-right font-semibold text-foreground">
				{formatCurrency(payment.total_collected)}
			</TableCell>
			<TableCell>
				<Badge
					variant="outline"
					className="border-border capitalize"
				>
					{getPaymentMethod(payment.transactions)}
				</Badge>
			</TableCell>
			<TableCell>
				<Badge
					variant={getStatusVariant(payment.status)}
					className="font-medium"
				>
					{payment.status}
				</Badge>
			</TableCell>
			<TableCell className="text-muted-foreground">
				{format(new Date(payment.created_at), "PPP p")}
			</TableCell>
		</>
	);

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
			pageTitle="All Payments"
			pageDescription="Manage and track all payment transactions"
			pageIcon={CreditCard}
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
				onRowClick={(payment) => navigate(`/payments/${payment.id}`)}
				renderRow={renderPaymentRow}
				className="border-border"
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
