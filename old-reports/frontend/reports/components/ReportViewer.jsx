// pos_and_backend/pos/pages/reports/components/ReportViewer.jsx
import { useRef, useState, Fragment } from "react"; // Add useState and Fragment
import {
	BarChart,
	Bar,
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	Legend,
	ResponsiveContainer,
	PieChart,
	Pie,
	Cell,
} from "recharts";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import PropTypes from "prop-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
	ArrowLeft,
	Download,
	FileText,
	AlertTriangle,
	TrendingUp,
	Package,
	CreditCard,
	Clock,
	DollarSign,
	ChevronDown,
	ChevronRight,
	Banknote as SolidBanknotesIcon,
	TicketIcon as SolidTicketIcon,
} from "lucide-react";
import { CreditCardIcon as CreditCardIconOutline } from "@heroicons/react/24/outline";

// +++ ADD a helper to display payment methods, adapted from PaymentDetails.jsx +++
const GetPaymentMethodDisplay = ({ method }) => {
	const baseClasses = "inline-flex items-center gap-1.5 text-xs";
	switch (method?.toLowerCase()) {
		case "cash":
			return (
				<span className={`${baseClasses} font-medium text-green-700`}>
					<SolidBanknotesIcon className="h-4 w-4 text-green-500" /> Cash
				</span>
			);
		case "credit":
			return (
				<span className={`${baseClasses} font-medium text-blue-700`}>
					<CreditCardIconOutline className="h-4 w-4 text-blue-500" /> Credit
					Card
				</span>
			);
		case "clover_terminal":
			return (
				<span className={`${baseClasses} font-medium text-teal-700`}>
					<CreditCardIconOutline className="h-4 w-4 text-teal-500" /> Clover
					Terminal
				</span>
			);
		default:
			return (
				<span className={`${baseClasses} font-medium text-slate-600`}>
					<SolidTicketIcon className="h-4 w-4 text-slate-400" />
					{method ? method.replace("_", " ").toUpperCase() : "N/A"}
				</span>
			);
	}
};
GetPaymentMethodDisplay.propTypes = { method: PropTypes.string };

/**
 * ReportViewer Component
 *
 * Displays generated report data with charts and tables. Includes export functionality.
 * Updated to align with new backend data structures from reports/utils.py.
 */
const ReportViewer = ({ data, type, onBack }) => {
	const reportRef = useRef(null);
	const [expandedRows, setExpandedRows] = useState(new Set());

	// +++ ADD Toggle function for rows +++
	const toggleRow = (index) => {
		const newExpandedRows = new Set(expandedRows);
		if (newExpandedRows.has(index)) {
			newExpandedRows.delete(index);
		} else {
			newExpandedRows.add(index);
		}
		setExpandedRows(newExpandedRows);
	};
	const formatCurrency = (amount) => {
		const numAmount = Number(amount);
		if (isNaN(numAmount) || amount === null || amount === undefined) {
			return "$ --";
		}
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
			minimumFractionDigits: 2,
		}).format(numAmount);
	};

	const formatDate = (dateString) => {
		if (!dateString) return "N/A";
		try {
			const date = new Date(
				dateString.includes("T") ? dateString : dateString + "T00:00:00"
			);
			if (isNaN(date.getTime())) return dateString;
			return date.toLocaleDateString("en-US", {
				year: "numeric",
				month: "short",
				day: "numeric",
			});
			//eslint-disable-next-line
		} catch (e) {
			return dateString;
		}
	};

	const exportAsPDF = async () => {
		if (!reportRef.current) return;
		try {
			const canvas = await html2canvas(reportRef.current, {
				scale: 2,
				logging: false,
				useCORS: true,
			});
			const imgData = canvas.toDataURL("image/png");
			const pdf = new jsPDF("p", "mm", "a4");
			const pdfWidth = pdf.internal.pageSize.getWidth();
			const pdfHeight = pdf.internal.pageSize.getHeight();
			const imgWidth = canvas.width;
			const imgHeight = canvas.height;
			const ratio = Math.min(
				(pdfWidth - 20) / imgWidth,
				(pdfHeight - 40) / imgHeight
			);
			const imgX = (pdfWidth - imgWidth * ratio) / 2;
			const imgY = 20;

			pdf.setFontSize(16);
			pdf.text(getReportTitle(type), pdfWidth / 2, 15, { align: "center" });

			pdf.addImage(
				imgData,
				"PNG",
				imgX,
				imgY,
				imgWidth * ratio,
				imgHeight * ratio
			);
			pdf.save(`report-${type}-${new Date().toISOString().split("T")[0]}.pdf`);
		} catch (error) {
			console.error("Error exporting PDF:", error);
			alert("Failed to export as PDF. Please try again.");
		}
	};

	const exportAsCSV = () => {
		let csvContent = "data:text/csv;charset=utf-8,";
		let headers = [];
		let exportData = [];

		if (!data || !data.summary) {
			alert("No data to export.");
			return;
		}

		// --- CHANGED: The logic for sales reports is completely new ---
		if (
			type === "sales" ||
			type === "daily_sales" ||
			type === "weekly_sales" ||
			type === "monthly_sales"
		) {
			// Define headers for the new per-order format
			headers = [
				"Order ID",
				"Order Date",
				"Order Time",
				"Order Status",
				"Subtotal",
				"Discount",
				"Surcharge",
				"Tax",
				"Tip",
				"Grand Total",
				"Payment Breakdown", // A single column for all transactions
			];

			// Iterate through each period (day/week/month)
			data.data.forEach((period) => {
				if (period.orders && period.orders.length > 0) {
					// Iterate through each order to create ONE row per order
					period.orders.forEach((order) => {
						// Consolidate all transaction details into a single string
						const paymentBreakdown = order.transactions
							.map(
								(txn) => `${txn.payment_method}: ${formatCurrency(txn.amount)}`
							)
							.join(" | "); // e.g., "cash: $50.00 | credit: $25.50"

						const row = [
							order.id,
							new Date(order.created_at).toLocaleDateString(),
							new Date(order.created_at).toLocaleTimeString(),
							order.status,
							order.subtotal,
							order.discount,
							order.surcharge,
							order.tax,
							order.tip,
							order.total_price,
							`"${paymentBreakdown}"`, // Enclose in quotes to handle the "|" separator
						];
						exportData.push(row);
					});
				}
			});
		} else {
			// --- The logic for other report types remains the same ---
			const productItems = data.products || [];
			const hourlyItems = data.hourly_data || [];
			const paymentReportItems = data.data || [];

			if (type === "product" || type === "product_performance") {
				headers = [
					"Product Name",
					"Category",
					"Quantity Sold",
					"Revenue",
					"Average Price Sold",
				];
				exportData = productItems.map((item) => [
					`"${item.product_name.replace(/"/g, '""')}"`,
					item.category,
					item.quantity_sold,
					item.revenue,
					item.avg_price_sold,
				]);
			} else if (type === "payment" || type === "payment_analytics") {
				const isPaymentMethodBased = paymentReportItems[0]?.payment_method;
				headers = [
					isPaymentMethodBased ? "Payment Method" : "Date",
					"Transaction Count",
					"Total Amount",
					"Refund Count",
					"Failed Count",
					"Voided Count",
					"Success Rate",
				];
				exportData = paymentReportItems.map((item) => [
					item.payment_method || item.date,
					item.transaction_count,
					item.total_amount,
					item.refund_count,
					item.failed_count || 0,
					item.void_count || 0,
					item.success_rate,
				]);
			} else if (type === "operational" || type === "operational_insights") {
				headers = [
					"Hour",
					"Order Count",
					"Revenue",
					"Average Order Value",
					"Subtotal",
					"Tax",
					"Discount",
					"Tip",
					"Surcharge",
				];
				exportData = hourlyItems.map((item) => [
					item.hour,
					item.order_count,
					item.revenue,
					item.avg_order_value,
					item.subtotal,
					item.tax,
					item.discount,
					item.tip,
					item.surcharge,
				]);
			}
		}

		csvContent += headers.join(",") + "\n";
		exportData.forEach((row) => {
			csvContent += row.join(",") + "\n";
		});

		const encodedUri = encodeURI(csvContent);
		const link = document.createElement("a");
		link.setAttribute("href", encodedUri);
		link.setAttribute(
			"download",
			`report-${type}-${new Date().toISOString().split("T")[0]}.csv`
		);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	const COLORS = [
		"#3b82f6",
		"#10b981",
		"#8b5cf6",
		"#f59e0b",
		"#ef4444",
		"#6366f1",
		"#ec4899",
		"#06b6d4",
		"#f97316",
		"#d946ef",
	];

	const getReportTitle = (reportType) => {
		switch (reportType) {
			case "sales":
			case "daily_sales":
			case "weekly_sales":
			case "monthly_sales":
				return "Sales Report";
			case "product":
			case "product_performance":
				return "Product Performance Report";
			case "payment":
			case "payment_analytics":
				return "Payment Analytics Report";
			case "operational":
			case "operational_insights":
				return "Operational Insights Report";
			default:
				return "Report";
		}
	};

	const validateReportData = (reportData) => {
		if (
			!reportData ||
			typeof reportData.summary !== "object" ||
			reportData.summary === null
		) {
			console.error(
				"Invalid report data: missing or invalid summary section",
				reportData
			);
			return false;
		}
		if (!reportData.summary.period_start || !reportData.summary.period_end) {
			console.warn(
				"Report data missing period information",
				reportData.summary
			);
		}
		return true;
	};

	const SummaryCard = ({ title, value, subValue = null, icon: Icon }) => (
		<Card>
			<CardContent className="p-4">
				<div className="flex items-center justify-between">
					<div className="space-y-1">
						<p className="text-sm font-medium text-muted-foreground">{title}</p>
						<p className="text-2xl font-bold">{value ?? "N/A"}</p>
						{subValue && (
							<p className="text-xs text-muted-foreground">{subValue}</p>
						)}
					</div>
					{Icon && <Icon className="h-8 w-8 text-muted-foreground" />}
				</div>
			</CardContent>
		</Card>
	);

	const ChartContainer = ({ children, title }) => (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-lg">{title}</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="h-[300px] w-full">{children}</div>
			</CardContent>
		</Card>
	);

	const CustomTooltipContent = ({ active, payload, label, formatter }) => {
		if (active && payload && payload.length) {
			return (
				<div className="rounded-lg border bg-background p-2 shadow-md">
					<p className="font-medium mb-1">{label}</p>
					{payload.map((entry, index) => {
						const dataKey = entry.dataKey;
						const displayName = entry.name;
						const value = entry.value;
						let formattedValue;

						const nonCurrencyDataKeys = [
							"order_count",
							"transaction_count",
							"refund_count",
							"failed_count",
							"void_count",
							"quantity_sold",
							"avg_order_count",
						];

						if (nonCurrencyDataKeys.includes(dataKey)) {
							formattedValue = new Intl.NumberFormat().format(value);
						} else {
							formattedValue = formatter ? formatter(value) : value;
						}

						return (
							<p
								key={`item-${index}`}
								style={{ color: entry.color || entry.payload.fill }}
								className="text-sm"
							>
								{`${displayName}: ${formattedValue}`}
							</p>
						);
					})}
				</div>
			);
		}
		return null;
	};

	SummaryCard.propTypes = {
		title: PropTypes.string.isRequired,
		value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
		subValue: PropTypes.string,
		icon: PropTypes.elementType,
	};

	ChartContainer.propTypes = {
		children: PropTypes.node.isRequired,
		title: PropTypes.string.isRequired,
	};

	CustomTooltipContent.propTypes = {
		active: PropTypes.bool,
		payload: PropTypes.arrayOf(PropTypes.object),
		label: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
		formatter: PropTypes.func,
		nameMap: PropTypes.object,
	};

	const renderSalesReport = () => {
		return (
			<div className="space-y-6">
				{/* The summary cards and chart container are unchanged */}
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
					<SummaryCard
						title="Total Orders"
						value={data.summary.total_orders ?? 0}
						icon={Package}
					/>
					<SummaryCard
						title="Total Revenue"
						value={formatCurrency(data.summary.total_revenue)}
						icon={DollarSign}
					/>
					<SummaryCard
						title="Total Subtotal"
						value={formatCurrency(data.summary.total_subtotal)}
						icon={DollarSign}
					/>
					<SummaryCard
						title="Total Discounts"
						value={formatCurrency(data.summary.total_discount)}
						icon={DollarSign}
					/>
					<SummaryCard
						title="Total Surcharges"
						value={formatCurrency(data.summary.total_surcharge)}
						icon={DollarSign}
					/>
					<SummaryCard
						title="Total Tax"
						value={formatCurrency(data.summary.total_tax)}
						icon={DollarSign}
					/>
					<SummaryCard
						title="Total Tips"
						value={formatCurrency(data.summary.total_tip)}
						icon={DollarSign}
					/>
					<SummaryCard
						title="Avg. Order Value"
						value={formatCurrency(data.summary.avg_order_value)}
						icon={DollarSign}
					/>
				</div>

				<ChartContainer title="Sales Trend">
					<ResponsiveContainer
						width="100%"
						height="100%"
					>
						<LineChart
							data={data.data}
							margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
						>
							<CartesianGrid
								strokeDasharray="3 3"
								className="stroke-muted"
							/>
							<XAxis
								dataKey="date"
								className="text-xs"
								tickFormatter={formatDate}
							/>
							<YAxis
								yAxisId="left"
								orientation="left"
								className="text-xs"
								tickFormatter={formatCurrency}
							/>
							<YAxis
								yAxisId="right"
								orientation="right"
								className="text-xs"
							/>
							<Tooltip
								content={
									<CustomTooltipContent
										formatter={formatCurrency}
										nameMap={{
											total_revenue: "Total Revenue",
											order_count: "Orders",
										}}
									/>
								}
							/>
							<Legend />
							<Line
								yAxisId="left"
								type="monotone"
								dataKey="total_revenue"
								name="Total Revenue"
								stroke={COLORS[0]}
								strokeWidth={2}
								dot={{ r: 3 }}
								activeDot={{ r: 6 }}
							/>
							<Line
								yAxisId="right"
								type="monotone"
								dataKey="order_count"
								name="Orders"
								stroke={COLORS[1]}
								strokeWidth={2}
								dot={{ r: 3 }}
								activeDot={{ r: 6 }}
							/>
						</LineChart>
					</ResponsiveContainer>
				</ChartContainer>

				<Card>
					<CardHeader>
						<CardTitle>Sales Breakdown</CardTitle>
					</CardHeader>
					<CardContent className="p-0">
						<div className="overflow-x-auto">
							<table className="w-full">
								<thead className="border-b bg-muted/50">
									<tr>
										<th className="p-4 w-12"></th>
										{/* Cell for expander button */}
										<th className="text-left p-4 font-medium">Date</th>
										<th className="text-right p-4 font-medium">Orders</th>
										<th className="text-right p-4 font-medium">Subtotal</th>
										<th className="text-right p-4 font-medium">Discount</th>
										<th className="text-right p-4 font-medium">Surcharge</th>
										<th className="text-right p-4 font-medium">Tax</th>
										<th className="text-right p-4 font-medium">Tip</th>
										<th className="text-right p-4 font-medium">
											Total Revenue
										</th>
										<th className="text-right p-4 font-medium">
											Avg. Order Value
										</th>
									</tr>
								</thead>
								<tbody className="divide-y">
									{(data.data || []).map((item, index) => (
										<Fragment key={index}>
											<tr className="hover:bg-muted/50">
												<td className="p-4">
													{item.orders && item.orders.length > 0 && (
														<Button
															variant="ghost"
															size="icon"
															onClick={() => toggleRow(index)}
															className="h-8 w-8"
														>
															{expandedRows.has(index) ? (
																<ChevronDown className="h-4 w-4" />
															) : (
																<ChevronRight className="h-4 w-4" />
															)}
														</Button>
													)}
												</td>
												<td className="p-4 font-medium">
													{formatDate(item.date)}
												</td>
												<td className="p-4 text-right">{item.order_count}</td>
												<td className="p-4 text-right">
													{formatCurrency(item.subtotal)}
												</td>
												<td className="p-4 text-right">
													{formatCurrency(item.discount)}
												</td>
												<td className="p-4 text-right">
													{formatCurrency(item.surcharge)}
												</td>
												<td className="p-4 text-right">
													{formatCurrency(item.tax)}
												</td>
												<td className="p-4 text-right">
													{formatCurrency(item.tip)}
												</td>
												<td className="p-4 text-right font-medium">
													{formatCurrency(item.total_revenue)}
												</td>
												<td className="p-4 text-right">
													{formatCurrency(item.avg_order_value)}
												</td>
											</tr>
											{expandedRows.has(index) && (
												<tr className="bg-slate-50/75">
													<td
														colSpan="10"
														className="p-2 sm:p-4"
													>
														<div className="p-4 bg-white rounded-md border shadow-inner">
															<h4 className="font-bold text-md mb-3">
																Order Details for {formatDate(item.date)}
															</h4>
															<div className="space-y-4">
																{item.orders.map((order) => (
																	<div
																		key={order.id}
																		className="p-3 border rounded-lg bg-background"
																	>
																		<div className="flex justify-between items-start mb-2">
																			<div>
																				<p className="font-semibold text-slate-800">
																					Order #{order.id}
																				</p>
																				<p className="text-xs text-slate-500">
																					{new Date(
																						order.created_at
																					).toLocaleTimeString()}
																				</p>
																			</div>
																			<div className="text-right">
																				<p className="font-bold text-lg text-slate-900">
																					{formatCurrency(order.total_price)}
																				</p>
																				<p className="text-xs text-slate-500">
																					Grand Total
																				</p>
																			</div>
																		</div>

																		<div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-xs border-t pt-2">
																			{/* Financial Details */}
																			<div className="space-y-1">
																				<p>
																					Subtotal:{" "}
																					<span className="font-medium">
																						{formatCurrency(order.subtotal)}
																					</span>
																				</p>
																				<p>
																					Discounts:{" "}
																					<span className="font-medium text-red-600">
																						-{formatCurrency(order.discount)}
																					</span>
																				</p>
																			</div>
																			<div className="space-y-1">
																				<p>
																					Surcharge:{" "}
																					<span className="font-medium">
																						{formatCurrency(order.surcharge)}
																					</span>
																				</p>
																				<p>
																					Tax:{" "}
																					<span className="font-medium">
																						{formatCurrency(order.tax)}
																					</span>
																				</p>
																			</div>
																			<div className="space-y-1">
																				<p>
																					Tip:{" "}
																					<span className="font-medium">
																						{formatCurrency(order.tip)}
																					</span>
																				</p>
																			</div>
																			{/* Transactions */}
																			<div className="space-y-1 md:border-l md:pl-4">
																				<p className="font-medium mb-1">
																					Payments:
																				</p>
																				{order.transactions.map((txn) => (
																					<div
																						key={txn.id}
																						className="flex justify-between items-center"
																					>
																						<GetPaymentMethodDisplay
																							method={txn.payment_method}
																						/>
																						<span className="font-mono">
																							{formatCurrency(txn.amount)}
																						</span>
																					</div>
																				))}
																			</div>
																		</div>
																	</div>
																))}
															</div>
														</div>
													</td>
												</tr>
											)}
										</Fragment>
									))}
								</tbody>
							</table>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	};

	const renderProductReport = () => (
		<div className="space-y-6">
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<SummaryCard
					title="Total Items Sold"
					value={data.summary.total_items_sold ?? 0}
					icon={Package}
				/>
				<SummaryCard
					title="Total Product Revenue"
					value={formatCurrency(data.summary.total_product_revenue)}
					icon={DollarSign}
				/>
				<SummaryCard
					title="Top Product"
					value={data.summary.top_product_name || "N/A"}
					subValue={`Category: ${data.summary.top_category_name || "N/A"}`}
					icon={TrendingUp}
				/>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<ChartContainer title="Top Products (by Revenue)">
					<ResponsiveContainer
						width="100%"
						height="100%"
					>
						<BarChart
							data={(data.products || []).slice(0, 10)}
							layout="vertical"
							margin={{ top: 5, right: 20, left: 100, bottom: 5 }}
						>
							<CartesianGrid
								strokeDasharray="3 3"
								className="stroke-muted"
							/>
							<XAxis
								type="number"
								className="text-xs"
								tickFormatter={formatCurrency}
							/>
							<YAxis
								dataKey="product_name"
								type="category"
								width={100}
								className="text-xs"
								interval={0}
							/>
							<Tooltip
								content={
									<CustomTooltipContent
										formatter={formatCurrency}
										nameMap={{ revenue: "Revenue", quantity_sold: "Qty Sold" }}
									/>
								}
							/>
							<Legend />
							<Bar
								dataKey="revenue"
								name="Revenue"
								fill={COLORS[0]}
								barSize={15}
							/>
						</BarChart>
					</ResponsiveContainer>
				</ChartContainer>

				<ChartContainer title="Revenue by Category">
					<ResponsiveContainer
						width="100%"
						height="100%"
					>
						<PieChart>
							<Pie
								data={data.categories || []}
								cx="50%"
								cy="50%"
								labelLine={false}
								//eslint-disable-next-line
								label={({ name, percent, revenue }) =>
									`${name} (${(percent * 100).toFixed(0)}%)`
								}
								outerRadius={85}
								fill={COLORS[1]}
								dataKey="revenue"
								nameKey="category"
							>
								{(data.categories || []).map((entry, index) => (
									<Cell
										key={`cell-${index}`}
										fill={COLORS[index % COLORS.length]}
									/>
								))}
							</Pie>
							<Tooltip
								content={<CustomTooltipContent formatter={formatCurrency} />}
							/>
							<Legend />
						</PieChart>
					</ResponsiveContainer>
				</ChartContainer>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Product Details</CardTitle>
				</CardHeader>
				<CardContent className="p-0">
					<div className="overflow-x-auto">
						<table className="w-full">
							<thead className="border-b bg-muted/50">
								<tr>
									<th className="text-left p-4 font-medium">Product</th>
									<th className="text-left p-4 font-medium">Category</th>
									<th className="text-right p-4 font-medium">Qty Sold</th>
									<th className="text-right p-4 font-medium">
										Avg. Price Sold
									</th>
									<th className="text-right p-4 font-medium">Revenue</th>
								</tr>
							</thead>
							<tbody className="divide-y">
								{(data.products || []).map((product) => (
									<tr
										key={product.product_id}
										className="hover:bg-muted/50"
									>
										<td className="p-4 font-medium">{product.product_name}</td>
										<td className="p-4">
											<Badge variant="outline">{product.category}</Badge>
										</td>
										<td className="p-4 text-right">{product.quantity_sold}</td>
										<td className="p-4 text-right">
											{formatCurrency(product.avg_price_sold)}
										</td>
										<td className="p-4 text-right font-medium">
											{formatCurrency(product.revenue)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>
		</div>
	);

	const renderPaymentReport = () => {
		const reportDataItems = data.data || [];
		const isPaymentMethodBased = reportDataItems[0]?.payment_method;
		return (
			<div className="space-y-6">
				{/* --- UPDATED SUMMARY CARDS --- */}
				<div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
					<SummaryCard
						title="Total Transactions"
						value={data.summary.total_transactions ?? 0}
						icon={CreditCard}
					/>
					<SummaryCard
						title="Total Processed"
						value={formatCurrency(data.summary.total_processed)}
						icon={DollarSign}
					/>
					<SummaryCard
						title="Net Revenue"
						value={formatCurrency(data.summary.net_revenue)}
						icon={DollarSign}
					/>
					<SummaryCard
						title="Total Refunds"
						value={data.summary.total_refunds ?? 0} // This is the count
						subValue={formatCurrency(data.summary.total_refunded_amount)} // This is the amount
						icon={AlertTriangle}
					/>
					<SummaryCard
						title="Success Rate"
						value={`${data.summary.success_rate?.toFixed(2) ?? 100}%`}
						subValue={`Failed: ${data.summary.total_failed ?? 0} Voided: ${
							data.summary.total_voided ?? 0
						}`}
						icon={TrendingUp}
					/>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					{isPaymentMethodBased ? (
						<>
							<ChartContainer title="Distribution by Amount">
								<ResponsiveContainer
									width="100%"
									height="100%"
								>
									<PieChart>
										<Pie
											data={reportDataItems}
											cx="50%"
											cy="50%"
											labelLine={false}
											label={({ name, percent }) =>
												`${name} (${(percent * 100).toFixed(0)}%)`
											}
											outerRadius={85}
											fill={COLORS[0]}
											dataKey="total_amount"
											nameKey="payment_method"
										>
											{reportDataItems.map((entry, index) => (
												<Cell
													key={`cell-${index}`}
													fill={COLORS[index % COLORS.length]}
												/>
											))}
										</Pie>
										<Tooltip
											content={
												<CustomTooltipContent formatter={formatCurrency} />
											}
										/>
										<Legend />
									</PieChart>
								</ResponsiveContainer>
							</ChartContainer>
							<ChartContainer title="Transaction Counts">
								<ResponsiveContainer
									width="100%"
									height="100%"
								>
									<BarChart
										data={reportDataItems}
										margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
									>
										<CartesianGrid
											strokeDasharray="3 3"
											className="stroke-muted"
										/>
										<XAxis
											dataKey="payment_method"
											className="text-xs"
										/>
										<YAxis className="text-xs" />
										<Tooltip content={<CustomTooltipContent />} /> <Legend />
										<Bar
											dataKey="transaction_count"
											name="Transactions"
											fill={COLORS[0]}
											barSize={20}
										/>
										<Bar
											dataKey="refund_count"
											name="Refunds"
											fill={COLORS[4]}
											barSize={20}
										/>
										<Bar
											dataKey="failed_count"
											name="Failed"
											fill={COLORS[8]}
											barSize={20}
										/>
									</BarChart>
								</ResponsiveContainer>
							</ChartContainer>
						</>
					) : (
						<div className="lg:col-span-2">
							<ChartContainer title="Payment Trend">
								<ResponsiveContainer
									width="100%"
									height="100%"
								>
									<LineChart
										data={reportDataItems}
										margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
									>
										<CartesianGrid
											strokeDasharray="3 3"
											className="stroke-muted"
										/>
										<XAxis
											dataKey="date"
											className="text-xs"
											tickFormatter={formatDate}
										/>
										<YAxis
											yAxisId="left"
											orientation="left"
											className="text-xs"
											tickFormatter={formatCurrency}
										/>
										<YAxis
											yAxisId="right"
											orientation="right"
											className="text-xs"
										/>
										<Tooltip
											content={
												<CustomTooltipContent
													formatter={formatCurrency}
													nameMap={{
														total_amount: "Total Amount",
														transaction_count: "Transactions",
													}}
												/>
											}
										/>
										<Legend />
										<Line
											yAxisId="left"
											type="monotone"
											dataKey="total_amount"
											name="Total Amount"
											stroke={COLORS[0]}
											strokeWidth={2}
											dot={{ r: 3 }}
											activeDot={{ r: 6 }}
										/>
										<Line
											yAxisId="right"
											type="monotone"
											dataKey="transaction_count"
											name="Transactions"
											stroke={COLORS[1]}
											strokeWidth={2}
											dot={{ r: 3 }}
											activeDot={{ r: 6 }}
										/>
									</LineChart>
								</ResponsiveContainer>
							</ChartContainer>
						</div>
					)}
				</div>

				<Card>
					<CardHeader>
						<CardTitle>Payment Details</CardTitle>
					</CardHeader>
					<CardContent className="p-0">
						<div className="overflow-x-auto">
							<table className="w-full">
								<thead className="border-b bg-muted/50">
									<tr>
										<th className="text-left p-4 font-medium">
											{isPaymentMethodBased ? "Payment Method" : "Date"}
										</th>
										<th className="text-right p-4 font-medium">Transactions</th>
										<th className="text-right p-4 font-medium">Total Amount</th>
										<th className="text-right p-4 font-medium">Refunds</th>
										<th className="text-right p-4 font-medium">Failed</th>
										<th className="text-right p-4 font-medium">Voided</th>
										<th className="text-right p-4 font-medium">Success Rate</th>
									</tr>
								</thead>
								<tbody className="divide-y">
									{reportDataItems.map((item, index) => (
										<tr
											key={index}
											className="hover:bg-muted/50"
										>
											<td className="p-4 font-medium">
												{isPaymentMethodBased
													? item.payment_method
													: formatDate(item.date)}
											</td>
											<td className="p-4 text-right">
												{item.transaction_count}
											</td>
											<td className="p-4 text-right font-medium">
												{formatCurrency(item.total_amount)}
											</td>
											<td className="p-4 text-right">{item.refund_count}</td>
											<td className="p-4 text-right">
												{item.failed_count ?? 0}
											</td>
											<td className="p-4 text-right">{item.void_count ?? 0}</td>
											<td className="p-4 text-right">
												{item.success_rate?.toFixed(2)}%
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	};

	const renderOperationalReport = () => {
		const hourlyItems = data.hourly_data || [];
		const dailyItems = data.daily_data || [];
		const dayOfWeekSummary = data.day_of_week_summary || [];
		const peakHoursDetail = data.summary?.peak_hours_detail || [];
		const orderSourceBreakdown = data.summary?.order_source_breakdown || [];

		// Calculate totals from the detailed data arrays to check for inconsistencies
		const hourlyOrdersSum = hourlyItems.reduce(
			(sum, item) => sum + item.order_count,
			0
		);
		const dailyOrdersSum = dailyItems.reduce(
			(sum, item) => sum + item.order_count,
			0
		);
		const dailyRevenueSum = dailyItems.reduce(
			(sum, item) => sum + item.revenue,
			0
		);

		return (
			<div className="space-y-6">
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					<SummaryCard
						title="Total Orders"
						value={data.summary.total_orders ?? 0}
						icon={Package}
					/>
					<SummaryCard
						title="Total Revenue"
						value={formatCurrency(data.summary.total_revenue)}
						icon={DollarSign}
					/>
					<SummaryCard
						title="Avg. Daily Orders"
						value={data.summary.avg_orders_per_day?.toFixed(1) ?? 0}
						icon={TrendingUp}
					/>
					<SummaryCard
						title="Peak Hour #1"
						value={
							peakHoursDetail[0]
								? `${peakHoursDetail[0].hour} (${peakHoursDetail[0].order_count} orders)`
								: "N/A"
						}
						subValue={
							peakHoursDetail[0]
								? `Revenue: ${formatCurrency(peakHoursDetail[0].revenue)}`
								: ""
						}
						icon={Clock}
					/>
				</div>
				{orderSourceBreakdown.length > 0 && (
					<ChartContainer title="Order Source Breakdown">
						<ResponsiveContainer
							width="100%"
							height="100%"
						>
							<BarChart
								data={orderSourceBreakdown}
								layout="vertical"
								margin={{ top: 5, right: 20, left: 70, bottom: 5 }}
							>
								<CartesianGrid
									strokeDasharray="3 3"
									className="stroke-muted"
								/>
								<XAxis
									type="number"
									tickFormatter={formatCurrency}
									name="Revenue"
									className="text-xs"
								/>
								<YAxis
									type="category"
									dataKey="source"
									width={70}
									className="text-xs"
									interval={0}
								/>
								<Tooltip
									content={
										<CustomTooltipContent
											formatter={formatCurrency}
											nameMap={{
												total_revenue: "Revenue",
												order_count: "Orders",
											}}
										/>
									}
								/>
								<Legend />
								<Bar
									dataKey="total_revenue"
									name="Revenue"
									fill={COLORS[5]}
									barSize={20}
								/>
							</BarChart>
						</ResponsiveContainer>
					</ChartContainer>
				)}

				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<ChartContainer title="Hourly Trend">
						{/* FIX: Add a warning if hourly order sum doesn't match summary */}
						{hourlyOrdersSum !== data.summary.total_orders && (
							<div className="px-4 pb-2 text-sm text-destructive flex items-center gap-2">
								<AlertTriangle className="h-4 w-4" />
								Chart shows {hourlyOrdersSum} orders, but the summary total is{" "}
								{data.summary.total_orders}.
							</div>
						)}
						<ResponsiveContainer
							width="100%"
							height="100%"
						>
							<BarChart
								data={hourlyItems}
								margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
							>
								<CartesianGrid
									strokeDasharray="3 3"
									className="stroke-muted"
								/>
								<XAxis
									dataKey="hour"
									className="text-xs"
								/>
								<YAxis
									yAxisId="left"
									orientation="left"
									className="text-xs"
								/>
								<YAxis
									yAxisId="right"
									orientation="right"
									className="text-xs"
									tickFormatter={formatCurrency}
								/>
								<Tooltip
									content={
										<CustomTooltipContent
											formatter={formatCurrency}
											nameMap={{ order_count: "Orders", revenue: "Revenue" }}
										/>
									}
								/>
								<Legend />
								<Bar
									yAxisId="left"
									dataKey="order_count"
									name="Orders"
									fill={COLORS[0]}
									barSize={15}
								/>
								<Bar
									yAxisId="right"
									dataKey="revenue"
									name="Revenue"
									fill={COLORS[1]}
									barSize={15}
								/>
							</BarChart>
						</ResponsiveContainer>
					</ChartContainer>

					<ChartContainer title="Day of Week Performance">
						<ResponsiveContainer
							width="100%"
							height="100%"
						>
							<BarChart
								data={dayOfWeekSummary}
								margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
							>
								<CartesianGrid
									strokeDasharray="3 3"
									className="stroke-muted"
								/>
								<XAxis
									dataKey="day_of_week"
									className="text-xs"
								/>
								<YAxis
									yAxisId="left"
									orientation="left"
									className="text-xs"
								/>
								<YAxis
									yAxisId="right"
									orientation="right"
									className="text-xs"
									tickFormatter={formatCurrency}
								/>
								<Tooltip
									content={
										<CustomTooltipContent
											formatter={formatCurrency}
											nameMap={{
												avg_order_count: "Avg Orders",
												avg_revenue: "Avg Revenue",
											}}
										/>
									}
								/>
								<Legend />
								<Bar
									yAxisId="left"
									dataKey="avg_order_count"
									name="Avg Orders"
									fill={COLORS[2]}
									barSize={15}
								/>
								<Bar
									yAxisId="right"
									dataKey="avg_revenue"
									name="Avg Revenue"
									fill={COLORS[3]}
									barSize={15}
								/>
							</BarChart>
						</ResponsiveContainer>
					</ChartContainer>
				</div>

				<Card>
					<CardHeader>
						<CardTitle>Daily Performance</CardTitle>
					</CardHeader>
					<CardContent className="p-0">
						<div className="overflow-x-auto">
							<table className="w-full">
								<thead className="border-b bg-muted/50">
									<tr>
										<th className="text-left p-4 font-medium">Date</th>
										<th className="text-left p-4 font-medium">Day</th>
										<th className="text-right p-4 font-medium">Orders</th>
										<th className="text-right p-4 font-medium">Revenue</th>
										<th className="text-right p-4 font-medium">Subtotal</th>
										<th className="text-right p-4 font-medium">Tax</th>
										<th className="text-right p-4 font-medium">Discount</th>
										<th className="text-right p-4 font-medium">Tip</th>
										<th className="text-right p-4 font-medium">Surcharge</th>
										<th className="text-right p-4 font-medium">
											Avg Items/Order
										</th>
									</tr>
								</thead>
								<tbody className="divide-y">
									{dailyItems.map((day, index) => (
										<tr
											key={index}
											className="hover:bg-muted/50"
										>
											<td className="p-4 font-medium">
												{formatDate(day.date)}
											</td>
											<td className="p-4">{day.day_of_week}</td>
											<td className="p-4 text-right">{day.order_count}</td>
											<td className="p-4 text-right font-medium">
												{formatCurrency(day.revenue)}
											</td>
											<td className="p-4 text-right">
												{formatCurrency(day.subtotal)}
											</td>
											<td className="p-4 text-right">
												{formatCurrency(day.tax)}
											</td>
											<td className="p-4 text-right">
												{formatCurrency(day.discount)}
											</td>
											<td className="p-4 text-right">
												{formatCurrency(day.tip)}
											</td>
											<td className="p-4 text-right">
												{formatCurrency(day.surcharge)}
											</td>
											<td className="p-4 text-right">
												{day.avg_items_per_order?.toFixed(2)}
											</td>
										</tr>
									))}
								</tbody>
								{/* FIX: Add a footer with calculated totals */}
								<tfoot className="border-t-2 bg-muted/50 font-medium">
									<tr>
										<td
											className="p-4 text-left"
											colSpan={2}
										>
											Totals
										</td>
										<td className="p-4 text-right">{dailyOrdersSum}</td>
										<td className="p-4 text-right">
											{formatCurrency(dailyRevenueSum)}
										</td>
										<td className="p-4 text-right">
											{formatCurrency(
												dailyItems.reduce((s, i) => s + i.subtotal, 0)
											)}
										</td>
										<td className="p-4 text-right">
											{formatCurrency(
												dailyItems.reduce((s, i) => s + i.tax, 0)
											)}
										</td>
										<td className="p-4 text-right">
											{formatCurrency(
												dailyItems.reduce((s, i) => s + i.discount, 0)
											)}
										</td>
										<td className="p-4 text-right">
											{formatCurrency(
												dailyItems.reduce((s, i) => s + i.tip, 0)
											)}
										</td>
										<td className="p-4 text-right">
											{formatCurrency(
												dailyItems.reduce((s, i) => s + i.surcharge, 0)
											)}
										</td>
										<td className="p-4 text-right">
											{/* This column is an average of averages, so a simple sum isn't a meaningful metric here. */}
										</td>
									</tr>
								</tfoot>
							</table>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	};
	const renderReport = () => {
		switch (type) {
			case "sales":
			case "daily_sales":
			case "weekly_sales":
			case "monthly_sales":
				return renderSalesReport();
			case "product":
			case "product_performance":
				return renderProductReport();
			case "payment":
			case "payment_analytics":
				return renderPaymentReport();
			case "operational":
			case "operational_insights":
				return renderOperationalReport();
			default:
				console.warn("Unknown report type:", type);
				return (
					<div className="text-center py-12">
						<AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
						<h3 className="text-lg font-semibold mb-2">Unknown Report Type</h3>
						<p className="text-muted-foreground">
							Cannot display report with type: &quot;{type}&quot;.
						</p>
					</div>
				);
		}
	};

	return (
		<div className="p-6 space-y-6">
			<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
				<Button
					variant="ghost"
					onClick={onBack}
					className="self-start"
				>
					<ArrowLeft className="h-4 w-4 mr-2" />
					Back to Report Selection
				</Button>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={exportAsPDF}
						disabled={!data || !data.summary}
					>
						<Download className="h-4 w-4 mr-2" />
						Export PDF
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={exportAsCSV}
						disabled={!data || !data.summary}
					>
						<FileText className="h-4 w-4 mr-2" />
						Export CSV
					</Button>
				</div>
			</div>

			{validateReportData(data) ? (
				<>
					<Card>
						<CardContent className="pt-6">
							<div className="text-center space-y-2">
								<h1 className="text-3xl font-bold">{getReportTitle(type)}</h1>
								<p className="text-muted-foreground">
									Period: {formatDate(data.summary.period_start) || "Unknown"}{" "}
									to {formatDate(data.summary.period_end) || "Unknown"}
								</p>
							</div>
						</CardContent>
					</Card>
					<div ref={reportRef}>{renderReport()}</div>
				</>
			) : (
				<Card>
					<CardContent className="pt-6">
						<div className="text-center py-12">
							<AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
							<h3 className="text-lg font-semibold mb-2">
								Invalid Report Data
							</h3>
							<p className="text-muted-foreground mb-4">
								The report data structure is invalid, incomplete, or the report
								type is unrecognized.
							</p>
							<Button onClick={onBack}>Back to Reports</Button>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
};

ReportViewer.propTypes = {
	data: PropTypes.object,
	type: PropTypes.string,
	onBack: PropTypes.func.isRequired,
};

export default ReportViewer;
