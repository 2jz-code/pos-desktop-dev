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
				return "secondary";
			default:
				return "outline";
		}
	};

	if (isLoading) {
		return <OrdersTableSkeleton />;
	}

	if (isError) {
		return (
			<div className="container mx-auto p-6">
				<h2 className="text-3xl font-bold tracking-tight mb-4">Payments</h2>
				<Card>
					<CardHeader>
						<CardTitle>Error</CardTitle>
					</CardHeader>
					<CardContent>
						<p>Failed to load payments: {error.message}</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (!payments || payments.length === 0) {
		return (
			<div className="container mx-auto p-6">
				<h2 className="text-3xl font-bold tracking-tight mb-4">Payments</h2>
				<Card>
					<CardHeader>
						<CardTitle>All Payments</CardTitle>
					</CardHeader>
					<CardContent>
						<p>No payments found.</p>
					</CardContent>
				</Card>
			</div>
		);
	}

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
								{payments.map((p) => (
									<TableRow
										key={p.id}
										onClick={() => navigate(`/payments/${p.id}`)}
										className="cursor-pointer"
									>
										<TableCell className="font-mono">
											{p.id.substring(0, 12)}...
										</TableCell>
										<TableCell className="font-mono">
											{p.order ? `${p.order.substring(0, 8)}...` : "N/A"}
										</TableCell>
										<TableCell>
											${parseFloat(p.amount_paid).toFixed(2)}
										</TableCell>
										<TableCell className="capitalize">
											{p.transactions?.[0]?.method.replace("_", " ") || "N/A"}
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
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			</main>
		</div>
	);
};

export default PaymentsPage;
