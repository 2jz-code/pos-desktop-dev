import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Mail, Clock, MapPin, Coffee, Phone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStoreInfo } from "@/hooks/useSettings";
import { Link } from "react-router-dom";
import ModifierDisplay from "@/components/ui/ModifierDisplay";

const OrderConfirmation = ({ orderData, surchargeDisplay }) => {
	const navigate = useNavigate();
	const { data: storeInfo } = useStoreInfo();

	if (!orderData) {
		return (
			<div className="text-center py-8">
				<div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-green mx-auto mb-4"></div>
				<p className="text-accent-dark-brown/70">Loading confirmation...</p>
			</div>
		);
	}

	const formatPrice = (price) => {
		const numericPrice =
			typeof price === "string" ? parseFloat(price) : Number(price);
		return isNaN(numericPrice) ? "0.00" : numericPrice.toFixed(2);
	};

	const getEstimatedPickupTime = () => {
		// If order is cancelled, show cancelled message
		if (orderData.status === "CANCELLED") {
			return "Order cancelled";
		}
		// If order is ready, show ready message
		if (orderData.status === "READY") {
			return "Ready for pickup!";
		}
		// If order is completed (payment succeeded), still show pickup time since they need to collect it
		if (orderData.status === "COMPLETED") {
			const now = new Date();
			const pickupTime = new Date(now.getTime() + 15 * 60000); // 15 minutes from now for paid orders
			return pickupTime.toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
			});
		}

		// For all other statuses (PENDING, PREPARING, etc.), show standard pickup time
		const now = new Date();
		const pickupTime = new Date(now.getTime() + 20 * 60000); // 20 minutes from now
		return pickupTime.toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	const getStatusMessage = () => {
		switch (orderData.status) {
			case "COMPLETED":
				return "Payment confirmed! Our kitchen team is preparing your delicious meal.";
			case "CANCELLED":
				return "This order was cancelled.";
			case "READY":
				return "Your order is ready for pickup!";
			case "PREPARING":
				return "Our chefs are working on your order";
			default:
				return "We've received your order and our kitchen team is preparing your delicious meal.";
		}
	};

	const getStatusColor = () => {
		switch (orderData.status) {
			case "COMPLETED":
				return "text-green-600";
			case "CANCELLED":
				return "text-red-600";
			case "READY":
				return "text-blue-600";
			default:
				return "text-green-600";
		}
	};

	// Handle items display - check for different item structure formats
	const getItemName = (item) => {
		return (
			item.product?.name || item.product_name || item.name || "Unknown Item"
		);
	};

	const getItemPrice = (item) => {
		return (
			item.total_price ||
			item.price_at_sale * item.quantity ||
			item.product?.price * item.quantity ||
			0
		);
	};

	return (
		<div className="max-w-2xl mx-auto">
			{/* Success Header */}
			<div className="text-center mb-8">
				<div className="flex justify-center mb-4">
					<CheckCircle className={`h-16 w-16 ${getStatusColor()}`} />
				</div>
				<h1 className="text-3xl font-bold text-accent-dark-green mb-2">
					{orderData.status === "COMPLETED"
						? "Order Confirmed!"
						: orderData.status === "CANCELLED"
						? "Order Cancelled"
						: orderData.status === "READY"
						? "Order Ready!"
						: "Order Confirmed!"}
				</h1>
				<p className="text-accent-dark-brown/70 text-lg">
					{getStatusMessage()}
				</p>
			</div>

			{/* Order Status Card */}
			{orderData.status !== "CANCELLED" && (
				<Card className="border-green-200 bg-green-50/50 mb-6">
					<CardContent className="p-6">
						<div className="flex items-center justify-center">
							<div className="flex items-center space-x-3">
								<Coffee className="h-8 w-8 text-green-600" />
								<div>
									<h3 className="font-semibold text-green-800">
										{orderData.status === "COMPLETED"
											? "Payment Confirmed"
											: orderData.status === "READY"
											? "Ready for Pickup"
											: "Order in Progress"}
									</h3>
									<p className="text-green-700 text-sm">{getStatusMessage()}</p>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Order Details */}
			<Card className="border-accent-subtle-gray/30 mb-6">
				<CardHeader>
					<CardTitle className="text-accent-dark-green">
						Order Details
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{/* Order Number */}
					<div className="flex justify-between items-center p-4 bg-primary-beige/30 rounded-lg border border-primary-beige/50">
						<span className="font-medium text-accent-dark-brown">
							Order Number
						</span>
						<span className="font-mono text-xl font-bold text-accent-dark-green">
							#{orderData.order_number || orderData.id}
						</span>
					</div>

					{/* Customer Info */}
					<div className="space-y-3">
						<h4 className="font-semibold text-accent-dark-brown border-b border-accent-subtle-gray/30 pb-2">
							Customer Information
						</h4>
						<div className="text-sm text-accent-dark-brown/80 space-y-2 pl-2">
							<p className="font-medium">
								{orderData.customer_display_name || "Guest Customer"}
							</p>
							{orderData.customer_email && (
								<p className="flex items-center">
									<Mail className="h-4 w-4 mr-2 text-primary-green" />
									{orderData.customer_email}
								</p>
							)}
							{orderData.customer_phone && (
								<p className="flex items-center">
									<Phone className="h-4 w-4 mr-2 text-primary-green" />
									{orderData.customer_phone}
								</p>
							)}
						</div>
					</div>

					{/* Order Items */}
					{orderData.items && orderData.items.length > 0 && (
						<div className="space-y-3">
							<h4 className="font-semibold text-accent-dark-brown border-b border-accent-subtle-gray/30 pb-2">
								Items Ordered
							</h4>
							<div className="space-y-3">
								{orderData.items.map((item, index) => (
									<div
										key={item.id || index}
										className="flex justify-between items-start p-3 bg-accent-light-beige/50 rounded-lg"
									>
										<div className="flex-1">
											<p className="font-semibold text-accent-dark-brown">
												{getItemName(item)}
											</p>
											
											{/* Display modifiers */}
											<ModifierDisplay 
												modifiers={item.selected_modifiers_snapshot} 
												compact={false} 
											/>
											
											{item.notes && (
												<p className="text-accent-dark-brown/60 text-sm mt-2">
													<span className="font-medium">Note:</span>{" "}
													{item.notes}
												</p>
											)}
											<p className="text-accent-dark-brown/70 text-sm mt-1">
												Quantity: {item.quantity}
											</p>
										</div>
										<span className="font-semibold text-accent-dark-green text-lg">
											${formatPrice(getItemPrice(item))}
										</span>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Order Total */}
					<div className="border-t-2 border-accent-subtle-gray/30 pt-4">
						<div className="space-y-2">
							{/* Subtotal */}
							{orderData.subtotal && (
								<div className="flex justify-between text-sm">
									<span className="text-accent-dark-brown">Subtotal</span>
									<span className="text-accent-dark-brown">
										${formatPrice(orderData.subtotal)}
									</span>
								</div>
							)}

							{/* Tax */}
							{orderData.tax_total && (
								<div className="flex justify-between text-sm">
									<span className="text-accent-dark-brown">Tax</span>
									<span className="text-accent-dark-brown">
										${formatPrice(orderData.tax_total)}
									</span>
								</div>
							)}

							{/* Service Fee - Use payment transaction data for accuracy */}
							{(() => {
								// Calculate service fee from payment transactions (most accurate)
								const serviceFee = orderData.payment_details?.transactions
									?.filter(t => t.surcharge > 0)
									?.reduce((sum, t) => sum + parseFloat(t.surcharge || 0), 0) || 0;

								return serviceFee > 0 && (
									<div className="flex justify-between text-sm">
										<span className="text-accent-dark-brown">Service Fee</span>
										<span className="text-accent-dark-brown">
											${formatPrice(serviceFee)}
										</span>
									</div>
								);
							})()}

							{/* Tip */}
							{(() => {
								// Calculate total tip from payment transactions
								const totalTip = orderData.payment_details?.transactions
									?.filter(t => t.tip > 0)
									?.reduce((sum, t) => sum + parseFloat(t.tip || 0), 0) || 0;
								
								return totalTip > 0 && (
									<div className="flex justify-between text-sm">
										<span className="text-accent-dark-brown">Tip</span>
										<span className="text-accent-dark-brown">
											${formatPrice(totalTip)}
										</span>
									</div>
								);
							})()}

							{/* Total */}
							<div className="flex justify-between items-center font-bold text-xl pt-2 border-t border-accent-subtle-gray/30">
								<span className="text-accent-dark-green">Total Paid</span>
								<span className="text-accent-dark-green">
									${formatPrice(
										(() => {
											// Calculate total from all payment transactions (most accurate)
											const totalCollected = orderData.payment_details?.total_collected;
											if (totalCollected !== undefined) {
												return totalCollected;
											}

											// Fallback: sum all transaction amounts including tips and surcharges
											const transactionTotal = orderData.payment_details?.transactions
												?.reduce((sum, t) => {
													const amount = parseFloat(t.amount || 0);
													const tip = parseFloat(t.tip || 0);
													const surcharge = parseFloat(t.surcharge || 0);
													return sum + amount + tip + surcharge;
												}, 0) || 0;

											if (transactionTotal > 0) {
												return transactionTotal;
											}

											// Final fallback: calculate manually
											const subtotal = parseFloat(orderData.subtotal || 0);
											const tax = parseFloat(orderData.tax_total || 0);
											const surcharges = orderData.payment_details?.transactions
												?.filter(t => t.surcharge > 0)
												?.reduce((sum, t) => sum + parseFloat(t.surcharge || 0), 0) || 0;
											const tips = orderData.payment_details?.transactions
												?.filter(t => t.tip > 0)
												?.reduce((sum, t) => sum + parseFloat(t.tip || 0), 0) || 0;

											return subtotal + tax + surcharges + tips;
										})()
									)}
								</span>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Next Steps - Show for all orders except cancelled ones */}
			{orderData.status !== "CANCELLED" && (
				<Card className="border-accent-subtle-gray/30 mb-6">
					<CardHeader>
						<CardTitle className="text-accent-dark-green">
							What's Next?
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-5">
						{orderData.customer_email && (
							<div className="flex items-start space-x-4">
								<Mail className="h-6 w-6 text-primary-green mt-0.5 flex-shrink-0" />
								<div>
									<h4 className="font-semibold text-accent-dark-brown">
										Email Confirmation Sent
									</h4>
									<p className="text-sm text-accent-dark-brown/70 mt-1">
										We've sent a detailed confirmation email to{" "}
										<span className="font-medium">
											{orderData.customer_email}
										</span>{" "}
										with your order receipt and pickup instructions.
									</p>
								</div>
							</div>
						)}

						<div className="flex items-start space-x-4">
							<Clock className="h-6 w-6 text-primary-green mt-0.5 flex-shrink-0" />
							<div>
								<h4 className="font-semibold text-accent-dark-brown">
									Estimated Pickup Time
								</h4>
								<p className="text-sm text-accent-dark-brown/70 mt-1">
									Your order will be ready for pickup at approximately{" "}
									<span className="font-bold text-accent-dark-green">
										{getEstimatedPickupTime()}
									</span>
									. We'll prepare it fresh for you!
								</p>
							</div>
						</div>

						<div className="flex items-start space-x-4">
							<MapPin className="h-6 w-6 text-primary-green mt-0.5 flex-shrink-0" />
							<div className="flex-1">
								<h4 className="font-semibold text-accent-dark-brown">
									Pickup Location
								</h4>
								<div className="mt-2 p-4 bg-primary-beige/30 rounded-lg border border-primary-beige/50">
									<div className="space-y-2 text-sm">
										<div className="flex items-center space-x-2">
											<MapPin className="h-4 w-4 text-primary-green flex-shrink-0" />
											<Link
												to="https://maps.app.goo.gl/UEHKAs1eg7pVsq2D7"
												target="_blank"
												rel="noopener noreferrer"
											>
												<span className="text-accent-dark-brown hover:text-primary-green transition-colors">
													{storeInfo?.store_address ||
														"2105 Cliff Rd Suite 300, Eagan, MN, 55124"}
												</span>
											</Link>
										</div>
										<div className="flex items-center space-x-2">
											<Phone className="h-4 w-4 text-primary-green flex-shrink-0" />
											<a
												href={`tel:+1${(
													storeInfo?.store_phone || "6514125336"
												).replace(/\D/g, "")}`}
												className="text-accent-dark-brown hover:text-primary-green transition-colors"
											>
												{storeInfo?.store_phone || "(651) 412-5336"}
											</a>
										</div>
										<div className="pt-2 border-t border-accent-subtle-gray/30">
											<p className="text-accent-dark-brown/70">
												Please come to our restaurant counter to collect your
												order. Have your order number{" "}
												<span className="font-mono font-bold text-accent-dark-green">
													#
													{orderData.orderNumber ||
														orderData.order_number ||
														orderData.id}
												</span>{" "}
												ready for quick pickup.
											</p>
										</div>
									</div>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Action Buttons */}
			<div className="flex flex-col sm:flex-row gap-4">
				<Button
					variant="outline"
					onClick={() => navigate("/menu")}
					className="flex-1 border-accent-subtle-gray/50 text-accent-dark-brown hover:bg-primary-beige/50 h-12"
				>
					Order Again
				</Button>
				<Button
					onClick={() => navigate("/")}
					className="flex-1 bg-primary-green hover:bg-accent-dark-green text-accent-light-beige h-12 font-semibold"
				>
					Back to Home
				</Button>
			</div>
		</div>
	);
};

export default OrderConfirmation;
