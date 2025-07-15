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
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import reportsService from "@/services/api/reportsService";
import { ExportDialog } from "@/components/reports/ExportDialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

interface SalesData {
	total_revenue: number;
	total_subtotal: number;
	total_orders: number;
	avg_order_value: number;
	total_tax: number;
	total_discounts: number;
	total_items: number;
	total_surcharges: number;
	total_tips: number;
	sales_by_period: Array<{
		date: string;
		revenue: number;
		orders: number;
		items: number;
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
						<p className="text-xs text-muted-foreground">Gross sales revenue</p>
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

			{/* Summary Stats */}
			<Card>
				<CardHeader>
					<CardTitle>Sales Summary</CardTitle>
					<CardDescription>Additional sales metrics</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 md:grid-cols-5">
						<div className="space-y-2">
							<p className="text-sm font-medium">Tax Collected</p>
							<p className="text-2xl font-bold">
								${data?.total_tax?.toLocaleString() || "0"}
							</p>
						</div>
						<div className="space-y-2">
							<p className="text-sm font-medium">Discounts Applied</p>
							<p className="text-2xl font-bold">
								${data?.total_discounts?.toLocaleString() || "0"}
							</p>
						</div>
						<div className="space-y-2">
							<p className="text-sm font-medium">Surcharges Collected</p>
							<p className="text-2xl font-bold">
								${data?.total_surcharges?.toLocaleString() || "0"}
							</p>
						</div>
						<div className="space-y-2">
							<p className="text-sm font-medium">Tips Collected</p>
							<p className="text-2xl font-bold">
								${data?.total_tips?.toLocaleString() || "0"}
							</p>
						</div>
						<div className="space-y-2">
							<p className="text-sm font-medium">Net Revenue</p>
							<p className="text-2xl font-bold">
								$
								{(
									(data?.total_subtotal || 0) +
									(data?.total_tips || 0)
								).toLocaleString()}
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
			{/* Sales Breakdown by Period */}
			<Card>
				<CardHeader>
					<CardTitle>Sales by {groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}</CardTitle>
					<CardDescription>
						Detailed sales breakdown by {groupBy}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}</TableHead>
								<TableHead>Revenue</TableHead>
								<TableHead>Orders</TableHead>
								<TableHead>Items Sold</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data?.sales_by_period?.map((period) => (
								<TableRow key={period.date}>
									<TableCell>{format(reportsService.parseLocalDate(period.date), "MMM dd, yyyy")}</TableCell>
									<TableCell>${period.revenue.toLocaleString()}</TableCell>
									<TableCell>{period.orders.toLocaleString()}</TableCell>
									<TableCell>{period.items.toLocaleString()}</TableCell>
								</TableRow>
							))}
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
