import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
	getAllOrders, // Use the updated service function
	resumeOrder,
	voidOrder,
} from "@/api/services/orderService";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { EllipsisVertical } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { OrdersTableSkeleton } from "@/components/OrdersTableSkeleton";
import { usePosStore } from "@/store/posStore";
import { shallow } from "zustand/shallow";

export default function OrdersPage() {
	const [orders, setOrders] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	// State to manage the filter values
	const [filters, setFilters] = useState({ order_type: "", status: "" });
	const navigate = useNavigate();

	const { isAuthenticated, isOwner } = useAuth();
	const { resumeCart } = usePosStore(
		(state) => ({
			resumeCart: state.resumeCart,
		}),
		shallow
	);

	// The fetchOrders function is now defined inside the component
	// to have access to the `filters` state.
	const fetchOrders = async () => {
		try {
			setLoading(true);
			const response = await getAllOrders(filters); // Pass filters to the API call
			setOrders(response || []);
			setError(null);
		} catch (err) {
			setError("Failed to fetch orders.");
			console.error(err);
		} finally {
			setLoading(false);
		}
	};

	// This useEffect hook now has `filters` as a dependency.
	// It will automatically run again whenever a filter is changed.
	useEffect(() => {
		fetchOrders();
	}, [filters]);

	// Handler to update the filter state
	const handleFilterChange = (filterName, value) => {
		// If the user selects "All", we set the value to an empty string
		const actualValue = value === "ALL" ? "" : value;
		setFilters((prev) => ({ ...prev, [filterName]: actualValue }));
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
			fetchOrders(); // Refetch orders after an action to show the updated status
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

	if (error) {
		return <div className="p-4 text-red-500 text-center">{error}</div>;
	}

	return (
		<div className="p-4 md:p-8">
			<Card>
				<CardHeader>
					<div className="flex justify-between items-center">
						<CardTitle>All Orders</CardTitle>
						{/* Filter Controls */}
						<div className="flex gap-2">
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
								onValueChange={(value) =>
									handleFilterChange("order_type", value)
								}
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
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<ScrollArea className="h-[75vh]">
						{loading ? (
							<OrdersTableSkeleton />
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Order ID</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Payment</TableHead>
										<TableHead>Type</TableHead>
										<TableHead className="text-right">Total</TableHead>
										<TableHead>Items</TableHead>
										<TableHead>Date</TableHead>
										{isAuthenticated && (
											<TableHead className="text-right">Actions</TableHead>
										)}
									</TableRow>
								</TableHeader>
								<TableBody>
									{orders.length > 0 ? (
										orders.map((order) => (
											<TableRow
												key={order.id}
												onClick={() => navigate(`/orders/${order.id}`)}
												className="cursor-pointer hover:bg-muted/50"
											>
												<TableCell className="font-mono text-xs">
													{order.order_number}
												</TableCell>
												<TableCell>
													<Badge variant={getStatusBadgeVariant(order.status)}>
														{order.status}
													</Badge>
												</TableCell>
												<TableCell>
													<Badge
														variant={getPaymentStatusBadgeVariant(
															order.payment_status
														)}
													>
														{order.payment_status}
													</Badge>
												</TableCell>
												<TableCell>
													<Badge variant="outline">{order.order_type}</Badge>
												</TableCell>
												<TableCell className="text-right font-medium">
													${parseFloat(order.total_with_tip).toFixed(2)}
												</TableCell>
												<TableCell>{order.item_count}</TableCell>
												<TableCell>
													{format(new Date(order.created_at), "PPP p")}
												</TableCell>
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
																{(order.status === "HOLD" ||
																	order.status === "PENDING") && (
																	<DropdownMenuItem
																		onClick={() => handleResumeAction(order.id)}
																	>
																		Resume
																	</DropdownMenuItem>
																)}

																{isOwner &&
																	(order.status === "PENDING" ||
																		order.status === "HOLD") && (
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
											</TableRow>
										))
									) : (
										<TableRow>
											<TableCell
												colSpan={isAuthenticated ? "8" : "7"}
												className="text-center h-24"
											>
												No orders found for the selected filters.
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						)}
					</ScrollArea>
				</CardContent>
			</Card>
		</div>
	);
}
