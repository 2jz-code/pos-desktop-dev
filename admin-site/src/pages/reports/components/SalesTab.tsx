import React, { useState, useEffect } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	Line,
	AreaChart,
	Area,
} from "recharts";
import {
	DollarSign,
	ShoppingCart,
	TrendingUp,
	Package,
	Download,
	RefreshCw,
	ChevronDown,
	ChevronRight,
	CreditCard,
	Banknote,
	Gift,
	HelpCircle,
	Info,
	MinusCircle,
	Receipt,
	BarChart3,
	Clock,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import reportsService from "@/services/api/reportsService";
import { ExportDialog } from "@/components/reports/ExportDialog";
import { RevenueTooltip } from "@/components/reports/RevenueTooltip";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

interface Transaction {
	order_number: string;
	created_at: string;
	amount: number;
	tip: number;
	surcharge: number;
	method: string;
	transaction_id: string;
	card_brand: string;
	card_last4: string;
}

interface PaymentTotals {
	total_tips: number;
	total_surcharges: number;
	total_collected: number;
}

interface MethodBreakdown {
	[method: string]: {
		count: number;
		total_amount: number;
		total_tips: number;
		total_surcharges: number;
	};
}

interface TransactionDetails {
	transactions: Transaction[];
	payment_totals: PaymentTotals;
	method_breakdown: MethodBreakdown;
}

interface SalesData {
	total_revenue: number;
	net_revenue: number;
	total_subtotal: number;
	total_orders: number;
	avg_order_value: number;
	total_tax: number;
	total_discounts: number;
	total_items: number;
	total_surcharges: number;
	total_tips: number;
	revenue_breakdown?: {
		total_revenue: number;
		components: {
			subtotal: number;
			tips: number;
			surcharges: number;
			tax: number;
			discounts_applied: number;
			refunds: number;
			net_revenue: number;
		};
	};
	sales_by_period: Array<{
		date: string;
		revenue: number;
		orders: number;
		items: number;
		transaction_details: TransactionDetails;
	}>;
	sales_by_category: Array<{
		category: string;
		revenue: number;
		quantity: number;
	}>;
	top_hours: Array<{
		hour: string;
		revenue: number;
		orders: number;
	}>;
}

interface SalesTabProps {
	dateRange: DateRange | undefined;
}

export function SalesTab({ dateRange }: SalesTabProps) {
	const [data, setData] = useState<SalesData | null>(null);
	const [loading, setLoading] = useState(false);
	const [exportDialogOpen, setExportDialogOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");
	const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

	const toggleRowExpansion = (date: string) => {
		const newExpandedRows = new Set(expandedRows);
		if (newExpandedRows.has(date)) {
			newExpandedRows.delete(date);
		} else {
			newExpandedRows.add(date);
		}
		setExpandedRows(newExpandedRows);
	};

	const getPaymentMethodIcon = (method: string) => {
		switch (method) {
			case "CASH":
				return <Banknote className="h-4 w-4" />;
			case "CARD_TERMINAL":
			case "CARD_ONLINE":
				return <CreditCard className="h-4 w-4" />;
			case "GIFT_CARD":
				return <Gift className="h-4 w-4" />;
			default:
				return <CreditCard className="h-4 w-4" />;
		}
	};

	const getPaymentMethodLabel = (method: string) => {
		switch (method) {
			case "CASH":
				return "Cash";
			case "CARD_TERMINAL":
				return "Card (Terminal)";
			case "CARD_ONLINE":
				return "Card (Online)";
			case "GIFT_CARD":
				return "Gift Card";
			default:
				return method;
		}
	};

	const fetchSalesData = async () => {
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

			const salesData = await reportsService.generateSalesReport(
				startDate,
				endDate,
				groupBy
			);
			setData(salesData as SalesData);
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchSalesData();
	}, [dateRange, groupBy]);

	if (loading) {
		return (
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="space-y-1">
						<h3 className="text-2xl font-semibold tracking-tight">
							Sales Reports
						</h3>
						<p className="text-sm text-muted-foreground">
							Detailed sales analysis and trends
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
								Error loading sales data: {error}
							</p>
							<Button
								onClick={fetchSalesData}
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
						Sales Reports
					</h3>
					<p className="text-sm text-muted-foreground">
						Detailed sales analysis and trends
					</p>
				</div>
				<div className="flex items-center space-x-2">
					<Select
						value={groupBy}
						onValueChange={(value: "day" | "week" | "month") =>
							setGroupBy(value)
						}
					>
						<SelectTrigger className="w-32">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="day">Daily</SelectItem>
							<SelectItem value="week">Weekly</SelectItem>
							<SelectItem value="month">Monthly</SelectItem>
						</SelectContent>
					</Select>
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
			<div>
				<div className="flex items-center gap-2 mb-4">
					<div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
						<Receipt className="h-5 w-5 text-blue-600 dark:text-blue-400" />
					</div>
					<div>
						<h3 className="text-lg font-semibold text-foreground">Key Sales Metrics</h3>
						<p className="text-sm text-muted-foreground">Overview of sales performance for the selected period</p>
					</div>
				</div>
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
					<Card className="border-border bg-card">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
							<div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
								<DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-foreground">
								${data?.total_revenue?.toLocaleString() || "0"}
							</div>
							<p className="text-xs text-muted-foreground mt-1">
								Grand total of all orders (inc. tax)
							</p>
						</CardContent>
					</Card>

					<Card className="border-border bg-card">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
							<div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
								<ShoppingCart className="h-4 w-4 text-purple-600 dark:text-purple-400" />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-foreground">
								{data?.total_orders?.toLocaleString() || "0"}
							</div>
							<p className="text-xs text-muted-foreground mt-1">Completed orders</p>
						</CardContent>
					</Card>

					<Card className="border-border bg-card">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">
								Avg Order Value
							</CardTitle>
							<div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
								<TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-foreground">
								${data?.avg_order_value?.toFixed(2) || "0.00"}
							</div>
							<p className="text-xs text-muted-foreground mt-1">Per order</p>
						</CardContent>
					</Card>

					<Card className="border-border bg-card">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">Items Sold</CardTitle>
							<div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
								<Package className="h-4 w-4 text-orange-600 dark:text-orange-400" />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-foreground">
								{data?.total_items?.toLocaleString() || "0"}
							</div>
							<p className="text-xs text-muted-foreground mt-1">Total units</p>
						</CardContent>
					</Card>
				</div>
			</div>

			{/* Revenue Breakdown */}
			<Card className="border-border bg-card">
				<CardHeader>
					<div className="flex items-center gap-2">
						<div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
							<DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
						</div>
						<div>
							<CardTitle className="text-foreground">Revenue Breakdown</CardTitle>
							<CardDescription>
								Clear breakdown of what contributes to your business profit
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					{/* Net Revenue Highlight */}
					<div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<RevenueTooltip type="net_revenue">
									<div className="flex items-center gap-2 cursor-help group">
										<TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
										<span className="text-lg font-semibold text-green-800 dark:text-green-300">
											Net Revenue
										</span>
										<HelpCircle className="h-4 w-4 text-green-600 dark:text-green-400 group-hover:text-green-700" />
									</div>
								</RevenueTooltip>
							</div>
							<div className="text-right">
								<div className="text-3xl font-bold text-green-700 dark:text-green-400">
									$
									{data?.revenue_breakdown?.components?.net_revenue?.toLocaleString() ||
										data?.net_revenue?.toLocaleString() ||
										"0"}
								</div>
								<div className="text-sm text-green-600 dark:text-green-500">
									Your actual business profit
								</div>
							</div>
						</div>
					</div>

					{/* Revenue Components */}
					<div className="space-y-4">
						<div>
							<h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
								<TrendingUp className="h-4 w-4 text-green-500" />
								Revenue Components (Contribute to Profit)
							</h4>
							<div className="grid gap-3 md:grid-cols-3">
								<div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
									<RevenueTooltip type="subtotal">
										<div className="flex items-center justify-between cursor-help group">
											<div className="flex items-center gap-2">
												<DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
												<span className="text-sm font-medium text-foreground">Subtotal</span>
												<HelpCircle className="h-3 w-3 text-blue-600 dark:text-blue-400 group-hover:text-blue-700" />
											</div>
											<span className="font-bold text-blue-700 dark:text-blue-400">
												${data?.total_subtotal?.toLocaleString() || "0"}
											</span>
										</div>
									</RevenueTooltip>
								</div>

								<div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
									<RevenueTooltip type="tips">
										<div className="flex items-center justify-between cursor-help group">
											<div className="flex items-center gap-2">
												<TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
												<span className="text-sm font-medium text-foreground">Tips</span>
												<HelpCircle className="h-3 w-3 text-green-600 dark:text-green-400 group-hover:text-green-700" />
											</div>
											<span className="font-bold text-green-700 dark:text-green-400">
												+${data?.total_tips?.toLocaleString() || "0"}
											</span>
										</div>
									</RevenueTooltip>
								</div>

								<div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
									<RevenueTooltip type="discounts">
										<div className="flex items-center justify-between cursor-help group">
											<div className="flex items-center gap-2">
												<MinusCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
												<span className="text-sm font-medium text-foreground">Discounts</span>
												<HelpCircle className="h-3 w-3 text-red-600 dark:text-red-400 group-hover:text-red-700" />
											</div>
											<span className="font-bold text-red-700 dark:text-red-400">
												-${data?.total_discounts?.toLocaleString() || "0"}
											</span>
										</div>
									</RevenueTooltip>
								</div>
							</div>
						</div>

						{/* Non-Revenue Components */}
						<div>
							<h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
								<Info className="h-4 w-4 text-muted-foreground" />
								Non-Revenue Components (Informational)
							</h4>
							<div className="grid gap-3 md:grid-cols-2">
								<div className="p-3 bg-muted/30 border border-border rounded-lg">
									<RevenueTooltip type="tax">
										<div className="flex items-center justify-between cursor-help group">
											<div className="flex items-center gap-2">
												<HelpCircle className="h-4 w-4 text-muted-foreground" />
												<span className="text-sm font-medium text-foreground">
													Tax Collected
												</span>
												<span className="text-xs text-muted-foreground">(Gov)</span>
												<HelpCircle className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
											</div>
											<span className="font-bold text-foreground">
												${data?.total_tax?.toLocaleString() || "0"}
											</span>
										</div>
									</RevenueTooltip>
								</div>

								<div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
									<RevenueTooltip type="surcharges">
										<div className="flex items-center justify-between cursor-help group">
											<div className="flex items-center gap-2">
												<CreditCard className="h-4 w-4 text-orange-600 dark:text-orange-400" />
												<span className="text-sm font-medium text-foreground">Surcharges</span>
												<span className="text-xs text-orange-600 dark:text-orange-500">(Fees)</span>
												<HelpCircle className="h-3 w-3 text-orange-600 dark:text-orange-400 group-hover:text-orange-700" />
											</div>
											<span className="font-bold text-orange-700 dark:text-orange-400">
												${data?.total_surcharges?.toLocaleString() || "0"}
											</span>
										</div>
									</RevenueTooltip>
								</div>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
			{/* Sales Trend Chart */}
			<Card className="border-border bg-card">
				<CardHeader>
					<div className="flex items-center gap-2">
						<div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
							<BarChart3 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
						</div>
						<div>
							<CardTitle className="text-foreground">Sales Trend</CardTitle>
							<CardDescription>Revenue and order trends over time</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<ResponsiveContainer
						width="100%"
						height={400}
					>
						<AreaChart data={data?.sales_by_period || []}>
							<CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
							<XAxis
								dataKey="date"
								tickFormatter={(value) =>
									format(reportsService.parseLocalDate(value), "MMM dd")
								}
								className="text-muted-foreground"
							/>
							<YAxis
								yAxisId="revenue"
								orientation="left"
								tickFormatter={(value) => `$${value.toLocaleString()}`}
								className="text-muted-foreground"
							/>
							<YAxis
								yAxisId="orders"
								orientation="right"
								tickFormatter={(value) => value.toString()}
								className="text-muted-foreground"
							/>
							<Tooltip
								labelFormatter={(value) =>
									format(reportsService.parseLocalDate(value), "MMM dd, yyyy")
								}
								formatter={(value: number, name: string) => [
									name === "revenue"
										? `$${value.toLocaleString()}`
										: value.toString(),
									name === "revenue" ? "Revenue" : "Orders",
								]}
							/>
							<Area
								yAxisId="revenue"
								type="monotone"
								dataKey="revenue"
								stackId="1"
								stroke="rgb(99, 102, 241)"
								fill="rgb(99, 102, 241)"
								fillOpacity={0.6}
							/>
							<Line
								yAxisId="orders"
								type="monotone"
								dataKey="orders"
								stroke="rgb(34, 197, 94)"
								strokeWidth={2}
								dot={{ fill: "rgb(34, 197, 94)", r: 4 }}
								activeDot={{ r: 6 }}
							/>
						</AreaChart>
					</ResponsiveContainer>
				</CardContent>
			</Card>

			{/* Category Performance and Peak Hours */}
			<div className="grid gap-4 md:grid-cols-2">
				<Card className="border-border bg-card">
					<CardHeader>
						<div className="flex items-center gap-2">
							<div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
								<Package className="h-4 w-4 text-purple-600 dark:text-purple-400" />
							</div>
							<div>
								<CardTitle className="text-foreground">Sales by Category</CardTitle>
								<CardDescription>
									Revenue breakdown by product category
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer
							width="100%"
							height={300}
						>
							<BarChart data={data?.sales_by_category || []}>
								<CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
								<XAxis
									dataKey="category"
									angle={-45}
									textAnchor="end"
									height={80}
									className="text-muted-foreground"
								/>
								<YAxis
									tickFormatter={(value) => `$${value.toLocaleString()}`}
									className="text-muted-foreground"
								/>
								<Tooltip
									formatter={(value: number) => `$${value.toLocaleString()}`}
								/>
								<Bar
									dataKey="revenue"
									fill="rgb(168, 85, 247)"
									radius={[4, 4, 0, 0]}
								/>
							</BarChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>

				<Card className="border-border bg-card">
					<CardHeader>
						<div className="flex items-center gap-2">
							<div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
								<Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
							</div>
							<div>
								<CardTitle className="text-foreground">Peak Hours</CardTitle>
								<CardDescription>Top performing hours by revenue</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer
							width="100%"
							height={300}
						>
							<BarChart data={data?.top_hours || []}>
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
									formatter={(value: number) => `$${value.toLocaleString()}`}
								/>
								<Bar
									dataKey="revenue"
									fill="rgb(245, 158, 11)"
									radius={[4, 4, 0, 0]}
								/>
							</BarChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>
			</div>
			{/* Sales Breakdown by Period */}
			<Card className="border-border bg-card">
				<CardHeader>
					<div className="flex items-center gap-2">
						<div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
							<Receipt className="h-4 w-4 text-blue-600 dark:text-blue-400" />
						</div>
						<div>
							<CardTitle className="text-foreground">
								Sales by {groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}
							</CardTitle>
							<CardDescription>
								Detailed sales breakdown by {groupBy} - Click on any row to view
								transactions and tips
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-12"></TableHead>
								<TableHead>
									{groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}
								</TableHead>
								<TableHead>Revenue</TableHead>
								<TableHead>Orders</TableHead>
								<TableHead>Items Sold</TableHead>
								<TableHead>Tips</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data?.sales_by_period?.map((period) => {
								const isExpanded = expandedRows.has(period.date);
								return (
									<React.Fragment key={period.date}>
										<TableRow
											className="cursor-pointer hover:bg-muted/50 transition-colors"
											onClick={() => toggleRowExpansion(period.date)}
										>
											<TableCell className="py-4">
												{isExpanded ? (
													<ChevronDown className="h-4 w-4 text-foreground" />
												) : (
													<ChevronRight className="h-4 w-4 text-muted-foreground" />
												)}
											</TableCell>
											<TableCell className="py-4 font-semibold text-foreground">
												{format(
													reportsService.parseLocalDate(period.date),
													"MMM dd, yyyy"
												)}
											</TableCell>
											<TableCell className="py-4 font-semibold text-foreground">${period.revenue.toLocaleString()}</TableCell>
											<TableCell className="py-4">{period.orders.toLocaleString()}</TableCell>
											<TableCell className="py-4">{period.items.toLocaleString()}</TableCell>
											<TableCell className="py-4 text-green-600 dark:text-green-400 font-medium">
												$
												{(
													period.transaction_details?.payment_totals
														?.total_tips ?? 0
												).toLocaleString()}
											</TableCell>
										</TableRow>
										{isExpanded && (
											<TableRow>
												<TableCell
													colSpan={6}
													className="p-0"
												>
													<div className="p-6 bg-muted/30 border-t border-border">
														<div className="space-y-6">
															{/* Payment Summary */}
															<div>
																<h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
																	<DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
																	Payment Summary
																</h4>
																<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
																	<div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
																		<span className="text-xs text-muted-foreground block mb-1">
																			Total Tips
																		</span>
																		<div className="text-xl font-bold text-green-700 dark:text-green-400">
																			$
																			{(
																				period.transaction_details
																					?.payment_totals?.total_tips ?? 0
																			).toLocaleString()}
																		</div>
																	</div>
																	<div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
																		<span className="text-xs text-muted-foreground block mb-1">
																			Total Surcharges
																		</span>
																		<div className="text-xl font-bold text-orange-700 dark:text-orange-400">
																			$
																			{(
																				period.transaction_details
																					?.payment_totals?.total_surcharges ??
																				0
																			).toLocaleString()}
																		</div>
																	</div>
																	<div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
																		<span className="text-xs text-muted-foreground block mb-1">
																			Total Collected
																		</span>
																		<div className="text-xl font-bold text-blue-700 dark:text-blue-400">
																			$
																			{(
																				period.transaction_details
																					?.payment_totals?.total_collected ?? 0
																			).toLocaleString()}
																		</div>
																	</div>
																</div>
															</div>

															{/* Payment Methods Breakdown */}
															{Object.keys(
																period.transaction_details?.method_breakdown ??
																	{}
															).length > 0 && (
																<div>
																	<h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
																		<CreditCard className="h-4 w-4 text-purple-600 dark:text-purple-400" />
																		Payment Methods
																	</h4>
																	<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
																		{Object.entries(
																			period.transaction_details
																				?.method_breakdown ?? {}
																		).map(([method, breakdown]) => (
																			<div
																				key={method}
																				className="flex items-center space-x-3 p-3 bg-card border border-border rounded-lg hover:shadow-sm transition-shadow"
																			>
																				<div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg flex-shrink-0">
																					{getPaymentMethodIcon(method)}
																				</div>
																				<div className="flex-1 min-w-0">
																					<div className="font-semibold text-sm text-foreground">
																						{getPaymentMethodLabel(method)}
																					</div>
																					<div className="text-xs text-muted-foreground mt-0.5">
																						{breakdown.count} txns • ${breakdown.total_amount.toLocaleString()}
																					</div>
																					<div className="text-xs text-muted-foreground mt-0.5">
																						Tips: <span className="text-green-600 dark:text-green-400 font-medium">${breakdown.total_tips.toLocaleString()}</span>
																						{" "}• Fees: <span className="text-orange-600 dark:text-orange-400 font-medium">${breakdown.total_surcharges.toLocaleString()}</span>
																					</div>
																				</div>
																			</div>
																		))}
																	</div>
																</div>
															)}

															{/* Individual Transactions */}
															{(period.transaction_details?.transactions
																?.length ?? 0) > 0 && (
																<div>
																	<h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
																		<Receipt className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
																		Individual Transactions
																		<span className="text-xs font-normal text-muted-foreground">
																			({period.transaction_details?.transactions?.length ?? 0})
																		</span>
																	</h4>
																	<div className="max-h-80 overflow-y-auto border border-border rounded-lg">
																		<Table>
																			<TableHeader className="sticky top-0 bg-muted/50 backdrop-blur-sm">
																				<TableRow>
																					<TableHead className="text-xs font-semibold">
																						Order #
																					</TableHead>
																					<TableHead className="text-xs font-semibold">
																						Time
																					</TableHead>
																					<TableHead className="text-xs font-semibold">
																						Amount
																					</TableHead>
																					<TableHead className="text-xs font-semibold">
																						Tip
																					</TableHead>
																					<TableHead className="text-xs font-semibold">
																						Surcharge
																					</TableHead>
																					<TableHead className="text-xs font-semibold">
																						Method
																					</TableHead>
																					<TableHead className="text-xs font-semibold">
																						Card Info
																					</TableHead>
																				</TableRow>
																			</TableHeader>
																			<TableBody>
																				{period.transaction_details?.transactions?.map(
																					(transaction, index) => (
																						<TableRow
																							key={index}
																							className="text-xs hover:bg-muted/30 transition-colors"
																						>
																							<TableCell className="font-mono font-medium text-foreground py-3">
																								{transaction.order_number}
																							</TableCell>
																							<TableCell className="py-3">
																								{format(
																									new Date(
																										transaction.created_at
																									),
																									"HH:mm"
																								)}
																							</TableCell>
																							<TableCell className="font-semibold text-foreground py-3">
																								$
																								{transaction.amount.toLocaleString()}
																							</TableCell>
																							<TableCell className="font-semibold text-green-600 dark:text-green-400 py-3">
																								$
																								{transaction.tip.toLocaleString()}
																							</TableCell>
																							<TableCell className="text-orange-600 dark:text-orange-400 py-3">
																								$
																								{transaction.surcharge.toLocaleString()}
																							</TableCell>
																							<TableCell className="py-3">
																								<div className="flex items-center space-x-1.5">
																									{getPaymentMethodIcon(
																										transaction.method
																									)}
																									<span className="text-foreground">
																										{getPaymentMethodLabel(
																											transaction.method
																										)}
																									</span>
																								</div>
																							</TableCell>
																							<TableCell className="py-3">
																								{transaction.card_brand &&
																									transaction.card_last4 && (
																										<span className="text-muted-foreground font-mono text-xs">
																											{transaction.card_brand}{" "}
																											****
																											{transaction.card_last4}
																										</span>
																									)}
																							</TableCell>
																						</TableRow>
																					)
																				)}
																			</TableBody>
																		</Table>
																	</div>
																</div>
															)}
														</div>
													</div>
												</TableCell>
											</TableRow>
										)}
									</React.Fragment>
								);
							})}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
			{/* Export Dialog */}
			<ExportDialog
				open={exportDialogOpen}
				onOpenChange={setExportDialogOpen}
				reportType="sales"
				defaultStartDate={dateRange?.from}
				defaultEndDate={dateRange?.to}
			/>
		</div>
	);
}
