import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
	getAllOrders,
	resumeOrder,
	voidOrder,
} from "@/domains/orders/services/orderService";
import { Badge } from "@/shared/components/ui/badge";
import { TableCell } from "@/shared/components/ui/table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Button } from "@/shared/components/ui/button";
import { EllipsisVertical } from "lucide-react";
import { toast } from "@/shared/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { DomainPageLayout, StandardTable } from "@/shared/components/layout";
import { usePosStore } from "@/domains/pos/store/posStore";
import { shallow } from "zustand/shallow";
import { format } from "date-fns";

export default function OrdersPage() {
	const [orders, setOrders] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [filters, setFilters] = useState({
		order_type: "",
		status: "",
		search: "",
	});
	const navigate = useNavigate();

	const { isAuthenticated, isOwner } = useAuth();
	const { resumeCart } = usePosStore(
		(state) => ({
			resumeCart: state.resumeCart,
		}),
		shallow
	);

	const fetchOrders = async () => {
		try {
			setLoading(true);
			const response = await getAllOrders(filters);
			setOrders(response || []);
			setError(null);
		} catch (err) {
			setError("Failed to fetch orders.");
			console.error(err);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchOrders();
	}, [filters]);

	const handleFilterChange = (filterName, value) => {
		const actualValue = value === "ALL" ? "" : value;
		setFilters((prev) => ({ ...prev, [filterName]: actualValue }));
	};

	const handleSearchChange = (e) => {
		const value = e.target.value;
		setFilters((prev) => ({ ...prev, search: value }));
	};

	const getStatusBadgeVariant = (status) => {
		switch (status) {
			case "COMPLETED":
				return "success";
			case "PENDING":
				return "default";
			case "HOLD":
				return "secondary";
			case "CANCELLED":
			case "VOID":
				return "destructive";
			default:
				return "outline";
		}
	};

	const getPaymentStatusBadgeVariant = (status) => {
		switch (status) {
			case "PAID":
				return "success";
			case "PARTIALLY_PAID":
				return "default";
			case "UNPAID":
				return "destructive";
			case "REFUNDED":
			case "PARTIALLY_REFUNDED":
				return "secondary";
			default:
				return "outline";
		}
	};

	const handleResumeAction = async (orderId) => {
		try {
			const response = await resumeOrder(orderId);
			resumeCart(response.data);
			toast({
				title: "Success",
				description: "Order has been resumed and loaded into the cart.",
			});
			navigate("/pos");
		} catch (err) {
			const description =
				err?.response?.data?.error || "An unknown error occurred.";
			toast({
				title: "Operation Failed",
				description,
				variant: "destructive",
			});
			console.error(`Failed to resume order ${orderId}:`, err);
		}
	};

	const handleAction = async (orderId, actionFunction, successMessage) => {
		try {
			await actionFunction(orderId);
			toast({ title: "Success", description: successMessage });
			fetchOrders();
		} catch (err) {
			const description =
				err?.response?.data?.error || "An unknown error occurred.";
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
		...(isAuthenticated ? [{ label: "Actions", className: "text-right" }] : []),
	];

	const renderOrderRow = (order) => (
		<>
			<TableCell className="font-mono text-xs">{order.order_number}</TableCell>
			<TableCell>
				<Badge variant={getStatusBadgeVariant(order.status)}>
					{order.status}
				</Badge>
			</TableCell>
			<TableCell>
				<Badge variant={getPaymentStatusBadgeVariant(order.payment_status)}>
					{order.payment_status}
				</Badge>
			</TableCell>
			<TableCell>
				<Badge variant="outline">{order.order_type}</Badge>
			</TableCell>
			<TableCell className="text-right font-medium">
				${parseFloat(order.total_collected || order.total_with_tip).toFixed(2)}
			</TableCell>
			<TableCell>{order.item_count}</TableCell>
			<TableCell>{format(new Date(order.created_at), "PPP p")}</TableCell>
			{isAuthenticated && (
				<TableCell
					onClick={(e) => e.stopPropagation()}
					className="text-right"
				>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
							>
								<EllipsisVertical className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{(order.status === "HOLD" || order.status === "PENDING") && (
								<DropdownMenuItem onClick={() => handleResumeAction(order.id)}>
									Resume
								</DropdownMenuItem>
							)}
							{isOwner &&
								(order.status === "PENDING" || order.status === "HOLD") && (
									<DropdownMenuItem
										className="text-red-600"
										onClick={() =>
											handleAction(
												order.id,
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
			)}
		</>
	);

	const filterControls = (
		<>
			<Select
				value={filters.status}
				onValueChange={(value) => handleFilterChange("status", value)}
			>
				<SelectTrigger className="w-[180px]">
					<SelectValue placeholder="Filter by Status" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="ALL">All Statuses</SelectItem>
					<SelectItem value="PENDING">Pending</SelectItem>
					<SelectItem value="HOLD">Hold</SelectItem>
					<SelectItem value="COMPLETED">Completed</SelectItem>
					<SelectItem value="CANCELLED">Cancelled</SelectItem>
					<SelectItem value="VOID">Void</SelectItem>
				</SelectContent>
			</Select>
			<Select
				value={filters.order_type}
				onValueChange={(value) => handleFilterChange("order_type", value)}
			>
				<SelectTrigger className="w-[180px]">
					<SelectValue placeholder="Filter by Type" />
				</SelectTrigger>
				<SelectContent>
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
			title="All Orders"
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
				colSpan={isAuthenticated ? 8 : 7}
			/>
		</DomainPageLayout>
	);
}
