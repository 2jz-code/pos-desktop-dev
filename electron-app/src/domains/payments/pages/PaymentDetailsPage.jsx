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
import { formatCurrency } from "@/shared/lib/utils";
import {
	ArrowLeft,
	CreditCard,
	Receipt,
	DollarSign,
	ExternalLink,
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
				<Card className="p-6 max-w-md mx-auto border-slate-200 dark:border-slate-700">
					<CardContent className="text-center">
						<p className="text-red-500">Error: {error.message}</p>
					</CardContent>
				</Card>
			</div>
		);
	if (!payment)
		return (
			<div className="flex items-center justify-center h-full">
				<Card className="p-6 max-w-md mx-auto border-slate-200 dark:border-slate-700">
					<CardContent className="text-center">
						<p className="text-slate-500 dark:text-slate-400">
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
							className="border-slate-200 dark:border-slate-700"
						>
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back to Payments
						</Button>
						<Badge
							variant={getStatusVariant(payment.status)}
							className="px-3 py-1"
						>
							{payment.status}
						</Badge>
					</div>
				}
				className="flex-shrink-0"
			/>

			{/* Scrollable Content Area */}
			<div className="flex-1 min-h-0 p-4 md:p-6">
				<ScrollArea className="h-full">
					<div className="pb-8">
						<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
							{/* Payment Summary Card */}
							<Card className="lg:col-span-1 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
								<CardHeader className="pb-4">
									<div className="flex items-center gap-3">
										<div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
											<Receipt className="h-5 w-5 text-slate-700 dark:text-slate-300" />
										</div>
										<div>
											<CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
												Payment Summary
											</CardTitle>
											<CardDescription className="text-slate-600 dark:text-slate-400 mt-1">
												Payment #: {payment.payment_number}
											</CardDescription>
										</div>
									</div>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="space-y-3">
										<div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
											<span className="text-slate-600 dark:text-slate-400">
												Amount Due
											</span>
											<span className="font-semibold text-slate-900 dark:text-slate-100">
												{formatCurrency(payment.total_amount_due)}
											</span>
										</div>
										<div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
											<span className="text-slate-600 dark:text-slate-400">
												Total Tips
											</span>
											<span className="font-semibold text-slate-900 dark:text-slate-100">
												{formatCurrency(payment.total_tips)}
											</span>
										</div>
										<div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
											<span className="text-slate-600 dark:text-slate-400">
												Total Surcharges
											</span>
											<span className="font-semibold text-slate-900 dark:text-slate-100">
												{formatCurrency(payment.total_surcharges)}
											</span>
										</div>
										<div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
											<span className="text-slate-600 dark:text-slate-400">
												Total Collected
											</span>
											<span className="font-semibold text-slate-900 dark:text-slate-100">
												{formatCurrency(payment.total_collected)}
											</span>
										</div>
										<div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
											<span className="text-slate-600 dark:text-slate-400">
												Status
											</span>
											<Badge
												variant={getStatusVariant(payment.status)}
												className="font-medium"
											>
												{payment.status}
											</Badge>
										</div>
										<div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
											<span className="text-slate-600 dark:text-slate-400">
												Created
											</span>
											<span className="font-medium text-slate-900 dark:text-slate-100">
												{new Date(payment.created_at).toLocaleString()}
											</span>
										</div>
										{payment.order && (
											<div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
												<span className="text-slate-600 dark:text-slate-400">
													Related Order
												</span>
												<Link
													to={`/orders/${payment.order.id}`}
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

							{/* Transaction History Card */}
							<Card className="lg:col-span-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
								<CardHeader className="pb-4">
									<div className="flex items-center gap-3">
										<div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
											<DollarSign className="h-5 w-5 text-slate-700 dark:text-slate-300" />
										</div>
										<div>
											<CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
												Transaction History
											</CardTitle>
											<CardDescription className="text-slate-600 dark:text-slate-400 mt-1">
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
									<div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
										<Table>
											<TableHeader>
												<TableRow className="border-slate-200 dark:border-slate-700 hover:bg-transparent">
													<TableHead className="font-semibold text-slate-900 dark:text-slate-100">
														Amount
													</TableHead>
													<TableHead className="font-semibold text-slate-900 dark:text-slate-100">
														Status
													</TableHead>
													<TableHead className="font-semibold text-slate-900 dark:text-slate-100">
														Method
													</TableHead>
													<TableHead className="font-semibold text-slate-900 dark:text-slate-100">
														Card Details
													</TableHead>
													<TableHead className="font-semibold text-slate-900 dark:text-slate-100">
														Refunded
													</TableHead>
													<TableHead className="text-right font-semibold text-slate-900 dark:text-slate-100">
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
																	className={`border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
																		isFailed
																			? "opacity-60 bg-red-50 dark:bg-red-900/20"
																			: ""
																	}`}
																>
																	<TableCell className="font-medium text-slate-900 dark:text-slate-100">
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
																				<div className="text-xs text-slate-500 dark:text-slate-400">
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
																			className="border-slate-200 dark:border-slate-700 capitalize"
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
																				<span className="font-mono text-sm text-slate-900 dark:text-slate-100">
																					****{txn.card_last4}
																				</span>
																			</div>
																		) : (
																			<span className="text-slate-500 dark:text-slate-400">
																				—
																			</span>
																		)}
																	</TableCell>
																	<TableCell className="text-slate-900 dark:text-slate-100">
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
																				className="border-slate-200 dark:border-slate-700"
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
															className="text-center py-8 text-slate-500 dark:text-slate-400"
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
