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

interface ProductsTabProps {
	dateRange: DateRange;
}
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
import { Progress } from "@/components/ui/progress";
import {
	BarChart,
	Bar,
	LineChart,
	Line,
	ResponsiveContainer,
	XAxis,
	YAxis,
	CartesianGrid,
	RadarChart,
	PolarGrid,
	PolarAngleAxis,
	PolarRadiusAxis,
	Radar,
	ScatterChart,
	Scatter,
} from "recharts";

const productData = [
	{
		name: "Espresso",
		sold: 234,
		revenue: 1170,
		margin: 68,
		cost: 374.4,
		rating: 4.8,
	},
	{
		name: "Cappuccino",
		sold: 189,
		revenue: 1323,
		margin: 72,
		cost: 370.44,
		rating: 4.7,
	},
	{
		name: "Latte",
		sold: 156,
		revenue: 1248,
		margin: 70,
		cost: 374.4,
		rating: 4.6,
	},
	{
		name: "Americano",
		sold: 145,
		revenue: 870,
		margin: 65,
		cost: 304.5,
		rating: 4.5,
	},
	{
		name: "Mocha",
		sold: 98,
		revenue: 882,
		margin: 75,
		cost: 220.5,
		rating: 4.9,
	},
];

const categoryPerformance = [
	{ category: "Hot Beverages", revenue: 4200, units: 567, margin: 68 },
	{ category: "Cold Beverages", revenue: 2800, units: 234, margin: 72 },
	{ category: "Pastries", revenue: 1500, units: 189, margin: 65 },
	{ category: "Sandwiches", revenue: 2200, units: 145, margin: 58 },
];

const weeklyProductTrends = [
	{
		week: "Week 1",
		espresso: 45,
		cappuccino: 38,
		latte: 32,
		americano: 28,
		mocha: 18,
	},
	{
		week: "Week 2",
		espresso: 52,
		cappuccino: 41,
		latte: 35,
		americano: 31,
		mocha: 22,
	},
	{
		week: "Week 3",
		espresso: 48,
		cappuccino: 44,
		latte: 38,
		americano: 29,
		mocha: 25,
	},
	{
		week: "Week 4",
		espresso: 58,
		cappuccino: 47,
		latte: 41,
		americano: 35,
		mocha: 28,
	},
];

const productPerformanceRadar = [
	{ product: "Espresso", sales: 95, margin: 68, rating: 96, frequency: 88 },
	{ product: "Cappuccino", sales: 81, margin: 72, rating: 94, frequency: 75 },
	{ product: "Latte", sales: 67, margin: 70, rating: 92, frequency: 62 },
	{ product: "Americano", sales: 62, margin: 65, rating: 90, frequency: 58 },
	{ product: "Mocha", sales: 42, margin: 75, rating: 98, frequency: 39 },
];

export function ProductsTab({ dateRange }: ProductsTabProps) {
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

				const reportData = await reportsService.generateProductsReport(
					startDate,
					endDate
				);

				setData(reportData);
			} catch (err) {
				setError("Failed to load products data");
				console.error("Error fetching products data:", err);
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
				<h2 className="text-2xl font-bold">Product Reports</h2>
				<div className="flex items-center gap-4">
					<Select defaultValue="all">
						<SelectTrigger className="w-[180px]">
							<SelectValue placeholder="Select category" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Categories</SelectItem>
							<SelectItem value="beverages">Beverages</SelectItem>
							<SelectItem value="food">Food</SelectItem>
							<SelectItem value="retail">Retail</SelectItem>
						</SelectContent>
					</Select>
					<Button>Export Product Data</Button>
				</div>
			</div>

			<div className="grid gap-6 md:grid-cols-3">
				<Card>
					<CardHeader>
						<CardTitle>Top Seller</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">Espresso</div>
						<p className="text-sm text-muted-foreground mt-2">234 units sold</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Highest Revenue</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">Cappuccino</div>
						<p className="text-sm text-muted-foreground mt-2">
							$1,323 total revenue
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Best Margin</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">Mocha</div>
						<p className="text-sm text-muted-foreground mt-2">
							75% profit margin
						</p>
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Product Revenue vs Units Sold</CardTitle>
						<CardDescription>
							Performance comparison across products
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ChartContainer
							config={{
								revenue: {
									label: "Revenue ($)",
									color: "hsl(var(--chart-1))",
								},
								sold: {
									label: "Units Sold",
									color: "hsl(var(--chart-2))",
								},
							}}
							className="h-[300px]"
						>
							<ResponsiveContainer
								width="100%"
								height="100%"
							>
								<ScatterChart data={productData}>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis
										dataKey="sold"
										name="Units Sold"
									/>
									<YAxis
										dataKey="revenue"
										name="Revenue"
									/>
									<ChartTooltip
										content={<ChartTooltipContent />}
										cursor={{ strokeDasharray: "3 3" }}
									/>
									<Scatter
										dataKey="revenue"
										fill="var(--color-revenue)"
									/>
								</ScatterChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Weekly Product Trends</CardTitle>
						<CardDescription>
							Sales trends for top products over time
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ChartContainer
							config={{
								espresso: {
									label: "Espresso",
									color: "hsl(var(--chart-1))",
								},
								cappuccino: {
									label: "Cappuccino",
									color: "hsl(var(--chart-2))",
								},
								latte: {
									label: "Latte",
									color: "hsl(var(--chart-3))",
								},
								americano: {
									label: "Americano",
									color: "hsl(var(--chart-4))",
								},
								mocha: {
									label: "Mocha",
									color: "hsl(var(--chart-5))",
								},
							}}
							className="h-[300px]"
						>
							<ResponsiveContainer
								width="100%"
								height="100%"
							>
								<LineChart data={weeklyProductTrends}>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="week" />
									<YAxis />
									<ChartTooltip content={<ChartTooltipContent />} />
									<Line
										type="monotone"
										dataKey="espresso"
										stroke="var(--color-espresso)"
										strokeWidth={2}
									/>
									<Line
										type="monotone"
										dataKey="cappuccino"
										stroke="var(--color-cappuccino)"
										strokeWidth={2}
									/>
									<Line
										type="monotone"
										dataKey="latte"
										stroke="var(--color-latte)"
										strokeWidth={2}
									/>
									<Line
										type="monotone"
										dataKey="americano"
										stroke="var(--color-americano)"
										strokeWidth={2}
									/>
									<Line
										type="monotone"
										dataKey="mocha"
										stroke="var(--color-mocha)"
										strokeWidth={2}
									/>
								</LineChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Category Performance</CardTitle>
					<CardDescription>
						Revenue and margin analysis by product category
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ChartContainer
						config={{
							revenue: {
								label: "Revenue",
								color: "hsl(var(--chart-1))",
							},
							margin: {
								label: "Margin %",
								color: "hsl(var(--chart-2))",
							},
						}}
						className="h-[300px]"
					>
						<ResponsiveContainer
							width="100%"
							height="100%"
						>
							<BarChart data={categoryPerformance}>
								<CartesianGrid strokeDasharray="3 3" />
								<XAxis dataKey="category" />
								<YAxis yAxisId="left" />
								<YAxis
									yAxisId="right"
									orientation="right"
								/>
								<ChartTooltip content={<ChartTooltipContent />} />
								<Bar
									yAxisId="left"
									dataKey="revenue"
									fill="var(--color-revenue)"
								/>
								<Line
									yAxisId="right"
									dataKey="margin"
									stroke="var(--color-margin)"
									strokeWidth={3}
								/>
							</BarChart>
						</ResponsiveContainer>
					</ChartContainer>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Product Performance Radar</CardTitle>
					<CardDescription>
						Multi-dimensional analysis of top products
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ChartContainer
						config={{
							espresso: {
								label: "Espresso",
								color: "hsl(var(--chart-1))",
							},
						}}
						className="h-[400px]"
					>
						<ResponsiveContainer
							width="100%"
							height="100%"
						>
							<RadarChart
								data={
									productPerformanceRadar[0] ? [productPerformanceRadar[0]] : []
								}
							>
								<PolarGrid />
								<PolarAngleAxis dataKey="product" />
								<PolarRadiusAxis
									angle={90}
									domain={[0, 100]}
								/>
								<Radar
									name="Performance"
									dataKey="sales"
									stroke="var(--color-espresso)"
									fill="var(--color-espresso)"
									fillOpacity={0.3}
								/>
								<ChartTooltip content={<ChartTooltipContent />} />
							</RadarChart>
						</ResponsiveContainer>
					</ChartContainer>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Product Performance Details</CardTitle>
					<CardDescription>
						Comprehensive breakdown of product metrics
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Product</TableHead>
								<TableHead>Units Sold</TableHead>
								<TableHead>Revenue</TableHead>
								<TableHead>Avg. Price</TableHead>
								<TableHead>Profit Margin</TableHead>
								<TableHead>Rating</TableHead>
								<TableHead>Performance</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{productData.map((product, index) => (
								<TableRow key={index}>
									<TableCell className="font-medium">{product.name}</TableCell>
									<TableCell>{product.sold}</TableCell>
									<TableCell>${product.revenue.toLocaleString()}</TableCell>
									<TableCell>
										${(product.revenue / product.sold).toFixed(2)}
									</TableCell>
									<TableCell>{product.margin}%</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<span>{product.rating}</span>
											<div className="flex">
												{[...Array(5)].map((_, i) => (
													<span
														key={i}
														className={
															i < Math.floor(product.rating)
																? "text-yellow-400"
																: "text-gray-300"
														}
													>
														★
													</span>
												))}
											</div>
										</div>
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<Progress
												value={(product.sold / 250) * 100}
												className="w-16 h-2"
											/>
											<Badge
												variant={
													product.sold > 200
														? "default"
														: product.sold > 150
														? "secondary"
														: "outline"
												}
											>
												{product.sold > 200
													? "High"
													: product.sold > 150
													? "Medium"
													: "Low"}
											</Badge>
										</div>
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
