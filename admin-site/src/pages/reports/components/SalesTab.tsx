import { useState, useEffect } from "react";
import reportsService from "@/services/api/reportsService";

interface DateRange {
	from: Date;
	to: Date;
}

interface SalesTabProps {
	dateRange: DateRange;
}
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
	Line,
	Bar,
	BarChart,
	Area,
	ResponsiveContainer,
	XAxis,
	YAxis,
	CartesianGrid,
	ComposedChart,
} from "recharts";
import { format } from "date-fns";

const salesData = [
	{
		date: "2024-01-01",
		sales: 2450,
		transactions: 67,
		avgTicket: 36.57,
		growth: 0,
	},
	{
		date: "2024-01-02",
		sales: 3200,
		transactions: 89,
		avgTicket: 35.96,
		growth: 30.6,
	},
	{
		date: "2024-01-03",
		sales: 2800,
		transactions: 76,
		avgTicket: 36.84,
		growth: -12.5,
	},
	{
		date: "2024-01-04",
		sales: 3600,
		transactions: 95,
		avgTicket: 37.89,
		growth: 28.6,
	},
	{
		date: "2024-01-05",
		sales: 4100,
		transactions: 112,
		avgTicket: 36.61,
		growth: 13.9,
	},
	{
		date: "2024-01-06",
		sales: 3800,
		transactions: 98,
		avgTicket: 38.78,
		growth: -7.3,
	},
	{
		date: "2024-01-07",
		sales: 4500,
		transactions: 125,
		avgTicket: 36.0,
		growth: 18.4,
	},
];

const monthlySalesData = [
	{ month: "Jul", sales: 85000, target: 80000, growth: 12.5 },
	{ month: "Aug", sales: 92000, target: 85000, growth: 8.2 },
	{ month: "Sep", sales: 78000, target: 90000, growth: -15.2 },
	{ month: "Oct", sales: 105000, target: 95000, growth: 34.6 },
	{ month: "Nov", sales: 118000, target: 100000, growth: 12.4 },
	{ month: "Dec", sales: 135000, target: 110000, growth: 14.4 },
];

const categoryData = [
	{ category: "Beverages", sales: 28500, percentage: 63, growth: 15.2 },
	{ category: "Food", sales: 12800, percentage: 28, growth: 8.7 },
	{ category: "Retail", sales: 4100, percentage: 9, growth: -2.1 },
];

export function SalesTab({ dateRange }: SalesTabProps) {
	const [data, setData] = useState<unknown>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selectedPeriod, setSelectedPeriod] = useState("daily");

	useEffect(() => {
		const fetchData = async () => {
			try {
				setLoading(true);
				setError(null);

				const startDate = reportsService.formatDateForApi(dateRange.from);
				const endDate = reportsService.formatDateForApi(dateRange.to);

				if (!startDate || !endDate) {
					setError("Invalid date range");
					return;
				}

				const reportData = await reportsService.generateSalesReport(
					startDate,
					endDate
				);

				setData(reportData);
			} catch (err) {
				setError("Failed to load sales data");
				console.error("Error fetching sales data:", err);
			} finally {
				setLoading(false);
			}
		};

		fetchData();
	}, [dateRange]);

	if (loading) {
		return (
			<div className="space-y-6">
				<div className="animate-pulse space-y-4">
					<div className="h-8 bg-gray-200 rounded w-1/4" />
					<div className="h-64 bg-gray-200 rounded" />
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>Error</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-red-600">{error}</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="text-2xl font-bold">Sales Reports</h2>
				<div className="flex items-center gap-4">
					<Select
						value={selectedPeriod}
						onValueChange={setSelectedPeriod}
					>
						<SelectTrigger className="w-[180px]">
							<SelectValue placeholder="Select period" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="daily">Daily</SelectItem>
							<SelectItem value="weekly">Weekly</SelectItem>
							<SelectItem value="monthly">Monthly</SelectItem>
						</SelectContent>
					</Select>
					<Button>Generate Report</Button>
				</div>
			</div>

			<div className="grid gap-6 md:grid-cols-3">
				<Card>
					<CardHeader>
						<CardTitle>Total Revenue</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold">$45,280</div>
						<p className="text-sm text-muted-foreground mt-2">
							Across 1,247 transactions
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Best Day</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold">Jan 7</div>
						<p className="text-sm text-muted-foreground mt-2">
							$4,500 in sales
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Growth Rate</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-green-600">+12.5%</div>
						<p className="text-sm text-muted-foreground mt-2">
							Compared to last period
						</p>
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Sales vs Transactions</CardTitle>
						<CardDescription>
							Daily performance with dual metrics
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ChartContainer
							config={{
								sales: {
									label: "Sales ($)",
									color: "hsl(var(--chart-1))",
								},
								transactions: {
									label: "Transactions",
									color: "hsl(var(--chart-2))",
								},
							}}
							className="h-[300px]"
						>
							<ResponsiveContainer
								width="100%"
								height="100%"
							>
								<ComposedChart data={salesData}>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis
										dataKey="date"
										tickFormatter={(value) => format(new Date(value), "MMM dd")}
									/>
									<YAxis yAxisId="left" />
									<YAxis
										yAxisId="right"
										orientation="right"
									/>
									<ChartTooltip content={<ChartTooltipContent />} />
									<Area
										yAxisId="left"
										type="monotone"
										dataKey="sales"
										fill="var(--color-sales)"
										fillOpacity={0.3}
										stroke="var(--color-sales)"
									/>
									<Line
										yAxisId="right"
										type="monotone"
										dataKey="transactions"
										stroke="var(--color-transactions)"
										strokeWidth={3}
									/>
								</ComposedChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Monthly Performance vs Target</CardTitle>
						<CardDescription>
							Sales performance against monthly targets
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ChartContainer
							config={{
								sales: {
									label: "Actual Sales",
									color: "hsl(var(--chart-1))",
								},
								target: {
									label: "Target",
									color: "hsl(var(--chart-3))",
								},
							}}
							className="h-[300px]"
						>
							<ResponsiveContainer
								width="100%"
								height="100%"
							>
								<BarChart data={monthlySalesData}>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="month" />
									<YAxis />
									<ChartTooltip content={<ChartTooltipContent />} />
									<Bar
										dataKey="target"
										fill="var(--color-target)"
										opacity={0.5}
									/>
									<Bar
										dataKey="sales"
										fill="var(--color-sales)"
									/>
								</BarChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Sales by Category</CardTitle>
					<CardDescription>
						Revenue breakdown by product category
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ChartContainer
						config={{
							sales: {
								label: "Sales",
								color: "hsl(var(--chart-1))",
							},
						}}
						className="h-[200px]"
					>
						<ResponsiveContainer
							width="100%"
							height="100%"
						>
							<BarChart
								data={categoryData}
								layout="horizontal"
							>
								<CartesianGrid strokeDasharray="3 3" />
								<XAxis type="number" />
								<YAxis
									dataKey="category"
									type="category"
									width={80}
								/>
								<ChartTooltip content={<ChartTooltipContent />} />
								<Bar
									dataKey="sales"
									fill="var(--color-sales)"
								/>
							</BarChart>
						</ResponsiveContainer>
					</ChartContainer>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Daily Sales Breakdown</CardTitle>
					<CardDescription>Detailed view of sales by day</CardDescription>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Date</TableHead>
								<TableHead>Sales</TableHead>
								<TableHead>Transactions</TableHead>
								<TableHead>Avg. Ticket</TableHead>
								<TableHead>Growth</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{salesData.map((day, index) => (
								<TableRow key={index}>
									<TableCell>
										{format(new Date(day.date), "MMM dd, yyyy")}
									</TableCell>
									<TableCell className="font-medium">
										${day.sales.toLocaleString()}
									</TableCell>
									<TableCell>{day.transactions}</TableCell>
									<TableCell>${day.avgTicket.toFixed(2)}</TableCell>
									<TableCell>
										<Badge
											variant={
												day.growth > 0
													? "default"
													: day.growth < 0
													? "destructive"
													: "secondary"
											}
										>
											{day.growth > 0 ? "+" : ""}
											{day.growth.toFixed(1)}%
										</Badge>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}
