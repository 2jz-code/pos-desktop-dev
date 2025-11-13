import apiClient from "./client";

/**
 * Cart API Service for Customer Website
 *
 * Handles cart operations for the new cart system.
 * The cart is a mutable staging area that converts to an order during payment.
 *
 * Flow:
 * 1. Add items to cart (no location required)
 * 2. Set location at checkout
 * 3. Create payment with cart_id (atomic conversion to order)
 */
export const cartAPI = {
	/**
	 * Get current cart for the user/session
	 *
	 * Returns cart with items and totals.
	 * Works for both authenticated users and guests.
	 */
	getCart: async () => {
		try {
			const response = await apiClient.get("/cart/");
			return response.data;
		} catch (error) {
			// Cart might not exist yet, return empty cart structure
			if (error.response && error.response.status === 404) {
				return {
					id: null,
					items: [],
					totals: {
						subtotal: "0.00",
						discount_total: "0.00",
						tax_total: "0.00",
						grand_total: "0.00",
						item_count: 0,
						has_location: false
					},
					store_location_id: null,
					store_location_name: null
				};
			}
			throw error;
		}
	},

	/**
	 * Add item to cart
	 *
	 * @param {string} productId - UUID of the product
	 * @param {number} quantity - Quantity to add (default: 1)
	 * @param {string} notes - Customer notes (default: "")
	 * @param {array} selectedModifiers - Array of {option_id, quantity} (default: [])
	 * @returns {object} Updated cart data
	 */
	addItem: async (productId, quantity = 1, notes = "", selectedModifiers = []) => {
		const response = await apiClient.post("/cart/add-item/", {
			product_id: productId,
			quantity,
			notes,
			selected_modifiers: selectedModifiers,
		});
		return response.data;
	},

	/**
	 * Update cart item quantity
	 *
	 * @param {string} itemId - UUID of the cart item
	 * @param {number} quantity - New quantity
	 * @returns {object} Updated cart data
	 */
	updateItem: async (itemId, quantity) => {
		const response = await apiClient.patch(`/cart/update-item/${itemId}/`, {
			quantity,
		});
		return response.data;
	},

	/**
	 * Remove item from cart
	 *
	 * @param {string} itemId - UUID of the cart item
	 * @returns {object} Updated cart data
	 */
	removeItem: async (itemId) => {
		const response = await apiClient.delete(`/cart/remove-item/${itemId}/`);
		return response.data;
	},

	/**
	 * Clear all items from cart
	 *
	 * @returns {object} Empty cart data
	 */
	clearCart: async () => {
		const response = await apiClient.delete("/cart/clear/");
		return response.data;
	},

	/**
	 * Set store location for cart (checkout step 1)
	 *
	 * This is required before payment can be processed.
	 * Setting the location enables tax calculation.
	 *
	 * @param {string} storeLocationId - UUID of the store location
	 * @returns {object} Updated cart data with tax calculations
	 */
	setLocation: async (storeLocationId) => {
		const response = await apiClient.post("/cart/set-location/", {
			store_location_id: storeLocationId,
		});
		return response.data;
	},

	/**
	 * Update customer information on cart (checkout step 2)
	 *
	 * Stores guest customer info that will be transferred to the order during payment.
	 *
	 * @param {object} customerInfo - Customer information
	 * @param {string} customerInfo.guest_first_name - First name
	 * @param {string} customerInfo.guest_last_name - Last name
	 * @param {string} customerInfo.guest_email - Email address
	 * @param {string} customerInfo.guest_phone - Phone number
	 * @returns {object} Updated cart data
	 */
	updateCustomerInfo: async (customerInfo) => {
		const response = await apiClient.patch("/cart/update-customer-info/", customerInfo);
		return response.data;
	},

	/**
	 * Get cart item count
	 *
	 * @returns {number} Total number of items in cart
	 */
	getItemCount: async () => {
		try {
			const cart = await cartAPI.getCart();
			return cart?.totals?.item_count || 0;
		} catch (error) {
			console.error("Error getting cart count:", error);
			return 0;
		}
	},

	/**
	 * Helper: Check if cart has items
	 *
	 * @returns {boolean} True if cart has items
	 */
	hasItems: async () => {
		const cart = await cartAPI.getCart();
		return cart?.totals?.item_count > 0;
	},

	/**
	 * Helper: Check if cart has location set
	 *
	 * @returns {boolean} True if location is set
	 */
	hasLocation: async () => {
		const cart = await cartAPI.getCart();
		return cart?.totals?.has_location === true;
	},

	/**
	 * Reorder - Recreate a past order by copying all items into cart
	 *
	 * This clears the current cart and adds all items from the specified order.
	 * User must be authenticated and own the order.
	 *
	 * @param {string} orderId - UUID of the order to reorder
	 * @returns {object} Updated cart data with reordered items
	 */
	reorder: async (orderId) => {
		const response = await apiClient.post("/cart/reorder/", {
			order_id: orderId,
		});
		return response.data;
	},

	/**
	 * DEPRECATED: checkout endpoint no longer used
	 *
	 * For atomic cart → order conversion, use the payment endpoint directly with cart_id:
	 * - Guest: paymentsAPI.createGuestPaymentIntent({ cart_id, amount, tip })
	 * - Auth: paymentsAPI.createAuthenticatedPaymentIntent({ cart_id, amount, tip })
	 */
	checkout: async () => {
		throw new Error(
			"Cart checkout endpoint is deprecated. " +
			"Use payment API with cart_id for atomic conversion. " +
			"See paymentsAPI.createGuestPaymentIntent() or paymentsAPI.createAuthenticatedPaymentIntent()"
		);
	},
};

export default cartAPI;
