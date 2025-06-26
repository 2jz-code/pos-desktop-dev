import React, { useState } from "react";
import { CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CreditCard, Lock, Shield } from "lucide-react";

const PaymentForm = ({ formData, onBack, onSubmit, isLoading }) => {
	const stripe = useStripe();
	const elements = useElements();
	const [cardComplete, setCardComplete] = useState(false);
	const [cardError, setCardError] = useState(null);

	const handleCardChange = (event) => {
		setCardComplete(event.complete);
		setCardError(event.error ? event.error.message : null);
	};

	const handleSubmit = async (e) => {
		e.preventDefault();

		if (!stripe || !elements || !cardComplete || isLoading) {
			return;
		}

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
		<div>
			<CardHeader className="px-0 pt-0">
				<CardTitle className="text-accent-dark-green flex items-center">
					<CreditCard className="mr-2 h-5 w-5" />
					Payment Information
				</CardTitle>
				<p className="text-accent-dark-brown/70 text-sm">
					Your payment information is secure and encrypted.
				</p>
			</CardHeader>

			<CardContent className="px-0">
				<form
					onSubmit={handleSubmit}
					className="space-y-6"
				>
					{/* Order Summary Preview */}
					<div className="bg-primary-beige/30 rounded-lg p-4 border border-accent-subtle-gray/30">
						<h4 className="font-medium text-accent-dark-brown mb-2">
							Order for:
						</h4>
						<p className="text-sm text-accent-dark-brown/80">
							{formData.firstName} {formData.lastName}
						</p>
						<p className="text-sm text-accent-dark-brown/80">
							{formData.email}
						</p>
						<p className="text-sm text-accent-dark-brown/80">
							{formData.phone}
						</p>
					</div>

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
										Your payment is secure
									</p>
									<p className="text-green-700 mt-1">
										We use Stripe's secure payment processing. Your card details
										are encrypted and never stored on our servers.
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
							disabled={isLoading}
							className="flex-1 border-accent-subtle-gray/50 text-accent-dark-brown hover:bg-primary-beige/50"
						>
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back to Information
						</Button>

						<Button
							type="submit"
							disabled={!stripe || !cardComplete || isLoading}
							className="flex-1 bg-primary-green hover:bg-accent-dark-green text-accent-light-beige py-3 text-base font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{isLoading ? (
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
