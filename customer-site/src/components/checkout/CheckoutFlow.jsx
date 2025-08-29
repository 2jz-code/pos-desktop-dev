import React, { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useCheckout } from "@/hooks/useCheckout";
import { useOrderConfirmation } from "@/hooks/useOrderConfirmation";
import { useCart } from "@/hooks/useCart";
import { useStoreStatus } from "@/contexts/StoreStatusContext";
import { useCartStore } from "@/store/cartStore";
import ProgressIndicator from "./ProgressIndicator";
import OrderSummary from "./OrderSummary";
import CustomerInfo from "./CustomerInfo";
import PaymentForm from "./PaymentForm";
import OrderConfirmation from "./OrderConfirmation";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Clock, Store } from "lucide-react";

const CheckoutFlow = () => {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const { cart } = useCart();
	const storeStatus = useStoreStatus();
	const cartStore = useCartStore();
	const {
		currentStep,
		formData,
		isLoading,
		isSubmitting,
		error,
		orderConfirmation,
		isAuthenticated,
		user,
		surchargeDisplay,
		updateFormData,
		prevStep,
		submitOrder,
		clearError,
		submitCustomerInfo,
	} = useCheckout();

	// Check if we're in confirmation mode from URL
	const isConfirmationMode = searchParams.get("step") === "confirmation";

	// Use the new order confirmation hook
	const {
		orderData: confirmationOrderData,
		isLoading: isLoadingOrderData,
		error: orderDataError,
	} = useOrderConfirmation(orderConfirmation);

	useEffect(() => {
		// Clear error when step changes
		if (error) {
			const timer = setTimeout(() => clearError(), 5000);
			return () => clearTimeout(timer);
		}
	}, [error, clearError]);

	// Monitor store status and update cart store
	useEffect(() => {
		if (!storeStatus.isLoading) {
			cartStore.updateStoreStatus(storeStatus.isOpen, storeStatus.canPlaceOrder);
			
			// If store closes during checkout (not in confirmation mode), redirect to cart
			if (!isConfirmationMode && !storeStatus.canPlaceOrder && !storeStatus.isLoading) {
				navigate("/menu", { 
					replace: true, 
					state: { 
						message: "Store is now closed. You can continue browsing our menu.", 
						type: "warning" 
					} 
				});
			}
		}
	}, [storeStatus.isOpen, storeStatus.canPlaceOrder, storeStatus.isLoading, isConfirmationMode, navigate]);

	const renderStep = () => {
		// If URL indicates confirmation, show confirmation regardless of internal step
		if (isConfirmationMode) {
			// Show loading if we're still fetching order data
			if (isLoadingOrderData) {
				return (
					<div className="text-center py-8">
						<div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-green mx-auto mb-4"></div>
						<p className="text-accent-dark-brown/70">
							Loading order details...
						</p>
					</div>
				);
			}

			// Show error if there was a problem loading order data
			if (orderDataError) {
				return (
					<div className="text-center py-8">
						<div className="text-red-500 mb-4">⚠️</div>
						<p className="text-red-600 mb-4">{orderDataError}</p>
						<p className="text-accent-dark-brown/70">
							Please try refreshing the page or contact support if the problem
							persists.
						</p>
					</div>
				);
			}

			return <OrderConfirmation orderData={confirmationOrderData} surchargeDisplay={surchargeDisplay} />;
		}

		// Normal checkout flow (only steps 1 and 2 now)
		switch (currentStep) {
			case 1:
				return (
					<CustomerInfo
						formData={formData}
						updateFormData={updateFormData}
						onNext={submitCustomerInfo}
						isLoading={isLoading}
						isAuthenticated={isAuthenticated}
						user={user}
					/>
				);
			case 2:
				return (
					<PaymentForm
						formData={formData}
						updateFormData={updateFormData}
						onBack={prevStep}
						onSubmit={submitOrder}
						isLoading={isSubmitting}
						isAuthenticated={isAuthenticated}
						user={user}
						cart={cart}
					/>
				);
			default:
				return null;
		}
	};

	// Don't show loading spinner or cart requirement check in confirmation mode
	if (isConfirmationMode) {
		return (
			<div className="max-w-4xl mx-auto">
				{/* Error Display */}
				{error && (
					<Card className="border-red-200 bg-red-50 mb-6">
						<CardContent className="p-4">
							<div className="flex items-start">
								<AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
								<div>
									<h3 className="text-sm font-medium text-red-800">Error</h3>
									<p className="text-sm text-red-700 mt-1">{error}</p>
								</div>
							</div>
						</CardContent>
					</Card>
				)}

				{/* Confirmation Content */}
				<div className="bg-accent-light-beige rounded-lg p-6 border border-accent-subtle-gray/30">
					{renderStep()}
				</div>
			</div>
		);
	}

	// Normal checkout flow layout
	if (!cart) {
		return (
			<div className="flex justify-center items-center h-64">
				<div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-green"></div>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
			{/* Main Checkout Flow */}
			<div className="lg:col-span-3 space-y-6">
				{/* Progress Indicator - Centered */}
				<div className="flex justify-center">
					<div className="w-full max-w-md">
						<ProgressIndicator currentStep={currentStep} />
					</div>
				</div>

				{/* Store Status Warning */}
				{storeStatus.isClosingSoon && (
					<Card className="border-yellow-200 bg-yellow-50">
						<CardContent className="p-4">
							<div className="flex items-start">
								<Clock className="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
								<div>
									<h3 className="text-sm font-medium text-yellow-800">Store Closing Soon</h3>
									<p className="text-sm text-yellow-700 mt-1">
										We're closing in {storeStatus.getTimeUntilCloseString()}. Please complete your order quickly.
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
				)}

				{/* Store Closed Warning */}
				{!storeStatus.canPlaceOrder && !storeStatus.isLoading && (
					<Card className="border-red-200 bg-red-50">
						<CardContent className="p-4">
							<div className="flex items-start">
								<Store className="h-5 w-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
								<div>
									<h3 className="text-sm font-medium text-red-800">Store Closed</h3>
									<p className="text-sm text-red-700 mt-1">
										Sorry, we're currently closed. 
										{storeStatus.getNextOpeningDisplay() && (
											<> We'll open again at {storeStatus.getNextOpeningDisplay()}.</>
										)}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
				)}

				{/* Error Display */}
				{error && (
					<Card className="border-red-200 bg-red-50">
						<CardContent className="p-4">
							<div className="flex items-start">
								<AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
								<div>
									<h3 className="text-sm font-medium text-red-800">Error</h3>
									<p className="text-sm text-red-700 mt-1">{error}</p>
								</div>
							</div>
						</CardContent>
					</Card>
				)}

				{/* Current Step Content */}
				<div className="bg-accent-light-beige rounded-lg p-6 border border-accent-subtle-gray/30">
					{renderStep()}
				</div>
			</div>

			{/* Order Summary Sidebar */}
			<div className="lg:col-span-2">
				<div className="sticky top-8">
					<OrderSummary
						cart={cart}
						isLoading={isLoading}
						surchargeDisplay={surchargeDisplay}
						tip={formData.tip || 0}
					/>
				</div>
			</div>
		</div>
	);
};

export default CheckoutFlow;
