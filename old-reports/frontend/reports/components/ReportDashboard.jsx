"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
	TrendingUp,
	TrendingDown,
	DollarSign,
	ShoppingCart,
	Package,
	CreditCard,
	AlertTriangle,
	Info,
	BarChart3,
} from "lucide-react";
import PropTypes from "prop-types";

const ReportDashboard = ({ data, isLoading, error }) => {
	// --- ORIGINAL LOGIC (UNCHANGED) ---
	const calculateCorrectSuccessRate = (method) => {
		if (!method || typeof method.transaction_count !== "number") return 0;
		const failedCount = method.failed_count || 0;
		if (method.transaction_count === 0) return 0;
		const successRate =
			((method.transaction_count - failedCount) / method.transaction_count) *
			100;
		return Math.round(successRate * 100) / 100;
	};

	const formatCurrency = (amount) => {
		const numAmount = Number(amount);
		if (isNaN(numAmount)) {
			return "$ --";
		}
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
			minimumFractionDigits: 2,
		}).format(numAmount);
	};

	//eslint-disable-next-line
	const GrowthIndicator = ({ value }) => {
		if (value === undefined || value === null) {
			return <span className="text-xs text-muted-foreground">-</span>;
		}

		const numValue = Number(value);
		if (isNaN(numValue)) {
			return <span className="text-xs text-muted-foreground">-</span>;
		}

		const isPositive = numValue >= 0;
		return (
			<Badge
				variant={isPositive ? "default" : "destructive"}
				className="text-xs"
			>
				{isPositive ? (
					<TrendingUp className="h-3 w-3 mr-1" />
				) : (
					<TrendingDown className="h-3 w-3 mr-1" />
				)}
				{Math.abs(numValue).toFixed(1)}%
			</Badge>
		);
	};

	const SuccessRateTooltip = () => (
		<div className="group relative inline-block ml-1">
			<Info className="h-4 w-4 text-muted-foreground cursor-help" />
			<div className="opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-300 absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-popover border rounded-md shadow-md z-10">
				<p className="text-xs text-popover-foreground">
					Success rate excludes refunded and voided transactions. Only failed
					transactions count against the success rate.
				</p>
			</div>
		</div>
	);
	// --- END OF ORIGINAL LOGIC ---

	// Loading State
	if (isLoading) {
		return (
			<div className="p-6 space-y-6">
				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					{[...Array(3)].map((_, i) => (
						<Card key={i}>
							<CardHeader className="pb-2">
								<Skeleton className="h-4 w-20" />
							</CardHeader>
							<CardContent>
								<Skeleton className="h-8 w-24 mb-2" />
								<Skeleton className="h-3 w-16" />
							</CardContent>
						</Card>
					))}
				</div>
				<Card>
					<CardHeader>
						<Skeleton className="h-6 w-32" />
					</CardHeader>
					<CardContent>
						<Skeleton className="h-32 w-full" />
					</CardContent>
				</Card>
			</div>
		);
	}

	// Error State
	if (error) {
		return (
			<div className="flex flex-col items-center justify-center h-96 text-center">
				<AlertTriangle className="h-12 w-12 text-destructive mb-4" />
				<h3 className="text-lg font-semibold mb-2">Error Loading Dashboard</h3>
				<p className="text-muted-foreground">{error}</p>
			</div>
		);
	}

	// No Data State
	if (
		!data ||
		!data.today ||
		!data.this_month ||
		!data.this_year ||
		!data.top_products ||
		!data.payment_methods
	) {
		return (
			<div className="flex flex-col items-center justify-center h-96 text-center">
				<BarChart3 className="h-16 w-16 text-muted-foreground mb-4" />
				<h3 className="text-xl font-semibold mb-2">No Data Available</h3>
				<p className="text-muted-foreground">
					No summary data is available for the dashboard yet.
				</p>
			</div>
		);
	}

	const totalPaymentAmount = data.payment_methods.reduce(
		(sum, method) => sum + method.total_amount,
		0
	);

	return (
		<div className="p-6 space-y-8">
			{/* Sales Overview Section */}
			<motion.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.1 }}
			>
				<div className="flex items-center gap-2 mb-6">
					<DollarSign className="h-6 w-6 text-primary" />
					<h2 className="text-2xl font-bold">Sales Overview</h2>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					{/* Today Card */}
					<Card className="relative overflow-hidden">
						<CardHeader className="pb-2">
							<div className="flex items-center justify-between">
								<CardTitle className="text-sm font-medium text-muted-foreground">
									Today
								</CardTitle>
								<GrowthIndicator value={data.today.growth} />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold">
								{formatCurrency(data.today.sales)}
							</div>
							<div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
								<ShoppingCart className="h-4 w-4" />
								{data.today.orders} orders
							</div>
						</CardContent>
						<div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-blue-500/10 to-transparent rounded-bl-full" />
					</Card>

					{/* This Month Card */}
					<Card className="relative overflow-hidden">
						<CardHeader className="pb-2">
							<div className="flex items-center justify-between">
								<CardTitle className="text-sm font-medium text-muted-foreground">
									This Month
								</CardTitle>
								<GrowthIndicator value={data.this_month.growth} />
							</div>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold">
								{formatCurrency(data.this_month.sales)}
							</div>
							<div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
								<ShoppingCart className="h-4 w-4" />
								{data.this_month.orders} orders
							</div>
						</CardContent>
						<div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-green-500/10 to-transparent rounded-bl-full" />
					</Card>

					{/* This Year Card */}
					<Card className="relative overflow-hidden">
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">
								This Year ({data.this_year.year})
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold">
								{formatCurrency(data.this_year.sales)}
							</div>
							<div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
								<ShoppingCart className="h-4 w-4" />
								{data.this_year.orders} orders
							</div>
						</CardContent>
						<div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-purple-500/10 to-transparent rounded-bl-full" />
					</Card>
				</div>
			</motion.div>

			{/* Top Products Section */}
			<motion.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.2 }}
			>
				<div className="flex items-center gap-2 mb-6">
					<Package className="h-6 w-6 text-primary" />
					<h2 className="text-2xl font-bold">Top Products</h2>
					<Badge variant="secondary">by Revenue</Badge>
				</div>

				<Card>
					<CardContent className="p-0">
						{data.top_products.length > 0 ? (
							<div className="overflow-x-auto">
								<table className="w-full">
									<thead className="border-b bg-muted/50">
										<tr>
											<th className="text-left p-4 font-medium">Product</th>
											<th className="text-left p-4 font-medium">Category</th>
											<th className="text-right p-4 font-medium">Sold</th>
											<th className="text-right p-4 font-medium">Revenue</th>
										</tr>
									</thead>
									<tbody className="divide-y">
										{data.top_products.map((product, index) => (
											<motion.tr
												key={product.product_id}
												initial={{ opacity: 0, x: -20 }}
												animate={{ opacity: 1, x: 0 }}
												transition={{ delay: 0.1 * index }}
												className="hover:bg-muted/50 transition-colors"
											>
												<td className="p-4">
													<div
														className="font-medium truncate max-w-[200px]"
														title={product.product_name}
													>
														{product.product_name}
													</div>
												</td>
												<td className="p-4">
													<Badge variant="outline">
														{product.category || "Uncategorized"}
													</Badge>
												</td>
												<td className="p-4 text-right font-medium">
													{product.quantity_sold}
												</td>
												<td className="p-4 text-right font-bold text-primary">
													{formatCurrency(product.revenue)}
												</td>
											</motion.tr>
										))}
									</tbody>
								</table>
							</div>
						) : (
							<div className="text-center py-12">
								<Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
								<p className="text-muted-foreground">
									No product data available for this period.
								</p>
							</div>
						)}
					</CardContent>
				</Card>
			</motion.div>

			{/* Payment Methods Section */}
			<motion.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.3 }}
			>
				<div className="flex items-center gap-2 mb-6">
					<CreditCard className="h-6 w-6 text-primary" />
					<h2 className="text-2xl font-bold">Payment Methods</h2>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					{/* Distribution Card */}
					<Card>
						<CardHeader>
							<CardTitle className="text-lg">Distribution by Amount</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							{data.payment_methods.length > 0 ? (
								data.payment_methods.map((method, index) => {
									const percentage =
										totalPaymentAmount > 0
											? (method.total_amount / totalPaymentAmount) * 100
											: 0;
									return (
										<motion.div
											key={method.payment_method}
											initial={{ opacity: 0, x: -20 }}
											animate={{ opacity: 1, x: 0 }}
											transition={{ delay: 0.1 * index }}
											className="space-y-2"
										>
											<div className="flex justify-between items-center">
												<span className="font-medium">
													{method.payment_method}
												</span>
												<span className="text-sm text-muted-foreground">
													{formatCurrency(method.total_amount)}
												</span>
											</div>
											<div className="space-y-1">
												<Progress
													value={percentage}
													className="h-2"
												/>
												<div className="text-xs text-muted-foreground text-right">
													{percentage.toFixed(1)}%
												</div>
											</div>
										</motion.div>
									);
								})
							) : (
								<div className="text-center py-8">
									<CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
									<p className="text-muted-foreground">
										No payment data available.
									</p>
								</div>
							)}
						</CardContent>
					</Card>

					{/* Success Rate Card */}
					<Card>
						<CardHeader>
							<CardTitle className="text-lg flex items-center">
								Success Rate
								<SuccessRateTooltip />
							</CardTitle>
						</CardHeader>
						<CardContent>
							{data.payment_methods.length > 0 ? (
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
									{data.payment_methods.map((method, index) => (
										<motion.div
											key={`success-${method.payment_method}`}
											initial={{ opacity: 0, scale: 0.9 }}
											animate={{ opacity: 1, scale: 1 }}
											transition={{ delay: 0.1 * index }}
											className="bg-muted/50 rounded-lg p-4 text-center border"
										>
											<div className="text-2xl font-bold text-primary mb-1">
												{calculateCorrectSuccessRate(method)}%
											</div>
											<div className="text-sm font-medium mb-1">
												{method.payment_method}
											</div>
											<div className="text-xs text-muted-foreground">
												{method.transaction_count} transactions
											</div>
										</motion.div>
									))}
								</div>
							) : (
								<div className="text-center py-8">
									<BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
									<p className="text-muted-foreground">
										No payment data available.
									</p>
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</motion.div>
		</div>
	);
};

ReportDashboard.propTypes = {
	data: PropTypes.shape({
		today: PropTypes.shape({
			sales: PropTypes.number.isRequired,
			orders: PropTypes.number.isRequired,
			growth: PropTypes.number, // Optional number
		}), // .isRequired removed because the entire 'data' prop is optional and handled
		this_month: PropTypes.shape({
			sales: PropTypes.number.isRequired,
			orders: PropTypes.number.isRequired,
			growth: PropTypes.number, // Optional number
		}), // .isRequired removed for the same reason
		this_year: PropTypes.shape({
			year: PropTypes.string.isRequired,
			sales: PropTypes.number.isRequired,
			orders: PropTypes.number.isRequired,
		}), // .isRequired removed
		top_products: PropTypes.arrayOf(
			PropTypes.shape({
				product_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
					.isRequired,
				product_name: PropTypes.string.isRequired,
				category: PropTypes.string, // Optional string
				quantity_sold: PropTypes.number.isRequired,
				revenue: PropTypes.number.isRequired,
			})
		), // .isRequired removed
		payment_methods: PropTypes.arrayOf(
			PropTypes.shape({
				payment_method: PropTypes.string.isRequired,
				transaction_count: PropTypes.number.isRequired,
				total_amount: PropTypes.number.isRequired,
				success_rate: PropTypes.number, // Optional number
				refund_count: PropTypes.number, // Optional number
				void_count: PropTypes.number, // Optional number
				failed_count: PropTypes.number, // Optional number
			})
		), // .isRequired removed
	}), // The 'data' prop itself is optional as handled by the component's null checks
	isLoading: PropTypes.bool, // Optional boolean
	error: PropTypes.string, // Optional string
};

// If you want to set default values for props (though your component handles undefined gracefully)
ReportDashboard.defaultProps = {
	data: null, // Or a default structure if it makes sense for your app
	isLoading: false,
	error: null,
};

export default ReportDashboard;
