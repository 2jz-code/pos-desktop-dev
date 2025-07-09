import { useEffect, useState } from "react";
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

const PaymentsPage = () => {
	const [payments, setPayments] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [filters, setFilters] = useState({
		status: "",
		method: "",
		search: "",
	});
	const [allPayments, setAllPayments] = useState([]);
	const navigate = useNavigate();

	const fetchPayments = async () => {
		try {
			setLoading(true);
			const data = await getPayments(); // fetch all; we'll filter client-side
			setAllPayments(data || []);
			setError(null);
		} catch (err) {
			setError("Failed to fetch payments.");
			console.error(err);
		} finally {
			setLoading(false);
		}
	};

	const applyFilters = () => {
		let filtered = [...allPayments];

		// Status filter
		if (filters.status) {
			filtered = filtered.filter(
				(p) => p.status?.toLowerCase() === filters.status.toLowerCase()
			);
		}

		// Method filter (cash/card/gift_card/SPLIT)
		if (filters.method) {
			const target = filters.method.toLowerCase();
			filtered = filtered.filter((p) => {
				const method = getPaymentMethod(p.transactions)
					.toLowerCase()
					.replace(/\s+/g, "_"); // normalize spaces to underscore
				return method === target;
			});
		}

		// Search filter
		if (filters.search) {
			const q = filters.search.toLowerCase();
			filtered = filtered.filter((p) => {
				const paymentNo = p.payment_number?.toString().toLowerCase() || "";
				const orderNo = p.order_number?.toString().toLowerCase() || "";
				const amountStr = p.total_collected?.toString() || "";
				return (
					paymentNo.includes(q) || orderNo.includes(q) || amountStr.includes(q)
				);
			});
		}

		setPayments(filtered);
	};

	useEffect(() => {
		fetchPayments();
	}, []);

	useEffect(() => {
		applyFilters();
	}, [allPayments, filters]);

	const handleFilterChange = (filterName, value) => {
		const actualValue = value === "ALL" ? "" : value;
		setFilters((prev) => ({ ...prev, [filterName]: actualValue }));
	};

	const handleSearchChange = (e) => {
		const value = e.target.value;
		setFilters((prev) => ({ ...prev, search: value }));
	};

	const getStatusVariant = (status) => {
		switch (status?.toLowerCase()) {
			case "succeeded":
			case "paid":
				return "default";
			case "refunded":
			case "partially_refunded":
				return "destructive";
			case "pending":
				return "secondary";
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
					<SelectItem value="pending">Pending</SelectItem>
					<SelectItem value="paid">Paid</SelectItem>
					<SelectItem value="succeeded">Succeeded</SelectItem>
					<SelectItem value="refunded">Refunded</SelectItem>
					<SelectItem value="partially_refunded">Partially Refunded</SelectItem>
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
					<SelectItem value="cash">Cash</SelectItem>
					<SelectItem value="card_terminal">Card</SelectItem>
					<SelectItem value="gift_card">Gift Card</SelectItem>
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
		</DomainPageLayout>
	);
};

export default PaymentsPage;
