import { useState, useMemo } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
	getPaymentById,
	refundTransaction,
} from "@/services/api/paymentService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@ajeen/ui";
import { format } from "date-fns";
import {
	ArrowLeft,
	CreditCard,
	Receipt,
	ExternalLink,
	RotateCw,
	AlertCircle,
} from "lucide-react";
import { RefundDialog } from "@/components/RefundDialog";
import { ItemRefundDialog } from "@/components/ItemRefundDialog";
import { processItemRefund } from "@/services/api/refundService";

const PaymentDetailsPage = () => {
	const { paymentId } = useParams();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const queryClient = useQueryClient();
	const { toast } = useToast();
	const { tenant } = useAuth();
	const tenantSlug = tenant?.slug || '';
	const [isRefreshing, setIsRefreshing] = useState(false);

	const [isRefundDialogOpen, setRefundDialogOpen] = useState(false);
	const [selectedTransaction, setSelectedTransaction] = useState(null);
	const [isItemRefundDialogOpen, setItemRefundDialogOpen] = useState(false);

	const {
		data: payment,
		isLoading,
		isError,
		error,
		refetch,
	} = useQuery({
		queryKey: ["payment", paymentId],
		queryFn: () => getPaymentById(paymentId),
		enabled: !!paymentId,
	});

	const handleRefresh = async () => {
		setIsRefreshing(true);
		await refetch();
		setIsRefreshing(false);
		toast({
			title: "Refreshed",
			description: "Payment details have been updated.",
		});
	};

	const { mutate: processRefund, isLoading: isRefunding } = useMutation({
		mutationFn: (refundData) => {
			return refundTransaction(paymentId, refundData);
		},
		onSuccess: () => {
			toast({
				title: "Success",
				description: "Refund processed successfully.",
			});
			queryClient.invalidateQueries(["payment", paymentId]);
			queryClient.invalidateQueries(["payments"]);
			setRefundDialogOpen(false);
		},
		onError: (err) => {
			toast({
				title: "Refund Error",
				description: err.response?.data?.error || "Failed to process refund.",
				variant: "destructive",
			});
		},
	});

	const handleOpenRefundDialog = (transaction) => {
		setSelectedTransaction(transaction);
		setRefundDialogOpen(true);
	};

	const handleRefundSubmit = (refundDetails) => {
		processRefund(refundDetails);
	};

	const { mutate: processItemsRefund, isLoading: isItemRefunding } = useMutation({
		mutationFn: (refundData) => {
			if (refundData.items.length === 1) {
				const item = refundData.items[0];
				return processItemRefund({
					order_item_id: item.order_item_id,
					quantity: item.quantity,
					reason: refundData.reason,
				});
			} else {
				return processItemRefund({
					items: refundData.items,
					reason: refundData.reason,
				});
			}
		},
		onSuccess: () => {
			toast({
				title: "Success",
				description: "Item refund processed successfully.",
			});
			queryClient.invalidateQueries(["payment", paymentId]);
			queryClient.invalidateQueries(["payments"]);
			setItemRefundDialogOpen(false);
		},
		onError: (err) => {
			toast({
				title: "Refund Error",
				description: err.response?.data?.error || "Failed to process item refund.",
				variant: "destructive",
			});
		},
	});

	const handleItemRefundSubmit = (refundData) => {
		processItemsRefund(refundData);
	};

	// Get primary payment method from successful transaction (must be before early returns)
	const primaryPaymentMethod = useMemo(() => {
		if (!payment?.transactions) return "N/A";
		const successfulTxn = payment.transactions.find(txn => txn.status === "SUCCESSFUL");
		if (successfulTxn) {
			return successfulTxn.method.replace("_", " ");
		}
		// Fallback to first transaction if no successful one
		return payment.transactions[0]?.method.replace("_", " ") || "N/A";
	}, [payment?.transactions]);

	if (isLoading)
		return (
			<div className="flex items-center justify-center h-full">
				<div className="text-center">
					<div className="animate-spin rounded-full h-32 w-32 border-b-2 border-foreground mx-auto mb-4"></div>
					<p className="text-muted-foreground">Loading payment details...</p>
				</div>
			</div>
		);

	if (isError)
		return (
			<div className="flex items-center justify-center h-full">
				<div className="p-6 max-w-md mx-auto">
					<p className="text-red-500">Error: {error.message}</p>
				</div>
			</div>
		);

	if (!payment)
		return (
			<div className="flex items-center justify-center h-full">
				<div className="p-6 max-w-md mx-auto">
					<p className="text-muted-foreground">Payment not found.</p>
				</div>
			</div>
		);

	const { status } = payment;

	const getStatusBadgeVariant = (status) => {
		switch (status?.toUpperCase()) {
			case "PAID":
				return "default";
			case "PARTIALLY_PAID":
				return "secondary";
			case "PENDING":
				return "outline";
			case "UNPAID":
			case "FAILED":
				return "destructive";
			case "REFUNDED":
			case "PARTIALLY_REFUNDED":
				return "outline";
			default:
				return "outline";
		}
	};

	return (
		<div className="flex flex-col h-full bg-muted/30">
			{/* Floating Header Bar */}
			<div className="flex-shrink-0 bg-background/95 backdrop-blur-sm border-b border-border/60 p-4 md:p-6 sticky top-0 z-10">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-4">
						<Button
							onClick={() => {
								const params = searchParams.toString();
								const backUrl = `/${tenantSlug}/payments${params ? `?${params}` : ''}`;
								navigate(backUrl);
							}}
							variant="ghost"
							size="sm"
							className="gap-2"
						>
							<ArrowLeft className="h-4 w-4" />
							Back
						</Button>
						<Separator orientation="vertical" className="h-6" />
						<div>
							<div className="flex items-center gap-2">
								<h1 className="text-lg font-bold text-foreground">
									Payment #{payment.payment_number}
								</h1>
								<Badge variant={getStatusBadgeVariant(status)} className="text-xs">
									{status}
								</Badge>
							</div>
							<p className="text-xs text-muted-foreground mt-0.5">
								{format(new Date(payment.created_at), "MMMM d, yyyy 'at' h:mm a")}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={handleRefresh}
							disabled={isRefreshing}
						>
							<RotateCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
							{isRefreshing ? "Refreshing..." : "Refresh"}
						</Button>
						{(payment.status === "PAID" || payment.status === "PARTIALLY_REFUNDED") && payment.order?.items && payment.order.items.length > 0 && (
							<Button
								variant="default"
								size="sm"
								onClick={() => setItemRefundDialogOpen(true)}
							>
								<Receipt className="h-4 w-4 mr-2" />
								Refund Items
							</Button>
						)}
					</div>
				</div>
			</div>

			{/* Invoice-Style Content */}
			<div className="flex-1 min-h-0 p-4 md:p-8">
				<ScrollArea className="h-full">
					<div className="max-w-5xl mx-auto pb-8">
						{/* Main Invoice Paper */}
						<div className="bg-background rounded-2xl shadow-lg border border-border/40 overflow-hidden">
							{/* Invoice Header */}
							<div className="bg-gradient-to-br from-muted/50 to-muted/20 p-6 md:p-8 border-b border-border/40">
								<div className="flex items-start justify-between mb-6">
									<div>
										<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
											Payment Details
										</p>
										<div className="flex items-center gap-3">
											<CreditCard className="h-5 w-5 text-muted-foreground" />
											<span className="text-sm text-muted-foreground">
												ID: {payment.id.toString().slice(0, 13)}...
											</span>
										</div>
										{payment.order && (
											<div className="flex items-center gap-3 mt-1">
												<Receipt className="h-5 w-5 text-muted-foreground" />
												<Link
													to={`/${tenantSlug}/orders/${payment.order.id}`}
													className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
												>
													Order #{payment.order_number}
													<ExternalLink className="h-3 w-3" />
												</Link>
											</div>
										)}
									</div>
									<div className="text-right flex flex-col items-end gap-2">
										<Badge
											variant="default"
											className="text-lg font-bold px-4 py-2 capitalize"
										>
											{primaryPaymentMethod}
										</Badge>
										<Badge
											variant="outline"
											className="text-sm font-semibold px-3 py-1"
										>
											{payment.transactions?.length || 0} Transaction{payment.transactions?.length !== 1 ? 's' : ''}
										</Badge>
									</div>
								</div>

								{/* Payment Status Flow */}
								<div className="pt-4 border-t border-border/40">
									<div className="flex items-center gap-4">
										{/* Created */}
										<div className="flex items-center gap-2">
											<div className="h-8 w-8 rounded-full flex items-center justify-center border-2 bg-emerald-500 border-emerald-500">
												<span className="text-xs font-bold text-white">✓</span>
											</div>
											<span className="text-xs font-medium text-muted-foreground">Created</span>
										</div>

										{/* Connector Line */}
										<div className={`flex-1 h-0.5 ${
											status === "PAID" || status === "PARTIALLY_PAID" || status === "REFUNDED" || status === "PARTIALLY_REFUNDED"
												? "bg-emerald-500"
												: status === "FAILED"
												? "bg-red-500"
												: "bg-border"
										}`} />

										{/* Processing/Completed */}
										<div className="flex items-center gap-2">
											<div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 ${
												status === "PAID" || status === "REFUNDED" || status === "PARTIALLY_REFUNDED"
													? "bg-emerald-500 border-emerald-500"
													: status === "FAILED"
													? "bg-red-500 border-red-500"
													: status === "PENDING"
													? "bg-yellow-500 border-yellow-500 animate-pulse"
													: "bg-muted border-border"
											}`}>
												{status === "PAID" || status === "PARTIALLY_PAID" ? (
													<span className="text-xs font-bold text-white">✓</span>
												) : status === "FAILED" ? (
													<span className="text-xs font-bold text-white">✕</span>
												) : (
													<span className="text-xs font-bold text-white">•••</span>
												)}
											</div>
											<span className="text-xs font-medium text-muted-foreground">
												{status === "PAID"
													? "Completed"
													: status === "PARTIALLY_PAID"
													? "Partially Paid"
													: status === "FAILED"
													? "Failed"
													: status === "REFUNDED"
													? "Refunded"
													: status === "PARTIALLY_REFUNDED"
													? "Partially Refunded"
													: "Processing"}
											</span>
										</div>
									</div>
									<div className="mt-3 text-xs text-muted-foreground">
										{status === "PENDING" ? (
											<span>Payment is currently being processed...</span>
										) : status === "PAID" ? (
											<span>Payment has been successfully completed</span>
										) : status === "FAILED" ? (
											<span>Payment has failed</span>
										) : (
											<span>Payment status: {status}</span>
										)}
									</div>
								</div>
							</div>

							{/* Order Items & Financial Breakdown */}
							<div className="p-6 md:p-8">
								<div className="mb-6">
									<div className="flex items-center gap-3 mb-4">
										<div className="p-2 rounded-lg bg-muted">
											<Receipt className="h-5 w-5 text-foreground" />
										</div>
										<div>
											<h2 className="text-lg font-bold text-foreground">Order & Payment Details</h2>
											<p className="text-sm text-muted-foreground">Complete breakdown of items and charges</p>
										</div>
									</div>

									{/* Order Items with Financial Summary */}
									{payment.order?.items && payment.order.items.length > 0 ? (
										<div className="mb-8">
											<div className="border border-border/40 rounded-lg overflow-hidden">
												<table className="w-full">
													<thead className="bg-muted/30">
														<tr className="text-xs text-muted-foreground uppercase tracking-wider">
															<th className="text-left px-4 py-3 font-semibold">Item</th>
															<th className="text-center px-4 py-3 font-semibold w-[100px]">Qty</th>
															<th className="text-center px-4 py-3 font-semibold w-[100px]">Refunded</th>
															<th className="text-right px-4 py-3 font-semibold w-[120px]">Price</th>
															<th className="text-right px-4 py-3 font-semibold w-[100px]">Tax</th>
															<th className="text-right px-4 py-3 font-semibold w-[120px]">Total</th>
														</tr>
													</thead>
													<tbody className="divide-y divide-border/40">
														{payment.order.items.map((item) => {
															const refundedQty = item.refunded_quantity || 0;
															const lineSubtotal = (item.price_at_sale || 0) * item.quantity;
															const lineTax = Number.parseFloat(item.tax_amount || 0);
															const lineTotal = lineSubtotal + lineTax;

															return (
																<tr key={item.id} className="hover:bg-muted/20 transition-colors">
																	<td className="px-4 py-3">
																		<div>
																			<div className="font-medium text-foreground mb-1">
																				{item.product_name || "Unknown Item"}
																			</div>
																			{item.notes && (
																				<div className="text-xs text-muted-foreground mt-1">
																					Note: {item.notes}
																				</div>
																			)}
																		</div>
																	</td>
																	<td className="px-4 py-3 text-center">
																		<span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 text-primary font-semibold text-sm">
																			{item.quantity}
																		</span>
																	</td>
																	<td className="px-4 py-3 text-center">
																		{refundedQty > 0 ? (
																			<span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 font-semibold text-sm">
																				{refundedQty}
																			</span>
																		) : (
																			<span className="text-muted-foreground">—</span>
																		)}
																	</td>
																	<td className="px-4 py-3 text-right text-sm text-muted-foreground">
																		{formatCurrency(lineSubtotal)}
																	</td>
																	<td className="px-4 py-3 text-right text-sm text-muted-foreground">
																		{formatCurrency(lineTax)}
																	</td>
																	<td className="px-4 py-3 text-right font-semibold text-foreground">
																		{formatCurrency(lineTotal)}
																	</td>
																</tr>
															);
														})}
													</tbody>
													{/* Financial Summary Footer */}
													<tfoot>
														<tr className="border-t-2 border-border/40 bg-muted/20">
															<td colSpan="5" className="px-4 py-3 text-right text-sm text-muted-foreground">
																Subtotal
															</td>
															<td className="px-4 py-3 text-right font-medium text-foreground">
																{formatCurrency(payment.order.subtotal)}
															</td>
														</tr>
														<tr className="bg-muted/20">
															<td colSpan="5" className="px-4 py-3 text-right text-sm text-muted-foreground">
																Tax
															</td>
															<td className="px-4 py-3 text-right font-medium text-foreground">
																{formatCurrency(payment.order.tax_total)}
															</td>
														</tr>
														{Number.parseFloat(payment.total_tips) > 0 && (
															<tr className="bg-muted/20">
																<td colSpan="5" className="px-4 py-3 text-right text-sm text-muted-foreground">
																	Tip
																</td>
																<td className="px-4 py-3 text-right font-medium text-foreground">
																	{formatCurrency(payment.total_tips)}
																</td>
															</tr>
														)}
														{Number.parseFloat(payment.total_surcharges) > 0 && (
															<tr className="bg-muted/20">
																<td colSpan="5" className="px-4 py-3 text-right text-sm text-muted-foreground">
																	Surcharge
																</td>
																<td className="px-4 py-3 text-right font-medium text-foreground">
																	{formatCurrency(payment.total_surcharges)}
																</td>
															</tr>
														)}
														<tr className="border-t-2 border-border/40 bg-gradient-to-r from-emerald-50/50 to-emerald-100/50 dark:from-emerald-950/20 dark:to-emerald-900/20">
															<td colSpan="5" className="px-4 py-4 text-right font-bold text-foreground text-base">
																Total
															</td>
															<td className="px-4 py-4 text-right font-bold text-emerald-700 dark:text-emerald-300 text-lg">
																{formatCurrency(payment.total_collected)}
															</td>
														</tr>
													</tfoot>
												</table>
											</div>
										</div>
									) : (
										<div className="mb-8 p-8 border border-border rounded-lg text-center">
											<p className="text-muted-foreground">No order items found for this payment.</p>
										</div>
									)}

									{/* Payment Methods Used */}
									<div>
										<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
											Payment Methods
										</h3>
										{payment.transactions?.some(
											(txn) => txn.status === "FAILED" || txn.status === "CANCELED"
										) && (
											<div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-start gap-2">
												<AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
												<p className="text-xs text-yellow-800 dark:text-yellow-200">
													<strong>Note:</strong> Failed/canceled transactions are shown below but did not charge the customer.
												</p>
											</div>
										)}
										<div className="border border-border/40 rounded-lg overflow-hidden">
											<table className="w-full">
												<thead className="bg-muted/30">
													<tr className="text-xs text-muted-foreground uppercase tracking-wider">
														<th className="text-left px-4 py-3 font-semibold">Method</th>
														<th className="text-left px-4 py-3 font-semibold">Card Details</th>
														<th className="text-left px-4 py-3 font-semibold w-[120px]">Status</th>
														<th className="text-left px-4 py-3 font-semibold w-[100px]">Time</th>
														<th className="text-right px-4 py-3 font-semibold w-[120px]">Refunded</th>
														<th className="text-right px-4 py-3 font-semibold w-[120px]">Actions</th>
													</tr>
												</thead>
												<tbody className="divide-y divide-border/40">
													{payment.transactions?.length > 0 ? (
														payment.transactions
															.sort((a, b) => {
																if (a.status === "SUCCESSFUL" && b.status !== "SUCCESSFUL") return -1;
																if (a.status !== "SUCCESSFUL" && b.status === "SUCCESSFUL") return 1;
																return new Date(b.created_at) - new Date(a.created_at);
															})
															.map((txn, index) => {
																const refundableAmount = Number.parseFloat(txn.amount) - Number.parseFloat(txn.refunded_amount || 0);
																const isRefundable = txn.status === "SUCCESSFUL" && refundableAmount > 0;
																const isFailed = txn.status === "FAILED" || txn.status === "CANCELED";

																return (
																	<tr
																		key={txn.id}
																		className={`${
																			isFailed
																				? "opacity-60 bg-red-50 dark:bg-red-900/20"
																				: "hover:bg-muted/20 transition-colors"
																		}`}
																	>
																		<td className="px-4 py-3">
																			<div className="flex items-center gap-2">
																				<div className="p-1.5 rounded bg-muted">
																					<CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
																				</div>
																				<Badge variant="outline" className="text-xs capitalize">
																					{txn.method.replace("_", " ")}
																				</Badge>
																			</div>
																		</td>
																		<td className="px-4 py-3">
																			{txn.card_brand && txn.card_last4 ? (
																				<div className="flex items-center gap-2">
																					<div className="h-5 w-8 bg-muted rounded flex items-center justify-center">
																						<span className="text-xs font-bold text-muted-foreground">
																							{txn.card_brand.substring(0, 2).toUpperCase()}
																						</span>
																					</div>
																					<span className="font-mono text-sm text-foreground">
																						****{txn.card_last4}
																					</span>
																				</div>
																			) : (
																				<span className="text-muted-foreground text-sm">—</span>
																			)}
																		</td>
																		<td className="px-4 py-3">
																			<Badge
																				variant={
																					txn.status === "SUCCESSFUL"
																						? "default"
																						: isFailed
																						? "destructive"
																						: "secondary"
																				}
																				className="text-xs"
																			>
																				{txn.status}
																			</Badge>
																		</td>
																		<td className="px-4 py-3">
																			<span className="text-xs text-muted-foreground">
																				{format(new Date(txn.created_at), "h:mm a")}
																			</span>
																		</td>
																		<td className="px-4 py-3 text-right">
																			{Number.parseFloat(txn.refunded_amount || 0) > 0 ? (
																				<Badge variant="secondary" className="text-xs">
																					{formatCurrency(txn.refunded_amount)}
																				</Badge>
																			) : (
																				<span className="text-muted-foreground text-sm">—</span>
																			)}
																		</td>
																		<td className="px-4 py-3 text-right">
																			{isRefundable && (
																				<Button
																					size="sm"
																					variant="outline"
																					onClick={() => handleOpenRefundDialog(txn)}
																					disabled={isRefunding}
																					className="text-xs"
																				>
																					Refund
																				</Button>
																			)}
																		</td>
																	</tr>
																);
															})
													) : (
														<tr>
															<td colSpan="6" className="text-center py-8 text-muted-foreground">
																No payment methods found.
															</td>
														</tr>
													)}
												</tbody>
											</table>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</ScrollArea>
			</div>

			{selectedTransaction && (
				<RefundDialog
					isOpen={isRefundDialogOpen}
					onOpenChange={setRefundDialogOpen}
					transaction={selectedTransaction}
					isRefunding={isRefunding}
					onSubmit={handleRefundSubmit}
				/>
			)}

			{payment?.order?.items && (
				<ItemRefundDialog
					isOpen={isItemRefundDialogOpen}
					onOpenChange={setItemRefundDialogOpen}
					orderItems={payment.order.items}
					paymentTransactions={payment.transactions || []}
					isProcessing={isItemRefunding}
					onSubmit={handleItemRefundSubmit}
				/>
			)}
		</div>
	);
};

export default PaymentDetailsPage;
