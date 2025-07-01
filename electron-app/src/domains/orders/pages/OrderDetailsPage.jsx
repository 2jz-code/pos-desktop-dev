import React, { useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { usePosStore } from "@/domains/pos/store/posStore";
import * as orderService from "@/domains/orders/services/orderService";
import { Button } from "@/shared/components/ui/button";
import { toast } from "@/shared/components/ui/use-toast";
import FullScreenLoader from "@/shared/components/common/FullScreenLoader";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
	CardFooter,
} from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { shallow } from "zustand/shallow";
import { formatCurrency } from "@/shared/lib/utils";
import {
	ArrowLeft,
	CreditCard,
	DollarSign,
	User,
	Mail,
	Phone,
} from "lucide-react";
import { useRolePermissions } from "@/shared/hooks/useRolePermissions";

// --- Reusable component to display a single transaction ---
const TransactionDetail = ({ transaction }) => {
	const method = transaction.method?.replace("_", " ") || "N/A";
	const isCredit = method.toLowerCase() === "credit";

	return (
		<div className="p-3 border rounded-md bg-muted/50 space-y-1">
			<div className="flex justify-between items-center">
				<div className="flex items-center gap-2">
					{isCredit ? (
						<CreditCard className="h-4 w-4 text-blue-500" />
					) : (
						<DollarSign className="h-4 w-4 text-green-500" />
					)}
					<span className="font-semibold capitalize text-sm">{method}</span>
				</div>
				<span className="font-medium text-sm">
					{formatCurrency(transaction.amount)}
				</span>
			</div>
			{isCredit && transaction.metadata?.card_brand && (
				<div className="text-xs text-muted-foreground pl-6">
					{transaction.metadata.card_brand} ****
					{transaction.metadata.card_last4}
				</div>
			)}
		</div>
	);
};

const OrderDetailsPage = () => {
	const { orderId } = useParams();
	const navigate = useNavigate();
	const permissions = useRolePermissions();

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
		customer_display_name,
		customer_email,
		customer_phone,
	} = order;

	const getPaymentStatusBadgeVariant = (status) => {
		switch (status) {
			case "PAID":
			case "succeeded":
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
				<ArrowLeft className="mr-2 h-4 w-4" />
				Back to Orders
			</Button>
			<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
				{/* Order Details Card */}
				<Card className="md:col-span-2">
					<CardHeader>
						<div className="flex justify-between items-start">
							<div>
								<CardTitle>Order Details</CardTitle>
								<CardDescription className={"pt-2.5"}>
									ID: {order.id}
								</CardDescription>
								<CardDescription className={"pt-2.5"}>
									Order #: {order.order_number}
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
											{formatCurrency(item.price_at_sale * item.quantity)}
										</span>
									</li>
								))}
							</ul>
						</div>
						<div className="border-t pt-4">
							<div className="flex justify-between">
								<span>Subtotal</span>
								<span>{formatCurrency(subtotal)}</span>
							</div>
							<div className="flex justify-between text-red-500">
								<span>Discounts</span>
								<span>-{formatCurrency(total_discounts_amount)}</span>
							</div>
							<div className="flex justify-between">
								<span>Tax</span>
								<span>{formatCurrency(tax_total)}</span>
							</div>
							<div className="flex justify-between">
								<span>Surcharges</span>
								<span>{formatCurrency(surcharges_total)}</span>
							</div>
							{payment_details && parseFloat(payment_details.tip) > 0 && (
								<div className="flex justify-between">
									<span>Tip</span>
									<span>{formatCurrency(payment_details.tip)}</span>
								</div>
							)}
							<div className="flex justify-between font-bold text-lg mt-2 border-t pt-2">
								<span>Grand Total</span>
								<span>{formatCurrency(total_with_tip)}</span>
							</div>
						</div>
					</CardContent>
					<CardFooter className="flex justify-end gap-2">
						{(status === "HOLD" || status === "PENDING") && (
							<Button onClick={handleResume}>Resume Order</Button>
						)}
						{/* Only allow managers/owners to cancel orders */}
						{(status === "PENDING" || status === "HOLD") &&
							permissions.canCancelOrders() && (
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

				{/* Right Column for Customer & Payment */}
				<div className="space-y-6">
					{/* --- NEW Customer Details Card --- */}
					{customer_display_name &&
						customer_display_name !== "Guest Customer" && (
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<User className="h-5 w-5" />
										<span>Customer Details</span>
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-3 text-sm">
									<div className="flex items-center gap-3">
										<User className="h-4 w-4 text-muted-foreground" />
										<span>{customer_display_name}</span>
									</div>
									{customer_email && (
										<div className="flex items-center gap-3">
											<Mail className="h-4 w-4 text-muted-foreground" />
											<a
												href={`mailto:${customer_email}`}
												className="hover:underline"
											>
												{customer_email}
											</a>
										</div>
									)}
									{customer_phone && (
										<div className="flex items-center gap-3">
											<Phone className="h-4 w-4 text-muted-foreground" />
											<a
												href={`tel:${customer_phone}`}
												className="hover:underline"
											>
												{customer_phone}
											</a>
										</div>
									)}
								</CardContent>
							</Card>
						)}

					{/* --- Payment Details Card --- */}
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
							{payment_details && payment_details.transactions?.length > 0 ? (
								<>
									{/* Only show payment record link to managers/owners */}
									{permissions.canAccessPayments() && (
										<div className="text-sm">
											<Link
												to={`/payments/${payment_details.id}`}
												className="text-blue-500 font-bold hover:underline"
											>
												View Full Payment Record &rarr;
											</Link>
										</div>
									)}
									{payment_details.transactions.map((txn) => (
										<TransactionDetail
											key={txn.id}
											transaction={txn}
										/>
									))}
								</>
							) : (
								<p className="text-sm text-gray-500">
									No payment details found for this order.
								</p>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
};

export default OrderDetailsPage;
