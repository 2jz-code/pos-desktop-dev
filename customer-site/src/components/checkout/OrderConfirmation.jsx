import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Mail, Clock, MapPin, Coffee, Phone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStoreInfo } from "@/hooks/useSettings";

const OrderConfirmation = ({ orderData }) => {
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
		const now = new Date();
		const pickupTime = new Date(now.getTime() + 20 * 60000); // 20 minutes from now
		return pickupTime.toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	return (
		<div className="max-w-2xl mx-auto">
			{/* Success Header */}
			<div className="text-center mb-8">
				<div className="flex justify-center mb-4">
					<CheckCircle className="h-16 w-16 text-green-500" />
				</div>
				<h1 className="text-3xl font-bold text-accent-dark-green mb-2">
					Order Confirmed!
				</h1>
				<p className="text-accent-dark-brown/70 text-lg">
					Thank you for your order. We've received your payment and our kitchen
					team is preparing your delicious meal.
				</p>
			</div>

			{/* Order Status Card */}
			<Card className="border-green-200 bg-green-50/50 mb-6">
				<CardContent className="p-6">
					<div className="flex items-center justify-center">
						<div className="flex items-center space-x-3">
							<Coffee className="h-8 w-8 text-green-600" />
							<div>
								<h3 className="font-semibold text-green-800">
									Order in Progress
								</h3>
								<p className="text-green-700 text-sm">
									Our chefs are working on your order
								</p>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

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
							#{orderData.orderNumber || orderData.id}
						</span>
					</div>

					{/* Customer Info */}
					<div className="space-y-3">
						<h4 className="font-semibold text-accent-dark-brown border-b border-accent-subtle-gray/30 pb-2">
							Customer Information
						</h4>
						<div className="text-sm text-accent-dark-brown/80 space-y-2 pl-2">
							<p className="font-medium">{orderData.customerName}</p>
							<p className="flex items-center">
								<Mail className="h-4 w-4 mr-2 text-primary-green" />
								{orderData.customerEmail}
							</p>
							<p className="flex items-center">
								<span className="h-4 w-4 mr-2 text-primary-green">📱</span>
								{orderData.customerPhone}
							</p>
						</div>
					</div>

					{/* Order Items */}
					<div className="space-y-3">
						<h4 className="font-semibold text-accent-dark-brown border-b border-accent-subtle-gray/30 pb-2">
							Items Ordered
						</h4>
						<div className="space-y-3">
							{orderData.items?.map((item, index) => (
								<div
									key={index}
									className="flex justify-between items-start p-3 bg-accent-light-beige/50 rounded-lg"
								>
									<div className="flex-1">
										<p className="font-semibold text-accent-dark-brown">
											{item.product?.name || item.name}
										</p>
										{item.notes && (
											<p className="text-accent-dark-brown/60 text-sm mt-1">
												<span className="font-medium">Note:</span> {item.notes}
											</p>
										)}
										<p className="text-accent-dark-brown/70 text-sm mt-1">
											Quantity: {item.quantity}
										</p>
									</div>
									<span className="font-semibold text-accent-dark-green text-lg">
										$
										{formatPrice(
											item.total_price || item.price_at_sale * item.quantity
										)}
									</span>
								</div>
							))}
						</div>
					</div>

					{/* Order Total */}
					<div className="border-t-2 border-accent-subtle-gray/30 pt-4">
						<div className="flex justify-between items-center font-bold text-xl">
							<span className="text-accent-dark-green">Total Paid</span>
							<span className="text-accent-dark-green">
								${formatPrice(orderData.grandTotal || orderData.total)}
							</span>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Next Steps */}
			<Card className="border-accent-subtle-gray/30 mb-6">
				<CardHeader>
					<CardTitle className="text-accent-dark-green">What's Next?</CardTitle>
				</CardHeader>
				<CardContent className="space-y-5">
					<div className="flex items-start space-x-4">
						<Mail className="h-6 w-6 text-primary-green mt-0.5 flex-shrink-0" />
						<div>
							<h4 className="font-semibold text-accent-dark-brown">
								Email Confirmation Sent
							</h4>
							<p className="text-sm text-accent-dark-brown/70 mt-1">
								We've sent a detailed confirmation email to{" "}
								<span className="font-medium">{orderData.customerEmail}</span>{" "}
								with your order receipt and pickup instructions.
							</p>
						</div>
					</div>

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
										<span className="text-accent-dark-brown">
											{storeInfo?.store_address ||
												"2105 Cliff Rd Suite 300, Eagan, MN, 55124"}
										</span>
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
												#{orderData.orderNumber || orderData.id}
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
