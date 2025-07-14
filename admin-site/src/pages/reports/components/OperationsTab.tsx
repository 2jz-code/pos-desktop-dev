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
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	LineChart,
	Line,
	AreaChart,
	Area,
} from "recharts";
import {
	Users,
	TrendingUp,
	Activity,
	Calendar,
	Download,
	RefreshCw,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import reportsService from "@/services/api/reportsService";
import { ExportDialog } from "@/components/reports/ExportDialog";

interface OperationsData {
	hourly_patterns: Array<{
		hour: string;
		orders: number;
		revenue: number;
		avg_order_value: number;
	}>;
	peak_hours: Array<{
		hour: string;
		orders: number;
		revenue: number;
	}>;
	daily_volume: Array<{
		date: string;
		orders: number;
		revenue: number;
	}>;
	staff_performance: Array<{
		cashier: string;
		orders_processed: number;
		revenue: number;
		avg_order_value: number;
	}>;
	summary: {
		total_orders: number;
		avg_orders_per_day: number;
		peak_day: {
			date: string;
			orders: number;
		} | null;
		slowest_day: {
			date: string;
			orders: number;
		} | null;
	};
}

interface OperationsTabProps {
	dateRange: DateRange | undefined;
}

export function OperationsTab({ dateRange }: OperationsTabProps) {
	const [data, setData] = useState<OperationsData | null>(null);
	const [loading, setLoading] = useState(false);
	const [exportDialogOpen, setExportDialogOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchOperationsData = async () => {
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

			const operationsData = await reportsService.generateOperationsReport(
				startDate,
				endDate
			);
			setData(operationsData as OperationsData);
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchOperationsData();
	}, [dateRange]);

	if (loading) {
		return (
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="space-y-1">
						<h3 className="text-2xl font-semibold tracking-tight">
							Operations Reports
						</h3>
						<p className="text-sm text-muted-foreground">
							Operational insights and staff performance
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
								Error loading operations data: {error}
							</p>
							<Button
								onClick={fetchOperationsData}
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
						Operations Reports
					</h3>
					<p className="text-sm text-muted-foreground">
						Operational insights and staff performance
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
						<CardTitle className="text-sm font-medium">Total Orders</CardTitle>
						<Activity className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{data?.summary?.total_orders?.toLocaleString() || "0"}
						</div>
						<p className="text-xs text-muted-foreground">Processed orders</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Daily Average</CardTitle>
						<Calendar className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{data?.summary?.avg_orders_per_day?.toFixed(1) || "0"}
						</div>
						<p className="text-xs text-muted-foreground">Orders per day</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Peak Day</CardTitle>
						<TrendingUp className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{data?.summary?.peak_day?.orders || "0"}
						</div>
						<p className="text-xs text-muted-foreground">
							{data?.summary?.peak_day?.date
								? format(new Date(data.summary.peak_day.date), "MMM dd")
								: "N/A"}
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Staff Members</CardTitle>
						<Users className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{data?.staff_performance?.length || "0"}
						</div>
						<p className="text-xs text-muted-foreground">Active cashiers</p>
					</CardContent>
				</Card>
			</div>

			{/* Hourly Patterns */}
			<Card>
				<CardHeader>
					<CardTitle>Hourly Order Patterns</CardTitle>
					<CardDescription>
						Order volume and revenue by hour of day
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ResponsiveContainer
						width="100%"
						height={400}
					>
						<AreaChart data={data?.hourly_patterns || []}>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis dataKey="hour" />
							<YAxis
								yAxisId="orders"
								orientation="left"
							/>
							<YAxis
								yAxisId="revenue"
								orientation="right"
								tickFormatter={(value) => `$${value.toLocaleString()}`}
							/>
							<Tooltip
								formatter={(value: number, name: string) => [
									name === "revenue"
										? `$${value.toLocaleString()}`
										: value.toString(),
									name === "revenue" ? "Revenue" : "Orders",
								]}
							/>
							<Area
								yAxisId="orders"
								type="monotone"
								dataKey="orders"
								stackId="1"
								stroke="#8884d8"
								fill="#8884d8"
								fillOpacity={0.6}
							/>
							<Line
								yAxisId="revenue"
								type="monotone"
								dataKey="revenue"
								stroke="#82ca9d"
								strokeWidth={2}
								dot={{ fill: "#82ca9d" }}
							/>
						</AreaChart>
					</ResponsiveContainer>
				</CardContent>
			</Card>

			{/* Peak Hours and Daily Volume */}
			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Peak Hours</CardTitle>
						<CardDescription>
							Top 5 busiest hours by order volume
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{data?.peak_hours?.map((hour, index) => (
								<div
									key={hour.hour}
									className="flex items-center justify-between"
								>
									<div className="flex items-center space-x-4">
										<Badge variant="secondary">{index + 1}</Badge>
										<div>
											<p className="font-medium">{hour.hour}</p>
											<p className="text-sm text-muted-foreground">
												${hour.revenue.toLocaleString()} revenue
											</p>
										</div>
									</div>
									<div className="text-right">
										<p className="font-medium">{hour.orders} orders</p>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Daily Volume Trend</CardTitle>
						<CardDescription>Order volume over time</CardDescription>
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
								<YAxis />
								<Tooltip
									labelFormatter={(value) =>
										format(reportsService.parseLocalDate(value), "MMM dd, yyyy")
									}
									formatter={(value: number) => [value.toString(), "Orders"]}
								/>
								<Line
									type="monotone"
									dataKey="orders"
									stroke="#8884d8"
									strokeWidth={2}
									dot={{ fill: "#8884d8" }}
								/>
							</LineChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>
			</div>

			{/* Staff Performance */}
			<Card>
				<CardHeader>
					<CardTitle>Staff Performance</CardTitle>
					<CardDescription>Cashier performance metrics</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{data?.staff_performance?.map((staff, index) => (
							<div
								key={staff.cashier}
								className="flex items-center justify-between p-4 border rounded-lg"
							>
								<div className="flex items-center space-x-4">
									<Badge variant="outline">{index + 1}</Badge>
									<div>
										<p className="font-medium">{staff.cashier}</p>
										<p className="text-sm text-muted-foreground">
											Avg Order: ${staff.avg_order_value.toFixed(2)}
										</p>
									</div>
								</div>
								<div className="text-right space-y-1">
									<p className="font-medium">{staff.orders_processed} orders</p>
									<p className="text-sm text-muted-foreground">
										${staff.revenue.toLocaleString()} revenue
									</p>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Performance Summary */}
			<Card>
				<CardHeader>
					<CardTitle>Performance Summary</CardTitle>
					<CardDescription>Key operational metrics</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-4">
							<div>
								<p className="text-sm font-medium mb-2">Busiest Day</p>
								<div className="flex items-center justify-between p-3 bg-muted rounded-lg">
									<span>
										{data?.summary?.peak_day?.date
											? format(
													new Date(data.summary.peak_day.date),
													"EEEE, MMM dd"
											  )
											: "N/A"}
									</span>
									<Badge>{data?.summary?.peak_day?.orders || 0} orders</Badge>
								</div>
							</div>
							<div>
								<p className="text-sm font-medium mb-2">Slowest Day</p>
								<div className="flex items-center justify-between p-3 bg-muted rounded-lg">
									<span>
										{data?.summary?.slowest_day?.date
											? format(
													new Date(data.summary.slowest_day.date),
													"EEEE, MMM dd"
											  )
											: "N/A"}
									</span>
									<Badge variant="secondary">
										{data?.summary?.slowest_day?.orders || 0} orders
									</Badge>
								</div>
							</div>
						</div>
						<div className="space-y-4">
							<div>
								<p className="text-sm font-medium mb-2">Peak Hour</p>
								<div className="flex items-center justify-between p-3 bg-muted rounded-lg">
									<span>{data?.peak_hours?.[0]?.hour || "N/A"}</span>
									<Badge>{data?.peak_hours?.[0]?.orders || 0} orders</Badge>
								</div>
							</div>
							<div>
								<p className="text-sm font-medium mb-2">Top Performer</p>
								<div className="flex items-center justify-between p-3 bg-muted rounded-lg">
									<span>{data?.staff_performance?.[0]?.cashier || "N/A"}</span>
									<Badge>
										{data?.staff_performance?.[0]?.orders_processed || 0} orders
									</Badge>
								</div>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
			{/* Export Dialog */}
			<ExportDialog
				open={exportDialogOpen}
				onOpenChange={setExportDialogOpen}
				reportType="operations"
				defaultStartDate={dateRange?.from}
				defaultEndDate={dateRange?.to}
			/>
		</div>
	);
}
