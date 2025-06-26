import React, { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useCheckout } from "@/hooks/useCheckout";
import { useCart } from "@/hooks/useCart";
import ProgressIndicator from "./ProgressIndicator";
import OrderSummary from "./OrderSummary";
import CustomerInfo from "./CustomerInfo";
import PaymentForm from "./PaymentForm";
import OrderConfirmation from "./OrderConfirmation";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

const CheckoutFlow = () => {
	const [searchParams] = useSearchParams();
	const { cart } = useCart();
	const {
		currentStep,
		formData,
		isLoading,
		error,
		orderConfirmation,
		updateFormData,
		nextStep,
		prevStep,
		submitOrder,
		clearError,
	} = useCheckout();

	// Check if we're in confirmation mode from URL
	const isConfirmationMode = searchParams.get("step") === "confirmation";
	const orderDataParam = searchParams.get("orderData");

	useEffect(() => {
		// Clear error when step changes
		if (error) {
			const timer = setTimeout(() => clearError(), 5000);
			return () => clearTimeout(timer);
		}
	}, [error, clearError]);

	const renderStep = () => {
		// If URL indicates confirmation, show confirmation regardless of internal step
		if (isConfirmationMode) {
			let confirmationData = orderConfirmation;

			// Try to get order data from URL if orderConfirmation is not available
			if (!confirmationData && orderDataParam) {
				try {
					confirmationData = JSON.parse(decodeURIComponent(orderDataParam));
				} catch (e) {
					console.error("Failed to parse order data from URL:", e);
				}
			}

			return <OrderConfirmation orderData={confirmationData} />;
		}

		// Normal checkout flow
		switch (currentStep) {
			case 1:
				return (
					<CustomerInfo
						formData={formData}
						updateFormData={updateFormData}
						onNext={nextStep}
						isLoading={isLoading}
					/>
				);
			case 2:
				return (
					<PaymentForm
						formData={formData}
						updateFormData={updateFormData}
						onBack={prevStep}
						onSubmit={submitOrder}
						isLoading={isLoading}
					/>
				);
			case 3:
				return <OrderConfirmation orderData={orderConfirmation} />;
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
		<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
			{/* Main Checkout Flow */}
			<div className="lg:col-span-2 space-y-6">
				{/* Progress Indicator - Centered */}
				<div className="flex justify-center">
					<div className="w-full max-w-md">
						<ProgressIndicator currentStep={currentStep} />
					</div>
				</div>

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
			<div className="lg:col-span-1">
				<div className="sticky top-8">
					<OrderSummary
						cart={cart}
						isLoading={isLoading}
					/>
				</div>
			</div>
		</div>
	);
};

export default CheckoutFlow;
