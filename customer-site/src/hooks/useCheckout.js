import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ordersAPI } from "@/api/orders";
import { paymentsAPI } from "@/api/payments";
import { useCart } from "./useCart";
import { useFinancialSettings } from "./useSettings";

// Initial form data structure
const initialFormData = {
	firstName: "",
	lastName: "",
	email: "",
	phone: "",
	orderNotes: "",
};

export const useCheckout = () => {
	const navigate = useNavigate();
	const { cart, clearCart } = useCart();
	const { data: financialSettings } = useFinancialSettings();

	// State management
	const [currentStep, setCurrentStep] = useState(1);
	const [formData, setFormData] = useState(initialFormData);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);
	const [orderConfirmation, setOrderConfirmation] = useState(null);

	// Refs to prevent duplicate submissions
	const isProcessingRef = useRef(false);
	const paymentIntentRef = useRef(null);

	// Update form data
	const updateFormData = useCallback(
		(field, value) => {
			setFormData((prev) => ({ ...prev, [field]: value }));
			// Clear error when user makes changes
			if (error) setError(null);
		},
		[error]
	);

	// Clear error
	const clearError = useCallback(() => {
		setError(null);
	}, []);

	// Validate form data
	const validateFormData = useCallback(() => {
		const { firstName, lastName, email, phone } = formData;

		if (!firstName?.trim()) return "First name is required";
		if (!lastName?.trim()) return "Last name is required";
		if (!email?.trim()) return "Email is required";
		if (!phone?.trim()) return "Phone number is required";

		// Basic email validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) return "Please enter a valid email address";

		// Basic phone validation (at least 10 digits)
		const phoneDigits = phone.replace(/\D/g, "");
		if (phoneDigits.length < 10) return "Please enter a valid phone number";

		return null;
	}, [formData]);

	// Calculate order totals - Use backend values when available
	const calculateOrderTotals = useCallback(
		(cartData) => {
			if (!cartData) return null;

			// Prefer backend-calculated values if available
			if (
				cartData.subtotal !== undefined &&
				cartData.grand_total !== undefined
			) {
				return {
					subtotal: parseFloat(cartData.subtotal || 0),
					surchargeAmount: parseFloat(cartData.surcharges_total || 0),
					taxAmount: parseFloat(cartData.tax_total || 0),
					total: parseFloat(cartData.grand_total || 0),
				};
			}

			// Fallback to frontend calculation if backend values not available
			if (!cartData.items) return null;

			const subtotal = cartData.items.reduce((sum, item) => {
				const itemPrice = parseFloat(
					item.price_at_sale || item.product.price || 0
				);
				return sum + itemPrice * item.quantity;
			}, 0);

			// Use backend settings or fallback rates
			const surchargeRate = financialSettings?.surcharge_percentage
				? parseFloat(financialSettings.surcharge_percentage)
				: 0.035; // 3.5%
			const taxRate = financialSettings?.tax_rate
				? parseFloat(financialSettings.tax_rate)
				: 0.08125; // 8.125%

			const surchargeAmount = subtotal * surchargeRate;
			const taxableAmount = subtotal + surchargeAmount;
			const taxAmount = taxableAmount * taxRate;
			const total = taxableAmount + taxAmount;

			return {
				subtotal: parseFloat(subtotal.toFixed(2)),
				surchargeAmount: parseFloat(surchargeAmount.toFixed(2)),
				taxAmount: parseFloat(taxAmount.toFixed(2)),
				total: parseFloat(total.toFixed(2)),
			};
		},
		[financialSettings]
	);

	// Step navigation
	const nextStep = useCallback(() => {
		const validationError = validateFormData();
		if (validationError) {
			setError(validationError);
			return;
		}

		setError(null);
		setCurrentStep((prev) => Math.min(prev + 1, 3));
	}, [validateFormData]);

	const prevStep = useCallback(() => {
		setError(null);
		setCurrentStep((prev) => Math.max(prev - 1, 1));
	}, []);

	// Create or update guest order
	const createGuestOrder = useCallback(async () => {
		try {
			const totals = calculateOrderTotals(cart);
			if (!totals) throw new Error("Unable to calculate order totals");

			// First, ensure guest session is initialized
			try {
				await ordersAPI.initGuestSession();
				console.log("Guest session initialized");
			} catch (sessionError) {
				console.warn("Session initialization failed:", sessionError);
			}

			// Create or get guest order (no data needed - it creates from session)
			const response = await ordersAPI.createGuestOrder();

			// Then update guest contact information
			if (response.id && formData.email) {
				try {
					await ordersAPI.updateGuestInfo(response.id, {
						email: formData.email,
						phone: formData.phone.replace(/[^\d]/g, ""), // Send raw digits
					});
				} catch (updateError) {
					console.warn("Failed to update guest info:", updateError);
				}
			}

			return response;
		} catch (err) {
			console.error("Error creating guest order:", err);
			throw new Error(err.response?.data?.detail || "Failed to create order");
		}
	}, [cart, formData, calculateOrderTotals]);

	// Create payment intent
	const createPaymentIntent = useCallback(
		async (order) => {
			try {
				const totals = calculateOrderTotals(cart);
				if (!totals) throw new Error("Unable to calculate order totals");

				const paymentData = {
					order_id: order.id,
					amount: totals.total,
					currency: "usd",
					customer_email: formData.email,
					customer_name: `${formData.firstName} ${formData.lastName}`,
				};

				const paymentIntent = await paymentsAPI.createGuestPaymentIntent(
					paymentData
				);
				paymentIntentRef.current = paymentIntent;
				return paymentIntent;
			} catch (err) {
				console.error("Error creating payment intent:", err);
				throw new Error(
					err.response?.data?.detail || "Failed to initialize payment"
				);
			}
		},
		[cart, formData, calculateOrderTotals]
	);

	// Submit order and process payment
	const submitOrder = useCallback(
		async ({ stripe, cardElement }) => {
			// Prevent duplicate submissions
			if (isProcessingRef.current || isLoading) {
				console.log(
					"Already processing payment, ignoring duplicate submission"
				);
				return;
			}

			isProcessingRef.current = true;
			setIsLoading(true);
			setError(null);

			try {
				// Step 1: Create the guest order
				console.log("Creating guest order...");
				const order = await createGuestOrder();

				// Step 2: Create payment intent
				console.log("Creating payment intent...");
				const paymentIntent = await createPaymentIntent(order);

				// Step 3: Confirm payment with Stripe
				console.log("Confirming payment with Stripe...");
				const { error: stripeError, paymentIntent: confirmedPayment } =
					await stripe.confirmCardPayment(paymentIntent.client_secret, {
						payment_method: {
							card: cardElement,
							billing_details: {
								name: `${formData.firstName} ${formData.lastName}`,
								email: formData.email,
								phone: formData.phone.replace(/[^\d]/g, ""),
							},
						},
					});

				if (stripeError) {
					throw new Error(stripeError.message);
				}

				if (confirmedPayment.status === "succeeded") {
					// Step 4: Finalize order on backend
					console.log("Payment succeeded, finalizing order...");

					// Complete the payment on the backend
					await paymentsAPI.completeGuestPayment({
						payment_intent_id: confirmedPayment.id,
						order_id: order.id,
					});

					// Prepare order confirmation data
					const confirmationData = {
						id: order.id,
						orderNumber: order.order_number || order.id,
						customerName: `${formData.firstName} ${formData.lastName}`,
						customerEmail: formData.email,
						customerPhone: formData.phone,
						items: cart.items,
						grandTotal: calculateOrderTotals(cart).total,
						paymentIntentId: confirmedPayment.id,
					};

					// Clear cart
					clearCart();

					// Navigate to confirmation page with order data
					const orderDataParam = encodeURIComponent(
						JSON.stringify(confirmationData)
					);
					navigate(`/checkout?step=confirmation&orderData=${orderDataParam}`);

					// Show success message
					toast.success("Order placed successfully!");

					console.log("Order completed successfully");
				} else {
					throw new Error("Payment was not completed successfully");
				}
			} catch (err) {
				console.error("Checkout error:", err);
				setError(err.message || "An unexpected error occurred during checkout");
				toast.error("Payment failed. Please try again.");
			} finally {
				setIsLoading(false);
				isProcessingRef.current = false;
			}
		},
		[
			isLoading,
			createGuestOrder,
			createPaymentIntent,
			formData,
			cart,
			calculateOrderTotals,
			clearCart,
			navigate,
		]
	);

	// Reset checkout state
	const resetCheckout = useCallback(() => {
		setCurrentStep(1);
		setFormData(initialFormData);
		setIsLoading(false);
		setError(null);
		setOrderConfirmation(null);
		isProcessingRef.current = false;
		paymentIntentRef.current = null;
	}, []);

	return {
		// State
		currentStep,
		formData,
		isLoading,
		error,
		orderConfirmation,

		// Actions
		updateFormData,
		nextStep,
		prevStep,
		submitOrder,
		clearError,
		resetCheckout,

		// Computed values
		orderTotals: calculateOrderTotals(cart),
		isFormValid: !validateFormData(),
	};
};
