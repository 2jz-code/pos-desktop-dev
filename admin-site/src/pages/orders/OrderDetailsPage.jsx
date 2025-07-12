import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	getOrderById,
	resendConfirmationEmail,
	cancelOrder,
} from "@/services/api/orderService";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
	CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/utils";
import {
	ArrowLeft,
	CreditCard,
	DollarSign,
	User,
	Mail,
	Phone,
	Send,
	Package,
	Receipt,
} from "lucide-react";

// Professional Transaction Detail Component
const TransactionDetail = ({ transaction }) => {
	const method = transaction.method?.replace("_", " ") || "N/A";
	const isCredit = method.toLowerCase() === "credit";

	return (
		<div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 space-y-2">
			<div className="flex justify-between items-center">
				<div className="flex items-center gap-3">
					<div className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
						{isCredit ? (
							<CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />
						) : (
							<DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
						)}
					</div>
					<span className="font-semibold capitalize text-sm text-slate-900 dark:text-slate-100">
						{method}
					</span>
				</div>
				<span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
					{formatCurrency(
						Number.parseFloat(transaction.amount) +
							Number.parseFloat(transaction.surcharge || 0)
					)}
				</span>
			</div>
			{isCredit && transaction.metadata?.card_brand && (
				<div className="text-xs text-slate-500 dark:text-slate-400 pl-12">
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
	const queryClient = useQueryClient();
	const { toast } = useToast();

	const {
		data: order,
		isLoading,
		isError,
		error,
	} = useQuery({
		queryKey: ["order", orderId],
		queryFn: () => getOrderById(orderId),
		enabled: !!orderId,
	});

	const resendEmailMutation = useMutation({
		mutationFn: () => resendConfirmationEmail(orderId),
		onSuccess: (data) => {
			toast({
				title: "Success",
				description: data.data.message || "Confirmation email has been resent.",
			});
		},
		onError: (error) => {
			toast({
				title: "Operation Failed",
				description:
					error?.response?.data?.error || "Could not resend the email.",
				variant: "destructive",
			});
		},
	});

	const cancelOrderMutation = useMutation({
		mutationFn: () => cancelOrder(orderId),
		onSuccess: () => {
			toast({
				title: "Success",
				description: "Order has been cancelled.",
			});
			queryClient.invalidateQueries(["order", orderId]);
			queryClient.invalidateQueries(["orders"]);
		},
		onError: (error) => {
			toast({
				title: "Operation Failed",
				description:
					error?.response?.data?.error || "Could not cancel the order.",
				variant: "destructive",
			});
		},
	});

	if (isLoading)
		return (
			<div className="flex items-center justify-center h-full">
				<div className="text-center">
					<div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900 mx-auto mb-4"></div>
					<p className="text-gray-600">Loading order details...</p>
				</div>
			</div>
		);

	if (isError)
		return (
			<div className="flex items-center justify-center h-full">
				<Card className="p-6 max-w-md mx-auto border-slate-200 dark:border-slate-700">
					<CardContent className="text-center">
						<p className="text-red-500">Error: {error.message}</p>
					</CardContent>
				</Card>
			</div>
		);

	if (!order)
		return (
			<div className="flex items-center justify-center h-full">
				<Card className="p-6 max-w-md mx-auto border-slate-200 dark:border-slate-700">
					<CardContent className="text-center">
						<p className="text-red-500">Order not found or failed to load.</p>
					</CardContent>
				</Card>
			</div>
		);

	const {
		status,
		payment_status,
		items = [],
		subtotal,
		total_discounts_amount,
		tax_total,
		cashier,
		payment_details,
		customer_display_name,
		customer_email,
		customer_phone,
	} = order;

	const getStatusBadgeVariant = (status) => {
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

	const getPaymentStatusBadgeVariant = (status) => {
		switch (status) {
			case "PAID":
			case "succeeded":
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

	return (
		<div className="flex flex-col h-full">
			{/* Page Header */}
			<div className="flex-shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 md:p-6">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
							<Receipt className="h-5 w-5 text-slate-700 dark:text-slate-300" />
						</div>
						<div>
							<h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
								Order Details
							</h1>
							<p className="text-slate-600 dark:text-slate-400">
								Order #{order.order_number}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-3">
						<Button
							onClick={() => navigate("/orders")}
							variant="outline"
							size="sm"
							className="border-slate-200 dark:border-slate-700"
						>
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back to Orders
						</Button>
						<Badge
							variant={getStatusBadgeVariant(status)}
							className="px-3 py-1"
						>
							{status}
						</Badge>
						<Badge
							variant={getPaymentStatusBadgeVariant(payment_status)}
							className="px-3 py-1"
						>
							{payment_status}
						</Badge>
					</div>
				</div>
			</div>

			{/* Scrollable Content Area */}
			<div className="flex-1 min-h-0 p-4 md:p-6">
				<ScrollArea className="h-full">
					<div className="pb-8">
						<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
							{/* Order Details Card */}
							<Card className="lg:col-span-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
								<CardHeader className="pb-4">
									<div className="flex items-start justify-between">
										<div className="flex items-center gap-3">
											<div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
												<Receipt className="h-5 w-5 text-slate-700 dark:text-slate-300" />
											</div>
											<div>
												<CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
													Order Information
												</CardTitle>
												<CardDescription className="text-slate-600 dark:text-slate-400 mt-1">
													ID: {order.id} • Cashier: {cashier?.username || "N/A"}
												</CardDescription>
											</div>
										</div>
									</div>
								</CardHeader>
								<CardContent className="space-y-6">
									{/* Items Section */}
									<div>
										<div className="flex items-center gap-2 mb-4">
											<Package className="h-4 w-4 text-slate-600 dark:text-slate-400" />
											<h4 className="font-semibold text-slate-900 dark:text-slate-100">
												Items Ordered
											</h4>
										</div>
										<div className="space-y-3">
											{items.map((item) => (
												<div
													key={item.id}
													className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700"
												>
													<div>
														<span className="font-medium text-slate-900 dark:text-slate-100">
															{item.product.name}
														</span>
														<span className="text-slate-500 dark:text-slate-400 ml-2">
															(x{item.quantity})
														</span>
													</div>
													<span className="font-semibold text-slate-900 dark:text-slate-100">
														{formatCurrency(item.price_at_sale * item.quantity)}
													</span>
												</div>
											))}
										</div>
									</div>

									{/* Order Summary */}
									<div className="border-t border-slate-200 dark:border-slate-700 pt-6">
										<h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">
											Order Summary
										</h4>
										<div className="space-y-3">
											<div className="flex justify-between text-slate-600 dark:text-slate-400">
												<span>Subtotal</span>
												<span>{formatCurrency(subtotal)}</span>
											</div>
											<div className="flex justify-between text-red-600 dark:text-red-400">
												<span>Discounts</span>
												<span>-{formatCurrency(total_discounts_amount)}</span>
											</div>
											<div className="flex justify-between text-slate-600 dark:text-slate-400">
												<span>Tax</span>
												<span>{formatCurrency(tax_total)}</span>
											</div>
											<div className="flex justify-between text-slate-600 dark:text-slate-400">
												<span>Surcharges</span>
												<span>
													{formatCurrency(order.total_surcharges || 0)}
												</span>
											</div>
											{order.total_tips > 0 && (
												<div className="flex justify-between text-slate-600 dark:text-slate-400">
													<span>Tips</span>
													<span>{formatCurrency(order.total_tips)}</span>
												</div>
											)}
											<div className="flex justify-between font-bold text-lg text-slate-900 dark:text-slate-100 pt-3 border-t border-slate-200 dark:border-slate-700">
												<span>Grand Total</span>
												<span>
													{formatCurrency(order.total_collected || 0)}
												</span>
											</div>
										</div>
									</div>
								</CardContent>
								<CardFooter className="flex flex-wrap justify-end gap-3 pt-6 border-t border-slate-200 dark:border-slate-700">
									{status === "COMPLETED" && (
										<Button
											variant="outline"
											onClick={() => resendEmailMutation.mutate()}
											disabled={resendEmailMutation.isPending}
											className="border-slate-200 dark:border-slate-700"
										>
											<Send className="mr-2 h-4 w-4" />
											{resendEmailMutation.isPending
												? "Sending..."
												: "Resend Email"}
										</Button>
									)}
									{(status === "PENDING" || status === "HOLD") && (
										<Button
											variant="destructive"
											onClick={() => cancelOrderMutation.mutate()}
											disabled={cancelOrderMutation.isPending}
										>
											{cancelOrderMutation.isPending
												? "Cancelling..."
												: "Cancel Order"}
										</Button>
									)}
								</CardFooter>
							</Card>

							{/* Right Column */}
							<div className="space-y-6">
								{/* Customer Details Card */}
								{customer_display_name &&
									customer_display_name !== "Guest Customer" && (
										<Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
											<CardHeader className="pb-4">
												<div className="flex items-center gap-3">
													<div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
														<User className="h-5 w-5 text-slate-700 dark:text-slate-300" />
													</div>
													<CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
														Customer Details
													</CardTitle>
												</div>
											</CardHeader>
											<CardContent className="space-y-4">
												<div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
													<User className="h-4 w-4 text-slate-500 dark:text-slate-400" />
													<span className="text-slate-900 dark:text-slate-100">
														{customer_display_name}
													</span>
												</div>
												{customer_email && (
													<div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
														<Mail className="h-4 w-4 text-slate-500 dark:text-slate-400" />
														<a
															href={`mailto:${customer_email}`}
															className="text-blue-600 dark:text-blue-400 hover:underline"
														>
															{customer_email}
														</a>
													</div>
												)}
												{customer_phone && (
													<div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
														<Phone className="h-4 w-4 text-slate-500 dark:text-slate-400" />
														<a
															href={`tel:${customer_phone}`}
															className="text-blue-600 dark:text-blue-400 hover:underline"
														>
															{customer_phone}
														</a>
													</div>
												)}
											</CardContent>
										</Card>
									)}

								{/* Payment Details Card */}
								<Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
									<CardHeader className="pb-4">
										<div className="flex items-center gap-3">
											<div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
												<CreditCard className="h-5 w-5 text-slate-700 dark:text-slate-300" />
											</div>
											<div>
												<CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
													Payment Details
												</CardTitle>
												<CardDescription className="text-slate-600 dark:text-slate-400 mt-1">
													Status:{" "}
													<Badge
														variant={getPaymentStatusBadgeVariant(
															payment_status
														)}
														className="ml-1"
													>
														{payment_status}
													</Badge>
												</CardDescription>
											</div>
										</div>
									</CardHeader>
									<CardContent className="space-y-4">
										{payment_details &&
										payment_details.transactions?.filter(
											(txn) => txn.status === "SUCCESSFUL"
										).length > 0 ? (
											<>
												<div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
													<Link
														to={`/payments/${payment_details.id}`}
														className="text-blue-600 dark:text-blue-400 font-semibold hover:underline text-sm"
													>
														View Full Payment Record →
													</Link>
												</div>
												<div className="space-y-3">
													{payment_details.transactions
														.filter((txn) => txn.status === "SUCCESSFUL")
														.map((txn) => (
															<TransactionDetail
																key={txn.id}
																transaction={txn}
															/>
														))}
												</div>
											</>
										) : (
											<div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
												<p className="text-sm text-slate-500 dark:text-slate-400">
													No payment details found for this order.
												</p>
											</div>
										)}
									</CardContent>
								</Card>
							</div>
						</div>
					</div>
				</ScrollArea>
			</div>
		</div>
	);
};

export default OrderDetailsPage;
