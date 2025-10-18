import apiClient from "./client";

// Helper function to check if user is authenticated
// Since we use HTTP-only cookies, we need to make an API call
// DEPRECATED: This is no longer needed as the new cart logic is unified.
// const isUserAuthenticated = async () => { ... };

// Orders API service for customer website with guest user support
export const ordersAPI = {
	getPendingOrder: async () => {
		try {
			const response = await apiClient.get("/customers/orders/pending/");
			return response.data;
		} catch (error) {
			if (error.response && error.response.status === 404) {
				return null; // No pending order found, which is a valid state
			}
			throw error; // Re-throw other errors
		}
	},
	// Create a new order (supports both authenticated and guest users)
	createOrder: async (orderData) => {
		const response = await apiClient.post("/orders/", {
			order_type: "WEB", // Specify this is from the website
			...orderData,
		});
		return response.data;
	},

	// Update customer info for an order (for both guest and auth users)
	updateCustomerInfo: async (orderId, customerData) => {
		const response = await apiClient.patch(
			`/orders/${orderId}/update-customer-info/`,
			customerData
		);
		return response.data;
	},

	// Get order by ID
	getOrder: async (orderId) => {
		const response = await apiClient.get(`/customers/orders/${orderId}/`);
		return response.data;
	},

	// Get full order details for confirmation view (with all needed data)
	getOrderForConfirmation: async (orderId) => {
		const response = await apiClient.get(`/customers/orders/${orderId}/`);
		return response.data;
	},

	// Get current user's orders (works for both auth and guest)
	getCurrentUserOrders: async (url = "/customers/orders/") => {
		// Use customer-specific endpoint to avoid conflicts with admin authentication
		const response = await apiClient.get(url);
		return response.data;
	},

	// Add item to order
	addItemToOrder: async (orderId, itemData) => {
		const response = await apiClient.post(
			`/orders/${orderId}/items/`,
			itemData
		);
		return response.data;
	},

	// Update item quantity in order
	updateOrderItem: async (orderId, itemId, quantity) => {
		const response = await apiClient.patch(
			`/orders/${orderId}/items/${itemId}/`,
			{
				quantity,
			}
		);
		return response.data;
	},

	// Remove item from order
	removeOrderItem: async (orderId, itemId) => {
		const response = await apiClient.delete(
			`/orders/${orderId}/items/${itemId}/`
		);
		return response.data;
	},

	// Clear all items from order
	clearOrderItems: async (orderId) => {
		const response = await apiClient.delete(`/orders/${orderId}/items/clear/`);
		return response.data;
	},

	// Update guest contact information (deprecated - use updateCustomerInfo instead)
	updateGuestInfo: async (orderId, contactData) => {
		const response = await apiClient.patch(
			`/orders/${orderId}/update-customer-info/`,
			contactData
		);
		return response.data;
	},

	// Convert guest order to user account
	convertGuestToUser: async (orderId, userData) => {
		const response = await apiClient.post(
			`/orders/${orderId}/convert-to-user/`,
			userData
		);
		return response.data;
	},

	// Apply discount to order
	applyDiscount: async (orderId, discountId) => {
		const response = await apiClient.post(
			`/orders/${orderId}/apply-discount/`,
			{
				discount_id: discountId,
			}
		);
		return response.data;
	},

	// Remove discount from order
	removeDiscount: async (orderId, discountId) => {
		const response = await apiClient.delete(
			`/orders/${orderId}/remove-discount/`,
			{
				data: { discount_id: discountId },
			}
		);
		return response.data;
	},

	// Update order status (for tracking)
	updateOrderStatus: async (orderId, status) => {
		const response = await apiClient.patch(`/orders/${orderId}/`, { status });
		return response.data;
	},

	// Cancel order
	cancelOrder: async (orderId) => {
		const response = await apiClient.post(`/orders/${orderId}/cancel/`);
		return response.data;
	},

	// Initialize a guest session
	initGuestSession: async () => {
		const response = await apiClient.post("/orders/init-guest-session/");
		return response.data;
	},

	// Create a new guest order
	createGuestOrder: async (orderData) => {
		const response = await apiClient.post("/orders/guest-order/", orderData);
		return response.data;
	},
};

/**
 * DEPRECATED: cartAPI has been moved to @/api/cart
 *
 * The old cart endpoints using orders are deprecated.
 * Use the new cart API instead:
 *
 * import cartAPI from "@/api/cart";
 *
 * Migration guide:
 * - cartAPI.addToCart() → cartAPI.addItem()
 * - cartAPI.updateCartItem() → cartAPI.updateItem() (no orderId needed)
 * - cartAPI.removeFromCart() → cartAPI.removeItem() (no orderId needed)
 * - cartAPI.clearCart() → cartAPI.clearCart() (no orderId needed)
 * - cartAPI.getCartItemCount() → cartAPI.getItemCount()
 */

export default ordersAPI;
