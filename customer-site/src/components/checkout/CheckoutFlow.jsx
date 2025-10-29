import React, { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useCheckout } from "@/hooks/useCheckout";
import { useOrderConfirmation } from "@/hooks/useOrderConfirmation";
import { useCart } from "@/hooks/useCart";
import { useStoreStatus } from "@/contexts/StoreStatusContext";
import { useLocationSelector } from "@/hooks/useLocationSelector";
import { useQuery } from "@tanstack/react-query";
import locationsAPI from "@/api/locations";
import ProgressIndicator from "./ProgressIndicator";
import OrderSummary from "./OrderSummary";
import CustomerInfo from "./CustomerInfo";
import PaymentForm from "./PaymentForm";
import OrderConfirmation from "./OrderConfirmation";
import LocationSelector from "./LocationSelector";
import LocationHeader from "./LocationHeader";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Clock, Store, MapPin, Edit2 } from "lucide-react";

const CheckoutFlow = () => {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const { cart } = useCart();
	const storeStatus = useStoreStatus();
	const { selectedLocationId, selectedLocation, locations, isLoading: isLoadingLocations, formatAddress, selectionRequired } = useLocationSelector();

	// If only 1 location exists, start at step 1 (customer info), otherwise start at step 0 (location selection)
	const initialStep = !isLoadingLocations && !selectionRequired ? 1 : 0;

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
		submitLocationSelection,
		submitOrder,
		clearError,
		submitCustomerInfo,
	} = useCheckout(initialStep);

	// Manually find the location if selectedLocation is undefined
	// Handle type mismatch: selectedLocationId might be string, location IDs are numbers
	const displayLocation = selectedLocation || locations.find(loc =>
		loc.id === selectedLocationId || loc.id === Number(selectedLocationId)
	);

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

		// Normal checkout flow (steps 0, 1, and 2)
		switch (currentStep) {
			case 0:
				// Step 0: Location Selection
				// LocationSelector already validates business hours and prevents selecting closed locations
				// No need to re-validate here
				return (
					<div>
						<h2 className="text-xl font-semibold text-accent-dark-green mb-4">
							Select Pickup Location
						</h2>
						<LocationSelector />
						<div className="mt-6">
							<button
								onClick={() => submitLocationSelection(selectedLocationId)}
								disabled={!selectedLocationId || isLoadingLocations}
								className={`w-full py-3 px-6 rounded-lg font-medium transition-colors ${
									!selectedLocationId || isLoadingLocations
										? "bg-accent-subtle-gray/50 text-accent-subtle-gray cursor-not-allowed"
										: "bg-primary-green text-white hover:bg-accent-dark-green"
								}`}
							>
								{isLoadingLocations ? "Loading locations..." : "Continue to Customer Info"}
							</button>
						</div>
					</div>
				);
			case 1:
				return (
					<CustomerInfo
						formData={formData}
						updateFormData={updateFormData}
						onNext={submitCustomerInfo}
						isLoading={isLoading}
						isAuthenticated={isAuthenticated}
						user={user}
						canPlaceOrder={storeStatus.canPlaceOrder}
						storeStatusLoading={storeStatus.isLoading}
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
				{/* Location Header - Always visible after step 0 */}
				{currentStep > 0 && <LocationHeader />}

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
				<div className="sticky top-8 space-y-4">
					{/* Selected Location Card - Show after location selection */}
					{currentStep > 0 && (displayLocation || cart?.store_location_name) && (
						<Card className="border-primary-green/20 bg-gradient-to-br from-accent-light-beige to-white">
							<CardContent className="p-4">
								{/* Header with change button */}
								<div className="flex items-start justify-between mb-3">
									<div className="flex items-center space-x-2">
										<div className="bg-primary-green/10 p-1.5 rounded-lg">
											<MapPin className="h-4 w-4 text-primary-green" />
										</div>
										<h3 className="text-xs font-semibold text-accent-dark-green uppercase tracking-wide">
											Pickup Location
										</h3>
									</div>
									{/* Only show "Change" button if multiple locations exist */}
									{selectionRequired && (
										<button
											onClick={prevStep}
											className="flex items-center space-x-1 text-xs text-primary-green hover:text-accent-dark-green transition-colors focus:outline-none focus:ring-2 focus:ring-primary-green focus:ring-offset-2 rounded px-2 py-1 bg-white border border-primary-green/20 hover:border-primary-green/40"
											aria-label="Change location"
										>
											<Edit2 className="h-3 w-3" />
											<span className="font-medium">Change</span>
										</button>
									)}
								</div>

								{/* Location details - compact */}
								<div className="space-y-1">
									<p className="text-sm font-bold text-accent-dark-green leading-tight">
										{displayLocation?.name || cart?.store_location_name}
									</p>
									{displayLocation && (
										<>
											{displayLocation.address_line1 && (
												<p className="text-xs text-accent-dark-brown/80 leading-tight">
													{displayLocation.address_line1}
												</p>
											)}
											{(displayLocation.city || displayLocation.state) && (
												<p className="text-xs text-accent-dark-brown/80 leading-tight">
													{displayLocation.city && displayLocation.state
														? `${displayLocation.city}, ${displayLocation.state} ${displayLocation.postal_code || ''}`
														: displayLocation.city || displayLocation.state}
												</p>
											)}
											{displayLocation.phone && (
												<p className="text-xs text-accent-dark-brown/70 leading-tight">
													{displayLocation.phone}
												</p>
											)}
										</>
									)}
								</div>
							</CardContent>
						</Card>
					)}

					{/* Order Summary */}
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
