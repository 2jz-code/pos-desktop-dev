import React, { Suspense, lazy } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { StripeProvider } from "@/contexts/StripeContext";
import { useCart } from "@/hooks/useCart";

// Lazy load checkout components for better performance
const CheckoutFlow = lazy(() => import("@/components/checkout/CheckoutFlow"));

const CheckoutPage = () => {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { cart, itemCount } = useCart();

	// Check if this is a confirmation step (after successful payment)
	const isConfirmation = searchParams.get("step") === "confirmation";

	// Redirect if cart is empty BUT allow confirmation step to show
	if (!isConfirmation && (!cart || itemCount === 0)) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<div className="max-w-md w-full text-center p-8">
					<div className="bg-accent-light-beige rounded-lg p-6 border border-accent-subtle-gray/30">
						<h2 className="text-xl font-semibold text-accent-dark-brown mb-4">
							Your cart is empty
						</h2>
						<p className="text-accent-dark-brown/70 mb-6">
							Add some delicious items to your cart before proceeding to
							checkout.
						</p>
						<button
							onClick={() => navigate("/menu")}
							className="w-full bg-primary-green text-accent-light-beige px-6 py-3 rounded-lg font-medium hover:bg-accent-dark-green transition-colors"
						>
							Browse Menu
						</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background">
			{/* Header */}
			<div className="bg-accent-light-beige border-b border-accent-subtle-gray/30">
				<div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
					<div className="flex items-center">
						{!isConfirmation && (
							<button
								onClick={() => navigate(-1)}
								className="mr-4 p-2 rounded-md text-accent-dark-green hover:bg-primary-beige/70 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-green focus:ring-offset-2 focus:ring-offset-background"
								aria-label="Go back"
							>
								<ArrowLeft size={20} />
							</button>
						)}
						<div>
							<h1 className="text-2xl sm:text-3xl font-bold text-accent-dark-green">
								{isConfirmation ? "Order Confirmation" : "Checkout"}
							</h1>
							{!isConfirmation && (
								<p className="text-accent-dark-brown/70 text-sm mt-1">
									{itemCount} {itemCount === 1 ? "item" : "items"} in your order
								</p>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Main Content */}
			<div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				<StripeProvider>
					<Suspense
						fallback={
							<div className="flex justify-center items-center h-64">
								<div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-green"></div>
							</div>
						}
					>
						<CheckoutFlow />
					</Suspense>
				</StripeProvider>
			</div>
		</div>
	);
};

export default CheckoutPage;
