import { useEffect, useState } from "react";
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
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { formatCurrency } from "@/shared/lib/utils";
import ModifierDisplay from "@/shared/components/ui/ModifierDisplay";
import {
	ArrowLeft,
	CreditCard,
	DollarSign,
	User,
	Mail,
	Phone,
	Printer,
	Send,
	Package,
	Receipt,
	Clock,
} from "lucide-react";
import { useRolePermissions } from "@/shared/hooks/useRolePermissions";
import { useMutation } from "@tanstack/react-query";
import { useSettingsStore } from "@/domains/settings/store/settingsStore";
import { PageHeader } from "@/shared/components/layout/PageHeader";

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
	const permissions = useRolePermissions();
	const [isPrinting, setIsPrinting] = useState(false);

	// ZUSTAND FIX: Select state and functions individually to prevent re-renders
	const order = usePosStore((state) => state.selectedOrder);
	const fetchOrderById = usePosStore((state) => state.fetchOrderById);
	const updateSingleOrder = usePosStore((state) => state.updateSingleOrder);
	const resumeCart = usePosStore((state) => state.resumeCart);
	const isLoading = usePosStore((state) => !state.selectedOrder);

	const getLocalReceiptPrinter = useSettingsStore(
		(state) => state.getLocalReceiptPrinter
	);
	const settings = useSettingsStore((state) => state.settings);

	useEffect(() => {
		if (orderId) {
			fetchOrderById(orderId);
		}
	}, [orderId, fetchOrderById]);

	const handlePrintReceipt = async () => {
		const receiptPrinter = getLocalReceiptPrinter();
		if (!receiptPrinter) {
			toast({
				title: "Printer Error",
				description: "No receipt printer is configured.",
				variant: "destructive",
			});
			return;
		}

		setIsPrinting(true);
		try {
			const isTransaction = status !== "COMPLETED";
			await window.hardwareApi.invoke("print-receipt", {
				printer: receiptPrinter,
				data: order,
				storeSettings: settings,
				isTransaction: isTransaction,
			});
			toast({
				title: "Success",
				description: isTransaction ? "Transaction receipt sent to printer." : "Receipt sent to printer.",
			});
		} catch (error) {
			console.error("Failed to print receipt:", error);
			toast({
				title: "Print Failed",
				description: error.message || "Could not print the receipt.",
				variant: "destructive",
			});
		} finally {
			setIsPrinting(false);
		}
	};

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

	const resendEmailMutation = useMutation({
		mutationFn: () => orderService.resendConfirmationEmail(orderId),
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

	if (isLoading && !order) return <FullScreenLoader />;
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
		items,
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
			<PageHeader
				icon={Receipt}
				title="Order Details"
				description={`Order #${order.order_number}`}
				actions={
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
				}
				className="flex-shrink-0"
			/>

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
													className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700"
												>
													<div className="flex justify-between items-center">
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
													{item.selected_modifiers_snapshot && item.selected_modifiers_snapshot.length > 0 && (
														<ModifierDisplay 
															modifiers={item.selected_modifiers_snapshot}
															compact={false}
															showTotal={false}
														/>
													)}
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
									{["COMPLETED", "PENDING", "HOLD"].includes(status) &&
										["POS", "WEB"].includes(order.order_type) &&
										permissions?.canCancelOrders() && (
											<Button
												variant="outline"
												onClick={handlePrintReceipt}
												disabled={isPrinting || !getLocalReceiptPrinter()}
												className="border-slate-200 dark:border-slate-700 bg-transparent"
											>
												<Printer className="mr-2 h-4 w-4" />
												{isPrinting ? "Printing..." : 
													(status === "COMPLETED" ? "Print Receipt" : "Print Transaction Receipt")}
											</Button>
										)}
									{status === "COMPLETED" && permissions?.canCancelOrders() && (
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
									{(status === "HOLD" || status === "PENDING") && (
										<Button
											onClick={handleResume}
											className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-900"
										>
											<Clock className="mr-2 h-4 w-4" />
											Resume Order
										</Button>
									)}
									{(status === "PENDING" || status === "HOLD") &&
										permissions?.canCancelOrders() && (
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
												{permissions.canAccessPayments() && (
													<div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
														<Link
															to={`/payments/${payment_details.id}`}
															className="text-blue-600 dark:text-blue-400 font-semibold hover:underline text-sm"
														>
															View Full Payment Record →
														</Link>
													</div>
												)}
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
