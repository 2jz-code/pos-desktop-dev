import React, { useState } from "react";
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
import FullScreenLoader from "@/shared/components/common/FullScreenLoader";
import { useToast } from "@/shared/components/ui/use-toast";
import { formatCurrency } from "@/shared/lib/utils";
import { ArrowLeft } from "lucide-react";
import { RefundDialog } from "@/domains/payments/components/RefundDialog";

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
	if (isError) return <div className="p-8">Error: {error.message}</div>;
	if (!payment) return <div className="p-8">Payment not found.</div>;

	const getStatusVariant = (status) => {
		switch (status.toLowerCase()) {
			case "paid":
				return "success";
			case "partially_refunded":
				return "warning";
			case "refunded":
				return "destructive";
			default:
				return "secondary";
		}
	};

	return (
		<div className="p-4 md:p-8 space-y-4">
			<Button
				onClick={() => navigate("/payments")}
				variant="outline"
				className="mb-4"
			>
				<ArrowLeft className="mr-2 h-4 w-4" />
				Back to All Payments
			</Button>

			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{/* Left Side: Overall Payment Summary */}
				<Card className="lg:col-span-1 h-fit">
					<CardHeader>
						<CardTitle>Payment Summary</CardTitle>
						<CardDescription>
							Payment #: {payment.payment_number}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4 text-sm">
						<div className="flex justify-between">
							<span className="text-muted-foreground">Net Amount Paid</span>
							<span className="font-medium">
								{formatCurrency(payment.amount_paid)}
							</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Tip</span>
							<span className="font-medium">{formatCurrency(payment.tip)}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Status</span>
							<Badge variant={getStatusVariant(payment.status)}>
								{payment.status}
							</Badge>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Created</span>
							<span className="font-medium">
								{new Date(payment.created_at).toLocaleString()}
							</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Related Order</span>
							<Link
								to={`/orders/${payment.order}`}
								className="hover:underline font-mono text-sm font-bold text-blue-500"
							>
								{payment.order_number}
							</Link>
						</div>
					</CardContent>
				</Card>

				{/* Right Side: Transaction List */}
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle>Transaction History</CardTitle>
						<CardDescription>
							Individual transactions associated with this payment.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Amount</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Method</TableHead>
									<TableHead>Card Details</TableHead>
									<TableHead>Refunded</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{payment.transactions?.length > 0 ? (
									payment.transactions.map((txn) => {
										const refundableAmount =
											parseFloat(txn.amount) -
											parseFloat(txn.refunded_amount || 0);
										const isRefundable =
											txn.status === "SUCCESSFUL" && refundableAmount > 0;

										// Select the correct logo based on the brand string
										const brandKey = txn.card_brand?.toLowerCase();
										const logoSrc = cardBrandLogos[brandKey] || DefaultCardLogo;

										return (
											<TableRow key={txn.id}>
												<TableCell className="font-medium">
													{formatCurrency(txn.amount)}
												</TableCell>
												<TableCell>
													<Badge
														variant={
															txn.status === "SUCCESSFUL"
																? "success"
																: "secondary"
														}
													>
														{txn.status}
													</Badge>
												</TableCell>
												<TableCell className="capitalize">
													{txn.method.replace("_", " ")}
												</TableCell>

												{/* --- UPDATED CELL TO DISPLAY LOGO --- */}
												<TableCell>
													{txn.card_brand && txn.card_last4 ? (
														<div className="flex items-center gap-2">
															<img
																src={logoSrc}
																alt={txn.card_brand}
																className="h-5 w-8 object-contain"
															/>
															<span className="font-mono text-sm">
																**** {txn.card_last4}
															</span>
														</div>
													) : (
														<span className="text-muted-foreground">—</span>
													)}
												</TableCell>

												<TableCell>
													{formatCurrency(txn.refunded_amount || 0)}
												</TableCell>
												<TableCell className="text-right">
													{isRefundable && (
														<Button
															size="sm"
															variant="outline"
															onClick={() => handleOpenRefundDialog(txn)}
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
											className="text-center"
										>
											No transactions found.
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
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
