import React, { useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom"; // Import Link
import { usePosStore } from "@/store/posStore";
import * as orderService from "@/api/services/orderService";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import FullScreenLoader from "@/components/FullScreenLoader";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
	CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { shallow } from "zustand/shallow";

const OrderDetailsPage = () => {
	const { orderId } = useParams();
	const navigate = useNavigate();

	const { order, fetchOrderById, updateSingleOrder, isLoading, resumeCart } =
		usePosStore(
			(state) => ({
				order: state.selectedOrder,
				fetchOrderById: state.fetchOrderById,
				updateSingleOrder: state.updateSingleOrder,
				isLoading: !state.selectedOrder,
				resumeCart: state.resumeCart,
			}),
			shallow
		);

	useEffect(() => {
		if (orderId) {
			fetchOrderById(orderId);
		}
	}, [orderId, fetchOrderById]);

	const handleStatusChange = async (serviceFunction, successMessage) => {
		try {
			const updatedOrder = await serviceFunction(orderId);
			updateSingleOrder(updatedOrder.data);
			toast({ title: "Success", description: successMessage });
		} catch (err) {
			const description =
				err?.response?.data?.error || "An unknown error occurred.";
			toast({
				title: "Operation Failed",
				description: description,
				variant: "destructive",
			});
		}
	};

	const handleResume = async () => {
		try {
			const response = await orderService.resumeOrder(orderId);
			resumeCart(response.data);
			toast({
				title: "Success",
				description: "Order has been resumed and loaded into the cart.",
			});
			navigate("/pos");
		} catch (err) {
			console.error("Failed to resume order:", err);
			toast({
				title: "Operation Failed",
				description: "Could not resume the order.",
				variant: "destructive",
			});
		}
	};

	if (isLoading && !order) return <FullScreenLoader />;
	if (!order)
		return (
			<p className="text-red-500 text-center p-4">
				Order not found or failed to load.
			</p>
		);

	const {
		status,
		payment_status,
		items,
		subtotal,
		total_discounts_amount,
		tax_total,
		surcharges_total,
		cashier,
		payment_details,
		total_with_tip,
	} = order;

	const getPaymentStatusBadgeVariant = (status) => {
		switch (status) {
			case "PAID":
			case "succeeded": // Handle Stripe status
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

	return (
		<div className="p-4 md:p-8">
			<Button
				onClick={() => navigate("/orders")}
				variant="outline"
				className="mb-4"
			>
				&larr; Back to Orders
			</Button>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				{/* Order Details Card */}
				<Card>
					<CardHeader>
						<div className="flex justify-between items-start">
							<div>
								<CardTitle>Order Details</CardTitle>
								<CardDescription className={"pt-2.5"}>
									ID: {order.id}
								</CardDescription>
								<CardDescription className={"py-2"}>
									Cashier: {cashier?.username || "N/A"}
								</CardDescription>
							</div>
							<Badge variant={status === "COMPLETED" ? "success" : "secondary"}>
								{status}
							</Badge>
						</div>
					</CardHeader>
					<CardContent>
						<div className="mb-4">
							<h4 className="font-semibold mb-2">Items</h4>
							<ul className="divide-y">
								{items.map((item) => (
									<li
										key={item.id}
										className="py-2 flex justify-between"
									>
										<span>
											{item.product.name} (x{item.quantity})
										</span>
										<span>
											${(item.price_at_sale * item.quantity).toFixed(2)}
										</span>
									</li>
								))}
							</ul>
						</div>
						<div className="border-t pt-4">
							<div className="flex justify-between">
								<span>Subtotal</span>
								<span>${parseFloat(subtotal).toFixed(2)}</span>
							</div>
							<div className="flex justify-between text-red-500">
								<span>Discounts</span>
								<span>-${parseFloat(total_discounts_amount).toFixed(2)}</span>
							</div>
							<div className="flex justify-between">
								<span>Tax</span>
								<span>${parseFloat(tax_total).toFixed(2)}</span>
							</div>
							<div className="flex justify-between">
								<span>Surcharges</span>
								<span>${parseFloat(surcharges_total).toFixed(2)}</span>
							</div>
							{payment_details && parseFloat(payment_details.tip) > 0 && (
								<div className="flex justify-between">
									<span>Tip</span>
									<span>${parseFloat(payment_details.tip).toFixed(2)}</span>
								</div>
							)}
							<div className="flex justify-between font-bold text-lg mt-2 border-t pt-2">
								<span>Grand Total</span>
								<span>${parseFloat(total_with_tip).toFixed(2)}</span>
							</div>
						</div>
					</CardContent>
					<CardFooter className="flex justify-end gap-2">
						{(status === "HOLD" || status === "PENDING") && (
							<Button onClick={handleResume}>Resume Order</Button>
						)}
						{(status === "PENDING" || status === "HOLD") && (
							<Button
								variant="destructive"
								onClick={() =>
									handleStatusChange(
										orderService.cancelOrder,
										"Order has been cancelled."
									)
								}
							>
								Cancel Order
							</Button>
						)}
					</CardFooter>
				</Card>

				{/* --- MODIFICATION: Payment Details Card --- */}
				<Card>
					<CardHeader>
						<CardTitle>Payment Details</CardTitle>
						<CardDescription>
							Overall Status:{" "}
							<Badge variant={getPaymentStatusBadgeVariant(payment_status)}>
								{payment_status}
							</Badge>
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{payment_details ? (
							<div className="border-b pb-3 last:border-b-0">
								<div className="flex justify-between">
									<span className="font-semibold capitalize">
										{payment_details.transactions?.[0]?.method.replace(
											"_",
											" "
										) || "N/A"}
									</span>
									<Badge
										variant={getPaymentStatusBadgeVariant(
											payment_details.status
										)}
									>
										{payment_details.status}
									</Badge>
								</div>
								<p>
									Amount: ${parseFloat(payment_details.amount_paid).toFixed(2)}
								</p>
								<Link
									to={`/payments/${payment_details.id}`}
									className="text-sm text-blue-600 hover:underline"
								>
									View Payment &rarr;
								</Link>
							</div>
						) : (
							<p className="text-sm text-gray-500">No payment found.</p>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
};

export default OrderDetailsPage;
