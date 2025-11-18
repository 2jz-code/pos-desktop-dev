import { useState } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	getOrderById,
	resendConfirmationEmail,
	cancelOrder,
} from "@/services/api/orderService";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { formatCurrency, formatPhoneNumber } from "@ajeen/ui";
import ModifierDisplay from "@/components/ui/ModifierDisplay";
import { Timeline } from "@/components/ui/Timeline";
import { generateOrderTimeline } from "@/utils/orderTimeline";
import {
	ArrowLeft,
	CreditCard,
	DollarSign,
	User,
	Mail,
	Phone,
	Send,
	Ban,
	Receipt,
	Clock,
	Tag,
	ExternalLink,
	Printer,
	Download,
	Activity,
	RotateCw,
} from "lucide-react";

// Clean Transaction Display Component
const TransactionDetail = ({ transaction }) => {
	const method = transaction.method?.replace("_", " ") || "N/A";
	const isCredit = method.toLowerCase() === "credit";

	return (
		<div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
			<div className="flex items-center gap-3">
				<div className="p-2 rounded-lg bg-muted">
					{isCredit ? (
						<CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />
					) : (
						<DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
					)}
				</div>
				<div>
					<p className="font-medium text-sm text-foreground capitalize">{method}</p>
					{isCredit && transaction.metadata?.card_brand && (
						<p className="text-xs text-muted-foreground">
							{transaction.metadata.card_brand} •••• {transaction.metadata.card_last4}
						</p>
					)}
				</div>
			</div>
			<span className="font-semibold text-foreground">
				{formatCurrency(
					Number.parseFloat(transaction.amount) +
						Number.parseFloat(transaction.tip || 0) +
						Number.parseFloat(transaction.surcharge || 0)
				)}
			</span>
		</div>
	);
};

const OrderDetailsPage = () => {
	const { orderId } = useParams();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const queryClient = useQueryClient();
	const { toast } = useToast();
	const { tenant } = useAuth();
	const tenantSlug = tenant?.slug || '';
	const [isRefreshing, setIsRefreshing] = useState(false);

	const {
		data: order,
		isLoading,
		isError,
		error,
		refetch,
	} = useQuery({
		queryKey: ["order", orderId],
		queryFn: () => getOrderById(orderId),
		enabled: !!orderId,
	});

	const handleRefresh = async () => {
		setIsRefreshing(true);
		await refetch();
		setIsRefreshing(false);
		toast({
			title: "Refreshed",
			description: "Order details have been updated.",
		});
	};

	const resendEmailMutation = useMutation({
		mutationFn: () => resendConfirmationEmail(orderId),
		onSuccess: (data) => {
			toast({
				title: "Success",
				description: data.data.message || "Confirmation email has been resent.",
			});
		},
		onError: (error) => {
			toast({
				title: "Operation Failed",
				description:
					error?.response?.data?.error || "Could not resend the email.",
				variant: "destructive",
			});
		},
	});

	const cancelOrderMutation = useMutation({
		mutationFn: () => cancelOrder(orderId),
		onSuccess: () => {
			toast({
				title: "Success",
				description: "Order has been cancelled.",
			});
			queryClient.invalidateQueries(["order", orderId]);
			queryClient.invalidateQueries(["orders"]);
		},
		onError: (error) => {
			toast({
				title: "Operation Failed",
				description:
					error?.response?.data?.error || "Could not cancel the order.",
				variant: "destructive",
			});
		},
	});

	if (isLoading)
		return (
			<div className="flex items-center justify-center h-full">
				<div className="text-center">
					<div className="animate-spin rounded-full h-32 w-32 border-b-2 border-foreground mx-auto mb-4"></div>
					<p className="text-muted-foreground">Loading order details...</p>
				</div>
			</div>
		);

	if (isError)
		return (
			<div className="flex items-center justify-center h-full">
				<Card className="p-6 max-w-md mx-auto border-border">
					<CardContent className="text-center">
						<p className="text-red-500">Error: {error.message}</p>
					</CardContent>
				</Card>
			</div>
		);

	if (!order)
		return (
			<div className="flex items-center justify-center h-full">
				<Card className="p-6 max-w-md mx-auto border-border">
					<CardContent className="text-center">
						<p className="text-red-500">Order not found or failed to load.</p>
					</CardContent>
				</Card>
			</div>
		);

	const {
		status,
		payment_status,
		items = [],
		subtotal,
		total_discounts_amount,
		tax_total,
		cashier,
		payment_details,
		customer_display_name,
		customer_email,
		customer_phone,
		applied_discounts = [],
		notes,
		kitchen_notes,
	} = order;

	const getStatusBadgeVariant = (status) => {
		switch (status) {
			case "COMPLETED":
				return "default";
			case "PENDING":
				return "secondary";
			case "HOLD":
				return "outline";
			case "CANCELLED":
			case "VOID":
				return "destructive";
			default:
				return "outline";
		}
	};

	const getPaymentStatusBadgeVariant = (status) => {
		switch (status) {
			case "PAID":
			case "succeeded":
				return "default";
			case "PARTIALLY_PAID":
				return "secondary";
			case "UNPAID":
				return "destructive";
			case "REFUNDED":
			case "PARTIALLY_REFUNDED":
				return "outline";
			default:
				return "outline";
		}
	};

	return (
		<div className="flex flex-col h-full bg-muted/30">
			{/* Floating Header Bar */}
			<div className="flex-shrink-0 bg-background/95 backdrop-blur-sm border-b border-border/60 p-4 md:p-6 sticky top-0 z-10">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-4">
						<Button
							onClick={() => {
								const params = searchParams.toString();
								const backUrl = `/${tenantSlug}/orders${params ? `?${params}` : ''}`;
								navigate(backUrl);
							}}
							variant="ghost"
							size="sm"
							className="gap-2"
						>
							<ArrowLeft className="h-4 w-4" />
							Back
						</Button>
						<Separator orientation="vertical" className="h-6" />
						<div>
							<div className="flex items-center gap-2">
								<h1 className="text-lg font-bold text-foreground">
									Order #{order.order_number}
								</h1>
								<Badge variant={getStatusBadgeVariant(status)} className="text-xs">
									{status}
								</Badge>
								<Badge variant={getPaymentStatusBadgeVariant(payment_status)} className="text-xs">
									{payment_status}
								</Badge>
							</div>
							<p className="text-xs text-muted-foreground mt-0.5">
								{format(new Date(order.created_at), "MMMM d, yyyy 'at' h:mm a")}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={handleRefresh}
							disabled={isRefreshing}
						>
							<RotateCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
							{isRefreshing ? "Refreshing..." : "Refresh"}
						</Button>
						{status === "COMPLETED" && (
							<Button
								variant="default"
								size="sm"
								onClick={() => resendEmailMutation.mutate()}
								disabled={resendEmailMutation.isPending}
							>
								<Send className="h-4 w-4 mr-2" />
								{resendEmailMutation.isPending ? "Sending..." : "Resend Email"}
							</Button>
						)}
						{(status === "PENDING" || status === "HOLD") && (
							<Button
								variant="destructive"
								size="sm"
								onClick={() => cancelOrderMutation.mutate()}
								disabled={cancelOrderMutation.isPending}
							>
								<Ban className="h-4 w-4 mr-2" />
								{cancelOrderMutation.isPending ? "Cancelling..." : "Cancel"}
							</Button>
						)}
					</div>
				</div>
			</div>

			{/* Invoice-Style Content */}
			<div className="flex-1 min-h-0 p-4 md:p-8">
				<ScrollArea className="h-full">
					<div className="max-w-5xl mx-auto pb-8">
						{/* Main Invoice Paper */}
						<div className="bg-background rounded-2xl shadow-lg border border-border/40 overflow-hidden">
							{/* Invoice Header */}
							<div className="bg-gradient-to-br from-muted/50 to-muted/20 p-6 md:p-8 border-b border-border/40">
								<div className="flex items-start justify-between mb-6">
									<div>
										<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
											Order Details
										</p>
										<div className="flex items-center gap-3">
											<Receipt className="h-5 w-5 text-muted-foreground" />
											<span className="text-sm text-muted-foreground">
												ID: {order.id.toString().slice(0, 13)}...
											</span>
										</div>
										<div className="flex items-center gap-3 mt-1">
											<User className="h-5 w-5 text-muted-foreground" />
											<span className="text-sm text-muted-foreground">
												Cashier: {cashier?.username || "N/A"}
											</span>
										</div>
									</div>
									<div className="text-right flex flex-col items-end gap-2">
										<Badge
											variant={order.order_type === "WEB" ? "default" : "secondary"}
											className="text-lg font-bold px-4 py-2"
										>
											{order.order_type}
										</Badge>
										<Badge
											variant="outline"
											className="text-sm font-semibold px-3 py-1"
										>
											{order.dining_preference === "DINE_IN" ? "Dine In" : "Take Out"}
										</Badge>
									</div>
								</div>

								{/* Order Status Flow */}
								<div className="pt-4 border-t border-border/40">
									<div className="flex items-center gap-4">
										{/* Received */}
										<div className="flex items-center gap-2">
											<div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 ${
												status !== "CANCELLED" && status !== "VOID"
													? "bg-emerald-500 border-emerald-500"
													: "bg-muted border-border"
											}`}>
												<span className="text-xs font-bold text-white">✓</span>
											</div>
											<span className="text-xs font-medium text-muted-foreground">Received</span>
										</div>

										{/* Connector Line */}
										<div className={`flex-1 h-0.5 ${
											status === "COMPLETED" || status === "CANCELLED" || status === "VOID"
												? "bg-emerald-500"
												: "bg-border"
										}`} />

										{/* Processing/Completed */}
										<div className="flex items-center gap-2">
											<div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 ${
												status === "COMPLETED"
													? "bg-emerald-500 border-emerald-500"
													: status === "CANCELLED" || status === "VOID"
													? "bg-red-500 border-red-500"
													: status === "PENDING" || status === "HOLD"
													? "bg-yellow-500 border-yellow-500 animate-pulse"
													: "bg-muted border-border"
											}`}>
												{status === "COMPLETED" ? (
													<span className="text-xs font-bold text-white">✓</span>
												) : status === "CANCELLED" || status === "VOID" ? (
													<span className="text-xs font-bold text-white">✕</span>
												) : (
													<span className="text-xs font-bold text-white">•••</span>
												)}
											</div>
											<span className="text-xs font-medium text-muted-foreground">
												{status === "COMPLETED"
													? "Completed"
													: status === "CANCELLED"
													? "Cancelled"
													: status === "VOID"
													? "Voided"
													: "Processing"}
											</span>
										</div>
									</div>
									<div className="mt-3 text-xs text-muted-foreground">
										{status === "PENDING" || status === "HOLD" ? (
											<span>Order is currently being processed...</span>
										) : status === "COMPLETED" ? (
											<span>Order has been completed and fulfilled</span>
										) : (
											<span>Order has been {status.toLowerCase()}</span>
										)}
									</div>
								</div>
							</div>

							{/* Order Notes - Prominent */}
							{(notes || kitchen_notes) && (
								<div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 p-6 md:p-8 border-b border-border/40">
									<h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-200 uppercase tracking-wider mb-3 flex items-center gap-2">
										<Receipt className="h-4 w-4" />
										Special Instructions
									</h3>
									{notes && (
										<div className="mb-3">
											<p className="text-xs text-yellow-800 dark:text-yellow-300 uppercase font-medium mb-1">
												Customer Notes:
											</p>
											<p className="text-sm text-yellow-900 dark:text-yellow-100 font-medium">
												{notes}
											</p>
										</div>
									)}
									{kitchen_notes && (
										<div>
											<p className="text-xs text-yellow-800 dark:text-yellow-300 uppercase font-medium mb-1">
												Kitchen Notes:
											</p>
											<p className="text-sm text-yellow-900 dark:text-yellow-100 font-medium">
												{kitchen_notes}
											</p>
										</div>
									)}
								</div>
							)}

							{/* Items Section - Compact Table */}
							<div className="p-6 md:p-8">
								<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
									Order Items
								</h3>
								<div className="border border-border/40 rounded-lg overflow-hidden">
									<table className="w-full">
										<thead className="bg-muted/30">
											<tr className="text-xs text-muted-foreground uppercase tracking-wider">
												<th className="text-left px-4 py-3 font-semibold">Item</th>
												<th className="text-center px-4 py-3 font-semibold w-[100px]">Qty</th>
												<th className="text-right px-4 py-3 font-semibold w-[120px]">Price</th>
												<th className="text-right px-4 py-3 font-semibold w-[120px]">Total</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-border/40">
											{items.map((item) => {
												// Find adjustments for this specific item
												const priceOverride = order.adjustments?.find(
													(adj) => adj.adjustment_type === "PRICE_OVERRIDE" && adj.order_item === item.id
												);
												const itemDiscounts = order.adjustments?.filter(
													(adj) => adj.adjustment_type === "ONE_OFF_DISCOUNT" && adj.order_item === item.id
												) || [];

												// Calculate effective price
												const basePrice = parseFloat(item.price_at_sale);
												const totalItemDiscount = itemDiscounts.reduce((sum, disc) => sum + parseFloat(disc.amount || 0), 0);
												const hasItemDiscount = itemDiscounts.length > 0;
												const effectivePricePerUnit = hasItemDiscount
													? basePrice + (totalItemDiscount / item.quantity)
													: basePrice;

												const hasOriginalPrice = priceOverride && item.product?.price;
												const originalPrice = hasOriginalPrice ? parseFloat(item.product.price) : null;

												return (
													<tr key={item.id} className="hover:bg-muted/20 transition-colors">
														<td className="px-4 py-3">
															<div>
																<div className="font-medium text-foreground mb-1">
																	{item.product.name}
																</div>
															{item.product.barcode && (
																<div className="mt-1">
																	<span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/30 text-xs font-mono text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
																		<svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
																			<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
																		</svg>
																		{item.product.barcode}
																	</span>
																</div>
															)}
															{item.selected_modifiers_snapshot && item.selected_modifiers_snapshot.length > 0 && (
																<div className="flex flex-wrap gap-1 mt-2">
																	{item.selected_modifiers_snapshot.map((mod, idx) => (
																		<span
																			key={idx}
																			className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted text-xs text-muted-foreground border border-border/40"
																		>
																			{mod.modifier_set_name}: {mod.option_name}
																		</span>
																	))}
																</div>
															)}

															{/* Adjustment Badges */}
															{(priceOverride || itemDiscounts.length > 0) && (
																<div className="flex flex-wrap gap-1 mt-2">
																	{priceOverride && (
																		<HoverCard>
																			<HoverCardTrigger asChild>
																				<Badge
																					variant="outline"
																					className="text-xs px-1.5 py-0 border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 cursor-help"
																				>
																					Override
																				</Badge>
																			</HoverCardTrigger>
																			<HoverCardContent className="w-80" side="top">
																				<div className="space-y-2">
																					<div className="text-sm">
																						<span className="font-semibold">Reason:</span>
																						<p className="text-muted-foreground mt-1">{priceOverride.reason}</p>
																					</div>
																					{priceOverride.approved_by_name && (
																						<div className="text-xs text-muted-foreground border-t pt-2">
																							Approved by {priceOverride.approved_by_name}
																						</div>
																					)}
																					<div className="text-xs text-muted-foreground border-t pt-2">
																						{priceOverride.original_price && (
																							<div>Original: {formatCurrency(priceOverride.original_price)}</div>
																						)}
																						<div>New: {formatCurrency(priceOverride.new_price)}</div>
																					</div>
																				</div>
																			</HoverCardContent>
																		</HoverCard>
																	)}
																	{itemDiscounts.map((discount) => {
																		let discountLabel = "";
																		if (discount.discount_type === "PERCENTAGE") {
																			discountLabel = `${discount.discount_value}% off`;
																		} else {
																			discountLabel = `${formatCurrency(discount.discount_value)} off`;
																		}
																		return (
																			<HoverCard key={discount.id}>
																				<HoverCardTrigger asChild>
																					<Badge
																						variant="outline"
																						className="text-xs px-1.5 py-0 border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 cursor-help"
																					>
																						{discountLabel}
																					</Badge>
																				</HoverCardTrigger>
																				<HoverCardContent className="w-80" side="top">
																					<div className="space-y-2">
																						<div className="text-sm">
																							<span className="font-semibold">Reason:</span>
																							<p className="text-muted-foreground mt-1">{discount.reason}</p>
																						</div>
																						{discount.approved_by_name && (
																							<div className="text-xs text-muted-foreground border-t pt-2">
																								Approved by {discount.approved_by_name}
																							</div>
																						)}
																					</div>
																				</HoverCardContent>
																			</HoverCard>
																		);
																	})}
																</div>
															)}
														</div>
													</td>
													<td className="px-4 py-3 text-center">
														<span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 text-primary font-semibold text-sm">
															{item.quantity}
														</span>
													</td>
													<td className="px-4 py-3 text-right">
														<div className="flex flex-col items-end gap-1">
															{(hasOriginalPrice || hasItemDiscount) && (
																<span className="text-xs text-muted-foreground line-through">
																	{formatCurrency(hasOriginalPrice ? originalPrice : basePrice)}
																</span>
															)}
															<span className={`text-sm font-medium ${
																priceOverride
																	? "text-orange-600 dark:text-orange-400"
																	: hasItemDiscount
																	? "text-emerald-600 dark:text-emerald-400"
																	: "text-muted-foreground"
															}`}>
																{formatCurrency(effectivePricePerUnit)}
															</span>
														</div>
													</td>
													<td className="px-4 py-3 text-right">
														<span className={`font-semibold ${
															priceOverride
																? "text-orange-600 dark:text-orange-400"
																: hasItemDiscount
																? "text-emerald-600 dark:text-emerald-400"
																: "text-foreground"
														}`}>
															{formatCurrency(item.quantity * effectivePricePerUnit)}
														</span>
													</td>
												</tr>
											);
											})}
										</tbody>
									</table>
								</div>
							</div>

							{/* Order Summary */}
							<div className="border-t border-border/40 bg-muted/20 p-6 md:p-8">
								<div className="max-w-md ml-auto space-y-3">
									<div className="flex justify-between text-sm">
										<span className="text-muted-foreground">Subtotal</span>
										<span className="font-medium text-foreground">{formatCurrency(subtotal)}</span>
									</div>

									{/* Order-Level One-Off Discounts */}
									{order.adjustments?.filter(
										(adj) => adj.adjustment_type === "ONE_OFF_DISCOUNT" && !adj.order_item
									).map((discount) => {
										let discountLabel = "One-Off Discount";
										if (discount.discount_type === "PERCENTAGE") {
											discountLabel = `${discount.discount_value}% Discount`;
										} else if (discount.discount_value) {
											discountLabel = `${formatCurrency(discount.discount_value)} Discount`;
										}
										return (
											<div key={discount.id} className="flex justify-between items-center text-sm">
												<div className="flex items-center gap-2">
													<Tag className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
													<span className="text-emerald-600 dark:text-emerald-400 font-medium">
														{discountLabel}
													</span>
													<HoverCard>
														<HoverCardTrigger asChild>
															<Badge
																variant="outline"
																className="text-xs px-1.5 py-0 border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 cursor-help"
															>
																{discount.discount_type === "PERCENTAGE" ? `${discount.discount_value}%` : formatCurrency(discount.discount_value)}
															</Badge>
														</HoverCardTrigger>
														<HoverCardContent className="w-80" side="top">
															<div className="space-y-2">
																<div className="text-sm">
																	<span className="font-semibold">Reason:</span>
																	<p className="text-muted-foreground mt-1">{discount.reason}</p>
																</div>
																{discount.approved_by_name && (
																	<div className="text-xs text-muted-foreground border-t pt-2">
																		Approved by {discount.approved_by_name}
																	</div>
																)}
															</div>
														</HoverCardContent>
													</HoverCard>
												</div>
												<span className="font-medium text-emerald-600 dark:text-emerald-400">
													-{formatCurrency(Math.abs(parseFloat(discount.amount || 0)))}
												</span>
											</div>
										);
									})}

									{/* Applied code-based discounts */}
									{total_discounts_amount > 0 && (
										<div className="space-y-2">
											{applied_discounts.length > 0 ? (
												applied_discounts.map((orderDiscount) => (
													<div key={orderDiscount.id} className="flex justify-between text-sm text-red-600 dark:text-red-400">
														<div className="flex items-center gap-2">
															<Tag className="h-3.5 w-3.5" />
															<div className="flex flex-col">
																<span className="font-medium">
																	{orderDiscount.discount.name}
																</span>
																{orderDiscount.discount.code && (
																	<span className="text-xs text-muted-foreground">
																		Code: {orderDiscount.discount.code}
																	</span>
																)}
															</div>
														</div>
														<span className="font-medium">-{formatCurrency(orderDiscount.amount)}</span>
													</div>
												))
											) : null}
										</div>
									)}
									{/* Show either Tax OR Tax Exemption */}
									{(() => {
										const taxExemption = order.adjustments?.find((adj) => adj.adjustment_type === "TAX_EXEMPT");
										return taxExemption ? (
											<div className="flex justify-between items-center text-sm">
												<div className="flex items-center gap-2">
													<span className="text-orange-600 dark:text-orange-400 font-medium">Tax Exemption</span>
													{taxExemption.reason && (
														<HoverCard>
															<HoverCardTrigger asChild>
																<Badge
																	variant="outline"
																	className="text-xs px-1.5 py-0 border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 cursor-help"
																>
																	Info
																</Badge>
															</HoverCardTrigger>
															<HoverCardContent className="w-80" side="top">
																<div className="space-y-2">
																	<div className="text-sm">
																		<span className="font-semibold">Reason:</span>
																		<p className="text-muted-foreground mt-1">{taxExemption.reason}</p>
																	</div>
																	{taxExemption.approved_by_name && (
																		<div className="text-xs text-muted-foreground border-t pt-2">
																			Approved by {taxExemption.approved_by_name}
																		</div>
																	)}
																</div>
															</HoverCardContent>
														</HoverCard>
													)}
												</div>
												<span className="text-orange-600 dark:text-orange-400 font-medium">Applied</span>
											</div>
										) : (
											<div className="flex justify-between text-sm">
												<span className="text-muted-foreground">Tax</span>
												<span className="font-medium text-foreground">{formatCurrency(tax_total)}</span>
											</div>
										);
									})()}

									{/* Show surcharges if any */}
									{order.total_surcharges > 0 && (
										<div className="flex justify-between text-sm">
											<span className="text-muted-foreground">Surcharges</span>
											<span className="font-medium text-foreground">
												{formatCurrency(order.total_surcharges || 0)}
											</span>
										</div>
									)}

									{/* Show fee exemption if applied */}
									{(() => {
										const feeExemption = order.adjustments?.find((adj) => adj.adjustment_type === "FEE_EXEMPT");
										return feeExemption ? (
											<div className="flex justify-between items-center text-sm">
												<div className="flex items-center gap-2">
													<span className="text-blue-600 dark:text-blue-400 font-medium">Fee Exemption</span>
													{feeExemption.reason && (
														<HoverCard>
															<HoverCardTrigger asChild>
																<Badge
																	variant="outline"
																	className="text-xs px-1.5 py-0 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 cursor-help"
																>
																	Info
																</Badge>
															</HoverCardTrigger>
															<HoverCardContent className="w-80" side="top">
																<div className="space-y-2">
																	<div className="text-sm">
																		<span className="font-semibold">Reason:</span>
																		<p className="text-muted-foreground mt-1">{feeExemption.reason}</p>
																	</div>
																	{feeExemption.approved_by_name && (
																		<div className="text-xs text-muted-foreground border-t pt-2">
																			Approved by {feeExemption.approved_by_name}
																		</div>
																	)}
																</div>
															</HoverCardContent>
														</HoverCard>
													)}
												</div>
												<span className="text-blue-600 dark:text-blue-400 font-medium">Applied</span>
											</div>
										) : null;
									})()}
									{order.total_tips > 0 && (
										<div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
											<span>Tip</span>
											<span className="font-medium">{formatCurrency(order.total_tips)}</span>
										</div>
									)}
									<Separator className="my-4" />
									<div className="flex justify-between items-center pt-2">
										<span className="text-base font-bold text-foreground">Total</span>
										<span className="text-2xl font-bold text-foreground">
											{formatCurrency(order.total_collected || 0)}
										</span>
									</div>
								</div>
							</div>

						</div>

						{/* Additional Info Grid */}
						<div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
							{/* Customer Info */}
							{customer_display_name && customer_display_name !== "Guest Customer" ? (
								<div className="bg-background rounded-xl border border-border/40 p-6">
									<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
										<User className="h-4 w-4" />
										Customer Information
									</h3>
									<div className="space-y-3">
										<div>
											<p className="text-xs text-muted-foreground mb-1">Name</p>
											<p className="font-medium text-foreground">{customer_display_name}</p>
										</div>
										{customer_email && (
											<div>
												<p className="text-xs text-muted-foreground mb-1">Email</p>
												<a
													href={`mailto:${customer_email}`}
													className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
												>
													{customer_email}
												</a>
											</div>
										)}
										{customer_phone && (
											<div>
												<p className="text-xs text-muted-foreground mb-1">Phone</p>
												<a
													href={`tel:${customer_phone}`}
													className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
												>
													{formatPhoneNumber(customer_phone)}
												</a>
											</div>
										)}
									</div>
								</div>
							) : (
								<div className="bg-background rounded-xl border border-border/40 p-6">
									<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
										<User className="h-4 w-4" />
										Customer Information
									</h3>
									<p className="text-sm text-muted-foreground">Guest Order</p>
								</div>
							)}

							{/* Payment Info */}
							<div className="bg-background rounded-xl border border-border/40 p-6">
								<div className="flex items-center justify-between mb-4">
									<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
										<CreditCard className="h-4 w-4" />
										Payment Information
									</h3>
									{payment_details && (
										<Link
											to={`/${tenantSlug}/payments/${payment_details.id}`}
											className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
										>
											View Full
											<ExternalLink className="h-3 w-3" />
										</Link>
									)}
								</div>
								{payment_details &&
								payment_details.transactions?.filter((txn) => !["FAILED", "CANCELED"].includes(txn.status))
									.length > 0 ? (
									<div className="space-y-0">
										{payment_details.transactions
											.filter((txn) => !["FAILED", "CANCELED"].includes(txn.status))
											.map((txn) => (
												<TransactionDetail key={txn.id} transaction={txn} />
											))}
									</div>
								) : (
									<p className="text-sm text-muted-foreground">No payment information available</p>
								)}
							</div>
						</div>

						{/* Order Activity Timeline */}
						<div className="bg-background rounded-xl border border-border/40 p-6 mt-6">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-6 flex items-center gap-2">
								<Activity className="h-4 w-4" />
								Order Activity
							</h3>
							<Timeline items={generateOrderTimeline(order)} />
						</div>
					</div>
				</ScrollArea>
			</div>
		</div>
	);
};

export default OrderDetailsPage;
