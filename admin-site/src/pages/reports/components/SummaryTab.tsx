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
import { Separator } from "@/components/ui/separator";
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
	Legend,
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
	Receipt,
	PercentCircle,
	Clock,
	Calendar,
	ArrowUpRight,
	ArrowDownRight,
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
			<div className="space-y-6">
				{/* Loading Quick Metrics */}
				<div className="grid gap-4 md:grid-cols-3">
					{[...Array(3)].map((_, i) => (
						<Card key={i} className="border-border bg-card">
							<CardHeader className="pb-3">
								<div className="h-4 w-24 bg-muted animate-pulse rounded" />
							</CardHeader>
							<CardContent className="space-y-3">
								<div className="h-10 w-32 bg-muted animate-pulse rounded" />
								<div className="h-8 w-28 bg-muted animate-pulse rounded" />
								<div className="space-y-2">
									<div className="h-6 w-full bg-muted animate-pulse rounded" />
									<div className="h-6 w-full bg-muted animate-pulse rounded" />
								</div>
							</CardContent>
						</Card>
					))}
				</div>

				{/* Loading Key Metrics */}
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
					{[...Array(4)].map((_, i) => (
						<Card key={i} className="border-border bg-card">
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<div className="h-4 w-20 bg-muted animate-pulse rounded" />
								<div className="h-10 w-10 bg-muted animate-pulse rounded-lg" />
							</CardHeader>
							<CardContent>
								<div className="h-10 w-28 bg-muted animate-pulse rounded mb-2" />
								<div className="h-4 w-24 bg-muted animate-pulse rounded" />
							</CardContent>
						</Card>
					))}
				</div>

				{/* Loading Charts */}
				<div className="grid gap-4 md:grid-cols-2">
					{[...Array(2)].map((_, i) => (
						<Card key={i} className="border-border bg-card">
							<CardHeader>
								<div className="h-5 w-32 bg-muted animate-pulse rounded mb-2" />
								<div className="h-4 w-48 bg-muted animate-pulse rounded" />
							</CardHeader>
							<CardContent>
								<div className="h-[300px] w-full bg-muted animate-pulse rounded" />
							</CardContent>
						</Card>
					))}
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<Card className="border-border bg-card">
				<CardContent className="pt-6">
					<div className="flex flex-col items-center justify-center py-10 text-center">
						<div className="p-3 bg-destructive/10 rounded-lg mb-4">
							<TrendingDown className="h-8 w-8 text-destructive" />
						</div>
						<h3 className="text-lg font-semibold text-foreground mb-2">
							Failed to Load Dashboard
						</h3>
						<p className="text-sm text-muted-foreground mb-4 max-w-md">
							{error}
						</p>
						<Button
							onClick={fetchSummaryData}
							variant="outline"
							size="sm"
						>
							<RefreshCw className="mr-2 h-4 w-4" />
							Retry
						</Button>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-6">
			{/* Quick Metrics - Today/MTD/YTD */}
			<div>
				<div className="flex items-center gap-2 mb-4">
					<div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
						<Receipt className="h-5 w-5 text-blue-600 dark:text-blue-400" />
					</div>
					<div>
						<h3 className="text-lg font-semibold text-foreground">Quick Metrics</h3>
						<p className="text-sm text-muted-foreground">Today, Month-to-Date, and Year-to-Date</p>
					</div>
				</div>
				<div className="grid gap-4 md:grid-cols-3">
					{quickMetricsLoading ? (
						[...Array(3)].map((_, i) => (
							<Card key={i} className="border-border bg-card">
								<CardHeader className="pb-3">
									<div className="h-4 w-24 bg-muted animate-pulse rounded" />
								</CardHeader>
								<CardContent className="space-y-3">
									<div className="h-10 w-32 bg-muted animate-pulse rounded" />
									<div className="h-8 w-28 bg-muted animate-pulse rounded" />
									<div className="space-y-2">
										<div className="h-6 w-full bg-muted animate-pulse rounded" />
										<div className="h-6 w-full bg-muted animate-pulse rounded" />
									</div>
								</CardContent>
							</Card>
						))
					) : quickMetrics ? (
						<>
							{/* Today */}
							<Card className="border-border bg-card">
								<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
									<div className="flex items-center gap-2">
										<div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
											<Calendar className="h-4 w-4 text-green-600 dark:text-green-400" />
										</div>
										<div>
											<CardTitle className="text-sm font-medium text-muted-foreground">TODAY</CardTitle>
											<Badge variant="outline" className="text-xs mt-1">
												{format(new Date(), "MMM d")}
											</Badge>
										</div>
									</div>
								</CardHeader>
								<CardContent className="space-y-3">
									<RevenueTooltip type="gross_revenue">
										<div className="flex items-center gap-1.5 cursor-help group">
											<span className="text-3xl font-bold text-foreground">
												${quickMetrics.today.gross_revenue?.toLocaleString() || "0"}
											</span>
											<HelpCircle className="h-4 w-4 text-blue-500 group-hover:text-blue-600" />
										</div>
									</RevenueTooltip>
									<p className="text-xs text-muted-foreground">Gross Revenue</p>

									<Separator className="my-3" />

									<div className="space-y-2">
										<RevenueTooltip type="net_revenue">
											<div className="flex items-center justify-between group cursor-help">
												<span className="text-sm text-muted-foreground">Net Revenue</span>
												<div className="flex items-center gap-1">
													<span className="text-sm font-semibold text-foreground">
														${quickMetrics.today.net_revenue?.toLocaleString() || quickMetrics.today.sales.toLocaleString()}
													</span>
													<HelpCircle className="h-3.5 w-3.5 text-green-500 group-hover:text-green-600" />
												</div>
											</div>
										</RevenueTooltip>
										<div className="flex items-center justify-between">
											<span className="text-sm text-muted-foreground">Orders</span>
											<span className="text-sm font-semibold text-foreground">
												{quickMetrics.today.orders}
											</span>
										</div>
										<div className="flex items-center justify-between">
											<span className="text-sm text-muted-foreground">Avg Order</span>
											<span className="text-sm font-semibold text-foreground">
												${quickMetrics.today.avg_order_value.toFixed(2)}
											</span>
										</div>
									</div>
								</CardContent>
							</Card>

							{/* Month to Date */}
							<Card className="border-border bg-card">
								<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
									<div className="flex items-center gap-2">
										<div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
											<Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400" />
										</div>
										<div>
											<CardTitle className="text-sm font-medium text-muted-foreground">MONTH TO DATE</CardTitle>
											<Badge variant="outline" className="text-xs mt-1">
												{format(new Date(), "MMM yyyy")}
											</Badge>
										</div>
									</div>
								</CardHeader>
								<CardContent className="space-y-3">
									<RevenueTooltip type="gross_revenue">
										<div className="flex items-center gap-1.5 cursor-help group">
											<span className="text-3xl font-bold text-foreground">
												${quickMetrics.month_to_date.gross_revenue?.toLocaleString() || "0"}
											</span>
											<HelpCircle className="h-4 w-4 text-blue-500 group-hover:text-blue-600" />
										</div>
									</RevenueTooltip>
									<p className="text-xs text-muted-foreground">Gross Revenue</p>

									<Separator className="my-3" />

									<div className="space-y-2">
										<RevenueTooltip type="net_revenue">
											<div className="flex items-center justify-between group cursor-help">
												<span className="text-sm text-muted-foreground">Net Revenue</span>
												<div className="flex items-center gap-1">
													<span className="text-sm font-semibold text-foreground">
														${quickMetrics.month_to_date.net_revenue?.toLocaleString() || quickMetrics.month_to_date.sales.toLocaleString()}
													</span>
													<HelpCircle className="h-3.5 w-3.5 text-green-500 group-hover:text-green-600" />
												</div>
											</div>
										</RevenueTooltip>
										<div className="flex items-center justify-between">
											<span className="text-sm text-muted-foreground">Orders</span>
											<span className="text-sm font-semibold text-foreground">
												{quickMetrics.month_to_date.orders}
											</span>
										</div>
										<div className="flex items-center justify-between">
											<span className="text-sm text-muted-foreground">Avg Order</span>
											<span className="text-sm font-semibold text-foreground">
												${quickMetrics.month_to_date.avg_order_value.toFixed(2)}
											</span>
										</div>
									</div>
								</CardContent>
							</Card>

							{/* Year to Date */}
							<Card className="border-border bg-card">
								<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
									<div className="flex items-center gap-2">
										<div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
											<Calendar className="h-4 w-4 text-orange-600 dark:text-orange-400" />
										</div>
										<div>
											<CardTitle className="text-sm font-medium text-muted-foreground">YEAR TO DATE</CardTitle>
											<Badge variant="outline" className="text-xs mt-1">
												{format(new Date(), "yyyy")}
											</Badge>
										</div>
									</div>
								</CardHeader>
								<CardContent className="space-y-3">
									<RevenueTooltip type="gross_revenue">
										<div className="flex items-center gap-1.5 cursor-help group">
											<span className="text-3xl font-bold text-foreground">
												${quickMetrics.year_to_date.gross_revenue?.toLocaleString() || "0"}
											</span>
											<HelpCircle className="h-4 w-4 text-blue-500 group-hover:text-blue-600" />
										</div>
									</RevenueTooltip>
									<p className="text-xs text-muted-foreground">Gross Revenue</p>

									<Separator className="my-3" />

									<div className="space-y-2">
										<RevenueTooltip type="net_revenue">
											<div className="flex items-center justify-between group cursor-help">
												<span className="text-sm text-muted-foreground">Net Revenue</span>
												<div className="flex items-center gap-1">
													<span className="text-sm font-semibold text-foreground">
														${quickMetrics.year_to_date.net_revenue?.toLocaleString() || quickMetrics.year_to_date.sales.toLocaleString()}
													</span>
													<HelpCircle className="h-3.5 w-3.5 text-green-500 group-hover:text-green-600" />
												</div>
											</div>
										</RevenueTooltip>
										<div className="flex items-center justify-between">
											<span className="text-sm text-muted-foreground">Orders</span>
											<span className="text-sm font-semibold text-foreground">
												{quickMetrics.year_to_date.orders}
											</span>
										</div>
										<div className="flex items-center justify-between">
											<span className="text-sm text-muted-foreground">Avg Order</span>
											<span className="text-sm font-semibold text-foreground">
												${quickMetrics.year_to_date.avg_order_value.toFixed(2)}
											</span>
										</div>
									</div>
								</CardContent>
							</Card>
						</>
					) : (
						<Card className="col-span-3 border-border bg-card">
							<CardContent className="pt-6">
								<div className="text-center py-8 text-muted-foreground">
									<p className="text-sm">Quick metrics unavailable</p>
								</div>
							</CardContent>
						</Card>
					)}
				</div>
			</div>

			{/* Key Metrics */}
			<div>
				<div className="flex items-center gap-2 mb-4">
					<div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
						<TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
					</div>
					<div>
						<h3 className="text-lg font-semibold text-foreground">Key Metrics</h3>
						<p className="text-sm text-muted-foreground">Performance indicators for the selected period</p>
					</div>
				</div>
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
					<Card className="border-border bg-card">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">Total Sales</CardTitle>
							<div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
								<DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-foreground">
								${data?.total_sales?.toLocaleString() || "0"}
							</div>
							<div className="flex items-center text-xs mt-1">
								{data?.sales_growth && data.sales_growth > 0 ? (
									<>
										<ArrowUpRight className="mr-1 h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
										<span className="text-emerald-600 dark:text-emerald-400 font-semibold">
											{data.sales_growth.toFixed(1)}%
										</span>
									</>
								) : (
									<>
										<ArrowDownRight className="mr-1 h-3.5 w-3.5 text-red-600 dark:text-red-400" />
										<span className="text-red-600 dark:text-red-400 font-semibold">
											{Math.abs(data?.sales_growth || 0).toFixed(1)}%
										</span>
									</>
								)}
								<span className="ml-1 text-muted-foreground">from last period</span>
							</div>
						</CardContent>
					</Card>

					<Card className="border-border bg-card">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">Transactions</CardTitle>
							<div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
								<ShoppingCart className="h-4 w-4 text-purple-600 dark:text-purple-400" />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-foreground">
								{data?.total_transactions?.toLocaleString() || "0"}
							</div>
							<div className="flex items-center text-xs mt-1">
								{data?.transaction_growth && data.transaction_growth > 0 ? (
									<>
										<ArrowUpRight className="mr-1 h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
										<span className="text-emerald-600 dark:text-emerald-400 font-semibold">
											{data.transaction_growth.toFixed(1)}%
										</span>
									</>
								) : (
									<>
										<ArrowDownRight className="mr-1 h-3.5 w-3.5 text-red-600 dark:text-red-400" />
										<span className="text-red-600 dark:text-red-400 font-semibold">
											{Math.abs(data?.transaction_growth || 0).toFixed(1)}%
										</span>
									</>
								)}
								<span className="ml-1 text-muted-foreground">from last period</span>
							</div>
						</CardContent>
					</Card>

					<Card className="border-border bg-card">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">
								Average Ticket
							</CardTitle>
							<div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
								<Users className="h-4 w-4 text-orange-600 dark:text-orange-400" />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-foreground">
								${data?.average_ticket?.toFixed(2) || "0.00"}
							</div>
							<p className="text-xs text-muted-foreground mt-1">Per transaction</p>
						</CardContent>
					</Card>

					<Card className="border-border bg-card">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">Top Product</CardTitle>
							<div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
								<Package className="h-4 w-4 text-green-600 dark:text-green-400" />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-xl font-bold text-foreground truncate">
								{data?.top_product || "N/A"}
							</div>
							<p className="text-xs text-muted-foreground mt-1">Best seller</p>
						</CardContent>
					</Card>
				</div>
			</div>

			{/* Charts Section */}
			<div>
				<div className="flex items-center gap-2 mb-4">
					<div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
						<TrendingUp className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
					</div>
					<div>
						<h3 className="text-lg font-semibold text-foreground">Performance Analytics</h3>
						<p className="text-sm text-muted-foreground">Trends and distributions for the selected period</p>
					</div>
				</div>
				<div className="grid gap-4 md:grid-cols-2">
					<Card className="border-border bg-card">
						<CardHeader>
							<div className="flex items-center gap-2">
								<div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
									<TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
								</div>
								<div>
									<CardTitle className="text-foreground">Sales Trend</CardTitle>
									<CardDescription>
										Daily sales over the selected period
									</CardDescription>
								</div>
							</div>
						</CardHeader>
						<CardContent>
							<ResponsiveContainer
								width="100%"
								height={300}
							>
								<LineChart data={data?.sales_trend || []}>
									<CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
									<XAxis
										dataKey="date"
										tickFormatter={(value) =>
											format(reportsService.parseLocalDate(value), "MMM dd")
										}
										className="text-muted-foreground"
									/>
									<YAxis
										tickFormatter={(value) => `$${value.toLocaleString()}`}
										className="text-muted-foreground"
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
										stroke="rgb(37, 99, 235)"
										strokeWidth={2}
										dot={{ fill: "rgb(37, 99, 235)", r: 4 }}
										activeDot={{ r: 6 }}
									/>
								</LineChart>
							</ResponsiveContainer>
						</CardContent>
					</Card>

					<Card className="border-border bg-card">
						<CardHeader>
							<div className="flex items-center gap-2">
								<div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
									<DollarSign className="h-4 w-4 text-purple-600 dark:text-purple-400" />
								</div>
								<div>
									<CardTitle className="text-foreground">Payment Methods</CardTitle>
									<CardDescription>Distribution of payment methods</CardDescription>
								</div>
							</div>
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
										outerRadius={100}
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
									<Legend />
								</PieChart>
							</ResponsiveContainer>
						</CardContent>
					</Card>
				</div>
			</div>

			{/* Hourly Performance */}
			<Card className="border-border bg-card">
				<CardHeader>
					<div className="flex items-center gap-2">
						<div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
							<Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
						</div>
						<div>
							<CardTitle className="text-foreground">Hourly Performance</CardTitle>
							<CardDescription>Sales performance by hour of day</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<ResponsiveContainer
						width="100%"
						height={300}
					>
						<BarChart data={data?.hourly_performance || []}>
							<CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
							<XAxis
								dataKey="hour"
								className="text-muted-foreground"
							/>
							<YAxis
								tickFormatter={(value) => `$${value.toLocaleString()}`}
								className="text-muted-foreground"
							/>
							<Tooltip
								formatter={(value: number) => [
									`$${value.toLocaleString()}`,
									"Sales",
								]}
							/>
							<Bar
								dataKey="sales"
								fill="rgb(217, 119, 6)"
								radius={[4, 4, 0, 0]}
							/>
						</BarChart>
					</ResponsiveContainer>
				</CardContent>
			</Card>

			{/* Top Products */}
			<Card className="border-border bg-card">
				<CardHeader>
					<div className="flex items-center gap-2">
						<div className="p-2 bg-pink-50 dark:bg-pink-900/20 rounded-lg">
							<Package className="h-4 w-4 text-pink-600 dark:text-pink-400" />
						</div>
						<div>
							<CardTitle className="text-foreground">Top Products by Revenue</CardTitle>
							<CardDescription>
								Best performing products in the selected period
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{data?.top_products_by_revenue && data.top_products_by_revenue.length > 0 ? (
							data.top_products_by_revenue.map((product, index) => (
								<div
									key={index}
									className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
								>
									<div className="flex items-center space-x-4 flex-1 min-w-0">
										<div className="flex-shrink-0">
											<div className={`
												h-10 w-10 rounded-lg flex items-center justify-center font-bold text-sm
												${index === 0 ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
												  index === 1 ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400' :
												  index === 2 ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
												  'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'}
											`}>
												#{index + 1}
											</div>
										</div>
										<div className="flex-1 min-w-0">
											<p className="font-semibold text-foreground truncate">{product.name}</p>
											<p className="text-sm text-muted-foreground">
												{product.quantity} units sold
											</p>
										</div>
									</div>
									<div className="text-right flex-shrink-0 ml-4">
										<p className="text-lg font-bold text-foreground">
											${product.revenue.toLocaleString()}
										</p>
									</div>
								</div>
							))
						) : (
							<div className="text-center py-8 text-muted-foreground">
								<Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
								<p className="text-sm">No product data available for this period</p>
							</div>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
