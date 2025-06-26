import React, { useState } from "react";
import { useDashboard } from "@/contexts/DashboardContext";
import { useCart } from "@/hooks/useCart";
import { useNavigate } from "react-router-dom";
import cartAPI from "@/api/orders";
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
import { Loader2, RefreshCw, ShoppingBag } from "lucide-react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";

const OrdersTab = () => {
	const { orders, isLoadingOrders, error } = useDashboard();
	const navigate = useNavigate();
	const { setOrderId } = useCart();
	const [reorderingId, setReorderingId] = useState(null);

	const handleReorder = async (orderId) => {
		setReorderingId(orderId);
		const toastId = toast.loading("Creating your new order...");
		try {
			const newOrder = await cartAPI.reorder(orderId);
			setOrderId(newOrder.id, true); // Set new order and persist it
			toast.success("Order created! Redirecting to checkout...", {
				id: toastId,
			});
			navigate("/checkout");
		} catch (err) {
			toast.error(
				`There was a problem creating your order: ${
					err.error || "Please try again."
				}`,
				{ id: toastId }
			);
		} finally {
			setReorderingId(null);
		}
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

	if (isLoadingOrders) {
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

	if (!orders || orders.length === 0) {
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
						<AccordionTrigger className="hover:bg-accent-light-beige/50 px-4 rounded-lg">
							<div className="flex justify-between items-center w-full">
								<div className="flex-1 text-left">
									<p className="font-medium">Order #{order.id.slice(0, 8)}</p>
									<p className="text-sm text-gray-500">
										{new Date(order.created_at).toLocaleDateString()}
									</p>
								</div>
								<div className="flex-1">
									<OrderStatusBadge status={order.status} />
								</div>
								<div className="flex-1 text-right">
									<p className="font-medium">{formatCurrency(order.total)}</p>
								</div>
							</div>
						</AccordionTrigger>
						<AccordionContent className="bg-white p-4">
							<div className="flex justify-between items-start">
								<div>
									<h4 className="font-semibold mb-2">Order Details</h4>
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Item</TableHead>
												<TableHead className="text-center">Quantity</TableHead>
												<TableHead className="text-right">Price</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{order.items.map((item) => (
												<TableRow key={item.id}>
													<TableCell>{item.product_name}</TableCell>
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
								</div>
								<Button
									onClick={() => handleReorder(order.id)}
									disabled={reorderingId === order.id}
									className="ml-8 bg-primary-green hover:bg-accent-dark-green"
								>
									{reorderingId === order.id ? (
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									) : (
										<RefreshCw className="mr-2 h-4 w-4" />
									)}
									Reorder
								</Button>
							</div>
						</AccordionContent>
					</AccordionItem>
				))}
			</Accordion>
		</div>
	);
};

export default OrdersTab;
