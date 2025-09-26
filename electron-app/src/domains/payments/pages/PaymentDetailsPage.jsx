import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	getPaymentById,
	refundTransaction,
} from "@/domains/payments/services/paymentService";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/shared/components/ui/table";
import { Badge } from "@/shared/components/ui/badge";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import FullScreenLoader from "@/shared/components/common/FullScreenLoader";
import { useToast } from "@/shared/components/ui/use-toast";
import { formatCurrency } from "@ajeen/ui";
import {
	ArrowLeft,
	CreditCard,
	Receipt,
	DollarSign,
	ExternalLink,
	RefreshCw,
} from "lucide-react";
import { RefundDialog } from "@/domains/payments/components/RefundDialog";
import { PageHeader } from "@/shared/components/layout/PageHeader";

// Import your card logos (ensure paths are correct)
import VisaLogo from "@/assets/images/card-logos/visa.svg";
import MastercardLogo from "@/assets/images/card-logos/mastercard.svg";
import AmexLogo from "@/assets/images/card-logos/amex.svg";
import DiscoverLogo from "@/assets/images/card-logos/discover.svg";
import DefaultCardLogo from "@/assets/images/card-logos/generic.svg";

// Mapping from brand string to the imported logo
const cardBrandLogos = {
	visa: VisaLogo,
	mastercard: MastercardLogo,
	amex: AmexLogo,
	discover: DiscoverLogo,
};

const PaymentDetailsPage = () => {
	const { paymentId } = useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { toast } = useToast();

	const [isRefundDialogOpen, setRefundDialogOpen] = useState(false);
	const [selectedTransaction, setSelectedTransaction] = useState(null);

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

	if (isLoading) return <FullScreenLoader />;
	if (isError)
		return (
			<div className="flex items-center justify-center h-full">
				<Card className="p-6 max-w-md mx-auto">
					<CardContent className="text-center">
						<p className="text-destructive">Error: {error.message}</p>
					</CardContent>
				</Card>
			</div>
		);
	if (!payment)
		return (
			<div className="flex items-center justify-center h-full">
				<Card className="p-6 max-w-md mx-auto">
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

	return (
		<div className="flex flex-col h-full">
			{/* Page Header */}
			<PageHeader
				icon={CreditCard}
				title="Payment Details"
				description={`Payment #${payment.payment_number}`}
				actions={
					<div className="flex items-center gap-3">
						<Button
							onClick={() => navigate("/payments")}
							variant="outline"
							size="sm"
						>
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back to Payments
						</Button>
						<Button
							onClick={() => refetch()}
							variant="outline"
							size="sm"
							disabled={isFetching}
						>
							<RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
							Refresh
						</Button>
						<Badge
							variant={getStatusVariant(payment.status)}
							className="px-3 py-1"
						>
							{payment.status}
						</Badge>
					</div>
				}
				className="shrink-0"
			/>

			{/* Main Content */}
			<div className="flex-1 min-h-0 p-4">
				<ScrollArea className="h-full">
					<div className="pb-6">
						<div className="grid grid-cols-1 xl:grid-cols-4 gap-4 lg:gap-6">
							{/* Payment Summary Card */}
							<Card className="xl:col-span-1 border-border/60 bg-card/80">
								<CardHeader>
									<div className="flex items-center gap-3">
										<div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
											<Receipt className="h-4 w-4" />
										</div>
										<div>
											<CardTitle className="text-base font-semibold text-foreground">
												Payment Summary
											</CardTitle>
											<CardDescription className="text-muted-foreground">
												Payment #: {payment.payment_number}
											</CardDescription>
										</div>
									</div>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="space-y-3">
										<div className="flex justify-between items-center p-3 bg-muted/20 rounded-lg border border-border/40">
											<span className="text-muted-foreground">
												Amount Due
											</span>
											<span className="font-semibold text-foreground">
												{formatCurrency(payment.total_amount_due)}
											</span>
										</div>
										<div className="flex justify-between items-center p-3 bg-muted/20 rounded-lg border border-border/40">
											<span className="text-muted-foreground">
												Total Tips
											</span>
											<span className="font-semibold text-foreground">
												{formatCurrency(payment.total_tips)}
											</span>
										</div>
										<div className="flex justify-between items-center p-3 bg-muted/20 rounded-lg border border-border/40">
											<span className="text-muted-foreground">
												Total Surcharges
											</span>
											<span className="font-semibold text-foreground">
												{formatCurrency(payment.total_surcharges)}
											</span>
										</div>
										<div className="flex justify-between items-center p-3 bg-muted/20 rounded-lg border border-border/40">
											<span className="text-muted-foreground">
												Total Collected
											</span>
											<span className="font-semibold text-foreground">
												{formatCurrency(payment.total_collected)}
											</span>
										</div>
										<div className="flex justify-between items-center p-3 bg-muted/20 rounded-lg border border-border/40">
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
										<div className="flex justify-between items-center p-3 bg-muted/20 rounded-lg border border-border/40">
											<span className="text-muted-foreground">
												Created
											</span>
											<span className="font-medium text-foreground">
												{new Date(payment.created_at).toLocaleString()}
											</span>
										</div>
										{payment.order && (
											<div className="flex justify-between items-center p-3 bg-primary/5 rounded-lg border border-primary/20">
												<span className="text-muted-foreground">
													Related Order
												</span>
												<Link
													to={`/orders/${payment.order.id}`}
													className="flex items-center gap-1 font-mono text-sm font-bold text-primary hover:underline"
												>
													{payment.order_number}
													<ExternalLink className="h-3 w-3" />
												</Link>
											</div>
										)}
									</div>
								</CardContent>
							</Card>

							{/* Transaction History Card */}
							<Card className="xl:col-span-3 border-border/60 bg-card/80">
								<CardHeader>
									<div className="flex items-center gap-3">
										<div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
											<DollarSign className="h-4 w-4" />
										</div>
										<div>
											<CardTitle className="text-base font-semibold text-foreground">
												Transaction History
											</CardTitle>
											<CardDescription className="text-muted-foreground">
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
										<div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
											<p className="text-sm text-yellow-800">
												<strong>Note:</strong> Failed/canceled transactions are
												shown with reduced opacity and marked as "Not Charged".
												These do not contribute to the payment total.
											</p>
										</div>
									)}
									<div className="border border-border/60 rounded-lg overflow-hidden">
										<Table>
											<TableHeader>
												<TableRow className="hover:bg-transparent">
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

															// Select the correct logo based on the brand string
															const brandKey = txn.card_brand?.toLowerCase();
															const logoSrc =
																cardBrandLogos[brandKey] || DefaultCardLogo;

															return (
																<TableRow
																	key={txn.id}
																	className={`hover:bg-muted/40 ${
																		isFailed
																			? "opacity-60 bg-destructive/10"
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
																			className="capitalize"
																		>
																			{txn.method.replace("_", " ")}
																		</Badge>
																	</TableCell>
																	<TableCell>
																		{txn.card_brand && txn.card_last4 ? (
																			<div className="flex items-center gap-2">
																				<img
																					src={logoSrc || "/placeholder.svg"}
																					alt={txn.card_brand}
																					className="h-5 w-8 object-contain"
																				/>
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
		</div>
	);
};

export default PaymentDetailsPage;