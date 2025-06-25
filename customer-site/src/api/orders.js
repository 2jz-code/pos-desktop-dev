import apiClient from "./client";

// Orders API service for customer website with guest user support
export const ordersAPI = {
	// Create a new order (supports both authenticated and guest users)
	createOrder: async (orderData) => {
		const response = await apiClient.post("/orders/", {
			order_type: "WEB", // Specify this is from the website
			...orderData,
		});
		return response.data;
	},

	// Create or get guest order for current session
	createGuestOrder: async () => {
		const response = await apiClient.post("/orders/guest-order/");
		return response.data;
	},

	// Get order by ID
	getOrder: async (orderId) => {
		const response = await apiClient.get(`/orders/${orderId}/`);
		return response.data;
	},

	// Get current user's orders (works for both auth and guest)
	getCurrentUserOrders: async () => {
		const response = await apiClient.get("/orders/");
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

	// Update guest contact information
	updateGuestInfo: async (orderId, contactData) => {
		const response = await apiClient.post(
			`/orders/${orderId}/update-guest-info/`,
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
};

// Helper functions for cart management
export const cartAPI = {
	// Get or create current cart (order)
	getCurrentCart: async () => {
		try {
			// First try to get existing orders
			const orders = await ordersAPI.getCurrentUserOrders();
			const pendingOrder = orders.results?.find(
				(order) => order.status === "PENDING"
			);

			if (pendingOrder) {
				return pendingOrder;
			}

			// If no pending order, create a guest order
			return await ordersAPI.createGuestOrder();
		} catch (error) {
			console.error("Error getting cart:", error);
			// Fallback to creating guest order
			return await ordersAPI.createGuestOrder();
		}
	},

	// Add item to current cart
	addToCart: async (productId, quantity = 1, notes = "") => {
		const cart = await cartAPI.getCurrentCart();
		return await ordersAPI.addItemToOrder(cart.id, {
			product_id: productId,
			quantity,
			notes,
		});
	},

	// Update cart item quantity
	updateCartItem: async (itemId, quantity) => {
		const cart = await cartAPI.getCurrentCart();
		return await ordersAPI.updateOrderItem(cart.id, itemId, quantity);
	},

	// Remove item from cart
	removeFromCart: async (itemId) => {
		const cart = await cartAPI.getCurrentCart();
		return await ordersAPI.removeOrderItem(cart.id, itemId);
	},

	// Clear entire cart
	clearCart: async () => {
		const cart = await cartAPI.getCurrentCart();
		return await ordersAPI.clearOrderItems(cart.id);
	},

	// Get cart item count
	getCartItemCount: async () => {
		try {
			const cart = await cartAPI.getCurrentCart();
			return cart.items?.reduce((total, item) => total + item.quantity, 0) || 0;
		} catch (error) {
			console.error("Error getting cart count:", error);
			return 0;
		}
	},
};

export default ordersAPI;
