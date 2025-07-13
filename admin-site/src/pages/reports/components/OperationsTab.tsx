import { useState, useEffect } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import reportsService from "@/services/api/reportsService";

interface DateRange {
	from: Date;
	to: Date;
}

interface OperationsTabProps {
	dateRange: DateRange;
}
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, Target, TrendingUp } from "lucide-react";
import {
	BarChart,
	Bar,
	LineChart,
	Line,
	ResponsiveContainer,
	XAxis,
	YAxis,
	CartesianGrid,
	AreaChart,
	Area,
} from "recharts";

const peakHoursData = [
	{ hour: "6AM", orders: 12, avgWait: 1.2, efficiency: 85 },
	{ hour: "7AM", orders: 24, avgWait: 1.8, efficiency: 88 },
	{ hour: "8AM", orders: 45, avgWait: 2.1, efficiency: 92 },
	{ hour: "9AM", orders: 38, avgWait: 1.9, efficiency: 90 },
	{ hour: "10AM", orders: 32, avgWait: 1.5, efficiency: 87 },
	{ hour: "11AM", orders: 42, avgWait: 1.7, efficiency: 89 },
	{ hour: "12PM", orders: 67, avgWait: 2.8, efficiency: 85 },
	{ hour: "1PM", orders: 52, avgWait: 2.3, efficiency: 88 },
	{ hour: "2PM", orders: 38, avgWait: 1.6, efficiency: 91 },
	{ hour: "3PM", orders: 28, avgWait: 1.3, efficiency: 93 },
	{ hour: "4PM", orders: 35, avgWait: 1.4, efficiency: 92 },
	{ hour: "5PM", orders: 48, avgWait: 2.0, efficiency: 89 },
];

const staffPerformanceData = [
	{
		name: "Alice Johnson",
		sales: 8500,
		orders: 234,
		efficiency: 95,
		rating: 4.8,
		hours: 40,
	},
	{
		name: "Bob Smith",
		sales: 7200,
		orders: 198,
		efficiency: 88,
		rating: 4.6,
		hours: 38,
	},
	{
		name: "Carol Davis",
		sales: 6800,
		orders: 187,
		efficiency: 92,
		rating: 4.7,
		hours: 35,
	},
	{
		name: "David Wilson",
		sales: 5900,
		orders: 156,
		efficiency: 85,
		rating: 4.5,
		hours: 32,
	},
];

const weeklyOperationsData = [
	{
		week: "Week 1",
		avgOrderTime: 3.5,
		customerSatisfaction: 4.2,
		efficiency: 85,
	},
	{
		week: "Week 2",
		avgOrderTime: 3.2,
		customerSatisfaction: 4.4,
		efficiency: 88,
	},
	{
		week: "Week 3",
		avgOrderTime: 3.0,
		customerSatisfaction: 4.6,
		efficiency: 92,
	},
	{
		week: "Week 4",
		avgOrderTime: 2.8,
		customerSatisfaction: 4.7,
		efficiency: 94,
	},
];

const equipmentUtilization = [
	{ equipment: "Espresso Machine 1", utilization: 85, status: "Optimal" },
	{ equipment: "Espresso Machine 2", utilization: 78, status: "Good" },
	{ equipment: "Grinder 1", utilization: 92, status: "High" },
	{ equipment: "Grinder 2", utilization: 67, status: "Low" },
];

export function OperationsTab({ dateRange }: OperationsTabProps) {
	const [data, setData] = useState<unknown>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

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

				const reportData = await reportsService.generateOperationsReport(
					startDate,
					endDate
				);

				setData(reportData);
			} catch (err) {
				setError("Failed to load operations data");
				console.error("Error fetching operations data:", err);
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
				<h2 className="text-2xl font-bold">Operations Insights</h2>
				<Button>Export Operations Data</Button>
			</div>

			<div className="grid gap-6 md:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Avg Order Time
						</CardTitle>
						<Clock className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">3.2 min</div>
						<p className="text-xs text-muted-foreground">
							<span className="text-green-600">-0.3 min</span> from last week
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Customer Wait</CardTitle>
						<Users className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">1.8 min</div>
						<p className="text-xs text-muted-foreground">
							<span className="text-green-600">-0.2 min</span> from last week
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Order Accuracy
						</CardTitle>
						<Target className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">98.5%</div>
						<p className="text-xs text-muted-foreground">
							<span className="text-green-600">+1.2%</span> from last week
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Efficiency</CardTitle>
						<TrendingUp className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">89.2%</div>
						<p className="text-xs text-muted-foreground">
							<span className="text-green-600">+3.1%</span> from last week
						</p>
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Peak Hours Analysis</CardTitle>
						<CardDescription>
							Order volume and wait times throughout the day
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ChartContainer
							config={{
								orders: {
									label: "Orders",
									color: "hsl(var(--chart-1))",
								},
								avgWait: {
									label: "Avg Wait (min)",
									color: "hsl(var(--chart-2))",
								},
							}}
							className="h-[300px]"
						>
							<ResponsiveContainer
								width="100%"
								height="100%"
							>
								<BarChart data={peakHoursData}>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="hour" />
									<YAxis yAxisId="left" />
									<YAxis
										yAxisId="right"
										orientation="right"
									/>
									<ChartTooltip content={<ChartTooltipContent />} />
									<Bar
										yAxisId="left"
										dataKey="orders"
										fill="var(--color-orders)"
									/>
									<Line
										yAxisId="right"
										dataKey="avgWait"
										stroke="var(--color-avgWait)"
										strokeWidth={3}
									/>
								</BarChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Weekly Operations Trend</CardTitle>
						<CardDescription>Key operational metrics over time</CardDescription>
					</CardHeader>
					<CardContent>
						<ChartContainer
							config={{
								avgOrderTime: {
									label: "Avg Order Time",
									color: "hsl(var(--chart-1))",
								},
								customerSatisfaction: {
									label: "Customer Satisfaction",
									color: "hsl(var(--chart-2))",
								},
								efficiency: {
									label: "Efficiency %",
									color: "hsl(var(--chart-3))",
								},
							}}
							className="h-[300px]"
						>
							<ResponsiveContainer
								width="100%"
								height="100%"
							>
								<LineChart data={weeklyOperationsData}>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="week" />
									<YAxis />
									<ChartTooltip content={<ChartTooltipContent />} />
									<Line
										type="monotone"
										dataKey="avgOrderTime"
										stroke="var(--color-avgOrderTime)"
										strokeWidth={2}
									/>
									<Line
										type="monotone"
										dataKey="customerSatisfaction"
										stroke="var(--color-customerSatisfaction)"
										strokeWidth={2}
									/>
									<Line
										type="monotone"
										dataKey="efficiency"
										stroke="var(--color-efficiency)"
										strokeWidth={2}
									/>
								</LineChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Staff Performance</CardTitle>
						<CardDescription>
							Individual team member productivity metrics
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ChartContainer
							config={{
								sales: {
									label: "Sales ($)",
									color: "hsl(var(--chart-1))",
								},
								efficiency: {
									label: "Efficiency %",
									color: "hsl(var(--chart-2))",
								},
							}}
							className="h-[300px]"
						>
							<ResponsiveContainer
								width="100%"
								height="100%"
							>
								<BarChart
									data={staffPerformanceData}
									layout="horizontal"
								>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis type="number" />
									<YAxis
										dataKey="name"
										type="category"
										width={100}
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
						<CardTitle>Equipment Utilization</CardTitle>
						<CardDescription>Usage efficiency of key equipment</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{equipmentUtilization.map((equipment, index) => (
								<div
									key={index}
									className="space-y-2"
								>
									<div className="flex items-center justify-between">
										<span className="font-medium">{equipment.equipment}</span>
										<div className="flex items-center gap-2">
											<span className="text-sm">{equipment.utilization}%</span>
											<Badge
												variant={
													equipment.status === "Optimal"
														? "default"
														: equipment.status === "Good"
														? "secondary"
														: equipment.status === "High"
														? "destructive"
														: "outline"
												}
											>
												{equipment.status}
											</Badge>
										</div>
									</div>
									<Progress
										value={equipment.utilization}
										className="h-2"
									/>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Efficiency Heatmap</CardTitle>
					<CardDescription>
						Operational efficiency throughout the day
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ChartContainer
						config={{
							efficiency: {
								label: "Efficiency %",
								color: "hsl(var(--chart-1))",
							},
						}}
						className="h-[200px]"
					>
						<ResponsiveContainer
							width="100%"
							height="100%"
						>
							<AreaChart data={peakHoursData}>
								<CartesianGrid strokeDasharray="3 3" />
								<XAxis dataKey="hour" />
								<YAxis domain={[80, 95]} />
								<ChartTooltip content={<ChartTooltipContent />} />
								<Area
									type="monotone"
									dataKey="efficiency"
									stroke="var(--color-efficiency)"
									fill="var(--color-efficiency)"
									fillOpacity={0.6}
								/>
							</AreaChart>
						</ResponsiveContainer>
					</ChartContainer>
				</CardContent>
			</Card>
		</div>
	);
}
