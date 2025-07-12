import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getAllOrders, voidOrder } from "@/services/api/orderService";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { EllipsisVertical, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { DomainPageLayout } from "@/components/shared/DomainPageLayout";
import { StandardTable } from "@/components/shared/StandardTable";
import { PaginationControls } from "@/components/ui/pagination";
import { format } from "date-fns";

interface Order {
	id: string;
	order_number: string;
	status: string;
	payment_status: string;
	order_type: string;
	total_collected: number;
	total_with_tip: number;
	item_count: number;
	created_at: string;
}

export default function OrdersPage() {
	const [orders, setOrders] = useState<Order[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [nextUrl, setNextUrl] = useState<string | null>(null);
	const [prevUrl, setPrevUrl] = useState<string | null>(null);
	const [count, setCount] = useState(0);
	const [currentPage, setCurrentPage] = useState(1);
	const [filters, setFilters] = useState({
		order_type: "",
		status: "",
		search: "",
	});
	const navigate = useNavigate();
	const { toast } = useToast();
	const { user } = useAuth();

	const fetchOrders = useCallback(
		async (url: string | null = null) => {
			try {
				setLoading(true);
				const response = await getAllOrders(filters, url);
				setOrders(response.results || []);
				setNextUrl(response.next);
				setPrevUrl(response.previous);
				setCount(response.count || 0);

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
				setError("Failed to fetch orders.");
				console.error("Order fetch error:", err);
			} finally {
				setLoading(false);
			}
		},
		[filters]
	);

	useEffect(() => {
		fetchOrders();
	}, [fetchOrders]);

	const handleNavigate = (url: string) => {
		if (url) fetchOrders(url);
	};

	const handleFilterChange = (filterName: string, value: string) => {
		const actualValue = value === "ALL" ? "" : value;
		setFilters((prev) => ({ ...prev, [filterName]: actualValue }));
	};

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setFilters((prev) => ({ ...prev, search: value }));
	};

	const getStatusBadgeVariant = (status: string) => {
		switch (status) {
			case "COMPLETED":
				return "default";
			case "PENDING":
				return "secondary";
			case "HOLD":
				return "outline";
			case "CANCELLED":
			case "VOID":
				return "destructive";
			default:
				return "outline";
		}
	};

	const getPaymentStatusBadgeVariant = (status: string) => {
		switch (status) {
			case "PAID":
				return "default";
			case "PARTIALLY_PAID":
				return "secondary";
			case "UNPAID":
				return "destructive";
			case "REFUNDED":
			case "PARTIALLY_REFUNDED":
				return "outline";
			default:
				return "outline";
		}
	};

	const handleAction = async (
		orderId: string,
		actionFunction: (id: string) => Promise<unknown>,
		successMessage: string
	) => {
		try {
			await actionFunction(orderId);
			toast({ title: "Success", description: successMessage });
			fetchOrders();
		} catch (err: unknown) {
			const description =
				(err as any)?.response?.data?.error || "An unknown error occurred.";
			toast({
				title: "Operation Failed",
				description: description,
				variant: "destructive",
			});
			console.error(`Failed to perform action on order ${orderId}:`, err);
		}
	};

	const headers = [
		{ label: "Order ID" },
		{ label: "Status" },
		{ label: "Payment" },
		{ label: "Type" },
		{ label: "Total", className: "text-right" },
		{ label: "Items" },
		{ label: "Date" },
		{ label: "Actions", className: "text-right" },
	];

	const renderOrderRow = (order: Order) => (
		<>
			<TableCell className="font-mono text-xs text-slate-900 dark:text-slate-100">
				{order.order_number}
			</TableCell>
			<TableCell>
				<Badge
					variant={getStatusBadgeVariant(order.status)}
					className="font-medium"
				>
					{order.status}
				</Badge>
			</TableCell>
			<TableCell>
				<Badge
					variant={getPaymentStatusBadgeVariant(order.payment_status)}
					className="font-medium"
				>
					{order.payment_status}
				</Badge>
			</TableCell>
			<TableCell>
				<Badge
					variant="outline"
					className="border-slate-200 dark:border-slate-700"
				>
					{order.order_type}
				</Badge>
			</TableCell>
			<TableCell className="text-right font-semibold text-slate-900 dark:text-slate-100">
				$
				{Number.parseFloat(
					order.total_collected || order.total_with_tip
				).toFixed(2)}
			</TableCell>
			<TableCell className="text-slate-600 dark:text-slate-400">
				{order.item_count}
			</TableCell>
			<TableCell className="text-slate-600 dark:text-slate-400">
				{format(new Date(order.created_at), "PPP p")}
			</TableCell>
			<TableCell
				onClick={(e) => e.stopPropagation()}
				className="text-right"
			>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="hover:bg-slate-100 dark:hover:bg-slate-800"
						>
							<EllipsisVertical className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						className="border-slate-200 dark:border-slate-700"
					>
						{user?.role === "OWNER" &&
							(order.status === "PENDING" || order.status === "HOLD") && (
								<DropdownMenuItem
									inset={false}
									className="text-red-600 dark:text-red-400"
									onClick={() =>
										handleAction(
											order.id.toString(),
											voidOrder,
											"Order voided successfully."
										)
									}
								>
									Void
								</DropdownMenuItem>
							)}
					</DropdownMenuContent>
				</DropdownMenu>
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
					<SelectItem value="HOLD">Hold</SelectItem>
					<SelectItem value="COMPLETED">Completed</SelectItem>
					<SelectItem value="CANCELLED">Cancelled</SelectItem>
					<SelectItem value="VOID">Void</SelectItem>
				</SelectContent>
			</Select>
			<Select
				value={filters.order_type || "ALL"}
				onValueChange={(value) => handleFilterChange("order_type", value)}
			>
				<SelectTrigger className="w-[180px] border-slate-200 dark:border-slate-700">
					<SelectValue placeholder="Filter by Type" />
				</SelectTrigger>
				<SelectContent className="border-slate-200 dark:border-slate-700">
					<SelectItem value="ALL">All Types</SelectItem>
					<SelectItem value="POS">Point of Sale</SelectItem>
					<SelectItem value="WEB">Website</SelectItem>
					<SelectItem value="APP">Customer App</SelectItem>
					<SelectItem value="DELIVERY">Delivery</SelectItem>
				</SelectContent>
			</Select>
		</>
	);

	return (
		<DomainPageLayout
			pageTitle="All Orders"
			pageDescription="Manage and track all customer orders"
			pageIcon={ClipboardList}
			title="Filters & Search"
			searchPlaceholder="Search by order number, customer, or amount..."
			searchValue={filters.search}
			onSearchChange={handleSearchChange}
			filterControls={filterControls}
			error={error}
		>
			<StandardTable
				headers={headers}
				data={orders}
				loading={loading}
				emptyMessage="No orders found for the selected filters."
				onRowClick={(order) => navigate(`/orders/${order.id}`)}
				renderRow={renderOrderRow}
				colSpan={8}
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
}
