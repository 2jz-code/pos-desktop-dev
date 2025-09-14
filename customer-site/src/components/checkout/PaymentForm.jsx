import React, { useState, useEffect } from "react";
import { CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TipSelector from "./TipSelector";
import {
	ArrowLeft,
	CreditCard,
	Lock,
	Shield,
	UserCheck,
	User,
} from "lucide-react";

const PaymentForm = ({
	formData,
	updateFormData,
	onBack,
	onSubmit,
	isLoading,
	isAuthenticated,
	user,
	cart,
}) => {
	const stripe = useStripe();
	const elements = useElements();
	const [cardComplete, setCardComplete] = useState(false);
	const [cardError, setCardError] = useState(null);
	const [isProcessing, setIsProcessing] = useState(false);

	// Get current tip from formData, default to 0
	const currentTip = formData.tip || 0;
	
	// Get subtotal for tip calculation
	const subtotal = cart?.subtotal || 0;

	useEffect(() => {
		if (!isLoading) {
			setIsProcessing(false);
		}
	}, [isLoading]);

	const handleCardChange = (event) => {
		setCardComplete(event.complete);
		setCardError(event.error ? event.error.message : null);
	};

	const handleTipChange = (tipAmount) => {
		// Update formData with tip amount for payment processing
		console.log('🎯 TipSelector called handleTipChange with:', tipAmount);
		updateFormData('tip', tipAmount);
		console.log('🎯 After updateFormData, formData.tip should be:', tipAmount);
		// Note: OrderSummary will handle display calculations using this tip amount
	};

	const handleSubmit = async (e) => {
		e.preventDefault();

		if (!stripe || !elements || !cardComplete || isLoading || isProcessing) {
			return;
		}

		console.log('🎯 PaymentForm handleSubmit - Current formData.tip:', formData.tip);
		console.log('🎯 PaymentForm handleSubmit - Full formData:', formData);

		setIsProcessing(true);

		const cardElement = elements.getElement(CardElement);

		// Call the parent's submit handler with Stripe elements
		await onSubmit({
			stripe,
			elements,
			cardElement,
		});
	};

	const cardElementOptions = {
		style: {
			base: {
				fontSize: "16px",
				color: "#3f2f1e", // accent-dark-brown
				fontFamily: "Inter, system-ui, sans-serif",
				"::placeholder": {
					color: "#9ca3af",
				},
			},
			invalid: {
				color: "#dc2626",
				iconColor: "#dc2626",
			},
		},
		hidePostalCode: false,
	};

	return (
		<div className="relative">
			{/* Loading Overlay */}
			{(isLoading || isProcessing) && (
				<div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-lg">
					<div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-green"></div>
					<p className="mt-4 text-lg font-medium text-accent-dark-green">
						Processing Payment...
					</p>
				</div>
			)}
			<CardHeader className="px-0 pt-0">
				<CardTitle className="text-accent-dark-green flex items-center">
					<CreditCard className="mr-2 h-5 w-5" />
					Payment Information
				</CardTitle>
			</CardHeader>

			<CardContent className="px-0 pt-3">
				<form
					onSubmit={handleSubmit}
					className="space-y-6"
				>
					{/* Order Summary Preview */}
					<div className="bg-primary-beige/30 rounded-lg p-4 border border-accent-subtle-gray/30">
						<h4 className="font-medium text-accent-dark-brown mb-3 flex items-center">
							{isAuthenticated ? (
								<>
									<UserCheck className="mr-2 h-4 w-4" />
									Order for:
								</>
							) : (
								<>
									<User className="mr-2 h-4 w-4" />
									Order for:
								</>
							)}
						</h4>

						{isAuthenticated && user ? (
							// Show form data for authenticated users (may have been modified in previous step)
							<div className="space-y-2">
								<p className="text-sm text-accent-dark-brown/80 font-medium">
									{formData.firstName && formData.lastName
										? `${formData.firstName} ${formData.lastName}`
										: formData.firstName || formData.lastName || (user?.first_name && user?.last_name ? `${user.first_name} ${user.last_name}` : user?.first_name)}
								</p>
								<p className="text-sm text-accent-dark-brown/70">
									{formData.email || user.email}
								</p>
								{(formData.phone || user.phone_number) && (
									<p className="text-sm text-accent-dark-brown/70">
										{formData.phone || user.phone_number}
									</p>
								)}
								{formData.orderNotes && (
									<div className="mt-3 pt-2 border-t border-accent-subtle-gray/20">
										<p className="text-xs text-accent-dark-brown/60">
											Order Notes:
										</p>
										<p className="text-sm text-accent-dark-brown/80">
											{formData.orderNotes}
										</p>
									</div>
								)}
							</div>
						) : (
							// Show guest user information
							<div className="space-y-2">
								<p className="text-sm text-accent-dark-brown/80 font-medium">
									{formData.firstName} {formData.lastName}
								</p>
								<p className="text-sm text-accent-dark-brown/70">
									{formData.email}
								</p>
								<p className="text-sm text-accent-dark-brown/70">
									{formData.phone}
								</p>
								{formData.orderNotes && (
									<div className="mt-3 pt-2 border-t border-accent-subtle-gray/20">
										<p className="text-xs text-accent-dark-brown/60">
											Order Notes:
										</p>
										<p className="text-sm text-accent-dark-brown/80">
											{formData.orderNotes}
										</p>
									</div>
								)}
							</div>
						)}
					</div>

					{/* Tip Selection */}
					<TipSelector
						onTipChange={handleTipChange}
						subtotal={subtotal}
						currentTip={currentTip}
					/>

					{/* Payment Method */}
					<div className="space-y-4">
						<div className="flex items-center justify-between">
							<h3 className="text-lg font-medium text-accent-dark-brown">
								Payment Method
							</h3>
							<div className="flex items-center text-sm text-accent-dark-brown/60">
								<Lock className="h-4 w-4 mr-1" />
								Secure Payment
							</div>
						</div>

						{/* Card Element Container */}
						<div className="border border-accent-subtle-gray/50 rounded-lg p-4 bg-white focus-within:border-primary-green focus-within:ring-2 focus-within:ring-primary-green/20 transition-all">
							<CardElement
								options={cardElementOptions}
								onChange={handleCardChange}
							/>
						</div>

						{/* Card Error */}
						{cardError && (
							<p className="text-red-600 text-sm flex items-center">
								<Shield className="h-4 w-4 mr-1" />
								{cardError}
							</p>
						)}

						{/* Security Information */}
						<div className="bg-green-50 border border-green-200 rounded-lg p-3">
							<div className="flex items-start">
								<Shield className="h-4 w-4 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
								<div className="text-sm">
									<p className="text-green-800 font-medium">
										Secure and Encrypted Payment
									</p>
									<p className="text-green-700 mt-1">
										Your payment is processed securely. Your card details are
										encrypted and never stored on our servers.
									</p>
								</div>
							</div>
						</div>
					</div>

					{/* Action Buttons */}
					<div className="flex flex-col sm:flex-row gap-3 pt-4">
						<Button
							type="button"
							variant="outline"
							onClick={onBack}
							disabled={isLoading || isProcessing}
							className="flex-1 border-accent-subtle-gray/50 text-accent-dark-brown hover:bg-primary-beige/50"
						>
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back to Information
						</Button>

						<Button
							type="submit"
							disabled={!stripe || !cardComplete || isLoading || isProcessing}
							className="flex-1 bg-primary-green hover:bg-accent-dark-green text-accent-light-beige py-3 text-base font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{isLoading || isProcessing ? (
								<div className="flex items-center justify-center">
									<div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-accent-light-beige mr-2"></div>
									Processing Payment...
								</div>
							) : (
								<div className="flex items-center justify-center">
									<Lock className="mr-2 h-4 w-4" />
									Complete Order
								</div>
							)}
						</Button>
					</div>

					{/* Terms and Privacy */}
					<div className="text-xs text-accent-dark-brown/60 text-center">
						By completing your order, you agree to our{" "}
						<a
							href="/terms"
							className="text-primary-green hover:underline"
						>
							Terms of Service
						</a>{" "}
						and{" "}
						<a
							href="/privacy"
							className="text-primary-green hover:underline"
						>
							Privacy Policy
						</a>
						.
					</div>
				</form>
			</CardContent>
		</div>
	);
};

export default PaymentForm;
