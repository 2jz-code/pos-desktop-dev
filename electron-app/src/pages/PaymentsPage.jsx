import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getPayments } from "@/api/services/paymentService";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { OrdersTableSkeleton } from "@/components/OrdersTableSkeleton";
import { formatCurrency } from "@/lib/utils";

const PaymentsPage = () => {
	const navigate = useNavigate();
	const {
		data: payments,
		isLoading,
		isError,
		error,
	} = useQuery({
		queryKey: ["payments"],
		queryFn: getPayments,
	});

	const getStatusVariant = (status) => {
		switch (status?.toLowerCase()) {
			case "succeeded":
				return "success";
			case "refunded":
				return "destructive";
			case "pending":
			case "paid":
				return "default";
			default:
				return "outline";
		}
	};

	const getPaymentMethod = (transactions) => {
		if (!transactions || transactions.length === 0) {
			return "N/A";
		}
		if (transactions.length > 1) {
			return "SPLIT";
		}
		return transactions[0].method.replace("_", " ") || "N/A";
	};

	if (isLoading) return <OrdersTableSkeleton />;
	if (isError) return <div className="p-6">Error: {error.message}</div>;

	return (
		<div className="container mx-auto p-6 bg-gray-50 min-h-screen">
			<main>
				<Card>
					<CardHeader>
						<CardTitle>All Payments</CardTitle>
						<CardDescription>
							A list of all payments processed by the system.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Payment ID</TableHead>
									<TableHead>Order ID</TableHead>
									<TableHead>Amount</TableHead>
									<TableHead>Method</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Date</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{payments && payments.length > 0 ? (
									payments.map((p) => (
										<TableRow
											key={p.id}
											onClick={() => navigate(`/payments/${p.id}`)}
											className="cursor-pointer"
										>
											<TableCell className="font-mono text-xs">
												{p.id.substring(0, 12)}...
											</TableCell>
											<TableCell className="font-mono text-xs">
												{p.order ? `${p.order_number}` : "N/A"}
											</TableCell>
											<TableCell>{formatCurrency(p.amount_paid)}</TableCell>
											<TableCell className="capitalize">
												{getPaymentMethod(p.transactions)}
											</TableCell>
											<TableCell>
												<Badge variant={getStatusVariant(p.status)}>
													{p.status}
												</Badge>
											</TableCell>
											<TableCell>
												{new Date(p.created_at).toLocaleString()}
											</TableCell>
										</TableRow>
									))
								) : (
									<TableRow>
										<TableCell
											colSpan={6}
											className="text-center h-24"
										>
											No payments found.
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			</main>
		</div>
	);
};

export default PaymentsPage;
