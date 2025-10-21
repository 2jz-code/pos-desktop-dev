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
	ComposedChart,
	Area,
} from "recharts";
import {
	Users,
	TrendingUp,
	Activity,
	Calendar,
	Download,
	RefreshCw,
	Clock,
	Target,
	Zap,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import reportsService from "@/services/api/reportsService";
import { ExportDialog } from "@/components/reports/ExportDialog";
import { useLocation as useStoreLocation } from "@/contexts/LocationContext";

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
	const { selectedLocationId } = useStoreLocation();
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

			const filters = selectedLocationId ? { location_id: selectedLocationId } : {};
			const operationsData = await reportsService.generateOperationsReport(
				startDate,
				endDate,
				filters
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
	}, [dateRange, selectedLocationId]);

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
			<div>
				<div className="flex items-center gap-2 mb-4">
					<div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
						<Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
					</div>
					<div>
						<h3 className="text-lg font-semibold text-foreground">Operational Metrics</h3>
						<p className="text-sm text-muted-foreground">Overview of order processing and staff activity for the selected period</p>
					</div>
				</div>
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
					<Card className="border-border bg-card">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
							<div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
								<Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-foreground">
								{data?.summary?.total_orders?.toLocaleString() || "0"}
							</div>
							<p className="text-xs text-muted-foreground mt-1">Processed orders</p>
						</CardContent>
					</Card>

					<Card className="border-border bg-card">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">Daily Average</CardTitle>
							<div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
								<Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400" />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-foreground">
								{data?.summary?.avg_orders_per_day?.toFixed(1) || "0"}
							</div>
							<p className="text-xs text-muted-foreground mt-1">Orders per day</p>
						</CardContent>
					</Card>

					<Card className="border-border bg-card">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">Peak Day</CardTitle>
							<div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
								<TrendingUp className="h-4 w-4 text-orange-600 dark:text-orange-400" />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-foreground">
								{data?.summary?.peak_day?.orders || "0"}
							</div>
							<p className="text-xs text-muted-foreground mt-1">
								{data?.summary?.peak_day?.date
									? format(new Date(data.summary.peak_day.date), "MMM dd")
									: "N/A"}
							</p>
						</CardContent>
					</Card>

					<Card className="border-border bg-card">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">Staff Members</CardTitle>
							<div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
								<Users className="h-4 w-4 text-green-600 dark:text-green-400" />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-foreground">
								{data?.staff_performance?.length || "0"}
							</div>
							<p className="text-xs text-muted-foreground mt-1">Active cashiers</p>
						</CardContent>
					</Card>
				</div>
			</div>

			{/* Hourly Patterns */}
			<Card className="border-border bg-card">
				<CardHeader>
					<div className="flex items-center gap-2">
						<div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
							<Clock className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
						</div>
						<div>
							<CardTitle className="text-foreground">Hourly Order Patterns</CardTitle>
							<CardDescription>
								Order volume and revenue by hour of day
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<ResponsiveContainer
						width="100%"
						height={400}
					>
						<ComposedChart data={data?.hourly_patterns || []}>
							<CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
							<XAxis dataKey="hour" className="text-muted-foreground" />
							<YAxis
								yAxisId="orders"
								orientation="left"
								className="text-muted-foreground"
							/>
							<YAxis
								yAxisId="revenue"
								orientation="right"
								tickFormatter={(value) => `$${value.toLocaleString()}`}
								className="text-muted-foreground"
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
								stroke="#6366f1"
								fill="#6366f1"
								fillOpacity={0.6}
							/>
							<Line
								yAxisId="revenue"
								type="monotone"
								dataKey="revenue"
								stroke="#10b981"
								strokeWidth={2}
								dot={{ fill: "#10b981" }}
							/>
						</ComposedChart>
					</ResponsiveContainer>
				</CardContent>
			</Card>

			{/* Peak Hours and Daily Volume */}
			<div className="grid gap-4 md:grid-cols-2">
				<Card className="border-border bg-card">
					<CardHeader>
						<div className="flex items-center gap-2">
							<div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
								<Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
							</div>
							<div>
								<CardTitle className="text-foreground">Peak Hours</CardTitle>
								<CardDescription>
									Top 5 busiest hours by order volume
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent>
						<div className="space-y-3">
							{data?.peak_hours?.map((hour, index) => (
								<div
									key={hour.hour}
									className="flex items-center justify-between p-4 border border-border rounded-lg hover:shadow-sm transition-shadow bg-muted/20"
								>
									<div className="flex items-center space-x-4 flex-1 min-w-0">
										<Badge variant="outline" className="text-sm font-semibold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 flex-shrink-0">
											#{index + 1}
										</Badge>
										<div className="flex-1 min-w-0">
											<p className="font-semibold text-foreground">{hour.hour}</p>
											<p className="text-sm text-muted-foreground mt-0.5">
												${hour.revenue.toLocaleString()} revenue
											</p>
										</div>
									</div>
									<div className="text-right ml-4">
										<p className="font-bold text-lg text-foreground">{hour.orders}</p>
										<p className="text-xs text-muted-foreground">orders</p>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>

				<Card className="border-border bg-card">
					<CardHeader>
						<div className="flex items-center gap-2">
							<div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
								<TrendingUp className="h-4 w-4 text-purple-600 dark:text-purple-400" />
							</div>
							<div>
								<CardTitle className="text-foreground">Daily Volume Trend</CardTitle>
								<CardDescription>Order volume over time</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer
							width="100%"
							height={300}
						>
							<LineChart data={data?.daily_volume || []}>
								<CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
								<XAxis
									dataKey="date"
									tickFormatter={(value) =>
										format(reportsService.parseLocalDate(value), "MMM dd")
									}
									className="text-muted-foreground"
								/>
								<YAxis className="text-muted-foreground" />
								<Tooltip
									labelFormatter={(value) =>
										format(reportsService.parseLocalDate(value), "MMM dd, yyyy")
									}
									formatter={(value: number) => [value.toString(), "Orders"]}
								/>
								<Line
									type="monotone"
									dataKey="orders"
									stroke="#a855f7"
									strokeWidth={2}
									dot={{ fill: "#a855f7" }}
								/>
							</LineChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>
			</div>

			{/* Staff Performance */}
			<Card className="border-border bg-card">
				<CardHeader>
					<div className="flex items-center gap-2">
						<div className="p-2 bg-teal-50 dark:bg-teal-900/20 rounded-lg">
							<Users className="h-4 w-4 text-teal-600 dark:text-teal-400" />
						</div>
						<div>
							<CardTitle className="text-foreground">Staff Performance</CardTitle>
							<CardDescription>Orders processed by cashier</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<div className="space-y-3">
						{data?.staff_performance?.map((staff, index) => (
							<div
								key={staff.cashier}
								className="flex items-center justify-between p-4 border border-border rounded-lg hover:shadow-sm transition-shadow bg-muted/20"
							>
								<div className="flex items-center space-x-4 flex-1 min-w-0">
									<Badge variant="outline" className="text-sm font-semibold bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 border-teal-300 dark:border-teal-700 flex-shrink-0">
										#{index + 1}
									</Badge>
									<div className="flex-1 min-w-0">
										<p className="font-semibold text-foreground">{staff.cashier}</p>
										<p className="text-sm text-muted-foreground mt-0.5">
											Avg: ${staff.avg_order_value.toFixed(2)} • Revenue: ${staff.revenue.toLocaleString()}
										</p>
									</div>
								</div>
								<div className="text-right ml-4">
									<p className="font-bold text-lg text-foreground">{staff.orders_processed}</p>
									<p className="text-xs text-muted-foreground">orders</p>
								</div>
							</div>
						))}
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
