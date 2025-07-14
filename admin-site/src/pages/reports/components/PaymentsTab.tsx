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

interface PaymentsTabProps {
	dateRange: DateRange;
}

interface PaymentsApiData {
	payment_methods: Array<{
		method: string;
		amount: number;
		count: number;
		avg_amount: number;
		percentage: number;
	}>;
	daily_volume: Array<{
		date: string;
		amount: number;
		count: number;
	}>;
	daily_breakdown: Array<{
		date: string;
		total: number;
		cardterminal?: number;
		cash?: number;
		cardonline?: number;
	}>;
	processing_stats: {
		total_attempts: number;
		successful: number;
		failed: number;
		refunded: number;
		success_rate: number;
	};
	order_totals_comparison?: {
		order_grand_total: number;
		order_count: number;
		payment_transaction_total: number;
		difference: number;
	};
}
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
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
	CreditCard,
	Smartphone,
	Banknote,
	TrendingUp,
	TrendingDown,
} from "lucide-react";
import {
	PieChart,
	Pie,
	Cell,
	BarChart,
	Bar,
	ResponsiveContainer,
	XAxis,
	YAxis,
	CartesianGrid,
	Area,
	AreaChart,
} from "recharts";

const paymentData = [
	{
		method: "Credit Card",
		amount: 18500,
		percentage: 65,
		transactions: 456,
		fees: 536.5,
		trend: 5,
	},
	{
		method: "Cash",
		amount: 7200,
		percentage: 25,
		transactions: 234,
		fees: 0,
		trend: -3,
	},
	{
		method: "Mobile Pay",
		amount: 2880,
		percentage: 10,
		transactions: 89,
		fees: 83.52,
		trend: 8,
	},
];

const dailyPaymentTrends = [
	{ date: "Jan 1", creditCard: 1590, cash: 650, mobilePay: 210 },
	{ date: "Jan 2", creditCard: 2080, cash: 800, mobilePay: 320 },
	{ date: "Jan 3", creditCard: 1820, cash: 700, mobilePay: 280 },
	{ date: "Jan 4", creditCard: 2340, cash: 900, mobilePay: 360 },
	{ date: "Jan 5", creditCard: 2665, cash: 1025, mobilePay: 410 },
	{ date: "Jan 6", creditCard: 2470, cash: 950, mobilePay: 380 },
	{ date: "Jan 7", creditCard: 2925, cash: 1125, mobilePay: 450 },
];

const hourlyPaymentData = [
	{ hour: "8AM", creditCard: 245, cash: 89, mobilePay: 34 },
	{ hour: "10AM", creditCard: 312, cash: 156, mobilePay: 67 },
	{ hour: "12PM", creditCard: 445, cash: 234, mobilePay: 123 },
	{ hour: "2PM", creditCard: 389, cash: 178, mobilePay: 89 },
	{ hour: "4PM", creditCard: 298, cash: 134, mobilePay: 56 },
	{ hour: "6PM", creditCard: 356, cash: 167, mobilePay: 78 },
];

const paymentMethodColors = {
	creditCard: "hsl(var(--chart-1))",
	cash: "hsl(var(--chart-2))",
	mobilePay: "hsl(var(--chart-3))",
};

export function PaymentsTab({ dateRange }: PaymentsTabProps) {
	const [data, setData] = useState<PaymentsApiData | null>(null);
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

				const reportData = await reportsService.generatePaymentsReport(
					startDate,
					endDate
				);

				setData(reportData as PaymentsApiData);
			} catch (err) {
				setError("Failed to load payments data");
				console.error("Error fetching payments data:", err);
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

	// Helper function to get API data with fallback to mock data
	const getApiValue = <T,>(apiValue: T | undefined, fallback: T): T => {
		return data !== null && apiValue !== undefined ? apiValue : fallback;
	};

	// Transform payment methods data for charts
	const getPaymentMethodsData = () => {
		if (data?.payment_methods) {
			return data.payment_methods.map(method => ({
				method: method.method,
				amount: method.amount,
				percentage: method.percentage,
				transactions: method.count,
				fees: 0, // Backend doesn't provide fees data
				trend: 0, // Would need historical data for trend
			}));
		}
		return paymentData;
	};

	// Transform daily volume data for charts
	const getDailyVolumeData = () => {
		if (data?.daily_volume) {
			return data.daily_volume.map(day => ({
				date: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
				amount: day.amount,
				count: day.count,
			}));
		}
		return dailyPaymentTrends;
	};

	// Transform daily breakdown data for stacked chart
	const getDailyBreakdownData = () => {
		if (data?.daily_breakdown) {
			return data.daily_breakdown.map(day => ({
				date: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
				cash: day.cash || 0,
				cardTerminal: day.cardterminal || 0,
				cardOnline: day.cardonline || 0,
				total: day.total
			}));
		}
		return dailyPaymentTrends;
	};

	// Get individual payment method totals
	const getPaymentMethodTotal = (methodName: string) => {
		if (data?.payment_methods) {
			const method = data.payment_methods.find(m => 
				m.method.toLowerCase().includes(methodName.toLowerCase())
			);
			return method ? method.amount : 0;
		}
		// Return mock data values
		const mockMethod = paymentData.find(p => 
			p.method.toLowerCase().includes(methodName.toLowerCase())
		);
		return mockMethod ? mockMethod.amount : 0;
	};

	// Get combined card payments (terminal + online)
	const getCombinedCardTotal = () => {
		if (data?.payment_methods) {
			const cardTerminal = data.payment_methods.find(m => 
				m.method.toLowerCase().includes('card_terminal')
			)?.amount || 0;
			const cardOnline = data.payment_methods.find(m => 
				m.method.toLowerCase().includes('card_online')
			)?.amount || 0;
			return cardTerminal + cardOnline;
		}
		// Return mock data values
		return paymentData.find(p => 
			p.method.toLowerCase().includes('credit')
		)?.amount || 0;
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="text-2xl font-bold">Payment Reports</h2>
				<Button>Export Payment Data</Button>
			</div>

			<div className="grid gap-6 md:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Cash</CardTitle>
						<Banknote className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							${getPaymentMethodTotal('cash').toLocaleString()}
						</div>
						<p className="text-xs text-muted-foreground">
							Cash payments
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Credit Card</CardTitle>
						<CreditCard className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							${getCombinedCardTotal().toLocaleString()}
						</div>
						<p className="text-xs text-muted-foreground">
							Terminal + online card payments
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Success Rate</CardTitle>
						<TrendingUp className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{getApiValue(data?.processing_stats.success_rate, 95.2)}%
						</div>
						<p className="text-xs text-muted-foreground">
							Transaction success rate
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
						<Smartphone className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{getApiValue(data?.processing_stats.successful, 1247).toLocaleString()}
						</div>
						<p className="text-xs text-muted-foreground">
							Successful payments
						</p>
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Payment Method Distribution</CardTitle>
						<CardDescription>Revenue breakdown by payment type</CardDescription>
					</CardHeader>
					<CardContent>
						<ChartContainer
							config={{
								creditCard: {
									label: "Credit Card",
									color: paymentMethodColors.creditCard,
								},
								cash: {
									label: "Cash",
									color: paymentMethodColors.cash,
								},
								mobilePay: {
									label: "Mobile Pay",
									color: paymentMethodColors.mobilePay,
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
										data={getPaymentMethodsData()}
										cx="50%"
										cy="50%"
										outerRadius={80}
										fill="#8884d8"
										dataKey="amount"
										label={({ method, percentage }) =>
											`${method}: ${percentage}%`
										}
									>
										{getPaymentMethodsData().map((entry, index) => (
											<Cell
												key={`cell-${index}`}
												fill={Object.values(paymentMethodColors)[index]}
											/>
										))}
									</Pie>
									<ChartTooltip 
										content={({ active, payload }) => {
											if (active && payload && payload.length) {
												const data = payload[0].payload;
												return (
													<div className="bg-white p-3 border rounded shadow-lg">
														<p className="font-semibold">{data.method}</p>
														<p className="text-blue-600">
															Amount: ${data.amount.toFixed(2)}
														</p>
														<p className="text-gray-600">
															Transactions: {data.transactions}
														</p>
														<p className="text-gray-600">
															{data.percentage}% of total
														</p>
													</div>
												);
											}
											return null;
										}}
									/>
								</PieChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Daily Payment Method Breakdown</CardTitle>
						<CardDescription>Payment method usage over time</CardDescription>
					</CardHeader>
					<CardContent>
						<ChartContainer
							config={{
								cash: {
									label: "Cash",
									color: "#0088FE",
								},
								cardTerminal: {
									label: "Card Terminal",
									color: "#00C49F",
								},
								cardOnline: {
									label: "Card Online",
									color: "#FFBB28",
								},
							}}
							className="h-[300px]"
						>
							<ResponsiveContainer
								width="100%"
								height="100%"
							>
								<AreaChart data={getDailyBreakdownData()}>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="date" />
									<YAxis />
									<ChartTooltip 
										content={({ active, payload, label }) => {
											if (active && payload && payload.length) {
												return (
													<div className="bg-white p-3 border rounded shadow-lg">
														<p className="font-semibold">{label}</p>
														{payload.map((entry, index) => (
															<p key={index} style={{ color: entry.color }}>
																{entry.name}: ${entry.value?.toFixed(2)}
															</p>
														))}
														<p className="font-semibold border-t pt-1">
															Total: ${payload.reduce((sum, p) => sum + (p.value || 0), 0).toFixed(2)}
														</p>
													</div>
												);
											}
											return null;
										}}
									/>
									<Area
										type="monotone"
										dataKey="cash"
										stackId="1"
										stroke="#0088FE"
										fill="#0088FE"
									/>
									<Area
										type="monotone"
										dataKey="cardTerminal"
										stackId="1"
										stroke="#00C49F"
										fill="#00C49F"
									/>
									<Area
										type="monotone"
										dataKey="cardOnline"
										stackId="1"
										stroke="#FFBB28"
										fill="#FFBB28"
									/>
								</AreaChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>
			</div>


			<Card>
				<CardHeader>
					<CardTitle>Payment Details</CardTitle>
					<CardDescription>
						Comprehensive payment breakdown with fees and trends
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Payment Method</TableHead>
								<TableHead>Total Amount</TableHead>
								<TableHead>Transactions</TableHead>
								<TableHead>Avg. Transaction</TableHead>
								<TableHead>Processing Fees</TableHead>
								<TableHead>Trend</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{getPaymentMethodsData().map((payment, index) => (
								<TableRow key={index}>
									<TableCell className="font-medium">
										{payment.method}
									</TableCell>
									<TableCell>${payment.amount.toLocaleString()}</TableCell>
									<TableCell>{payment.transactions}</TableCell>
									<TableCell>
										${(payment.amount / payment.transactions).toFixed(2)}
									</TableCell>
									<TableCell>
										{payment.fees > 0 ? `$${payment.fees.toFixed(2)}` : 'N/A'}
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											{payment.trend > 0 ? (
												<TrendingUp className="h-4 w-4 text-green-600" />
											) : payment.trend < 0 ? (
												<TrendingDown className="h-4 w-4 text-red-600" />
											) : null}
											<Badge
												variant={payment.trend > 0 ? "default" : payment.trend < 0 ? "destructive" : "secondary"}
											>
												{payment.trend > 0 ? "+" : ""}
												{payment.trend === 0 ? 'N/A' : `${payment.trend}%`}
											</Badge>
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Transaction Success Rate</CardTitle>
					<CardDescription>
						Payment processing success over time
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-2 gap-6">
						{/* Left side - Chart */}
						<div className="flex items-center justify-center pl-4">
							<ChartContainer
								config={{
									successful: {
										label: "Successful",
										color: "#22c55e",
									},
									failed: {
										label: "Failed", 
										color: "#ef4444",
									},
								}}
								className="h-[250px] w-full"
							>
								<ResponsiveContainer width="100%" height="100%">
									<PieChart>
										<Pie
											data={[
												{
													name: "Successful",
													value: getApiValue(data?.processing_stats.successful, 60),
													fill: "#22c55e"
												},
												{
													name: "Failed",
													value: getApiValue(data?.processing_stats.failed, 3),
													fill: "#ef4444"
												}
											]}
											cx="45%"
											cy="50%"
											outerRadius={70}
											dataKey="value"
											label={({ name, value, percent }) => 
												value > 0 ? `${name}: ${value}` : null
											}
										>
										</Pie>
										<ChartTooltip 
											content={({ active, payload }) => {
												if (active && payload && payload.length) {
													const data = payload[0].payload;
													return (
														<div className="bg-white p-3 border rounded shadow-lg">
															<p className="font-semibold">{data.name} Transactions</p>
															<p className="text-gray-600">
																Count: {data.value}
															</p>
														</div>
													);
												}
												return null;
											}}
										/>
									</PieChart>
								</ResponsiveContainer>
							</ChartContainer>
						</div>
						
						{/* Right side - Text information */}
						<div className="space-y-6">
							<div className="space-y-2">
								<p className="text-sm font-medium text-muted-foreground">Overall Success Rate</p>
								<p className="text-4xl font-bold text-green-600">
									{getApiValue(data?.processing_stats.success_rate, 95.2)}%
								</p>
								<p className="text-sm text-muted-foreground">
									{getApiValue(data?.processing_stats.successful, 60)} successful of{' '}
									{getApiValue(data?.processing_stats.total_attempts, 63)} total attempts
								</p>
							</div>
							
							<div className="space-y-2">
								<p className="text-sm font-medium text-muted-foreground">Failed Transactions</p>
								<p className="text-2xl font-bold text-red-600">
									{getApiValue(data?.processing_stats.failed, 3)}
								</p>
								<p className="text-sm text-muted-foreground">
									{getApiValue(data?.processing_stats.refunded, 0)} refunded transactions
								</p>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
