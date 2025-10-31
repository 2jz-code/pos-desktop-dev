import { useState, useMemo } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
	getPaymentById,
	refundTransaction,
} from "@/services/api/paymentService";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@ajeen/ui";
import {
	ArrowLeft,
	CreditCard,
	Receipt,
	DollarSign,
	ExternalLink,
	RefreshCw,
	Clock,
} from "lucide-react";
import { RefundDialog } from "@/components/RefundDialog";
import { ItemRefundDialog } from "@/components/ItemRefundDialog";
import { Timeline } from "@/components/ui/Timeline";
import { generatePaymentTimeline } from "@/utils/paymentTimeline";
import { processItemRefund } from "@/services/api/refundService";

const PaymentDetailsPage = () => {
	const { paymentId } = useParams();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const queryClient = useQueryClient();
	const { toast } = useToast();
	const { tenant } = useAuth();
	const tenantSlug = tenant?.slug || '';

	const [isRefundDialogOpen, setRefundDialogOpen] = useState(false);
	const [selectedTransaction, setSelectedTransaction] = useState(null);
	const [isItemRefundDialogOpen, setItemRefundDialogOpen] = useState(false);

	const {
		data: payment,
		isLoading,
		isError,
		error,
		refetch,
		isFetching,
	} = useQuery({
		queryKey: ["payment", paymentId],
		queryFn: () => getPaymentById(paymentId),
		enabled: !!paymentId,
	});

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
			// Check if single or multiple items
			if (refundData.items.length === 1) {
				// Single item format
				const item = refundData.items[0];
				return processItemRefund({
					order_item_id: item.order_item_id,
					quantity: item.quantity,
					reason: refundData.reason,
				});
			} else {
				// Multiple items format
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

	// Generate timeline events - must be before early returns to satisfy Rules of Hooks
	const timelineEvents = useMemo(() => {
		if (!payment) return [];
		return generatePaymentTimeline(payment);
	}, [payment]);

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
				<Card className="p-6 max-w-md mx-auto border-border">
					<CardContent className="text-center">
						<p className="text-red-500">Error: {error.message}</p>
					</CardContent>
				</Card>
			</div>
		);
	if (!payment)
		return (
			<div className="flex items-center justify-center h-full">
				<Card className="p-6 max-w-md mx-auto border-border">
					<CardContent className="text-center">
						<p className="text-muted-foreground">
							Payment not found.
						</p>
					</CardContent>
				</Card>
			</div>
		);

	const getStatusVariant = (status) => {
		switch (status?.toLowerCase()) {
			case "paid":
			case "succeeded":
				return "default";
			case "partially_refunded":
				return "secondary";
			case "refunded":
				return "destructive";
			case "pending":
				return "outline";
			default:
				return "outline";
		}
	};

	const getStatusDotColor = (status) => {
		switch (status?.toUpperCase()) {
			case "PAID":
				return "bg-emerald-500";
			case "PARTIALLY_PAID":
				return "bg-yellow-500";
			case "PENDING":
				return "bg-blue-500";
			case "UNPAID":
				return "bg-red-500";
			case "REFUNDED":
			case "PARTIALLY_REFUNDED":
				return "bg-gray-500";
			default:
				return "bg-gray-400";
		}
	};

	return (
		<div className="flex flex-col h-full">
			{/* Page Header */}
			<div className="flex-shrink-0 border-b border-border bg-background p-4 md:p-6">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="p-2.5 bg-muted rounded-lg">
							<CreditCard className="h-5 w-5 text-foreground" />
						</div>
						<div>
							<h1 className="text-xl font-bold text-foreground">
								Payment Details
							</h1>
							<p className="text-muted-foreground">
								Payment #{payment.payment_number}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-3">
						<Button
							onClick={() => {
								// Preserve URL parameters when navigating back
								const backUrl = `/${tenantSlug}/payments${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
								navigate(backUrl);
							}}
							variant="outline"
							size="sm"
							className="border-border"
						>
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back to Payments
						</Button>
						<Button
							onClick={() => refetch()}
							variant="outline"
							size="sm"
							className="border-border"
							disabled={isFetching}
						>
							<RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
							Refresh
						</Button>
						<div className="flex items-center gap-2">
							<div className={`h-2 w-2 rounded-full ${getStatusDotColor(payment.status)}`} />
							<Badge
								variant={getStatusVariant(payment.status)}
								className="px-3 py-1 font-semibold"
							>
								{payment.status}
							</Badge>
						</div>
					</div>
				</div>
			</div>

			{/* Scrollable Content Area */}
			<div className="flex-1 min-h-0 p-4 md:p-6">
				<ScrollArea className="h-full">
					<div className="pb-8">
						<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
							{/* Payment Summary Card */}
							<Card className="lg:col-span-1 border-border bg-card">
								<CardHeader className="pb-4">
									<div className="flex items-center gap-3">
										<div className="p-2.5 bg-muted rounded-lg">
											<Receipt className="h-5 w-5 text-foreground" />
										</div>
										<div>
											<CardTitle className="text-lg font-semibold text-foreground">
												Payment Summary
											</CardTitle>
											<CardDescription className="text-muted-foreground mt-1">
												Payment #: {payment.payment_number}
											</CardDescription>
										</div>
									</div>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="space-y-3">
										<div className="flex justify-between items-center p-3 bg-muted rounded-lg border border-border">
											<span className="text-muted-foreground">
												Amount Due
											</span>
											<span className="font-semibold text-foreground">
												{formatCurrency(payment.total_amount_due)}
											</span>
										</div>
										<div className="flex justify-between items-center p-3 bg-muted rounded-lg border border-border">
											<span className="text-muted-foreground">
												Total Tips
											</span>
											<span className="font-semibold text-foreground">
												{formatCurrency(payment.total_tips)}
											</span>
										</div>
										<div className="flex justify-between items-center p-3 bg-muted rounded-lg border border-border">
											<span className="text-muted-foreground">
												Total Surcharges
											</span>
											<span className="font-semibold text-foreground">
												{formatCurrency(payment.total_surcharges)}
											</span>
										</div>
										<div className="flex justify-between items-center p-3 bg-muted rounded-lg border border-border">
											<span className="text-muted-foreground">
												Total Collected
											</span>
											<span className="font-semibold text-foreground">
												{formatCurrency(payment.total_collected)}
											</span>
										</div>
										<div className="flex justify-between items-center p-3 bg-muted rounded-lg border border-border">
											<span className="text-muted-foreground">
												Status
											</span>
											<Badge
												variant={getStatusVariant(payment.status)}
												className="font-medium"
											>
												{payment.status}
											</Badge>
										</div>
										<div className="flex justify-between items-center p-3 bg-muted rounded-lg border border-border">
											<span className="text-muted-foreground">
												Created
											</span>
											<span className="font-medium text-foreground">
												{new Date(payment.created_at).toLocaleString()}
											</span>
										</div>
										{payment.order && (
											<div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
												<span className="text-muted-foreground">
													Related Order
												</span>
												<Link
													to={`/${tenantSlug}/orders/${payment.order.id}`}
													className="flex items-center gap-1 font-mono text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline"
												>
													{payment.order_number}
													<ExternalLink className="h-3 w-3" />
												</Link>
											</div>
										)}
									</div>
								</CardContent>
							</Card>

							{/* Payment Timeline Card */}
							<Card className="lg:col-span-2 border-border bg-card">
								<CardHeader className="pb-4">
									<div className="flex items-center gap-3">
										<div className="p-2.5 bg-muted rounded-lg">
											<Clock className="h-5 w-5 text-foreground" />
										</div>
										<div>
											<CardTitle className="text-lg font-semibold text-foreground">
												Payment Timeline
											</CardTitle>
											<CardDescription className="text-muted-foreground mt-1">
												Complete history of payment events
											</CardDescription>
										</div>
									</div>
								</CardHeader>
								<CardContent>
									{timelineEvents.length > 0 ? (
										<Timeline items={timelineEvents} />
									) : (
										<p className="text-muted-foreground text-center py-8">
											No timeline events available
										</p>
									)}
								</CardContent>
							</Card>
						</div>

						{/* Order Items Table */}
						{payment.order?.items && payment.order.items.length > 0 && (
							<div className="mt-6">
								<Card className="border-border bg-card">
									<CardHeader className="pb-4">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-3">
												<div className="p-2.5 bg-muted rounded-lg">
													<Receipt className="h-5 w-5 text-foreground" />
												</div>
												<div>
													<CardTitle className="text-lg font-semibold text-foreground">
														Order Items
													</CardTitle>
													<CardDescription className="text-muted-foreground mt-1">
														Items included in this order
													</CardDescription>
												</div>
											</div>
											{payment.status === "PAID" && (
												<Button
													onClick={() => setItemRefundDialogOpen(true)}
													variant="outline"
													size="sm"
													className="border-border"
												>
													Refund Items
												</Button>
											)}
										</div>
									</CardHeader>
									<CardContent>
										<div className="border border-border rounded-lg overflow-hidden">
											<Table>
												<TableHeader>
													<TableRow className="border-border hover:bg-transparent">
														<TableHead className="font-semibold text-foreground">
															Item
														</TableHead>
														<TableHead className="font-semibold text-foreground text-center">
															Quantity
														</TableHead>
														<TableHead className="font-semibold text-foreground text-center">
															Refunded
														</TableHead>
														<TableHead className="font-semibold text-foreground text-right">
															Price
														</TableHead>
														<TableHead className="font-semibold text-foreground text-right">
															Total
														</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{payment.order.items.map((item) => {
														const refundedQty = item.refunded_quantity || 0;
														const lineTotal = (item.price_at_sale || 0) * item.quantity;

														return (
															<TableRow
																key={item.id}
																className="border-border hover:bg-muted/50"
															>
																<TableCell className="font-medium text-foreground">
																	<div className="space-y-1">
																		<div>{item.product_name || "Unknown Item"}</div>
																		{item.notes && (
																			<div className="text-xs text-muted-foreground">
																				Note: {item.notes}
																			</div>
																		)}
																	</div>
																</TableCell>
																<TableCell className="text-center text-foreground">
																	{item.quantity}
																</TableCell>
																<TableCell className="text-center">
																	{refundedQty > 0 ? (
																		<Badge variant="secondary">{refundedQty}</Badge>
																	) : (
																		<span className="text-muted-foreground">—</span>
																	)}
																</TableCell>
																<TableCell className="text-right font-medium text-foreground">
																	{formatCurrency(item.price_at_sale || 0)}
																</TableCell>
																<TableCell className="text-right font-semibold text-foreground">
																	{formatCurrency(lineTotal)}
																</TableCell>
															</TableRow>
														);
													})}
												</TableBody>
											</Table>
										</div>
									</CardContent>
								</Card>
							</div>
						)}

						{/* Transaction Details Table */}
						<div className="mt-6">
							<Card className="border-border bg-card">
								<CardHeader className="pb-4">
									<div className="flex items-center gap-3">
										<div className="p-2.5 bg-muted rounded-lg">
											<DollarSign className="h-5 w-5 text-foreground" />
										</div>
										<div>
											<CardTitle className="text-lg font-semibold text-foreground">
												Transaction Details
											</CardTitle>
											<CardDescription className="text-muted-foreground mt-1">
												Individual transactions associated with this payment
											</CardDescription>
										</div>
									</div>
								</CardHeader>
								<CardContent>
									{payment.transactions?.some(
										(txn) =>
											txn.status === "FAILED" || txn.status === "CANCELED"
									) && (
										<div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
											<p className="text-sm text-yellow-800 dark:text-yellow-200">
												<strong>Note:</strong> Failed/canceled transactions are
												shown with reduced opacity and marked as "Not Charged".
												These do not contribute to the payment total.
											</p>
										</div>
									)}
									<div className="border border-border rounded-lg overflow-hidden">
										<Table>
											<TableHeader>
												<TableRow className="border-border hover:bg-transparent">
													<TableHead className="font-semibold text-foreground">
														Amount
													</TableHead>
													<TableHead className="font-semibold text-foreground">
														Status
													</TableHead>
													<TableHead className="font-semibold text-foreground">
														Method
													</TableHead>
													<TableHead className="font-semibold text-foreground">
														Card Details
													</TableHead>
													<TableHead className="font-semibold text-foreground">
														Refunded
													</TableHead>
													<TableHead className="text-right font-semibold text-foreground">
														Actions
													</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{payment.transactions?.length > 0 ? (
													payment.transactions
														.sort((a, b) => {
															// Sort successful transactions first, then failed
															if (
																a.status === "SUCCESSFUL" &&
																b.status !== "SUCCESSFUL"
															)
																return -1;
															if (
																a.status !== "SUCCESSFUL" &&
																b.status === "SUCCESSFUL"
															)
																return 1;
															return (
																new Date(b.created_at) - new Date(a.created_at)
															);
														})
														.map((txn) => {
															const refundableAmount =
																Number.parseFloat(txn.amount) -
																Number.parseFloat(txn.refunded_amount || 0);
															const isRefundable =
																txn.status === "SUCCESSFUL" &&
																refundableAmount > 0;
															const isFailed =
																txn.status === "FAILED" ||
																txn.status === "CANCELED";

															return (
																<TableRow
																	key={txn.id}
																	className={`border-border hover:bg-muted/50 ${
																		isFailed
																			? "opacity-60 bg-red-50 dark:bg-red-900/20"
																			: ""
																	}`}
																>
																	<TableCell className="font-medium text-foreground">
																		<div className="space-y-1">
																			<div>
																				{formatCurrency(
																					Number.parseFloat(txn.amount) +
																						Number.parseFloat(
																							txn.surcharge || 0
																						)
																				)}
																			</div>
																			{Number.parseFloat(txn.surcharge || 0) >
																				0 && (
																				<div className="text-xs text-muted-foreground">
																					Base: {formatCurrency(txn.amount)} +
																					Fee: {formatCurrency(txn.surcharge)}
																				</div>
																			)}
																		</div>
																	</TableCell>
																	<TableCell>
																		<Badge
																			variant={
																				txn.status === "SUCCESSFUL"
																					? "default"
																					: isFailed
																					? "destructive"
																					: "secondary"
																			}
																			className={`font-medium ${
																				isFailed ? "opacity-90" : ""
																			}`}
																		>
																			{txn.status}
																			{isFailed && " (Not Charged)"}
																		</Badge>
																	</TableCell>
																	<TableCell>
																		<Badge
																			variant="outline"
																			className="border-border capitalize"
																		>
																			{txn.method.replace("_", " ")}
																		</Badge>
																	</TableCell>
																	<TableCell>
																		{txn.card_brand && txn.card_last4 ? (
																			<div className="flex items-center gap-2">
																				<div className="h-5 w-8 bg-muted rounded flex items-center justify-center">
																					<span className="text-xs font-bold text-muted-foreground">
																						{txn.card_brand
																							.substring(0, 2)
																							.toUpperCase()}
																					</span>
																				</div>
																				<span className="font-mono text-sm text-foreground">
																					****{txn.card_last4}
																				</span>
																			</div>
																		) : (
																			<span className="text-muted-foreground">
																				—
																			</span>
																		)}
																	</TableCell>
																	<TableCell className="text-foreground">
																		{formatCurrency(txn.refunded_amount || 0)}
																	</TableCell>
																	<TableCell className="text-right">
																		{isRefundable && (
																			<Button
																				size="sm"
																				variant="outline"
																				onClick={() =>
																					handleOpenRefundDialog(txn)
																				}
																				disabled={isRefunding}
																				className="border-border"
																			>
																				Refund
																			</Button>
																		)}
																	</TableCell>
																</TableRow>
															);
														})
												) : (
													<TableRow>
														<TableCell
															colSpan="6"
															className="text-center py-8 text-muted-foreground"
														>
															No transactions found.
														</TableCell>
													</TableRow>
												)}
											</TableBody>
										</Table>
									</div>
								</CardContent>
							</Card>
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
					isProcessing={isItemRefunding}
					onSubmit={handleItemRefundSubmit}
				/>
			)}
		</div>
	);
};

export default PaymentDetailsPage;
