import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getPayments } from "@/domains/payments/services/paymentService";
import { Badge } from "@/shared/components/ui/badge";
import { TableCell } from "@/shared/components/ui/table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { DomainPageLayout, StandardTable } from "@/shared/components/layout";
import { formatCurrency } from "@/shared/lib/utils";
import { CreditCard } from "lucide-react";
import { format } from "date-fns";
import { PaginationControls } from "@/shared/components/ui/PaginationControls";

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
		if (transactions.length > 1) {
			return "SPLIT";
		}
		return transactions[0].method.replace("_", " ") || "N/A";
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
			<TableCell className="font-mono text-xs text-slate-900 dark:text-slate-100">
				{payment.payment_number}
			</TableCell>
			<TableCell className="font-mono text-xs text-slate-900 dark:text-slate-100">
				{payment.order ? `${payment.order_number}` : "N/A"}
			</TableCell>
			<TableCell className="text-right font-semibold text-slate-900 dark:text-slate-100">
				{formatCurrency(payment.total_collected)}
			</TableCell>
			<TableCell>
				<Badge
					variant="outline"
					className="border-slate-200 dark:border-slate-700 capitalize"
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
			<TableCell className="text-slate-600 dark:text-slate-400">
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
				<SelectTrigger className="w-[180px] border-slate-200 dark:border-slate-700">
					<SelectValue placeholder="Filter by Status" />
				</SelectTrigger>
				<SelectContent className="border-slate-200 dark:border-slate-700">
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
				<SelectTrigger className="w-[180px] border-slate-200 dark:border-slate-700">
					<SelectValue placeholder="Filter by Method" />
				</SelectTrigger>
				<SelectContent className="border-slate-200 dark:border-slate-700">
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
				className="border-slate-200 dark:border-slate-700"
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
