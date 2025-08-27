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
import {
	BarChart,
	Bar,
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
	DollarSign,
	ShoppingCart,
	TrendingUp,
	TrendingDown,
	Users,
	RefreshCw,
	Package,
	HelpCircle,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import reportsService from "@/services/api/reportsService";
import { RevenueTooltip } from "@/components/reports/RevenueTooltip";

interface SummaryData {
	total_sales: number;
	total_transactions: number;
	average_ticket: number;
	total_tax: number;
	total_discounts: number;
	sales_growth: number;
	transaction_growth: number;
	top_product: string;
	sales_trend: Array<{
		date: string;
		sales: number;
		transactions: number;
	}>;
	payment_distribution: Array<{
		method: string;
		amount: number;
		count: number;
		percentage: number;
	}>;
	hourly_performance: Array<{
		hour: string;
		sales: number;
		orders: number;
	}>;
	top_products_by_revenue: Array<{
		name: string;
		revenue: number;
		quantity: number;
	}>;
}

interface QuickMetrics {
	today: {
		sales: number;
		gross_revenue: number;
		net_revenue: number;
		subtotal: number;
		tips: number;
		discounts: number;
		orders: number;
		items: number;
		avg_order_value: number;
		date_range: {
			start: string;
			end: string;
		};
	};
	month_to_date: {
		sales: number;
		gross_revenue: number;
		net_revenue: number;
		subtotal: number;
		tips: number;
		discounts: number;
		orders: number;
		items: number;
		avg_order_value: number;
		date_range: {
			start: string;
			end: string;
		};
	};
	year_to_date: {
		sales: number;
		gross_revenue: number;
		net_revenue: number;
		subtotal: number;
		tips: number;
		discounts: number;
		orders: number;
		items: number;
		avg_order_value: number;
		date_range: {
			start: string;
			end: string;
		};
	};
	generated_at: string;
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"];

interface SummaryTabProps {
	dateRange: DateRange | undefined;
}

export function SummaryTab({ dateRange }: SummaryTabProps) {
	const [data, setData] = useState<SummaryData | null>(null);
	const [quickMetrics, setQuickMetrics] = useState<QuickMetrics | null>(null);
	const [loading, setLoading] = useState(false);
	const [quickMetricsLoading, setQuickMetricsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchSummaryData = async () => {
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

			const summaryData = await reportsService.generateSummaryReport(
				startDate,
				endDate
			);
			setData(summaryData as SummaryData);
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setLoading(false);
		}
	};

	const fetchQuickMetrics = async () => {
		setQuickMetricsLoading(true);

		try {
			const metricsData = await reportsService.getQuickMetrics();
			setQuickMetrics(metricsData as QuickMetrics);
		} catch (err) {
			console.error("Error fetching quick metrics:", err);
			// Don't set error for quick metrics as it's secondary data
		} finally {
			setQuickMetricsLoading(false);
		}
	};

	useEffect(() => {
		fetchSummaryData();
	}, [dateRange]);

	useEffect(() => {
		fetchQuickMetrics();
	}, []);

	if (loading) {
		return (
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="space-y-1">
						<h3 className="text-2xl font-semibold tracking-tight">
							Dashboard Summary
						</h3>
						<p className="text-sm text-muted-foreground">
							Overview of your business performance
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
								Error loading dashboard data: {error}
							</p>
							<Button
								onClick={fetchSummaryData}
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

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="space-y-1">
					<h3 className="text-2xl font-semibold tracking-tight">
						Dashboard Summary
					</h3>
					<p className="text-sm text-muted-foreground">
						Overview of your business performance
					</p>
				</div>
			</div>

			{/* Quick Metrics - Today/MTD/YTD */}
			<Card className="mb-6">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<DollarSign className="h-5 w-5" />
						Quick Metrics
					</CardTitle>
					<CardDescription>
						Today's performance, month-to-date, and year-to-date overview
					</CardDescription>
				</CardHeader>
				<CardContent>
					{quickMetricsLoading ? (
						<div className="grid gap-6 md:grid-cols-3">
							{[...Array(3)].map((_, i) => (
								<div
									key={i}
									className="space-y-3"
								>
									<div className="h-4 w-20 bg-muted animate-pulse rounded" />
									<div className="grid gap-2">
										<div className="h-8 w-24 bg-muted animate-pulse rounded" />
										<div className="h-3 w-16 bg-muted animate-pulse rounded" />
									</div>
								</div>
							))}
						</div>
					) : quickMetrics ? (
						<div className="grid gap-6 md:grid-cols-3">
							{/* Today */}
							<div className="space-y-3">
								<div className="flex items-center gap-2">
									<h4 className="font-medium text-sm text-muted-foreground">
										TODAY
									</h4>
									<Badge
										variant="outline"
										className="text-xs"
									>
										{format(new Date(), "MMM d")}
									</Badge>
								</div>
								<div className="grid gap-2">
									<div className="flex items-center justify-between">
										<RevenueTooltip type="gross_revenue">
											<div className="flex items-center gap-1 cursor-help">
												<span className="text-2xl font-bold text-blue-600">
													${quickMetrics.today.gross_revenue?.toLocaleString() || "0"}
												</span>
												<HelpCircle className="h-4 w-4 text-blue-500" />
											</div>
										</RevenueTooltip>
										<span className="text-sm text-muted-foreground">Gross Revenue</span>
									</div>
									<div className="flex items-center justify-between">
										<RevenueTooltip type="net_revenue">
											<div className="flex items-center gap-1 cursor-help">
												<span className="text-lg font-bold text-green-600">
													${quickMetrics.today.net_revenue?.toLocaleString() || quickMetrics.today.sales.toLocaleString()}
												</span>
												<HelpCircle className="h-4 w-4 text-green-500" />
											</div>
										</RevenueTooltip>
										<span className="text-sm text-muted-foreground">Net Revenue</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-lg font-medium">
											{quickMetrics.today.orders}
										</span>
										<span className="text-sm text-muted-foreground">
											Orders
										</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-sm font-medium">
											${quickMetrics.today.avg_order_value.toFixed(2)}
										</span>
										<span className="text-sm text-muted-foreground">
											Avg Order
										</span>
									</div>
								</div>
							</div>

							{/* Month to Date */}
							<div className="space-y-3">
								<div className="flex items-center gap-2">
									<h4 className="font-medium text-sm text-muted-foreground">
										MONTH TO DATE
									</h4>
									<Badge
										variant="outline"
										className="text-xs"
									>
										{format(new Date(), "MMM yyyy")}
									</Badge>
								</div>
								<div className="grid gap-2">
									<div className="flex items-center justify-between">
										<RevenueTooltip type="gross_revenue">
											<div className="flex items-center gap-1 cursor-help">
												<span className="text-2xl font-bold text-blue-600">
													${quickMetrics.month_to_date.gross_revenue?.toLocaleString() || "0"}
												</span>
												<HelpCircle className="h-4 w-4 text-blue-500" />
											</div>
										</RevenueTooltip>
										<span className="text-sm text-muted-foreground">Gross Revenue</span>
									</div>
									<div className="flex items-center justify-between">
										<RevenueTooltip type="net_revenue">
											<div className="flex items-center gap-1 cursor-help">
												<span className="text-lg font-bold text-green-600">
													${quickMetrics.month_to_date.net_revenue?.toLocaleString() || quickMetrics.month_to_date.sales.toLocaleString()}
												</span>
												<HelpCircle className="h-4 w-4 text-green-500" />
											</div>
										</RevenueTooltip>
										<span className="text-sm text-muted-foreground">Net Revenue</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-lg font-medium">
											{quickMetrics.month_to_date.orders}
										</span>
										<span className="text-sm text-muted-foreground">
											Orders
										</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-sm font-medium">
											${quickMetrics.month_to_date.avg_order_value.toFixed(2)}
										</span>
										<span className="text-sm text-muted-foreground">
											Avg Order
										</span>
									</div>
								</div>
							</div>

							{/* Year to Date */}
							<div className="space-y-3">
								<div className="flex items-center gap-2">
									<h4 className="font-medium text-sm text-muted-foreground">
										YEAR TO DATE
									</h4>
									<Badge
										variant="outline"
										className="text-xs"
									>
										{format(new Date(), "yyyy")}
									</Badge>
								</div>
								<div className="grid gap-2">
									<div className="flex items-center justify-between">
										<RevenueTooltip type="gross_revenue">
											<div className="flex items-center gap-1 cursor-help">
												<span className="text-2xl font-bold text-blue-600">
													${quickMetrics.year_to_date.gross_revenue?.toLocaleString() || "0"}
												</span>
												<HelpCircle className="h-4 w-4 text-blue-500" />
											</div>
										</RevenueTooltip>
										<span className="text-sm text-muted-foreground">Gross Revenue</span>
									</div>
									<div className="flex items-center justify-between">
										<RevenueTooltip type="net_revenue">
											<div className="flex items-center gap-1 cursor-help">
												<span className="text-lg font-bold text-green-600">
													${quickMetrics.year_to_date.net_revenue?.toLocaleString() || quickMetrics.year_to_date.sales.toLocaleString()}
												</span>
												<HelpCircle className="h-4 w-4 text-green-500" />
											</div>
										</RevenueTooltip>
										<span className="text-sm text-muted-foreground">Net Revenue</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-lg font-medium">
											{quickMetrics.year_to_date.orders}
										</span>
										<span className="text-sm text-muted-foreground">
											Orders
										</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-sm font-medium">
											${quickMetrics.year_to_date.avg_order_value.toFixed(2)}
										</span>
										<span className="text-sm text-muted-foreground">
											Avg Order
										</span>
									</div>
								</div>
							</div>
						</div>
					) : (
						<div className="text-center py-8 text-muted-foreground">
							<p className="text-sm">Quick metrics unavailable</p>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Key Metrics */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Total Sales</CardTitle>
						<DollarSign className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							${data?.total_sales?.toLocaleString() || "0"}
						</div>
						<div className="flex items-center text-xs text-muted-foreground">
							{data?.sales_growth && data.sales_growth > 0 ? (
								<TrendingUp className="mr-1 h-3 w-3 text-green-500" />
							) : (
								<TrendingDown className="mr-1 h-3 w-3 text-red-500" />
							)}
							{data?.sales_growth?.toFixed(1) || "0"}% from last period
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Transactions</CardTitle>
						<ShoppingCart className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{data?.total_transactions?.toLocaleString() || "0"}
						</div>
						<div className="flex items-center text-xs text-muted-foreground">
							{data?.transaction_growth && data.transaction_growth > 0 ? (
								<TrendingUp className="mr-1 h-3 w-3 text-green-500" />
							) : (
								<TrendingDown className="mr-1 h-3 w-3 text-red-500" />
							)}
							{data?.transaction_growth?.toFixed(1) || "0"}% from last period
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Average Ticket
						</CardTitle>
						<Users className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							${data?.average_ticket?.toFixed(2) || "0.00"}
						</div>
						<p className="text-xs text-muted-foreground">Per transaction</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Top Product</CardTitle>
						<Package className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-lg font-bold truncate">
							{data?.top_product || "N/A"}
						</div>
						<p className="text-xs text-muted-foreground">Best seller</p>
					</CardContent>
				</Card>
			</div>

			{/* Charts Row */}
			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Sales Trend</CardTitle>
						<CardDescription>
							Daily sales over the selected period
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer
							width="100%"
							height={300}
						>
							<LineChart data={data?.sales_trend || []}>
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
										"Sales",
									]}
								/>
								<Line
									type="monotone"
									dataKey="sales"
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
						<CardTitle>Payment Methods</CardTitle>
						<CardDescription>Distribution of payment methods</CardDescription>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer
							width="100%"
							height={300}
						>
							<PieChart>
								<Pie
									data={data?.payment_distribution || []}
									cx="50%"
									cy="50%"
									labelLine={false}
									label={({ method, percentage }) =>
										`${method} (${percentage}%)`
									}
									outerRadius={80}
									fill="#8884d8"
									dataKey="amount"
								>
									{data?.payment_distribution?.map((entry, index) => (
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

			{/* Hourly Performance */}
			<Card>
				<CardHeader>
					<CardTitle>Hourly Performance</CardTitle>
					<CardDescription>Sales performance by hour of day</CardDescription>
				</CardHeader>
				<CardContent>
					<ResponsiveContainer
						width="100%"
						height={300}
					>
						<BarChart data={data?.hourly_performance || []}>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis dataKey="hour" />
							<YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
							<Tooltip
								formatter={(value: number) => [
									`$${value.toLocaleString()}`,
									"Sales",
								]}
							/>
							<Bar
								dataKey="sales"
								fill="#8884d8"
							/>
						</BarChart>
					</ResponsiveContainer>
				</CardContent>
			</Card>

			{/* Top Products */}
			<Card>
				<CardHeader>
					<CardTitle>Top Products by Revenue</CardTitle>
					<CardDescription>
						Best performing products in the selected period
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{data?.top_products_by_revenue?.map((product, index) => (
							<div
								key={index}
								className="flex items-center justify-between"
							>
								<div className="flex items-center space-x-4">
									<Badge variant="secondary">{index + 1}</Badge>
									<div>
										<p className="font-medium">{product.name}</p>
										<p className="text-sm text-muted-foreground">
											{product.quantity} units sold
										</p>
									</div>
								</div>
								<div className="text-right">
									<p className="font-medium">
										${product.revenue.toLocaleString()}
									</p>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
