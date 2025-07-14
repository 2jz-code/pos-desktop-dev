import { DollarSign, FileText, BarChart3, Package } from "lucide-react";
import { useState, useEffect } from "react";
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
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	ResponsiveContainer,
	XAxis,
	YAxis,
	CartesianGrid,
	PieChart,
	Pie,
	Cell,
} from "recharts";
import reportsService from "@/services/api/reportsService";

interface DateRange {
	from: Date;
	to: Date;
}

interface SummaryTabProps {
	dateRange: DateRange;
}

interface SummaryApiData {
	total_sales: number;
	total_transactions: number;
	average_ticket: number;
	top_product: string;
	sales_growth: number;
	transaction_growth: number;
	sales_trend: Array<{ date: string; sales: number }>;
	payment_distribution: Array<{ name: string; value: number }>;
	hourly_performance: Array<{ hour: string; transactions: number }>;
	top_products_by_revenue: Array<{ name: string; revenue: number; quantity: number }>;
}

const summaryData = {
	totalSales: 45280.5,
	totalTransactions: 1247,
	averageTicket: 36.32,
	topProduct: "Espresso",
	salesGrowth: 12.5,
	transactionGrowth: 8.3,
};

const salesTrendData = [
	{ date: "Jan 1", sales: 2450, transactions: 67, hour: "8AM" },
	{ date: "Jan 2", sales: 3200, transactions: 89, hour: "9AM" },
	{ date: "Jan 3", sales: 2800, transactions: 78, hour: "10AM" },
	{ date: "Jan 4", sales: 3500, transactions: 95, hour: "11AM" },
	{ date: "Jan 5", sales: 4200, transactions: 112, hour: "12PM" },
	{ date: "Jan 6", sales: 3800, transactions: 101, hour: "1PM" },
	{ date: "Jan 7", sales: 4500, transactions: 125, hour: "2PM" },
];

const paymentDistributionData = [
	{ name: "Cash", value: 45, color: "#0088FE" },
	{ name: "Card", value: 35, color: "#00C49F" },
	{ name: "Digital", value: 20, color: "#FFBB28" },
];

const hourlyPerformanceData = [
	{ hour: "8AM", transactions: 12, sales: 450 },
	{ hour: "9AM", transactions: 18, sales: 680 },
	{ hour: "10AM", transactions: 25, sales: 920 },
	{ hour: "11AM", transactions: 35, sales: 1200 },
	{ hour: "12PM", transactions: 45, sales: 1580 },
	{ hour: "1PM", transactions: 42, sales: 1450 },
	{ hour: "2PM", transactions: 38, sales: 1320 },
	{ hour: "3PM", transactions: 28, sales: 980 },
	{ hour: "4PM", transactions: 22, sales: 780 },
	{ hour: "5PM", transactions: 15, sales: 520 },
];

const topProductsData = [
	{ name: "Espresso", revenue: 2450, quantity: 145 },
	{ name: "Cappuccino", revenue: 1890, quantity: 98 },
	{ name: "Latte", revenue: 1650, quantity: 87 },
	{ name: "Americano", revenue: 1200, quantity: 120 },
	{ name: "Mocha", revenue: 980, quantity: 45 },
];

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042"];

export function SummaryTab({ dateRange }: SummaryTabProps) {
	const [data, setData] = useState<SummaryApiData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchData = async () => {
			try {
				setLoading(true);
				setError(null);

				const startDate = reportsService.formatDateForApi(dateRange.from);
				const endDate = reportsService.formatEndDateForApi(dateRange.to);

				if (!startDate || !endDate) {
					setError("Invalid date range");
					return;
				}

				const reportData = await reportsService.generateSummaryReport(
					startDate,
					endDate
				);

				setData(reportData as SummaryApiData);
			} catch (err) {
				setError("Failed to load summary data");
				console.error("Error fetching summary data:", err);
			} finally {
				setLoading(false);
			}
		};

		fetchData();
	}, [dateRange]);

	if (loading) {
		return (
			<div className="space-y-6">
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
					{[...Array(4)].map((_, i) => (
						<Card key={i}>
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
								<div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
							</CardHeader>
							<CardContent>
								<div className="h-6 w-24 bg-gray-200 rounded animate-pulse mb-2" />
								<div className="h-3 w-32 bg-gray-200 rounded animate-pulse" />
							</CardContent>
						</Card>
					))}
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

	// Helper function to get API data with fallback to mock data
	const getApiValue = <T,>(apiValue: T | undefined, fallback: T): T => {
		return data !== null && apiValue !== undefined ? apiValue : fallback;
	};

	// Transform payment distribution data for pie chart
	const getPaymentDistributionData = () => {
		if (data?.payment_distribution) {
			return data.payment_distribution.map((item: any) => ({
				name: item.method,
				value: item.percentage,
				color: paymentDistributionData.find(p => p.name.toLowerCase() === item.method.toLowerCase())?.color || "#8884d8"
			}));
		}
		return paymentDistributionData;
	};

	// Transform hourly performance data for bar chart
	const getHourlyPerformanceData = () => {
		if (data?.hourly_performance) {
			return data.hourly_performance.map((item: any) => ({
				hour: item.hour,
				transactions: item.orders,
				sales: item.sales
			}));
		}
		return hourlyPerformanceData;
	};

	// Get top products by revenue data
	const getTopProductsData = () => {
		if (data?.top_products_by_revenue && data.top_products_by_revenue.length > 0) {
			// Ensure the data has the correct structure and format
			return data.top_products_by_revenue.map((item: any) => ({
				name: item.name || 'Unknown Product',
				revenue: Number(item.revenue) || 0,
				quantity: Number(item.quantity) || 0
			}));
		}
		return topProductsData;
	};

	return (
		<div className="space-y-6">
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Total Sales</CardTitle>
						<DollarSign className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							$
							{getApiValue(
								data?.total_sales,
								summaryData.totalSales
							).toLocaleString()}
						</div>
						<p className="text-xs text-muted-foreground">
							<span className="text-green-600">
								+{getApiValue(data?.sales_growth, summaryData.salesGrowth)}%
							</span>{" "}
							from last period
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Transactions</CardTitle>
						<FileText className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{getApiValue(
								data?.total_transactions,
								summaryData.totalTransactions
							).toLocaleString()}
						</div>
						<p className="text-xs text-muted-foreground">
							<span className="text-green-600">
								+
								{getApiValue(
									data?.transaction_growth,
									summaryData.transactionGrowth
								)}
								%
							</span>{" "}
							from last period
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Average Ticket
						</CardTitle>
						<BarChart3 className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							$
							{getApiValue(
								data?.average_ticket,
								summaryData.averageTicket
							).toLocaleString()}
						</div>
						<p className="text-xs text-muted-foreground">
							<span className="text-green-600">+2.1%</span> from last period
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Top Product</CardTitle>
						<Package className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{getApiValue(data?.top_product, summaryData.topProduct)}
						</div>
						<p className="text-xs text-muted-foreground">
							Best performing item
						</p>
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Sales Trend</CardTitle>
						<CardDescription>Daily sales performance</CardDescription>
					</CardHeader>
					<CardContent>
						<ChartContainer
							config={{
								sales: {
									label: "Sales",
									color: "hsl(var(--chart-1))",
								},
							}}
							className="h-[300px]"
						>
							<ResponsiveContainer
								width="100%"
								height="100%"
							>
								<AreaChart
									data={getApiValue(data?.sales_trend, salesTrendData)}
								>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="date" />
									<YAxis />
									<ChartTooltip content={<ChartTooltipContent />} />
									<Area
										type="monotone"
										dataKey="sales"
										stroke="var(--color-sales)"
										fill="var(--color-sales)"
									/>
								</AreaChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle>Top Products by Revenue</CardTitle>
						<CardDescription>Best performing products</CardDescription>
					</CardHeader>
					<CardContent className="pt-2">
						<ChartContainer
							config={{
								revenue: {
									label: "Revenue ($)",
									color: "#0088FE",
								},
							}}
							className="h-[350px]"
						>
							<ResponsiveContainer
								width="100%"
								height="100%"
							>
								<BarChart
									data={getTopProductsData()}
									margin={{
										top: 20,
										right: 20,
										left: 20,
										bottom: 60,
									}}
								>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis 
										dataKey="name"
										tick={{ fontSize: 11, angle: -45, textAnchor: 'end' }}
										height={60}
									/>
									<YAxis
										tickFormatter={(value) => `$${value}`}
										tick={{ fontSize: 11 }}
									/>
									<ChartTooltip 
										content={({ active, payload, label }) => {
											if (active && payload && payload.length) {
												const data = payload[0].payload;
												return (
													<div className="bg-white p-3 border rounded shadow-lg">
														<p className="font-semibold">{label}</p>
														<p className="text-blue-600">
															Revenue: ${data.revenue.toFixed(2)}
														</p>
														<p className="text-gray-600">
															Quantity Sold: {data.quantity}
														</p>
													</div>
												);
											}
											return null;
										}}
									/>
									<Bar
										dataKey="revenue"
										fill="#0088FE"
										radius={[4, 4, 0, 0]}
									/>
								</BarChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Hourly Performance</CardTitle>
						<CardDescription>Sales by hour of day</CardDescription>
					</CardHeader>
					<CardContent>
						<ChartContainer
							config={{
								transactions: {
									label: "Transactions",
									color: "hsl(var(--chart-1))",
								},
							}}
							className="h-[300px]"
						>
							<ResponsiveContainer
								width="100%"
								height="100%"
							>
								<BarChart
									data={getHourlyPerformanceData()}
								>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="hour" />
									<YAxis />
									<ChartTooltip content={<ChartTooltipContent />} />
									<Bar
										dataKey="transactions"
										fill="var(--color-transactions)"
									/>
								</BarChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Payment Distribution</CardTitle>
						<CardDescription>Payment method breakdown</CardDescription>
					</CardHeader>
					<CardContent>
						<ChartContainer
							config={{
								cash: {
									label: "Cash",
									color: "hsl(var(--chart-1))",
								},
								card: {
									label: "Card",
									color: "hsl(var(--chart-2))",
								},
								digital: {
									label: "Digital",
									color: "hsl(var(--chart-3))",
								},
							}}
							className="h-[300px]"
						>
							<ResponsiveContainer
								width="100%"
								height="100%"
							>
								<PieChart>
									<Pie
										data={getPaymentDistributionData()}
										cx="50%"
										cy="50%"
										labelLine={false}
										label={({ name, percent }) =>
											`${name} ${(percent * 100).toFixed(0)}%`
										}
										outerRadius={80}
										fill="#8884d8"
										dataKey="value"
									>
										{getPaymentDistributionData().map((entry, index) => (
											<Cell
												key={`cell-${index}`}
												fill={entry.color || COLORS[index % COLORS.length]}
											/>
										))}
									</Pie>
									<ChartTooltip content={<ChartTooltipContent />} />
								</PieChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
