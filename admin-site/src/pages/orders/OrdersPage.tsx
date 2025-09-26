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
import { useToast } from "@/components/ui/use-toast";
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
	total_collected: number;
	total_with_tip: number;
	item_count: number;
	created_at: string;
}

export default function OrdersPage() {
	const navigate = useNavigate();
	const { toast } = useToast();
	const { user } = useAuth();

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
		hasFilters,
		handleNavigate,
		handleFilterChange,
		handleSearchChange,
		clearFilters,
		refetch
	} = useOrdersData({
		getAllOrdersService: getAllOrders
	});

	// Use shared order actions hook
	const { handleAction } = useOrderActions({
		toast,
		refetch
	});


	// Use shared status configurations
	const getStatusBadgeVariant = (status: string) => {
		return getStatusConfig(status).variant;
	};

	const getPaymentStatusBadgeVariant = (status: string) => {
		return getPaymentStatusConfig(status).variant;
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
			<TableCell className="font-mono text-xs text-foreground">
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
					className="border-border"
				>
					{order.order_type}
				</Badge>
			</TableCell>
			<TableCell className="text-right font-semibold text-foreground">
				$
				{Number.parseFloat(
					order.total_collected || order.total_with_tip
				).toFixed(2)}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{order.item_count}
			</TableCell>
			<TableCell className="text-muted-foreground">
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
						className="border-border"
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
}
