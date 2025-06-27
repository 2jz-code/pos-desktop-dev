import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ordersAPI } from "@/api/orders";
import { paymentsAPI } from "@/api/payments";
import { useCart } from "./useCart";
import { useFinancialSettings } from "./useSettings";
import { useAuth } from "@/contexts/AuthContext";
import { useCartStore } from "@/store/cartStore"; // <-- 1. IMPORT THE STORE
import { cartKeys } from "./useCart"; // <-- 2. IMPORT CART QUERY KEYS

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
	const queryClient = useQueryClient();
	const { cart } = useCart();
	const { data: financialSettings } = useFinancialSettings();
	const { user, isAuthenticated } = useAuth();

	// State management
	const [currentStep, setCurrentStep] = useState(1);
	const [formData, setFormData] = useState(initialFormData);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);
	const [orderConfirmation, setOrderConfirmation] = useState(null);
	const setCheckoutCompleted = useCartStore(
		(state) => state.setCheckoutCompleted
	); // <-- 2. GET THE ACTION

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

		// Basic email validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) return "Please enter a valid email address";

		// Basic phone validation (at least 10 digits)
		const phoneDigits = phone.replace(/\D/g, "");
		if (phoneDigits.length < 10) return "Please enter a valid phone number";

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
			// This data structure matches the new serializer
			const customerData = {
				guest_first_name: formData.firstName,
				guest_last_name: formData.lastName,
				guest_email: formData.email,
				guest_phone: formData.phone.replace(/[^\d]/g, ""), // Sanitize phone
			};

			// Call the new unified endpoint
			await ordersAPI.updateCustomerInfo(cart.id, customerData);

			// Invalidate cart queries to refetch the updated order data
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

	// Create or update guest order (for guest users only)
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
			if (
				response.id &&
				(formData.firstName ||
					formData.lastName ||
					formData.email ||
					formData.phone)
			) {
				try {
					const updateData = {};
					if (formData.firstName) updateData.first_name = formData.firstName;
					if (formData.lastName) updateData.last_name = formData.lastName;
					if (formData.email) updateData.email = formData.email;
					if (formData.phone)
						updateData.phone = formData.phone.replace(/[^\d]/g, ""); // Send raw digits

					await ordersAPI.updateGuestInfo(response.id, updateData);
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

	// Note: For authenticated users, we use the cart directly as it's already an order

	// Create payment intent (for guest users)
	const createGuestPaymentIntent = useCallback(
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
	const completeGuestPayment = useCallback(async (paymentIntentId, orderId) => {
		return await paymentsAPI.completeGuestPayment({
			payment_intent_id: paymentIntentId,
			order_id: orderId,
		});
	}, []);

	// Note: Authenticated payment completion is now handled in handleAuthenticatedCheckout

	// Authenticated user checkout function (must be defined before submitOrder)
	const handleAuthenticatedCheckout = useCallback(
		async ({ stripe, cardElement }) => {
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
				const paymentIntentData =
					await paymentsAPI.createAuthenticatedPaymentIntent({
						order_id: cart.id,
						amount: cart.grand_total,
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
										: user.username,
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
				const completionResponse =
					await paymentsAPI.completeAuthenticatedPayment({
						payment_intent_id: paymentIntent.id,
						order_id: cart.id,
					});

				console.log("Payment completed:", completionResponse);

				// Step 4: Prepare confirmation data in the format expected by OrderConfirmation component
				const confirmationData = {
					id: cart.id,
					orderNumber: cart.order_number || cart.id,
					customerName:
						user.first_name && user.last_name
							? `${user.first_name} ${user.last_name}`
							: user.username,
					customerEmail: user.email,
					customerPhone: user.phone || "",
					items: cart.items,
					grandTotal: cart.grand_total,
					total: cart.grand_total, // Alternative field name for compatibility
					subtotal: cart.subtotal,
					taxAmount: cart.tax_total,
					surchargeAmount: cart.surcharges_total,
					status: "PREPARING", // Order is being prepared after payment confirmation
					paymentIntentId: paymentIntent.id,
					paymentDetails: completionResponse,
				};

				console.log(
					"Navigating to dedicated confirmation page with order data:",
					confirmationData
				);

				// Navigate to dedicated confirmation page with order data
				const queryParams = new URLSearchParams({
					orderData: encodeURIComponent(JSON.stringify(confirmationData)),
				});

				setCheckoutCompleted(true);
				// Clear cart data immediately to update UI
				queryClient.invalidateQueries({ queryKey: cartKeys.current() });

				navigate(`/confirmation?${queryParams.toString()}`);

				toast.success("Order placed successfully!");

				console.log("Authenticated checkout completed successfully");
			} catch (error) {
				console.error("Authenticated checkout error:", error);
				setError(error.message || "Payment failed. Please try again.");
				toast.error(error.message || "Payment failed. Please try again.");
			} finally {
				setIsLoading(false);
			}
		},
		[cart, user, setCheckoutCompleted, navigate, queryClient]
	);

	// Submit order and process payment (unified for both user types)
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
				let order, paymentIntent;

				// Step 1: Create/get the order based on user type
				if (isAuthenticated && user) {
					console.log("Routing to authenticated checkout...");
					// Use the new authenticated checkout method
					isProcessingRef.current = false; // Reset flag before calling
					setIsLoading(false);
					return handleAuthenticatedCheckout({ stripe, cardElement });
				} else {
					console.log("Processing guest user order...");
					order = await createGuestOrder();
					paymentIntent = await createGuestPaymentIntent(order);
				}

				// Step 2: Confirm payment with Stripe
				console.log("Confirming payment with Stripe...");
				const billingDetails = {
					name:
						isAuthenticated && user
							? `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
							  user.username
							: `${formData.firstName} ${formData.lastName}`,
					email: isAuthenticated && user ? user.email : formData.email,
					phone:
						isAuthenticated && user
							? user.phone
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

					// Complete the guest payment (authenticated users are handled separately)
					await completeGuestPayment(confirmedPayment.id, order.id);

					// Prepare order confirmation data
					const confirmationData = {
						id: order.id,
						orderNumber: order.order_number || order.id,
						customerName: billingDetails.name,
						customerEmail: billingDetails.email,
						customerPhone: billingDetails.phone,
						items: cart.items,
						grandTotal: calculateOrderTotals(cart).total,
						subtotal: calculateOrderTotals(cart).subtotal,
						taxAmount: calculateOrderTotals(cart).taxAmount,
						surchargeAmount: calculateOrderTotals(cart).surchargeAmount,
						status: "PREPARING", // Order is being prepared after payment confirmation
						paymentIntentId: confirmedPayment.id,
					};

					// Navigate to dedicated confirmation page with order data
					const queryParams = new URLSearchParams({
						orderData: encodeURIComponent(JSON.stringify(confirmationData)),
					});

					setCheckoutCompleted(true);
					// Clear cart data immediately to update UI
					queryClient.invalidateQueries({ queryKey: cartKeys.current() });

					navigate(`/confirmation?${queryParams.toString()}`);

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

		// User context
		isAuthenticated,
		user,

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

		// New authenticated checkout function
		handleAuthenticatedCheckout,

		// NEW: Unified function to submit customer info
		submitCustomerInfo,
	};
};
