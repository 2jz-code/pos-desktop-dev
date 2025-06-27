import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useOrderConfirmation } from "@/hooks/useOrderConfirmation";
import OrderConfirmation from "@/components/checkout/OrderConfirmation";

const ConfirmationPage = () => {
	const navigate = useNavigate();

	// Use the order confirmation hook to handle data loading
	const { orderData, isLoading, error } = useOrderConfirmation();

	return (
		<div className="min-h-screen bg-background">
			{/* Header */}
			<div className="bg-accent-light-beige border-b border-accent-subtle-gray/30">
				<div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
					<div className="flex items-center">
						<button
							onClick={() => navigate("/")}
							className="mr-4 p-2 rounded-md text-accent-dark-green hover:bg-primary-beige/70 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-green focus:ring-offset-2 focus:ring-offset-background"
							aria-label="Go to home"
						>
							<ArrowLeft size={20} />
						</button>
						<div>
							<h1 className="text-2xl sm:text-3xl font-bold text-accent-dark-green">
								Order Confirmation
							</h1>
							<p className="text-accent-dark-brown/70 text-sm mt-1">
								Thank you for your order!
							</p>
						</div>
					</div>
				</div>
			</div>

			{/* Main Content */}
			<div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				{isLoading ? (
					<div className="text-center py-8">
						<div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-green mx-auto mb-4"></div>
						<p className="text-accent-dark-brown/70">
							Loading order details...
						</p>
					</div>
				) : error ? (
					<div className="text-center py-8">
						<div className="text-red-500 mb-4">⚠️</div>
						<p className="text-red-600 mb-4">{error}</p>
						<p className="text-accent-dark-brown/70">
							Please try refreshing the page or contact support if the problem
							persists.
						</p>
					</div>
				) : (
					<OrderConfirmation orderData={orderData} />
				)}
			</div>
		</div>
	);
};

export default ConfirmationPage;
