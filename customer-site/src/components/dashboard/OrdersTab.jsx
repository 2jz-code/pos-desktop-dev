import React, { useState } from "react";
import { useDashboard } from "@/contexts/DashboardContext";
import { useCart } from "@/hooks/useCart";
import { useNavigate } from "react-router-dom";
import { cartAPI, ordersAPI } from "@/api/orders";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { cartKeys } from "@/hooks/useCart";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ShoppingBag, Eye } from "lucide-react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { PaginationControls } from "@/components/ui/PaginationControls"; // Import the new component

const OrdersTab = () => {
	const {
		orders,
		isLoadingOrders,
		error,
		nextUrl,
		prevUrl,
		count,
		currentPage,
		handleOrderNavigation,
	} = useDashboard();
	const { user } = useAuth();
	const navigate = useNavigate();
	const { resetCheckoutState } = useCart();
	const queryClient = useQueryClient();
	const [reorderingId, setReorderingId] = useState(null);
	const [orderDetails, setOrderDetails] = useState({});
	const [loadingDetails, setLoadingDetails] = useState({});

	const handleReorder = async (orderId) => {
		setReorderingId(orderId);
		const toastId = toast.loading("Creating your new order...");
		try {
			// Ensure user is authenticated before attempting reorder
			if (!user || !user.id) {
				throw new Error("Authentication required to reorder");
			}

			// Reset checkout state first
			resetCheckoutState();

			// Call the reorder API
			await cartAPI.reorder(orderId);

			// Wait for the cart to be refetched with the new items
			await queryClient.refetchQueries({
				queryKey: cartKeys.current(),
				type: "active", // Only refetch active queries
			});

			toast.success("Order created! Redirecting to checkout...", {
				id: toastId,
			});
			navigate("/checkout");
		} catch (err) {
			console.error("Reorder failed:", err);
			toast.error(
				`There was a problem creating your order: ${
					err.error || err.message || "Please try again."
				}`,
				{ id: toastId }
			);
		} finally {
			setReorderingId(null);
		}
	};

	const fetchOrderDetails = async (orderId) => {
		if (orderDetails[orderId] || loadingDetails[orderId]) {
			return; // Already loaded or loading
		}

		setLoadingDetails((prev) => ({ ...prev, [orderId]: true }));
		try {
			const fullOrder = await ordersAPI.getOrder(orderId);
			setOrderDetails((prev) => ({ ...prev, [orderId]: fullOrder }));
		} catch (error) {
			console.error("Failed to fetch order details:", error);
			toast.error("Failed to load order details");
		} finally {
			setLoadingDetails((prev) => ({ ...prev, [orderId]: false }));
		}
	};

	const handleViewDetails = (orderId) => {
		// Navigate to checkout page in confirmation mode with the order ID
		navigate(`/checkout?step=confirmation&orderId=${orderId}`);
	};

	const OrderStatusBadge = ({ status }) => {
		const statusStyles = {
			PENDING: "bg-yellow-100 text-yellow-800",
			COMPLETED: "bg-green-100 text-green-800",
			CANCELLED: "bg-red-100 text-red-800",
			HOLD: "bg-blue-100 text-blue-800",
			default: "bg-gray-100 text-gray-800",
		};
		const style = statusStyles[status] || statusStyles.default;
		return (
			<Badge
				variant="outline"
				className={`capitalize ${style}`}
			>
				{status.toLowerCase()}
			</Badge>
		);
	};

	const formatCurrency = (amount) => {
		// This should ideally use a more robust currency formatting library or i18n
		return `$${Number(amount).toFixed(2)}`;
	};

	if (isLoadingOrders && orders.length === 0) {
		// Show loader only on initial load
		return (
			<div className="flex items-center justify-center h-64">
				<Loader2 className="h-8 w-8 animate-spin text-primary-green" />
			</div>
		);
	}

	if (error) {
		return (
			<Alert variant="destructive">
				<AlertTitle>Error</AlertTitle>
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		);
	}

	if (!isLoadingOrders && (!orders || orders.length === 0)) {
		return (
			<div className="text-center py-16">
				<ShoppingBag className="mx-auto h-12 w-12 text-gray-400" />
				<h3 className="mt-2 text-sm font-medium text-gray-900">
					No order history
				</h3>
				<p className="mt-1 text-sm text-gray-500">
					You haven't placed any orders with us yet.
				</p>
				<div className="mt-6">
					<Button
						onClick={() => navigate("/menu")}
						className="bg-primary-green hover:bg-accent-dark-green"
					>
						Start your first order
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<h2 className="text-2xl font-semibold text-accent-dark-green">
				Order History
			</h2>
			{isLoadingOrders && (
				<div className="text-center p-4">
					<Loader2 className="h-6 w-6 animate-spin text-primary-green mx-auto" />
				</div>
			)}
			<Accordion
				type="single"
				collapsible
				className="w-full"
			>
				{orders.map((order) => (
					<AccordionItem
						value={order.id}
						key={order.id}
					>
						<AccordionTrigger
							className="hover:bg-accent-light-beige/50 px-4 rounded-lg"
							onClick={() => fetchOrderDetails(order.id)}
						>
							<div className="flex justify-between items-center w-full">
								<div className="flex-1 text-left">
									<p className="font-medium">
										{order.order_number || order.id.slice(0, 8)}
									</p>
									<p className="text-sm text-gray-500">
										{new Date(order.created_at).toLocaleDateString()}
									</p>
								</div>
								<div className="flex-1">
									<OrderStatusBadge status={order.status} />
								</div>
								<div className="flex-1 text-right">
									<p className="font-medium">
										{formatCurrency(order.total_with_tip)}
									</p>
								</div>
							</div>
						</AccordionTrigger>
						<AccordionContent className="bg-white p-4">
							<div className="flex justify-between items-start">
								<div className="flex-1">
									<h4 className="font-semibold mb-2">Order Details</h4>
									{loadingDetails[order.id] ? (
										<div className="flex items-center justify-center py-8">
											<Loader2 className="h-6 w-6 animate-spin text-primary-green" />
											<span className="ml-2">Loading order details...</span>
										</div>
									) : orderDetails[order.id] ? (
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Item</TableHead>
													<TableHead className="text-center">
														Quantity
													</TableHead>
													<TableHead className="text-right">Price</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{orderDetails[order.id].items.map((item) => (
													<TableRow key={item.id}>
														<TableCell>
															{item.product?.name || item.product_name}
														</TableCell>
														<TableCell className="text-center">
															{item.quantity}
														</TableCell>
														<TableCell className="text-right">
															{formatCurrency(item.price_at_sale)}
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									) : (
										<div className="text-center py-4 text-gray-500">
											Click to load order details
										</div>
									)}
								</div>
								<div className="ml-8 flex flex-col gap-2">
									<Button
										onClick={() => handleViewDetails(order.id)}
										variant="outline"
										className="border-primary-green text-primary-green hover:bg-primary-green hover:text-white"
									>
										<Eye className="mr-2 h-4 w-4" />
										View Details
									</Button>
									<Button
										onClick={() => handleReorder(order.id)}
										disabled={reorderingId === order.id}
										className="bg-primary-green hover:bg-accent-dark-green"
									>
										{reorderingId === order.id ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<RefreshCw className="mr-2 h-4 w-4" />
										)}
										Reorder
									</Button>
								</div>
							</div>
						</AccordionContent>
					</AccordionItem>
				))}
			</Accordion>
			<PaginationControls
				prevUrl={prevUrl}
				nextUrl={nextUrl}
				onNavigate={handleOrderNavigation}
				count={count}
				currentPage={currentPage}
				pageSize={25}
			/>
		</div>
	);
};

export default OrdersTab;
