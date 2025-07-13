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

				const reportData = await reportsService.generatePaymentsReport(
					startDate,
					endDate
				);

				setData(reportData);
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
	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="text-2xl font-bold">Payment Reports</h2>
				<Button>Export Payment Data</Button>
			</div>

			<div className="grid gap-6 md:grid-cols-3">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Credit Card</CardTitle>
						<CreditCard className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">$18,500</div>
						<p className="text-xs text-muted-foreground">
							<span className="text-green-600">+5%</span> from last period
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Cash</CardTitle>
						<Banknote className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">$7,200</div>
						<p className="text-xs text-muted-foreground">
							<span className="text-red-600">-3%</span> from last period
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Mobile Pay</CardTitle>
						<Smartphone className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">$2,880</div>
						<p className="text-xs text-muted-foreground">
							<span className="text-green-600">+8%</span> from last period
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
										data={paymentData}
										cx="50%"
										cy="50%"
										outerRadius={80}
										fill="#8884d8"
										dataKey="amount"
										label={({ method, percentage }) =>
											`${method}: ${percentage}%`
										}
									>
										{paymentData.map((entry, index) => (
											<Cell
												key={`cell-${index}`}
												fill={Object.values(paymentMethodColors)[index]}
											/>
										))}
									</Pie>
									<ChartTooltip content={<ChartTooltipContent />} />
								</PieChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Daily Payment Trends</CardTitle>
						<CardDescription>Payment method usage over time</CardDescription>
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
								<AreaChart data={dailyPaymentTrends}>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="date" />
									<YAxis />
									<ChartTooltip content={<ChartTooltipContent />} />
									<Area
										type="monotone"
										dataKey="creditCard"
										stackId="1"
										stroke="var(--color-creditCard)"
										fill="var(--color-creditCard)"
									/>
									<Area
										type="monotone"
										dataKey="cash"
										stackId="1"
										stroke="var(--color-cash)"
										fill="var(--color-cash)"
									/>
									<Area
										type="monotone"
										dataKey="mobilePay"
										stackId="1"
										stroke="var(--color-mobilePay)"
										fill="var(--color-mobilePay)"
									/>
								</AreaChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Hourly Payment Patterns</CardTitle>
					<CardDescription>
						Payment method preferences throughout the day
					</CardDescription>
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
							<BarChart data={hourlyPaymentData}>
								<CartesianGrid strokeDasharray="3 3" />
								<XAxis dataKey="hour" />
								<YAxis />
								<ChartTooltip content={<ChartTooltipContent />} />
								<Bar
									dataKey="creditCard"
									stackId="a"
									fill="var(--color-creditCard)"
								/>
								<Bar
									dataKey="cash"
									stackId="a"
									fill="var(--color-cash)"
								/>
								<Bar
									dataKey="mobilePay"
									stackId="a"
									fill="var(--color-mobilePay)"
								/>
							</BarChart>
						</ResponsiveContainer>
					</ChartContainer>
				</CardContent>
			</Card>

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
							{paymentData.map((payment, index) => (
								<TableRow key={index}>
									<TableCell className="font-medium">
										{payment.method}
									</TableCell>
									<TableCell>${payment.amount.toLocaleString()}</TableCell>
									<TableCell>{payment.transactions}</TableCell>
									<TableCell>
										${(payment.amount / payment.transactions).toFixed(2)}
									</TableCell>
									<TableCell>${payment.fees.toFixed(2)}</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											{payment.trend > 0 ? (
												<TrendingUp className="h-4 w-4 text-green-600" />
											) : (
												<TrendingDown className="h-4 w-4 text-red-600" />
											)}
											<Badge
												variant={payment.trend > 0 ? "default" : "destructive"}
											>
												{payment.trend > 0 ? "+" : ""}
												{payment.trend}%
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
