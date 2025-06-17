import React from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPaymentById, refundPayment } from "@/api/services/paymentService";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import FullScreenLoader from "@/components/FullScreenLoader";
import { toast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";
import { ArrowLeft, CreditCard, DollarSign } from "lucide-react";

// A small component to render each transaction
const TransactionDetail = ({ transaction }) => {
	const method = transaction.method?.replace("_", " ") || "N/A";
	const isCredit = method.toLowerCase() === "credit";

	return (
		<div className="p-4 border rounded-lg bg-muted/50 space-y-2">
			<div className="flex justify-between items-center">
				<div className="flex items-center gap-2">
					{isCredit ? (
						<CreditCard className="h-5 w-5 text-blue-500" />
					) : (
						<DollarSign className="h-5 w-5 text-green-500" />
					)}
					<span className="font-semibold capitalize">{method}</span>
				</div>
				<span className="font-bold text-lg">
					{formatCurrency(transaction.amount)}
				</span>
			</div>
			<div className="text-xs text-muted-foreground space-y-1 pl-7">
				<p>Status: {transaction.status}</p>
				<p>Date: {new Date(transaction.created_at).toLocaleString()}</p>
				{isCredit && transaction.metadata?.card_brand && (
					<p>
						Card: {transaction.metadata.card_brand} ****
						{transaction.metadata.card_last4}
					</p>
				)}
			</div>
		</div>
	);
};

const PaymentDetailsPage = () => {
	const { paymentId } = useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

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

	const { mutate: initiateRefund, isLoading: isRefunding } = useMutation({
		mutationFn: () => refundPayment(paymentId, parseFloat(payment.amount_paid)),
		onSuccess: () => {
			toast({
				title: "Success",
				description: "Refund processed successfully.",
			});
			queryClient.invalidateQueries(["payment", paymentId]);
			queryClient.invalidateQueries(["payments"]);
		},
		onError: (err) => {
			toast({
				title: "Refund Error",
				description: err.message || "Failed to process refund.",
				variant: "destructive",
			});
		},
	});

	if (isLoading) return <FullScreenLoader />;
	if (isError) return <div className="p-8">Error: {error.message}</div>;
	if (!payment) return <div className="p-8">Payment not found.</div>;

	const canRefund = payment.status === "succeeded";

	return (
		<div className="p-4 md:p-8 space-y-4">
			<Button
				onClick={() => navigate("/payments")}
				variant="outline"
			>
				<ArrowLeft className="mr-2 h-4 w-4" />
				Back to All Payments
			</Button>

			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{/* Left Side: Overall Payment Summary */}
				<Card className="lg:col-span-1">
					<CardHeader>
						<CardTitle>Payment Summary</CardTitle>
						<CardDescription>ID: {payment.id}</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4 text-sm">
						<div className="flex justify-between">
							<span className="text-muted-foreground">Total Amount Paid</span>
							<span className="font-medium">
								{formatCurrency(payment.amount_paid)}
							</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Tip</span>
							<span className="font-medium">{formatCurrency(payment.tip)}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Overall Status</span>
							<Badge>{payment.status}</Badge>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Created</span>
							<span className="font-medium">
								{new Date(payment.created_at).toLocaleString()}
							</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Related Order: </span>
							<Link
								to={`/orders/${payment.order}`}
								className="hover:underline font-mono text-sm font-bold text-blue-500"
							>
								{payment.order?.order_number} {/* Display order_number */}
							</Link>
						</div>
						{canRefund && (
							<Button
								className="w-full mt-4"
								onClick={initiateRefund}
								disabled={isRefunding}
							>
								{isRefunding ? "Refunding..." : "Refund Full Amount"}
							</Button>
						)}
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
					<CardContent className="space-y-4">
						{payment.transactions && payment.transactions.length > 0 ? (
							payment.transactions.map((txn) => (
								<TransactionDetail
									key={txn.id}
									transaction={txn}
								/>
							))
						) : (
							<p className="text-muted-foreground">No transactions found.</p>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
};

export default PaymentDetailsPage;
