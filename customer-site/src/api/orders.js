import apiClient from "./client";

// Function to check if checkout was recently completed
const isCheckoutCompleted = () => {
	try {
		// Check localStorage for checkout completed flag
		const cartStorage = localStorage.getItem("cart-storage");
		if (cartStorage) {
			const parsed = JSON.parse(cartStorage);
			return parsed.state?.checkoutCompleted === true;
		}
		return false;
	} catch (error) {
		console.error("Error checking checkout status:", error);
		return false;
	}
};

// Helper function to check if user is authenticated
// Since we use HTTP-only cookies, we need to make an API call
// DEPRECATED: This is no longer needed as the new cart logic is unified.
// const isUserAuthenticated = async () => { ... };

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
		const response = await apiClient.get(`/orders/${orderId}/`);
		return response.data;
	},

	// Get full order details for confirmation view (with all needed data)
	getOrderForConfirmation: async (orderId) => {
		try {
			const response = await apiClient.get(`/orders/${orderId}/`);
			const order = response.data;

			// Transform the backend order data into the format expected by OrderConfirmation component
			const confirmationData = {
				id: order.id,
				orderNumber: order.order_number || order.id,
				customerName:
					order.customer_display_name ||
					(order.customer
						? `${order.customer.first_name || ""} ${
								order.customer.last_name || ""
						  }`.trim() || order.customer.username
						: `${order.guest_first_name || ""} ${
								order.guest_last_name || ""
						  }`.trim() || "Guest Customer"),
				customerEmail:
					order.customer?.email ||
					order.guest_email ||
					order.customer_email ||
					"",
				customerPhone:
					order.customer?.phone ||
					order.guest_phone ||
					order.customer_phone ||
					"",
				items: order.items || [],
				grandTotal: order.grand_total,
				total: order.grand_total, // Alternative field name for compatibility
				subtotal: order.subtotal,
				taxAmount: order.tax_total,
				surchargeAmount: order.surcharges_total,
				status: order.status,
				paymentStatus: order.payment_status,
				createdAt: order.created_at,
				updatedAt: order.updated_at,
				orderType: order.order_type,
			};

			return confirmationData;
		} catch (error) {
			console.error("Error fetching order for confirmation:", error);
			throw error;
		}
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

// Helper functions for cart management
export const cartAPI = {
	// Get or create current cart (order).
	// The backend now handles the "get or create" logic, so we can just call create.
	getCurrentCart: async () => {
		try {
			// This will either create a new order or return the existing pending one.
			return await ordersAPI.createOrder({ order_type: "WEB" });
		} catch (error) {
			console.error("Error getting or creating cart:", error);
			// Throw the error to be handled by the calling function (e.g., in the store)
			throw error;
		}
	},

	// Get current cart without creating new orders (safe after checkout)
	getCurrentCartSafe: async (checkoutCompleted = false) => {
		try {
			// Check if checkout was recently completed from store
			const checkoutRecentlyCompleted =
				checkoutCompleted || isCheckoutCompleted();

			// If checkout was recently completed, don't create a new order
			if (checkoutRecentlyCompleted) {
				console.log("Checkout completed, not creating new order");
				return null;
			}

			// This will now get the existing pending order or create one if none exists.
			return await ordersAPI.createOrder({ order_type: "WEB" });
		} catch (error) {
			console.error("Error in getCurrentCartSafe:", error);
			throw error;
		}
	},

	// Add item to current cart using the new single-action endpoint
	addToCart: async (productId, quantity = 1, notes = "") => {
		const response = await apiClient.post("/orders/add-item/", {
			product_id: productId,
			quantity,
			notes,
		});
		return response.data;
	},

	// Update cart item quantity
	updateCartItem: async (orderId, itemId, quantity) => {
		if (!orderId) throw new Error("Order ID is required to update an item.");
		return await ordersAPI.updateOrderItem(orderId, itemId, quantity);
	},

	// Remove item from cart
	removeFromCart: async (orderId, itemId) => {
		if (!orderId) throw new Error("Order ID is required to remove an item.");
		try {
			const response = await apiClient.delete(
				`/orders/${orderId}/items/${itemId}/`
			);
			return response.data;
		} catch (error) {
			console.error("Error removing item from cart:", error.response?.data);
			throw error.response?.data || { error: "An unknown error occurred" };
		}
	},

	// Clear all items from cart
	clearCart: async (orderId) => {
		if (!orderId) throw new Error("Order ID is required to clear the cart.");
		return await ordersAPI.clearOrderItems(orderId);
	},

	// Get cart item count
	getCartItemCount: async () => {
		try {
			// Use the safe version that won't create new orders
			const cart = await cartAPI.getCurrentCartSafe(true); // Pass true to indicate we're just checking
			return (
				cart?.items?.reduce((total, item) => total + item.quantity, 0) || 0
			);
		} catch (error) {
			console.error("Error getting cart count:", error);
			return 0;
		}
	},

	// Reorder from a previous order
	reorder: async (orderId) => {
		const response = await apiClient.post(`/orders/${orderId}/reorder/`);
		return response.data;
	},
};

export default ordersAPI;
