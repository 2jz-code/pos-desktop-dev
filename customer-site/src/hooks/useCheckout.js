import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ordersAPI } from "@/api/orders";
import { paymentsAPI } from "@/api/payments";
import cartAPI from "@/api/cart";
import { useCart } from "./useCart";
import { useFinancialSettings } from "./useSettings";
import { useAuth } from "@/contexts/AuthContext";
import { useCartStore } from "@/store/cartStore"; // <-- 1. IMPORT THE STORE
import { cartKeys } from "./useCart"; // <-- 2. IMPORT CART QUERY KEYS
import { isValidEmail, isValidPhoneNumber } from "@ajeen/ui";

// Initial form data structure
const initialFormData = {
	firstName: "",
	lastName: "",
	email: "",
	phone: "",
	orderNotes: "",
	tip: 0,
};

export const useCheckout = () => {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { cart } = useCart();
	const { data: financialSettings } = useFinancialSettings();
	const { user, isAuthenticated } = useAuth();

	// State management
	const [currentStep, setCurrentStep] = useState(0); // Start at 0 for location selection
	const [formData, setFormData] = useState(initialFormData);
	const [isLoading, setIsLoading] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false); // <-- New state for payment submission
	const [error, setError] = useState(null);
	const [orderConfirmation, setOrderConfirmation] = useState(null);
	const [surchargeDisplay, setSurchargeDisplay] = useState(null); // <-- New state for surcharge display
	const setCheckoutCompleted = useCartStore(
		(state) => state.setCheckoutCompleted
	); // <-- 2. GET THE ACTION

	// Refs to prevent duplicate submissions
	const isProcessingRef = useRef(false);
	const paymentIntentRef = useRef(null);

	// Update form data
	const updateFormData = useCallback(
		(field, value) => {
			console.log('🎯 updateFormData called with field:', field, 'value:', value);
			setFormData((prev) => {
				const newFormData = { ...prev, [field]: value };
				console.log('🎯 updateFormData - previous formData:', prev);
				console.log('🎯 updateFormData - new formData:', newFormData);
				return newFormData;
			});
			// Clear error when user makes changes
			if (error) setError(null);
		},
		[error]
	);

	// Clear error
	const clearError = useCallback(() => {
		setError(null);
	}, []);



	// Validate form data - skip for authenticated users as we have their data
	const validateFormData = useCallback(() => {
		// For authenticated users, only validate order notes if needed
		if (isAuthenticated && user) {
			return null; // No validation errors for authenticated users
		}

		// For guest users, validate all fields
		const { firstName, lastName, email, phone } = formData;

		if (!firstName?.trim()) return "First name is required";
		if (!lastName?.trim()) return "Last name is required";
		if (!email?.trim()) return "Email is required";
		if (!phone?.trim()) return "Phone number is required";

		// Email validation using shared utility
		if (!isValidEmail(email)) return "Please enter a valid email address";

		// Phone validation using shared utility
		if (!isValidPhoneNumber(phone)) return "Please enter a valid phone number";

		return null;
	}, [formData, isAuthenticated, user]);

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

			// Tax rate comes from cart's location (location-specific)
			const taxRate = cartData.store_location_tax_rate
				? parseFloat(cartData.store_location_tax_rate)
				: 0; // No tax if location not selected yet

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

	// Fetch surcharge for display purposes
	const fetchSurchargeDisplay = useCallback(async () => {
		// Check if cart has totals (backend-calculated values)
		if (!cart || !cart.totals || !cart.totals.grand_total) return;

		try {
			// Use backend-calculated grand_total as the base for surcharge calculation
			const baseAmount = parseFloat(cart.totals.grand_total);

			const response = await paymentsAPI.calculateSurcharge(baseAmount);
			setSurchargeDisplay({
				amount: response.surcharge,
				baseAmount: baseAmount,
				totalWithSurcharge: baseAmount + response.surcharge
			});
		} catch (err) {
			console.warn('Failed to fetch surcharge display:', err);
			// Don't show error to user for display-only calculation
		}
	}, [cart]);

	// Fetch surcharge display when cart changes
	useEffect(() => {
		fetchSurchargeDisplay();
	}, [fetchSurchargeDisplay]);


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
		setCurrentStep((prev) => Math.max(prev - 1, 0)); // Allow going back to step 0 (location)
	}, []);

	// Handle location selection completion (Step 0 -> Step 1)
	const submitLocationSelection = useCallback((selectedLocationId) => {
		if (!selectedLocationId) {
			setError("Please select a pickup location to continue");
			return;
		}

		// Location is already set in cart by the LocationSelector component
		// Just move to next step
		setError(null);
		setCurrentStep(1);
	}, []);

	// NEW: Unified function to submit customer info
	const submitCustomerInfo = useCallback(async () => {
		const validationError = validateFormData();
		if (validationError) {
			setError(validationError);
			return; // Stop if validation fails
		}
		if (!cart?.id) {
			setError("No active cart found. Please add items to your cart first.");
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			// This data structure matches the new cart serializer
			const customerData = {
				guest_first_name: formData.firstName,
				guest_last_name: formData.lastName,
				guest_email: formData.email,
				guest_phone: formData.phone.replace(/[^\d]/g, ""), // Sanitize phone
			};

			// Call the cart API to update customer info
			await cartAPI.updateCustomerInfo(customerData);

			// Invalidate cart queries to refetch the updated cart data
			await queryClient.invalidateQueries({ queryKey: cartKeys.current() });

			// Proceed to the next step
			setCurrentStep((prev) => Math.min(prev + 1, 3));
		} catch (err) {
			console.error("Error updating customer info:", err);
			const errorMessage =
				err.response?.data?.error ||
				"A problem occurred while saving your information. Please try again.";
			setError(errorMessage);
			toast.error(errorMessage);
		} finally {
			setIsLoading(false);
		}
	}, [cart, formData, queryClient, validateFormData]);

	// Get or update cart (for guest users only)
	// Note: This doesn't create an order - it returns the cart. Cart → Order conversion happens atomically during payment.
	const createGuestOrder = useCallback(async () => {
		try {
			const totals = calculateOrderTotals(cart);
			if (!totals) throw new Error("Unable to calculate order totals");

			// Check if we already have a cart with items
			if (cart && cart.id && cart.items && cart.items.length > 0) {
				console.log("Using existing cart for guest checkout:", cart.id);
				console.log("Cart has", cart.items.length, "items");

				// Customer info should already be in cart from submitCustomerInfo
				// No need to update it here

				return cart; // Return the existing cart (will be converted to order during payment)
			}

			// If no cart exists, this shouldn't happen in the checkout flow
			// Cart should have been created when items were added
			throw new Error("No cart found. Please add items to your cart first.");
		} catch (err) {
			console.error("Error in createGuestOrder:", err);
			throw new Error(err.response?.data?.detail || "Failed to prepare order");
		}
	}, [cart, calculateOrderTotals]);

	// Note: For authenticated users, we use the cart directly as it's already an order

	// Create payment intent (for guest users)
	const createGuestPaymentIntent = useCallback(
		async (cartOrOrder) => {
			try {
				// Use backend-calculated grand_total (does NOT include surcharge)
				// Backend will add surcharge during payment processing
				if (!cart?.totals?.grand_total) throw new Error("Unable to get cart total");

				const paymentData = {
					cart_id: cart.id, // Use cart_id for web orders (atomic cart → order conversion)
					amount: cart.totals.grand_total,  // Backend total WITHOUT surcharge
					tip: formData.tip || 0,
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
				console.error("Error creating guest payment intent:", err);
				throw new Error(
					err.response?.data?.detail || "Failed to initialize payment"
				);
			}
		},
		[cart, formData, calculateOrderTotals]
	);

	// Note: Authenticated payment intents are now handled in handleAuthenticatedCheckout

	// Complete guest payment
	const completeGuestPayment = useCallback(async (paymentIntentId, tipAmount = 0) => {
		return await paymentsAPI.completeGuestPayment({
			payment_intent_id: paymentIntentId,
			tip: tipAmount,
		});
	}, []);

	// Note: Authenticated payment completion is now handled in handleAuthenticatedCheckout

	// Authenticated user checkout function (must be defined before submitOrder)
	const handleAuthenticatedCheckout = useCallback(
		async ({ stripe, cardElement, tipAmount = 0 }) => {
			try {
				setIsLoading(true);
				setError(null);

				console.log("Starting authenticated checkout...");
				console.log("Current order:", cart);

				if (!cart?.id) {
					throw new Error("No order found");
				}

				// Step 1: Create payment intent for authenticated user
				console.log("Creating authenticated payment intent...");
				console.log('🎯 Creating authenticated payment intent with tip:', tipAmount);
				const paymentIntentData =
					await paymentsAPI.createAuthenticatedPaymentIntent({
						cart_id: cart.id, // Use cart_id for web orders (atomic cart → order conversion)
						amount: cart.totals.grand_total,  // Backend total WITHOUT surcharge
						tip: tipAmount || 0,
						currency: "usd",
					});

				console.log("Payment intent created:", paymentIntentData);

				// Step 2: Confirm payment with Stripe
				console.log("Confirming payment with Stripe...");
				const { error: confirmError, paymentIntent } =
					await stripe.confirmCardPayment(paymentIntentData.client_secret, {
						payment_method: {
							card: cardElement,
							billing_details: {
								name:
									user.first_name && user.last_name
										? `${user.first_name} ${user.last_name}`
										: user.first_name || user.email,
								email: user.email,
							},
						},
					});

				if (confirmError) {
					console.error("Stripe confirmation error:", confirmError);
					throw new Error(confirmError.message);
				}

				console.log("Payment confirmed with Stripe:", paymentIntent);

				// Step 3: Complete payment on backend
				console.log("Completing payment on backend...");
				console.log('🎯 About to send payment completion with tipAmount:', tipAmount);
				console.log('🎯 Full formData at payment completion:', formData);
				const completionResponse =
					await paymentsAPI.completeAuthenticatedPayment({
						payment_intent_id: paymentIntent.id,
						tip: tipAmount,
					});

				console.log("Payment completed on backend:", completionResponse);

				// Use the order data returned from payment completion if available, otherwise fetch it
				if (completionResponse.order) {
					setOrderConfirmation(completionResponse.order);
				} else {
					const finalOrderData = await ordersAPI.getOrderForConfirmation(
						cart.id
					);
					setOrderConfirmation(finalOrderData);
				}

				toast.success("Payment successful!");

				// Clear cart and navigate with order data
				setCheckoutCompleted(true);
				queryClient.invalidateQueries({ queryKey: cartKeys.all }); // Invalidate all cart queries

				// Pass order data in URL to avoid the 404 API call issue
				const orderDataParam = encodeURIComponent(
					JSON.stringify(completionResponse.order)
				);
				navigate(
					`/checkout?step=confirmation&orderId=${cart.id}&orderData=${orderDataParam}`
				);
			} catch (err) {
				console.error("Authenticated checkout error:", err);
				setError(err.message || "Payment failed. Please try again.");
				toast.error(err.message || "Payment failed. Please try again.");
			} finally {
				setIsLoading(false);
			}
		},
		[cart, user, setCheckoutCompleted, navigate, queryClient]
	);

	// Submit order and process payment (unified for both user types)
	const submitOrder = useCallback(
		async ({ stripe, cardElement }) => {
			// Prevent multiple submissions
			if (isSubmitting) return;

			setIsSubmitting(true);
			setError(null);

			try {
				let paymentIntent;

				// Step 1: Create/get the cart and payment intent based on user type
				if (isAuthenticated && user) {
					console.log("Routing to authenticated checkout...");
					console.log('🎯 Passing tip to handleAuthenticatedCheckout:', formData.tip);
					// Use the new authenticated checkout method
					isProcessingRef.current = false; // Reset flag before calling
					setIsLoading(false);
					return handleAuthenticatedCheckout({ stripe, cardElement, tipAmount: formData.tip || 0 });
				} else {
					console.log("Processing guest user checkout...");
					// Get cart (not order - cart → order conversion happens during payment)
					await createGuestOrder(); // Ensures cart has guest info
					paymentIntent = await createGuestPaymentIntent(); // Uses cart.id internally
				}

				// Step 2: Confirm payment with Stripe
				console.log("Confirming payment with Stripe...");
				const billingDetails = {
					name:
						isAuthenticated && user
							? `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
							  user.first_name || user.email
							: `${formData.firstName} ${formData.lastName}`,
					email: isAuthenticated && user ? user.email : formData.email,
					phone:
						isAuthenticated && user
							? user.phone_number
							: formData.phone?.replace(/[^\d]/g, ""),
				};

				const { error: stripeError, paymentIntent: confirmedPayment } =
					await stripe.confirmCardPayment(paymentIntent.client_secret, {
						payment_method: {
							card: cardElement,
							billing_details: billingDetails,
						},
					});

				if (stripeError) {
					throw new Error(stripeError.message);
				}

				if (confirmedPayment.status === "succeeded") {
					// Step 3: Finalize order on backend
					console.log("Payment succeeded, finalizing order...");

					// Complete the guest payment (now returns order data directly)
					const completionResponse = await completeGuestPayment(
						confirmedPayment.id,
						formData.tip || 0
					);

					// Use the order data returned from payment completion
					setOrderConfirmation(completionResponse.order);
					const orderId = completionResponse.order.id; // Get order ID from response

					toast.success("Payment successful!");

					// Clear cart and navigate with order data
					setCheckoutCompleted(true);
					queryClient.invalidateQueries({ queryKey: cartKeys.all }); // Invalidate all cart queries

					// Pass order data in URL to avoid the 404 API call issue
					const orderDataParam = encodeURIComponent(
						JSON.stringify(completionResponse.order)
					);
					navigate(
						`/checkout?step=confirmation&orderId=${orderId}&orderData=${orderDataParam}`
					);
				} else {
					throw new Error("Payment was not completed successfully");
				}
			} catch (err) {
				console.error("Checkout error:", err);
				setError(err.message || "An unexpected error occurred during checkout");
				toast.error("Payment failed. Please try again.");
			} finally {
				setIsLoading(false);
				setIsSubmitting(false);
			}
		},
		[
			isLoading,
			isAuthenticated,
			user,
			handleAuthenticatedCheckout,
			createGuestOrder,
			createGuestPaymentIntent,
			completeGuestPayment,
			formData,
			cart,
			calculateOrderTotals,
			setCheckoutCompleted,
			navigate,
			queryClient,
			isSubmitting,
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
		isSubmitting, // <-- Expose new state
		error,
		orderConfirmation,
		surchargeDisplay, // <-- Expose surcharge display

		// User context
		isAuthenticated,
		user,

		// Actions
		updateFormData,
		nextStep,
		prevStep,
		submitLocationSelection,
		submitOrder,
		clearError,
		resetCheckout,

		// Computed values
		orderTotals: calculateOrderTotals(cart),
		isFormValid: !validateFormData(),

		// New authenticated checkout function
		handleAuthenticatedCheckout,

		// NEW: Unified function to submit customer info
		submitCustomerInfo,
	};
};
