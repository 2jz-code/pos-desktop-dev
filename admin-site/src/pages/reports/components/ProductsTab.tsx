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
} from "recharts";
import {
	Package,
	DollarSign,
	TrendingUp,
	Star,
	Download,
	RefreshCw,
	BarChart3,
	ShoppingBag,
	Layers,
	Award,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import reportsService from "@/services/api/reportsService";
import { getCategories } from "@/services/api/categoryService";
import { ExportDialog } from "@/components/reports/ExportDialog";
import { useLocation as useStoreLocation } from "@/contexts/LocationContext";

interface Category {
	id: number;
	name: string;
}

interface ProductsData {
	top_products: Array<{
		name: string;
		id: number;
		revenue: number;
		sold: number;
		avg_price: number;
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
	const { selectedLocationId } = useStoreLocation();
	const [data, setData] = useState<ProductsData | null>(null);
	const [loading, setLoading] = useState(false);
	const [exportDialogOpen, setExportDialogOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [categories, setCategories] = useState<Category[]>([]);
	const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
	const [limit, setLimit] = useState<number>(10);
	const [sortBy, setSortBy] = useState<"revenue" | "quantity" | "margin">(
		"revenue"
	);
	const [trendPeriod, setTrendPeriod] = useState<
		"auto" | "daily" | "weekly" | "monthly"
	>("auto");

	const fetchCategories = async () => {
		try {
			const response = await getCategories();
			setCategories(response.data || []);
		} catch (err) {
			console.error("Error fetching categories:", err);
		}
	};

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
				...(categoryFilter && { category_id: categoryFilter }),
				...(selectedLocationId && { location_id: selectedLocationId }),
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

	// Compute sorted products based on sortBy selection
	const sortedTopProducts = data?.top_products
		? [...data.top_products].sort((a, b) => {
				if (sortBy === "revenue") {
					return b.revenue - a.revenue;
				} else if (sortBy === "quantity") {
					return b.sold - a.sold;
				}
				// For margin, keep original order until we implement margin calculation
				return 0;
		  })
		: [];

	// Get dynamic title and description based on sort
	const getTopProductsTitle = () => {
		if (sortBy === "revenue") return "Top Products by Revenue";
		if (sortBy === "quantity") return "Top Products by Quantity";
		if (sortBy === "margin") return "Top Products by Margin (Coming Soon)";
		return "Top Products";
	};

	const getTopProductsDescription = () => {
		if (sortBy === "revenue")
			return "Highest earning products in the selected period";
		if (sortBy === "quantity") return "Most frequently sold products";
		if (sortBy === "margin") return "Profit margin data will be available soon";
		return "Product performance ranking";
	};

	useEffect(() => {
		fetchCategories();
	}, []);

	useEffect(() => {
		fetchProductsData();
	}, [dateRange, categoryFilter, limit, trendPeriod, selectedLocationId]);

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
						value={categoryFilter?.toString() || "all"}
						onValueChange={(value) =>
							setCategoryFilter(value === "all" ? null : Number(value))
						}
					>
						<SelectTrigger className="w-40">
							<SelectValue placeholder="All Categories" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Categories</SelectItem>
							{categories.results?.map((category) => (
								<SelectItem
									key={category.id}
									value={category.id.toString()}
								>
									{category.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
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
			<div>
				<div className="flex items-center gap-2 mb-4">
					<div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
						<ShoppingBag className="h-5 w-5 text-blue-600 dark:text-blue-400" />
					</div>
					<div>
						<h3 className="text-lg font-semibold text-foreground">Product Performance Metrics</h3>
						<p className="text-sm text-muted-foreground">Overview of product sales and revenue for the selected period</p>
					</div>
				</div>
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
					<Card className="border-border bg-card">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">
								Products Sold
							</CardTitle>
							<div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
								<Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-foreground">
								{data?.summary?.total_products?.toLocaleString() || "0"}
							</div>
							<p className="text-xs text-muted-foreground mt-1">
								Unique SKUs with sales
							</p>
						</CardContent>
					</Card>

					<Card className="border-border bg-card">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
							<div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
								<DollarSign className="h-4 w-4 text-purple-600 dark:text-purple-400" />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-foreground">
								${data?.summary?.total_revenue?.toLocaleString() || "0"}
							</div>
							<p className="text-xs text-muted-foreground mt-1">From product sales</p>
						</CardContent>
					</Card>

					<Card className="border-border bg-card">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">Units Sold</CardTitle>
							<div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
								<TrendingUp className="h-4 w-4 text-orange-600 dark:text-orange-400" />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-foreground">
								{data?.summary?.total_units_sold?.toLocaleString() || "0"}
							</div>
							<p className="text-xs text-muted-foreground mt-1">Total quantity</p>
						</CardContent>
					</Card>

					<Card className="border-border bg-card">
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">
								Avg Revenue/Product
							</CardTitle>
							<div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
								<Star className="h-4 w-4 text-green-600 dark:text-green-400" />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold text-foreground">
								$
								{(
									(data?.summary?.total_revenue || 0) /
									(data?.summary?.total_products || 1)
								).toFixed(2)}
							</div>
							<p className="text-xs text-muted-foreground mt-1">Per product</p>
						</CardContent>
					</Card>
				</div>
			</div>

			{/* Top Products Table */}
			<Card className="border-border bg-card">
				<CardHeader>
					<div className="flex items-center gap-2">
						<div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
							<Award className="h-4 w-4 text-amber-600 dark:text-amber-400" />
						</div>
						<div>
							<CardTitle className="text-foreground">{getTopProductsTitle()}</CardTitle>
							<CardDescription>{getTopProductsDescription()}</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					{sortBy === "margin" ? (
						<div className="flex items-center justify-center py-8">
							<p className="text-sm text-muted-foreground">
								Margin calculation coming soon. Switch to Revenue or Quantity
								sorting.
							</p>
						</div>
					) : (
						<div className="space-y-3">
							{sortedTopProducts?.map((product, index) => {
								const rankBadgeStyles =
									index === 0 ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700" :
									index === 1 ? "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600" :
									index === 2 ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-700" :
									"bg-muted text-muted-foreground border-border";

								return (
									<div
										key={product.id}
										className="flex items-center justify-between p-4 border border-border rounded-lg hover:shadow-sm transition-shadow bg-muted/20"
									>
										<div className="flex items-center space-x-4 flex-1 min-w-0">
											<Badge variant="outline" className={`text-sm font-semibold ${rankBadgeStyles} flex-shrink-0`}>
												#{index + 1}
											</Badge>
											<div className="flex-1 min-w-0">
												<p className="font-semibold text-foreground">{product.name}</p>
												<p className="text-sm text-muted-foreground mt-0.5">
													{product.sold} units • Avg: ${product.avg_price.toFixed(2)}
												</p>
											</div>
										</div>
										<div className="text-right ml-4">
											<p className="font-bold text-lg text-foreground">
												{sortBy === "quantity"
													? `${product.sold}`
													: `$${product.revenue.toLocaleString()}`}
											</p>
											<p className="text-xs text-muted-foreground">
												{sortBy === "quantity" ? "units" : "revenue"}
											</p>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</CardContent>
			</Card>

			{/* Category Performance */}
			<Card className="border-border bg-card">
				<CardHeader>
					<div className="flex items-center gap-2">
						<div className="p-2 bg-teal-50 dark:bg-teal-900/20 rounded-lg">
							<Layers className="h-4 w-4 text-teal-600 dark:text-teal-400" />
						</div>
						<div>
							<CardTitle className="text-foreground">Category Performance</CardTitle>
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
						<BarChart data={data?.category_performance || []}>
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
								fill="#14b8a6"
								radius={[4, 4, 0, 0]}
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
					const actualPeriod =
						data?.filters?.actual_period ||
						(trendPeriod === "auto" ? "daily" : trendPeriod);
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
						<Card className="border-border bg-card">
							<CardHeader>
								<div className="flex items-center gap-2">
									<div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
										<BarChart3 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
									</div>
									<div>
										<CardTitle className="text-foreground">Product Trends</CardTitle>
										<CardDescription>
											Sales trends for top products over time ({actualPeriod})
										</CardDescription>
									</div>
								</div>
							</CardHeader>
							<CardContent>
								<ResponsiveContainer
									width="100%"
									height={400}
								>
									<LineChart
										key={actualPeriod}
										data={unifiedData}
									>
										<CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
										<XAxis
											dataKey="date"
											tickFormatter={(value) =>
												format(reportsService.parseLocalDate(value), dateFormat)
											}
											className="text-muted-foreground"
										/>
										<YAxis className="text-muted-foreground" />
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


			{/* Export Dialog */}
			<ExportDialog
				open={exportDialogOpen}
				onOpenChange={setExportDialogOpen}
				reportType="products"
				defaultStartDate={dateRange?.from}
				defaultEndDate={dateRange?.to}
				defaultFilters={{
					category_id: categoryFilter || undefined,
					limit: limit,
				}}
			/>
		</div>
	);
}
