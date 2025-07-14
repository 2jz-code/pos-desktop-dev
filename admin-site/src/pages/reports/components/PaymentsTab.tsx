"use client";

import { useState, useEffect } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	LineChart,
	Line,
	PieChart,
	Pie,
	Cell,
} from "recharts";
import {
	CreditCard,
	DollarSign,
	TrendingUp,
	TrendingDown,
	AlertCircle,
	CheckCircle,
	Download,
	RefreshCw,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import reportsService from "@/services/api/reportsService";
import { ExportDialog } from "@/components/reports/ExportDialog";

interface PaymentsData {
	payment_methods: Array<{
		method: string;
		amount: number;
		count: number;
		avg_amount: number;
		processing_fees: number;
		percentage: number;
		trend: number;
	}>;
	daily_volume: Array<{
		date: string;
		amount: number;
		count: number;
	}>;
	daily_breakdown: Array<{
		date: string;
		total: number;
		[key: string]: number | string;
	}>;
	processing_stats: {
		total_attempts: number;
		successful: number;
		failed: number;
		refunded: number;
		success_rate: number;
	};
	order_totals_comparison: {
		order_grand_total: number;
		order_count: number;
		payment_transaction_total: number;
		difference: number;
	};
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"];

interface PaymentsTabProps {
	dateRange: DateRange | undefined;
}

export function PaymentsTab({ dateRange }: PaymentsTabProps) {
	const [data, setData] = useState<PaymentsData | null>(null);
	const [loading, setLoading] = useState(false);
	const [exportDialogOpen, setExportDialogOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchPaymentsData = async () => {
		if (!dateRange?.from || !dateRange?.to) return;

		setLoading(true);
		setError(null);

		try {
			const startDate = reportsService.formatDateForApi(dateRange.from);
			const endDate = reportsService.formatEndDateForApi(dateRange.to);

			if (!startDate || !endDate) {
				setError("Invalid date range");
				return;
			}

			const paymentsData = await reportsService.generatePaymentsReport(
				startDate,
				endDate
			);
			setData(paymentsData as PaymentsData);
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchPaymentsData();
	}, [dateRange]);

	if (loading) {
		return (
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="space-y-1">
						<h3 className="text-2xl font-semibold tracking-tight">
							Payment Reports
						</h3>
						<p className="text-sm text-muted-foreground">
							Payment method analysis and transaction insights
						</p>
					</div>
				</div>
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
					{[...Array(4)].map((_, i) => (
						<Card key={i}>
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<div className="h-4 w-20 bg-muted animate-pulse rounded" />
								<div className="h-4 w-4 bg-muted animate-pulse rounded" />
							</CardHeader>
							<CardContent>
								<div className="h-8 w-24 bg-muted animate-pulse rounded mb-2" />
								<div className="h-3 w-16 bg-muted animate-pulse rounded" />
							</CardContent>
						</Card>
					))}
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="space-y-4">
				<Card>
					<CardContent className="pt-6">
						<div className="text-center">
							<p className="text-sm text-muted-foreground mb-4">
								Error loading payments data: {error}
							</p>
							<Button
								onClick={fetchPaymentsData}
								variant="outline"
							>
								<RefreshCw className="mr-2 h-4 w-4" />
								Retry
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	const totalAmount =
		data?.payment_methods?.reduce((sum, method) => sum + method.amount, 0) || 0;
	const totalTransactions =
		data?.payment_methods?.reduce((sum, method) => sum + method.count, 0) || 0;

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="space-y-1">
					<h3 className="text-2xl font-semibold tracking-tight">
						Payment Reports
					</h3>
					<p className="text-sm text-muted-foreground">
						Payment method analysis and transaction insights
					</p>
				</div>
				<div className="flex items-center space-x-2">
					<Button
						onClick={() => setExportDialogOpen(true)}
						variant="outline"
						size="sm"
					>
						<Download className="mr-2 h-4 w-4" />
						Export
					</Button>
				</div>
			</div>

			{/* Key Metrics */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Total Processed
						</CardTitle>
						<DollarSign className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							${totalAmount.toLocaleString()}
						</div>
						<p className="text-xs text-muted-foreground">All payment methods</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Transactions</CardTitle>
						<CreditCard className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{totalTransactions.toLocaleString()}
						</div>
						<p className="text-xs text-muted-foreground">Total transactions</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Success Rate</CardTitle>
						<CheckCircle className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{data?.processing_stats?.success_rate?.toFixed(1) || "0"}%
						</div>
						<p className="text-xs text-muted-foreground">Transaction success</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Processing Fees
						</CardTitle>
						<AlertCircle className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							$
							{data?.payment_methods
								?.reduce((sum, method) => sum + method.processing_fees, 0)
								.toLocaleString() || "0"}
						</div>
						<p className="text-xs text-muted-foreground">Total fees paid</p>
					</CardContent>
				</Card>
			</div>

			{/* Payment Methods Breakdown */}
			<Card>
				<CardHeader>
					<CardTitle>Payment Methods</CardTitle>
					<CardDescription>
						Breakdown by payment method with trends
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{data?.payment_methods?.map((method, index) => (
							<div
								key={method.method}
								className="flex items-center justify-between p-4 border rounded-lg"
							>
								<div className="flex items-center space-x-4">
									<div
										className="w-4 h-4 rounded-full"
										style={{ backgroundColor: COLORS[index % COLORS.length] }}
									/>
									<div>
										<p className="font-medium capitalize">
											{method.method.replace("_", " ")}
										</p>
										<p className="text-sm text-muted-foreground">
											{method.count} transactions • Avg: $
											{method.avg_amount.toFixed(2)}
										</p>
									</div>
								</div>
								<div className="text-right space-y-1">
									<div className="flex items-center space-x-2">
										<span className="font-medium">
											${method.amount.toLocaleString()}
										</span>
										<Badge variant={method.trend > 0 ? "default" : "secondary"}>
											{method.trend > 0 ? (
												<TrendingUp className="mr-1 h-3 w-3" />
											) : (
												<TrendingDown className="mr-1 h-3 w-3" />
											)}
											{Math.abs(method.trend).toFixed(1)}%
										</Badge>
									</div>
									<div className="flex items-center space-x-2">
										<Progress
											value={method.percentage}
											className="w-20"
										/>
										<span className="text-sm text-muted-foreground">
											{method.percentage.toFixed(1)}%
										</span>
									</div>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Charts Row */}
			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Payment Volume Trend</CardTitle>
						<CardDescription>Daily payment volume over time</CardDescription>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer
							width="100%"
							height={300}
						>
							<LineChart data={data?.daily_volume || []}>
								<CartesianGrid strokeDasharray="3 3" />
								<XAxis
									dataKey="date"
									tickFormatter={(value) =>
										format(reportsService.parseLocalDate(value), "MMM dd")
									}
								/>
								<YAxis
									tickFormatter={(value) => `$${value.toLocaleString()}`}
								/>
								<Tooltip
									labelFormatter={(value) =>
										format(reportsService.parseLocalDate(value), "MMM dd, yyyy")
									}
									formatter={(value: number) => [
										`$${value.toLocaleString()}`,
										"Amount",
									]}
								/>
								<Line
									type="monotone"
									dataKey="amount"
									stroke="#8884d8"
									strokeWidth={2}
									dot={{ fill: "#8884d8" }}
								/>
							</LineChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Payment Distribution</CardTitle>
						<CardDescription>Share of total payment volume</CardDescription>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer
							width="100%"
							height={300}
						>
							<PieChart>
								<Pie
									data={data?.payment_methods || []}
									cx="50%"
									cy="50%"
									labelLine={false}
									label={({ method, percentage }) =>
										`${method} (${percentage.toFixed(1)}%)`
									}
									outerRadius={80}
									fill="#8884d8"
									dataKey="amount"
								>
									{data?.payment_methods?.map((entry, index) => (
										<Cell
											key={`cell-${index}`}
											fill={COLORS[index % COLORS.length]}
										/>
									))}
								</Pie>
								<Tooltip
									formatter={(value: number) => `$${value.toLocaleString()}`}
								/>
							</PieChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>
			</div>

			{/* Processing Statistics */}
			<Card>
				<CardHeader>
					<CardTitle>Processing Statistics</CardTitle>
					<CardDescription>Transaction processing performance</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 md:grid-cols-4">
						<div className="space-y-2">
							<p className="text-sm font-medium">Total Attempts</p>
							<p className="text-2xl font-bold">
								{data?.processing_stats?.total_attempts?.toLocaleString() ||
									"0"}
							</p>
						</div>
						<div className="space-y-2">
							<p className="text-sm font-medium text-green-600">Successful</p>
							<p className="text-2xl font-bold text-green-600">
								{data?.processing_stats?.successful?.toLocaleString() || "0"}
							</p>
						</div>
						<div className="space-y-2">
							<p className="text-sm font-medium text-red-600">Failed</p>
							<p className="text-2xl font-bold text-red-600">
								{data?.processing_stats?.failed?.toLocaleString() || "0"}
							</p>
						</div>
						<div className="space-y-2">
							<p className="text-sm font-medium text-orange-600">Refunded</p>
							<p className="text-2xl font-bold text-orange-600">
								{data?.processing_stats?.refunded?.toLocaleString() || "0"}
							</p>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Reconciliation */}
			{data?.order_totals_comparison && (
				<Card>
					<CardHeader>
						<CardTitle>Payment Reconciliation</CardTitle>
						<CardDescription>
							Comparison between order totals and payment transactions
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid gap-4 md:grid-cols-3">
							<div className="space-y-2">
								<p className="text-sm font-medium">Order Grand Total</p>
								<p className="text-2xl font-bold">
									$
									{data.order_totals_comparison.order_grand_total.toLocaleString()}
								</p>
								<p className="text-xs text-muted-foreground">
									{data.order_totals_comparison.order_count} orders
								</p>
							</div>
							<div className="space-y-2">
								<p className="text-sm font-medium">Payment Transactions</p>
								<p className="text-2xl font-bold">
									$
									{data.order_totals_comparison.payment_transaction_total.toLocaleString()}
								</p>
								<p className="text-xs text-muted-foreground">
									Processed amount
								</p>
							</div>
							<div className="space-y-2">
								<p className="text-sm font-medium">Difference</p>
								<p
									className={`text-2xl font-bold ${
										data.order_totals_comparison.difference === 0
											? "text-green-600"
											: "text-red-600"
									}`}
								>
									$
									{Math.abs(
										data.order_totals_comparison.difference
									).toLocaleString()}
								</p>
								<p className="text-xs text-muted-foreground">
									{data.order_totals_comparison.difference === 0
										? "Balanced"
										: "Variance detected"}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Export Dialog */}
			<ExportDialog
				open={exportDialogOpen}
				onOpenChange={setExportDialogOpen}
				reportType="payments"
				defaultStartDate={dateRange?.from}
				defaultEndDate={dateRange?.to}
			/>
		</div>
	);
}
