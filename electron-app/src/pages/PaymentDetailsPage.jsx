import React, { useEffect, useState } from "react";
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
import FullScreenLoader from "@/components/FullScreenLoader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

const PaymentDetailsPage = () => {
	const { paymentId } = useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { toast } = useToast();

	const [refundAmount, setRefundAmount] = useState("");

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
		mutationFn: ({ amount }) => refundPayment(paymentId, amount),
		onSuccess: () => {
			toast({
				title: "Success",
				description: "Refund processed successfully.",
			});
			queryClient.invalidateQueries(["payment", paymentId]);
			queryClient.invalidateQueries(["payments"]); // Invalidate list view
		},
		onError: (err) => {
			toast({
				title: "Refund Error",
				description: err.message || "Failed to process refund.",
				variant: "destructive",
			});
		},
	});

	useEffect(() => {
		if (payment) {
			setRefundAmount(parseFloat(payment.amount_paid).toFixed(2));
		}
	}, [payment]);

	if (isLoading) {
		return <FullScreenLoader />;
	}

	if (isError) {
		return (
			<div className="flex-1 space-y-4 p-8 pt-6">
				<h2 className="text-3xl font-bold tracking-tight">Error</h2>
				<p>Failed to load payment details: {error.message}</p>
			</div>
		);
	}

	if (!payment) {
		return (
			<div className="flex-1 space-y-4 p-8 pt-6">
				<h2 className="text-3xl font-bold tracking-tight">Payment Not Found</h2>
			</div>
		);
	}

	const handleRefund = () => {
		const amount = parseFloat(refundAmount);
		if (!isNaN(amount) && amount > 0) {
			initiateRefund({ amount });
		}
	};

	const canRefund = payment.status === "succeeded";

	return (
		<div className="flex-1 space-y-4 p-8 pt-6">
			<Button
				onClick={() => navigate("/payments")}
				variant="outline"
				className="mb-4"
			>
				&larr; Back to Payments
			</Button>
			<h2 className="text-3xl font-bold tracking-tight">Payment Details</h2>
			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Payment Information</CardTitle>
						<CardDescription>ID: {payment.id}</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<p>
							<strong>Amount:</strong> $
							{parseFloat(payment.amount_paid).toFixed(2)}
						</p>
						<p>
							<strong>Method:</strong>{" "}
							{payment.transactions?.[0]?.method.replace("_", " ") || "N/A"}
						</p>
						<p>
							<strong>Status:</strong> {payment.status}
						</p>
						<p>
							<strong>Created:</strong>{" "}
							{new Date(payment.created_at).toLocaleString()}
						</p>
						<p>
							<strong>Related Order:</strong>{" "}
							<Link
								to={`/orders/${payment.order}`}
								className="text-blue-600 hover:underline font-mono"
							>
								{payment.order}
							</Link>
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Refunds</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						{canRefund ? (
							<div className="space-y-2">
								<Label htmlFor="refundAmount">Refund Amount</Label>
								<Input
									id="refundAmount"
									type="number"
									value={refundAmount}
									onChange={(e) => setRefundAmount(e.target.value)}
								/>
								<Button
									onClick={handleRefund}
									disabled={isRefunding}
								>
									{isRefunding ? "Refunding..." : "Initiate Refund"}
								</Button>
							</div>
						) : (
							<p>This payment cannot be refunded (Status: {payment.status}).</p>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
};

export default PaymentDetailsPage;
