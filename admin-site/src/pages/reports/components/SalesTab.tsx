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
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
						<DollarSign className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							${data?.total_revenue?.toLocaleString() || "0"}
						</div>
						<p className="text-xs text-muted-foreground">
							Grand total of all orders (inc. tax)
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Total Orders</CardTitle>
						<ShoppingCart className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{data?.total_orders?.toLocaleString() || "0"}
						</div>
						<p className="text-xs text-muted-foreground">Completed orders</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Avg Order Value
						</CardTitle>
						<TrendingUp className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							${data?.avg_order_value?.toFixed(2) || "0.00"}
						</div>
						<p className="text-xs text-muted-foreground">Per order</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Items Sold</CardTitle>
						<Package className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{data?.total_items?.toLocaleString() || "0"}
						</div>
						<p className="text-xs text-muted-foreground">Total units</p>
					</CardContent>
				</Card>
			</div>

			{/* Revenue Breakdown */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<DollarSign className="h-5 w-5" />
						Revenue Breakdown
					</CardTitle>
					<CardDescription>
						Clear breakdown of what contributes to your business profit
					</CardDescription>
				</CardHeader>
				<CardContent>
					{/* Net Revenue Highlight */}
					<div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<RevenueTooltip type="net_revenue">
									<div className="flex items-center gap-2 cursor-help">
										<TrendingUp className="h-5 w-5 text-green-600" />
										<span className="text-lg font-semibold text-green-800">
											Net Revenue
										</span>
										<HelpCircle className="h-4 w-4 text-green-600" />
									</div>
								</RevenueTooltip>
							</div>
							<div className="text-right">
								<div className="text-3xl font-bold text-green-700">
									$
									{data?.revenue_breakdown?.components?.net_revenue?.toLocaleString() ||
										data?.net_revenue?.toLocaleString() ||
										"0"}
								</div>
								<div className="text-sm text-green-600">
									Your actual business profit
								</div>
							</div>
						</div>
					</div>

					{/* Revenue Components */}
					<div className="space-y-4">
						<div>
							<h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
								<TrendingUp className="h-4 w-4 text-green-500" />
								Revenue Components (Contribute to Profit)
							</h4>
							<div className="grid gap-3 md:grid-cols-3">
								<div className="p-3 bg-blue-50 border border-blue-200 rounded">
									<RevenueTooltip type="subtotal">
										<div className="flex items-center justify-between cursor-help">
											<div className="flex items-center gap-2">
												<DollarSign className="h-4 w-4 text-blue-600" />
												<span className="text-sm font-medium">Subtotal</span>
												<HelpCircle className="h-3 w-3 text-blue-600" />
											</div>
											<span className="font-bold text-blue-700">
												${data?.total_subtotal?.toLocaleString() || "0"}
											</span>
										</div>
									</RevenueTooltip>
								</div>

								<div className="p-3 bg-green-50 border border-green-200 rounded">
									<RevenueTooltip type="tips">
										<div className="flex items-center justify-between cursor-help">
											<div className="flex items-center gap-2">
												<TrendingUp className="h-4 w-4 text-green-600" />
												<span className="text-sm font-medium">Tips</span>
												<HelpCircle className="h-3 w-3 text-green-600" />
											</div>
											<span className="font-bold text-green-700">
												+${data?.total_tips?.toLocaleString() || "0"}
											</span>
										</div>
									</RevenueTooltip>
								</div>

								<div className="p-3 bg-red-50 border border-red-200 rounded">
									<RevenueTooltip type="discounts">
										<div className="flex items-center justify-between cursor-help">
											<div className="flex items-center gap-2">
												<MinusCircle className="h-4 w-4 text-red-600" />
												<span className="text-sm font-medium">Discounts</span>
												<HelpCircle className="h-3 w-3 text-red-600" />
											</div>
											<span className="font-bold text-red-700">
												-${data?.total_discounts?.toLocaleString() || "0"}
											</span>
										</div>
									</RevenueTooltip>
								</div>
							</div>
						</div>

						{/* Non-Revenue Components */}
						<div>
							<h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
								<Info className="h-4 w-4 text-gray-500" />
								Non-Revenue Components (Informational)
							</h4>
							<div className="grid gap-3 md:grid-cols-2">
								<div className="p-3 bg-gray-50 border border-gray-200 rounded">
									<RevenueTooltip type="tax">
										<div className="flex items-center justify-between cursor-help">
											<div className="flex items-center gap-2">
												<HelpCircle className="h-4 w-4 text-gray-600" />
												<span className="text-sm font-medium">
													Tax Collected
												</span>
												<span className="text-xs text-gray-500">(Gov)</span>
												<HelpCircle className="h-3 w-3 text-gray-600" />
											</div>
											<span className="font-bold text-gray-700">
												${data?.total_tax?.toLocaleString() || "0"}
											</span>
										</div>
									</RevenueTooltip>
								</div>

								<div className="p-3 bg-orange-50 border border-orange-200 rounded">
									<RevenueTooltip type="surcharges">
										<div className="flex items-center justify-between cursor-help">
											<div className="flex items-center gap-2">
												<CreditCard className="h-4 w-4 text-orange-600" />
												<span className="text-sm font-medium">Surcharges</span>
												<span className="text-xs text-orange-500">(Fees)</span>
												<HelpCircle className="h-3 w-3 text-orange-600" />
											</div>
											<span className="font-bold text-orange-700">
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
			<Card>
				<CardHeader>
					<CardTitle>Sales Trend</CardTitle>
					<CardDescription>Revenue and order trends over time</CardDescription>
				</CardHeader>
				<CardContent>
					<ResponsiveContainer
						width="100%"
						height={400}
					>
						<AreaChart data={data?.sales_by_period || []}>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis
								dataKey="date"
								tickFormatter={(value) =>
									format(reportsService.parseLocalDate(value), "MMM dd")
								}
							/>
							<YAxis
								yAxisId="revenue"
								orientation="left"
								tickFormatter={(value) => `$${value.toLocaleString()}`}
							/>
							<YAxis
								yAxisId="orders"
								orientation="right"
								tickFormatter={(value) => value.toString()}
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
								stroke="#8884d8"
								fill="#8884d8"
								fillOpacity={0.6}
							/>
							<Line
								yAxisId="orders"
								type="monotone"
								dataKey="orders"
								stroke="#82ca9d"
								strokeWidth={2}
								dot={{ fill: "#82ca9d" }}
							/>
						</AreaChart>
					</ResponsiveContainer>
				</CardContent>
			</Card>

			{/* Category Performance and Peak Hours */}
			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Sales by Category</CardTitle>
						<CardDescription>
							Revenue breakdown by product category
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer
							width="100%"
							height={300}
						>
							<BarChart data={data?.sales_by_category || []}>
								<CartesianGrid strokeDasharray="3 3" />
								<XAxis
									dataKey="category"
									angle={-45}
									textAnchor="end"
									height={80}
								/>
								<YAxis
									tickFormatter={(value) => `$${value.toLocaleString()}`}
								/>
								<Tooltip
									formatter={(value: number) => `$${value.toLocaleString()}`}
								/>
								<Bar
									dataKey="revenue"
									fill="#8884d8"
								/>
							</BarChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Peak Hours</CardTitle>
						<CardDescription>Top performing hours by revenue</CardDescription>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer
							width="100%"
							height={300}
						>
							<BarChart data={data?.top_hours || []}>
								<CartesianGrid strokeDasharray="3 3" />
								<XAxis dataKey="hour" />
								<YAxis
									tickFormatter={(value) => `$${value.toLocaleString()}`}
								/>
								<Tooltip
									formatter={(value: number) => `$${value.toLocaleString()}`}
								/>
								<Bar
									dataKey="revenue"
									fill="#82ca9d"
								/>
							</BarChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>
			</div>
			{/* Sales Breakdown by Period */}
			<Card>
				<CardHeader>
					<CardTitle>
						Sales by {groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}
					</CardTitle>
					<CardDescription>
						Detailed sales breakdown by {groupBy} - Click on any row to view
						transactions and tips
					</CardDescription>
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
											className="cursor-pointer hover:bg-muted/50"
											onClick={() => toggleRowExpansion(period.date)}
										>
											<TableCell>
												{isExpanded ? (
													<ChevronDown className="h-4 w-4" />
												) : (
													<ChevronRight className="h-4 w-4" />
												)}
											</TableCell>
											<TableCell>
												{format(
													reportsService.parseLocalDate(period.date),
													"MMM dd, yyyy"
												)}
											</TableCell>
											<TableCell>${period.revenue.toLocaleString()}</TableCell>
											<TableCell>{period.orders.toLocaleString()}</TableCell>
											<TableCell>{period.items.toLocaleString()}</TableCell>
											<TableCell>
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
													<div className="p-4 bg-muted/20 border-t">
														<div className="space-y-4">
															{/* Payment Summary */}
															<div>
																<h4 className="font-semibold mb-2">
																	Payment Summary
																</h4>
																<div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
																	<div>
																		<span className="text-muted-foreground">
																			Total Tips:
																		</span>
																		<div className="font-medium">
																			$
																			{(
																				period.transaction_details
																					?.payment_totals?.total_tips ?? 0
																			).toLocaleString()}
																		</div>
																	</div>
																	<div>
																		<span className="text-muted-foreground">
																			Total Surcharges:
																		</span>
																		<div className="font-medium">
																			$
																			{(
																				period.transaction_details
																					?.payment_totals?.total_surcharges ??
																				0
																			).toLocaleString()}
																		</div>
																	</div>
																	<div>
																		<span className="text-muted-foreground">
																			Total Collected:
																		</span>
																		<div className="font-medium">
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
																	<h4 className="font-semibold mb-2">
																		Payment Methods
																	</h4>
																	<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
																		{Object.entries(
																			period.transaction_details
																				?.method_breakdown ?? {}
																		).map(([method, breakdown]) => (
																			<div
																				key={method}
																				className="flex items-center space-x-2 p-2 bg-background rounded border"
																			>
																				{getPaymentMethodIcon(method)}
																				<div className="flex-1">
																					<div className="font-medium text-sm">
																						{getPaymentMethodLabel(method)}
																					</div>
																					<div className="text-xs text-muted-foreground">
																						{breakdown.count} transactions • $
																						{breakdown.total_amount.toLocaleString()}
																					</div>
																					<div className="text-xs text-muted-foreground">
																						Tips: $
																						{breakdown.total_tips.toLocaleString()}{" "}
																						• Fees: $
																						{breakdown.total_surcharges.toLocaleString()}
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
																	<h4 className="font-semibold mb-2">
																		Individual Transactions (
																		{period.transaction_details?.transactions
																			?.length ?? 0}
																		)
																	</h4>
																	<div className="max-h-64 overflow-y-auto">
																		<Table>
																			<TableHeader>
																				<TableRow>
																					<TableHead className="text-xs">
																						Order #
																					</TableHead>
																					<TableHead className="text-xs">
																						Time
																					</TableHead>
																					<TableHead className="text-xs">
																						Amount
																					</TableHead>
																					<TableHead className="text-xs">
																						Tip
																					</TableHead>
																					<TableHead className="text-xs">
																						Surcharge
																					</TableHead>
																					<TableHead className="text-xs">
																						Method
																					</TableHead>
																					<TableHead className="text-xs">
																						Card Info
																					</TableHead>
																				</TableRow>
																			</TableHeader>
																			<TableBody>
																				{period.transaction_details?.transactions?.map(
																					(transaction, index) => (
																						<TableRow
																							key={index}
																							className="text-xs"
																						>
																							<TableCell className="font-mono">
																								{transaction.order_number}
																							</TableCell>
																							<TableCell>
																								{format(
																									new Date(
																										transaction.created_at
																									),
																									"HH:mm"
																								)}
																							</TableCell>
																							<TableCell>
																								$
																								{transaction.amount.toLocaleString()}
																							</TableCell>
																							<TableCell className="font-medium text-green-600">
																								$
																								{transaction.tip.toLocaleString()}
																							</TableCell>
																							<TableCell>
																								$
																								{transaction.surcharge.toLocaleString()}
																							</TableCell>
																							<TableCell>
																								<div className="flex items-center space-x-1">
																									{getPaymentMethodIcon(
																										transaction.method
																									)}
																									<span>
																										{getPaymentMethodLabel(
																											transaction.method
																										)}
																									</span>
																								</div>
																							</TableCell>
																							<TableCell>
																								{transaction.card_brand &&
																									transaction.card_last4 && (
																										<span className="text-muted-foreground">
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
