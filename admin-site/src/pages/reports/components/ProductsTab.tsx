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
import { Badge } from "@/components/ui/badge";
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
} from "recharts";
import {
	Package,
	DollarSign,
	TrendingUp,
	Star,
	Download,
	RefreshCw,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import reportsService from "@/services/api/reportsService";
import { ExportDialog } from "@/components/reports/ExportDialog";

interface ProductsData {
	top_products: Array<{
		name: string;
		id: number;
		revenue: number;
		sold: number;
		avg_price: number;
	}>;
	best_sellers: Array<{
		name: string;
		id: number;
		sold: number;
		revenue: number;
	}>;
	category_performance: Array<{
		category: string;
		revenue: number;
		units_sold: number;
		unique_products: number;
	}>;
	product_trends: {
		[productName: string]: Array<{
			date: string;
			sold: number;
		}>;
	};
	summary: {
		total_products: number;
		total_revenue: number;
		total_units_sold: number;
	};
	filters?: {
		category_id?: number;
		limit: number;
		trend_period: string;
		actual_period: string;
	};
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"];

interface ProductsTabProps {
	dateRange: DateRange | undefined;
}

export function ProductsTab({ dateRange }: ProductsTabProps) {
	const [data, setData] = useState<ProductsData | null>(null);
	const [loading, setLoading] = useState(false);
	const [exportDialogOpen, setExportDialogOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [categoryFilter, setCategoryFilter] = useState<string>("all");
	const [limit, setLimit] = useState<number>(10);
	const [sortBy, setSortBy] = useState<"revenue" | "quantity" | "margin">(
		"revenue"
	);
	const [trendPeriod, setTrendPeriod] = useState<"auto" | "daily" | "weekly" | "monthly">("auto");

	const fetchProductsData = async () => {
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

			const filters = {
				limit: limit,
				trend_period: trendPeriod,
				...(categoryFilter !== "all" && { category_id: categoryFilter }),
			};

			const productsData = await reportsService.generateProductsReport(
				startDate,
				endDate,
				filters
			);
			setData(productsData as ProductsData);
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchProductsData();
	}, [dateRange, categoryFilter, limit, sortBy, trendPeriod]);

	if (loading) {
		return (
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="space-y-1">
						<h3 className="text-2xl font-semibold tracking-tight">
							Product Reports
						</h3>
						<p className="text-sm text-muted-foreground">
							Product performance and inventory insights
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
								Error loading products data: {error}
							</p>
							<Button
								onClick={fetchProductsData}
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
						Product Reports
					</h3>
					<p className="text-sm text-muted-foreground">
						Product performance and inventory insights
					</p>
				</div>
				<div className="flex items-center space-x-2">
					<Select
						value={sortBy}
						onValueChange={(value: "revenue" | "quantity" | "margin") =>
							setSortBy(value)
						}
					>
						<SelectTrigger className="w-32">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="revenue">Revenue</SelectItem>
							<SelectItem value="quantity">Quantity</SelectItem>
							<SelectItem value="margin">Margin</SelectItem>
						</SelectContent>
					</Select>
					<Select
						value={trendPeriod}
						onValueChange={(value: "auto" | "daily" | "weekly" | "monthly") =>
							setTrendPeriod(value)
						}
					>
						<SelectTrigger className="w-28">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="auto">Auto</SelectItem>
							<SelectItem value="daily">Daily</SelectItem>
							<SelectItem value="weekly">Weekly</SelectItem>
							<SelectItem value="monthly">Monthly</SelectItem>
						</SelectContent>
					</Select>
					<Select
						value={limit.toString()}
						onValueChange={(value) => setLimit(Number.parseInt(value))}
					>
						<SelectTrigger className="w-20">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="10">10</SelectItem>
							<SelectItem value="25">25</SelectItem>
							<SelectItem value="50">50</SelectItem>
							<SelectItem value="100">100</SelectItem>
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
						<CardTitle className="text-sm font-medium">
							Total Products
						</CardTitle>
						<Package className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{data?.summary?.total_products?.toLocaleString() || "0"}
						</div>
						<p className="text-xs text-muted-foreground">
							Unique products sold
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
						<DollarSign className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							${data?.summary?.total_revenue?.toLocaleString() || "0"}
						</div>
						<p className="text-xs text-muted-foreground">From product sales</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Units Sold</CardTitle>
						<TrendingUp className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{data?.summary?.total_units_sold?.toLocaleString() || "0"}
						</div>
						<p className="text-xs text-muted-foreground">Total quantity</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Avg Revenue/Product
						</CardTitle>
						<Star className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							$
							{(
								(data?.summary?.total_revenue || 0) /
								(data?.summary?.total_products || 1)
							).toFixed(2)}
						</div>
						<p className="text-xs text-muted-foreground">Per product</p>
					</CardContent>
				</Card>
			</div>

			{/* Top Products Tables */}
			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Top Products by Revenue</CardTitle>
						<CardDescription>
							Highest earning products in the selected period
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{data?.top_products?.map((product, index) => (
								<div
									key={product.id}
									className="flex items-center justify-between"
								>
									<div className="flex items-center space-x-4">
										<Badge variant="secondary">{index + 1}</Badge>
										<div>
											<p className="font-medium">{product.name}</p>
											<p className="text-sm text-muted-foreground">
												{product.sold} units • Avg: $
												{product.avg_price.toFixed(2)}
											</p>
										</div>
									</div>
									<div className="text-right">
										<p className="font-medium">
											${product.revenue.toLocaleString()}
										</p>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Best Sellers by Quantity</CardTitle>
						<CardDescription>Most frequently sold products</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{data?.best_sellers?.map((product, index) => (
								<div
									key={product.id}
									className="flex items-center justify-between"
								>
									<div className="flex items-center space-x-4">
										<Badge variant="secondary">{index + 1}</Badge>
										<div>
											<p className="font-medium">{product.name}</p>
											<p className="text-sm text-muted-foreground">
												${product.revenue.toLocaleString()} revenue
											</p>
										</div>
									</div>
									<div className="text-right">
										<p className="font-medium">{product.sold} units</p>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Category Performance */}
			<Card>
				<CardHeader>
					<CardTitle>Category Performance</CardTitle>
					<CardDescription>
						Revenue breakdown by product category
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ResponsiveContainer
						width="100%"
						height={300}
					>
						<BarChart data={data?.category_performance || []}>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis
								dataKey="category"
								angle={-45}
								textAnchor="end"
								height={80}
							/>
							<YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
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

			{/* Product Trends */}
			{data?.product_trends &&
				Object.keys(data.product_trends).length > 0 &&
				(() => {
					// Create a unified dataset with all dates and product data
					const allDates = new Set<string>();
					const productNames = Object.keys(data.product_trends);

					// Collect all unique dates
					productNames.forEach((productName) => {
						data.product_trends[productName].forEach((trend) => {
							allDates.add(trend.date);
						});
					});

					// Sort dates
					const sortedDates = Array.from(allDates).sort();

					// Create unified data structure
					const unifiedData = sortedDates.map((date) => {
						const dataPoint: any = { date };
						productNames.forEach((productName) => {
							const trend = data.product_trends[productName].find(
								(t) => t.date === date
							);
							dataPoint[productName] = trend ? trend.sold : 0;
						});
						return dataPoint;
					});

					// Determine date format based on current trend period state
					const actualPeriod = data?.filters?.actual_period || (trendPeriod === "auto" ? "daily" : trendPeriod);
					const getDateFormat = (period: string) => {
						switch (period) {
							case "weekly":
								return "MMM dd"; // Week starting date
							case "monthly":
								return "MMM yyyy"; // Month and year
							case "daily":
							default:
								return "MMM dd"; // Month and day
						}
					};

					const getTooltipFormat = (period: string) => {
						switch (period) {
							case "weekly":
								return "MMM dd, yyyy"; // Full date for week start
							case "monthly":
								return "MMMM yyyy"; // Full month name and year
							case "daily":
							default:
								return "MMM dd, yyyy"; // Full date
						}
					};

					const dateFormat = getDateFormat(actualPeriod);
					const tooltipFormat = getTooltipFormat(actualPeriod);

					return (
						<Card>
							<CardHeader>
								<CardTitle>Product Trends</CardTitle>
								<CardDescription>
									Sales trends for top products over time ({actualPeriod})
								</CardDescription>
							</CardHeader>
							<CardContent>
								<ResponsiveContainer
									width="100%"
									height={400}
								>
									<LineChart key={actualPeriod} data={unifiedData}>
										<CartesianGrid strokeDasharray="3 3" />
										<XAxis
											dataKey="date"
											tickFormatter={(value) =>
												format(reportsService.parseLocalDate(value), dateFormat)
											}
										/>
										<YAxis />
										<Tooltip
											labelFormatter={(value) =>
												format(
													reportsService.parseLocalDate(value),
													tooltipFormat
												)
											}
										/>
										{productNames.map((productName, index) => (
											<Line
												key={productName}
												type="monotone"
												dataKey={productName}
												stroke={COLORS[index % COLORS.length]}
												strokeWidth={2}
												name={productName}
												connectNulls={false}
											/>
										))}
									</LineChart>
								</ResponsiveContainer>
							</CardContent>
						</Card>
					);
				})()}

			{/* Category Distribution */}
			<Card>
				<CardHeader>
					<CardTitle>Category Distribution</CardTitle>
					<CardDescription>Revenue share by category</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 md:grid-cols-2">
						<ResponsiveContainer
							width="100%"
							height={300}
						>
							<PieChart>
								<Pie
									data={data?.category_performance || []}
									cx="50%"
									cy="50%"
									labelLine={false}
									label={({ category, revenue }) =>
										`${category}: $${revenue.toLocaleString()}`
									}
									outerRadius={80}
									fill="#8884d8"
									dataKey="revenue"
								>
									{data?.category_performance?.map((entry, index) => (
										<Cell
											key={`cell-${index}`}
											fill={COLORS[index % COLORS.length]}
										/>
									))}
								</Pie>
								<Tooltip
									formatter={(value: number) => `$${value.toLocaleString()}`}
								/>
							</PieChart>
						</ResponsiveContainer>
						<div className="space-y-4">
							{data?.category_performance?.map((category, index) => (
								<div
									key={category.category}
									className="flex items-center justify-between p-3 border rounded-lg"
								>
									<div className="flex items-center space-x-3">
										<div
											className="w-4 h-4 rounded-full"
											style={{ backgroundColor: COLORS[index % COLORS.length] }}
										/>
										<div>
											<p className="font-medium">{category.category}</p>
											<p className="text-sm text-muted-foreground">
												{category.unique_products} products
											</p>
										</div>
									</div>
									<div className="text-right">
										<p className="font-medium">
											${category.revenue.toLocaleString()}
										</p>
										<p className="text-sm text-muted-foreground">
											{category.units_sold} units
										</p>
									</div>
								</div>
							))}
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Export Dialog */}
			<ExportDialog
				open={exportDialogOpen}
				onOpenChange={setExportDialogOpen}
				reportType="products"
				defaultStartDate={dateRange?.from}
				defaultEndDate={dateRange?.to}
				defaultFilters={{
					category_id: categoryFilter !== "all" ? categoryFilter : undefined,
					limit: limit,
				}}
			/>
		</div>
	);
}
