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
		refunded_amount: number;
		refunded_count: number;
		total_processed: number;
		net_amount: number;
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
	summary: {
		// Primary comprehensive metrics
		total_attempted: number;
		successfully_processed: number;
		processing_issues: number;

		// Detailed breakdown by status
		breakdown: {
			successful: {
				amount: number;
				count: number;
			};
			refunded: {
				amount: number;
				count: number;
			};
			failed: {
				amount: number;
				count: number;
			};
			canceled: {
				amount: number;
				count: number;
			};
		};

		// Calculated rates
		processing_success_rate: number;
		processing_issues_rate: number;

		// Legacy fields for backward compatibility
		total_processed: number;
		total_transactions: number;
		total_refunds: number;
		total_refunded_transactions: number;
		net_revenue: number;
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
	// New comprehensive payment metrics
	const totalAttempted = Number(data?.summary?.total_attempted || 0);
	const successfullyProcessed = Number(
		data?.summary?.successfully_processed || 0
	);
	const processingIssues = Number(data?.summary?.processing_issues || 0);
	const processingSuccessRate = Number(
		data?.summary?.processing_success_rate || 0
	);
	const processingIssuesRate = Number(
		data?.summary?.processing_issues_rate || 0
	);

	// Detailed breakdown
	const successfulCount = Number(
		data?.summary?.breakdown?.successful?.count || 0
	);
	const refundedAmount = Number(
		data?.summary?.breakdown?.refunded?.amount || 0
	);
	const refundedCount = Number(data?.summary?.breakdown?.refunded?.count || 0);
	const failedAmount = Number(data?.summary?.breakdown?.failed?.amount || 0);
	const failedCount = Number(data?.summary?.breakdown?.failed?.count || 0);
	const canceledAmount = Number(
		data?.summary?.breakdown?.canceled?.amount || 0
	);
	const canceledCount = Number(data?.summary?.breakdown?.canceled?.count || 0);

	// Legacy fields for backward compatibility
	const totalRefunds = Number(data?.summary?.total_refunds || 0);
	const netRevenue = Number(data?.summary?.net_revenue || 0);
	const totalTransactions = Number(data?.summary?.total_transactions || 0);

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

			{/* Key Metrics - Simplified to 4 clear metrics */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Total Collected
						</CardTitle>
						<DollarSign className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							${successfullyProcessed.toLocaleString()}
						</div>
						<p className="text-xs text-muted-foreground">
							Successfully processed payments
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Total Refunds</CardTitle>
						<RefreshCw className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold text-orange-600">
							${totalRefunds.toLocaleString()}
						</div>
						<p className="text-xs text-muted-foreground">
							{refundedCount} transactions refunded
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Total After Refunds
						</CardTitle>
						<CreditCard className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold text-green-600">
							${netRevenue.toLocaleString()}
						</div>
						<p className="text-xs text-muted-foreground">After refunds</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Success Rate</CardTitle>
						<TrendingUp className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{processingSuccessRate.toFixed(1)}%
						</div>
						<p className="text-xs text-muted-foreground">
							{successfulCount} of {totalTransactions} succeeded
						</p>
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
											{Number(method.avg_amount || 0).toFixed(2)}
										</p>
										{Number(method.refunded_count || 0) > 0 && (
											<p className="text-xs text-red-500">
												{method.refunded_count} refunds (-$
												{Number(method.refunded_amount || 0).toFixed(2)})
											</p>
										)}
									</div>
								</div>
								<div className="text-right space-y-1">
									<div className="flex items-center space-x-2">
										<div className="text-right">
											<div className="font-medium">
												${Number(method.amount || 0).toLocaleString()}
											</div>
											<div className="text-sm text-muted-foreground">
												{Number(method.processing_fees || 0) > 0 && (
													<span>
														Fees: $
														{Number(method.processing_fees || 0).toFixed(2)} |{" "}
													</span>
												)}
												{Number(method.percentage || 0).toFixed(1)}%
											</div>
										</div>
										{method.trend !== 0 && (
											<Badge
												variant={method.trend > 0 ? "default" : "secondary"}
											>
												{method.trend > 0 ? (
													<TrendingUp className="mr-1 h-3 w-3" />
												) : (
													<TrendingDown className="mr-1 h-3 w-3" />
												)}
												{Math.abs(Number(method.trend || 0)).toFixed(1)}%
											</Badge>
										)}
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

			{/* Processing Breakdown */}
			<Card>
				<CardHeader>
					<CardTitle>Transaction Breakdown</CardTitle>
					<CardDescription>
						Detailed transaction status breakdown
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 md:grid-cols-4">
						<div className="space-y-2">
							<p className="text-sm font-medium">Successful</p>
							<p className="text-2xl font-bold text-green-600">
								{successfulCount.toLocaleString()}
							</p>
							<p className="text-xs text-muted-foreground">
								${successfullyProcessed.toLocaleString()}
							</p>
						</div>
						<div className="space-y-2">
							<p className="text-sm font-medium">Refunded</p>
							<p className="text-2xl font-bold text-orange-600">
								{refundedCount.toLocaleString()}
							</p>
							<p className="text-xs text-muted-foreground">
								${refundedAmount.toLocaleString()}
							</p>
						</div>
						<div className="space-y-2">
							<p className="text-sm font-medium">Failed</p>
							<p className="text-2xl font-bold text-red-600">
								{failedCount.toLocaleString()}
							</p>
							<p className="text-xs text-muted-foreground">
								${failedAmount.toLocaleString()}
							</p>
						</div>
						<div className="space-y-2">
							<p className="text-sm font-medium">Canceled</p>
							<p className="text-2xl font-bold text-muted-foreground">
								{canceledCount.toLocaleString()}
							</p>
							<p className="text-xs text-muted-foreground">
								${canceledAmount.toLocaleString()}
							</p>
						</div>
					</div>
				</CardContent>
			</Card>

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
