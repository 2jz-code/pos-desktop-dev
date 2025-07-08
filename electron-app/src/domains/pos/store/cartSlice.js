// desktop-combined/electron-app/src/store/slices/cartSlice.js
import * as orderService from "@/domains/orders/services/orderService";
import { toast } from "@/shared/components/ui/use-toast";
import { cartSocket } from "@/shared/lib/cartSocket";

// A helper function to safely parse numbers, defaulting to 0
const safeParseFloat = (value) => {
	const parsed = parseFloat(value);
	return isNaN(parsed) ? 0 : parsed;
};

const calculateLocalTotals = (items) => {
	const subtotal = items.reduce((acc, item) => {
		const price = safeParseFloat(item.product?.price);
		const quantity = parseInt(item.quantity, 10) || 0;
		return acc + price * quantity;
	}, 0);
	return {
		subtotal: subtotal,
		total: subtotal,
	};
};

// The single source of truth for the initial state of a cart.
// All financial values are initialized to 0.
export const defaultCartState = {
	orderId: null,
	orderNumber: null,
	orderStatus: "DRAFT",
	items: [],
	subtotal: 0,
	total: 0,
	taxAmount: 0,
	totalDiscountsAmount: 0,
	tip: 0, // Keep tip for now, might be used later
	isSocketConnected: false,
	addingItemId: null,
	updatingItems: [],
	appliedDiscounts: [],
	stockOverrideDialog: {
		show: false,
		productId: null,
		message: "",
		lastPayload: null,
		actionType: null,
		itemId: null,
		currentQuantity: null,
		requestedQuantity: null,
	},
};

const loadInitialCartState = () => {
	// This function can be simplified as we are not persisting cart state
	// across sessions anymore, but leaving it for potential future use.
	return { ...defaultCartState };
};

export const createCartSlice = (set, get) => {
	const initialState = loadInitialCartState();

	return {
		...initialState,

		addItem: async (product) => {
			set({ addingItemId: product.id });

			// Store original state for rollback
			const originalItems = [...get().items];
			const originalSubtotal = get().subtotal;
			const originalTotal = get().total;

			const existingItemIndex = get().items.findIndex(
				(item) =>
					item.product.id === product.id &&
					!item.id.toString().startsWith("temp-")
			);
			let optimisticItems = [...get().items];

			if (existingItemIndex > -1) {
				optimisticItems[existingItemIndex].quantity += 1;
			} else {
				optimisticItems.push({
					id: `temp-${product.id}-${Date.now()}`,
					product: product,
					quantity: 1,
					price_at_sale: product.price,
				});
			}

			const { subtotal, total } = calculateLocalTotals(optimisticItems);
			set({ items: optimisticItems, subtotal, total });

			try {
				let orderId = get().orderId;

				if (!orderId) {
					const orderRes = await orderService.createOrder({
						order_type: "POS",
					});
					orderId = orderRes.data.id;
					set({
						orderId: orderId,
						orderStatus: orderRes.data.status,
						orderNumber: orderRes.data.order_number,
					});
					// We no longer use localStorage for the order ID.
					// The state itself is the source of truth.
					await get().initializeCartSocket();
					get().showToast({
						title: "New Order Started",
						description: `Order #${orderId.substring(0, 4)}...`,
					});
				}

				const payload = { product_id: product.id, quantity: 1 };

				// Store the payload in case we need to retry with force_add
				set({
					stockOverrideDialog: {
						...get().stockOverrideDialog,
						lastPayload: payload,
					},
				});

				cartSocket.sendMessage({
					type: "add_item",
					payload: payload,
				});
			} catch (error) {
				console.error("Error during cart sync:", error);
				// Rollback optimistic update
				set({
					items: originalItems,
					subtotal: originalSubtotal,
					total: originalTotal,
				});
				get().showToast({
					title: "Failed to Sync Item",
					description:
						error.response?.data?.detail || "An unexpected error occurred.",
					variant: "destructive",
				});
			} finally {
				set({ addingItemId: null });
			}
		},

		// Add method to handle rollback from WebSocket errors
		rollbackOptimisticUpdate: (originalState) => {
			set({
				items: originalState.items,
				subtotal: originalState.subtotal,
				total: originalState.total,
			});
		},

		// Stock override dialog methods
		setStockOverrideDialog: (dialogState) => {
			set({ stockOverrideDialog: dialogState });
		},

		forceAddItem: () => {
			const dialog = get().stockOverrideDialog;
			const { lastPayload, actionType, itemId, requestedQuantity } = dialog;

			if (actionType === "quantity_update" && itemId && requestedQuantity) {
				// Force quantity update
				cartSocket.sendMessage({
					type: "update_item_quantity",
					payload: {
						item_id: itemId,
						quantity: requestedQuantity,
						force_update: true,
					},
				});

				get().showToast({
					title: "Quantity Updated",
					description:
						"Item quantity was updated despite low stock - remember to update inventory later",
					variant: "default",
				});
			} else if (lastPayload) {
				// Force add item
				cartSocket.sendMessage({
					type: "add_item",
					payload: { ...lastPayload, force_add: true },
				});

				get().showToast({
					title: "Item Added",
					description:
						"Item was added despite low stock - remember to update inventory later",
					variant: "default",
				});
			}

			// Close the dialog
			get().setStockOverrideDialog({
				show: false,
				productId: null,
				message: "",
				lastPayload: null,
				actionType: null,
				itemId: null,
				currentQuantity: null,
				requestedQuantity: null,
			});
		},

		cancelStockOverride: () => {
			const dialog = get().stockOverrideDialog;
			const { lastPayload, actionType, itemId, currentQuantity } = dialog;

			if (
				actionType === "quantity_update" &&
				itemId &&
				currentQuantity !== null
			) {
				// Rollback quantity update - revert to original quantity
				const items = get().items.map((item) =>
					item.id === itemId ? { ...item, quantity: currentQuantity } : item
				);
				const { subtotal, total } = calculateLocalTotals(items);
				set({ items, subtotal, total });
			} else if (lastPayload) {
				// Rollback add item - remove optimistic add
				const productId = lastPayload.product_id;
				const items = get().items.filter(
					(item) =>
						!(
							item.id.toString().startsWith("temp-") &&
							item.product.id === productId
						)
				);
				const { subtotal, total } = calculateLocalTotals(items);
				set({ items, subtotal, total });
			}

			// Close the dialog
			get().setStockOverrideDialog({
				show: false,
				productId: null,
				message: "",
				lastPayload: null,
				actionType: null,
				itemId: null,
				currentQuantity: null,
				requestedQuantity: null,
			});
		},

		setCartFromSocket: (orderData) => {
			console.log("Reconciling state from WebSocket:", orderData);
			set({
				items: orderData.items || [],
				orderId: orderData.id,
				orderNumber: orderData.order_number,
				orderStatus: orderData.status,
				total: safeParseFloat(orderData.grand_total),
				subtotal: safeParseFloat(orderData.subtotal),
				taxAmount: safeParseFloat(orderData.tax_total),
				totalDiscountsAmount: safeParseFloat(orderData.total_discounts_amount),
				appliedDiscounts: orderData.applied_discounts || [],
				addingItemId: null,
				updatingItems: [],
				isSyncing: false,
			});
		},

		updateItemQuantityViaSocket: (itemId, quantity) => {
			set((state) => ({
				updatingItems: [...state.updatingItems, itemId],
			}));

			cartSocket.sendMessage({
				type: "update_item_quantity",
				payload: { item_id: itemId, quantity },
			});
		},

		setSocketConnected: (connected) => {
			set({ isSocketConnected: connected });
		},

		initializeCartSocket: async () => {
			const orderId = get().orderId;
			if (orderId) {
				try {
					await cartSocket.connect(orderId);
				} catch (error) {
					console.error("Failed to connect cart socket:", error);
					get().showToast({
						title: "Connection Error",
						description: "Could not connect to the order server.",
						variant: "destructive",
					});
					throw error;
				}
			} else {
				console.warn("Cannot initialize cart socket: orderId is null.");
			}
		},

		disconnectCartSocket: () => {
			cartSocket.disconnect();
		},

		removeItemViaSocket: (itemId) => {
			const items = get().items.filter((item) => item.id !== itemId);
			const { subtotal, total } = calculateLocalTotals(items);
			set({ items, subtotal, total });

			cartSocket.sendMessage({
				type: "remove_item",
				payload: { item_id: itemId },
			});
		},

		applyDiscountViaSocket: (discountId) => {
			cartSocket.sendMessage({
				type: "apply_discount",
				payload: { discount_id: discountId },
			});
		},

		applyDiscountCodeViaSocket: (code) => {
			cartSocket.sendMessage({
				type: "apply_discount_code",
				payload: { code },
			});
		},

		removeDiscountViaSocket: (discountId) => {
			cartSocket.sendMessage({
				type: "remove_discount",
				payload: { discount_id: discountId },
			});
		},

		showToast: ({ title, description, variant = "default" }) => {
			toast({ title, description, variant });
		},

		clearCart: async () => {
			const orderId = get().orderId;
			if (!orderId) return;

			set({
				items: [],
				subtotal: 0,
				total: 0,
				taxAmount: 0,
				appliedDiscounts: [],
				totalDiscountsAmount: 0,
			});

			cartSocket.sendMessage({
				type: "clear_cart",
				payload: { order_id: orderId },
			});
		},

		holdOrder: async () => {
			const orderId = get().orderId;
			if (!orderId || get().items.length === 0) {
				get().showToast({
					title: "Cannot Hold Order",
					description: "Cart is empty or no order is active.",
					variant: "default",
				});
				return;
			}
			try {
				await orderService.updateOrder(orderId, { status: "HOLD" });
				get().showToast({
					title: "Order Held",
					description: `Order ${orderId.substring(0, 8)}... placed on hold.`,
				});
				get().resetCart();
			} catch (error) {
				console.error("Failed to hold order:", error);
				get().showToast({
					title: "Error Holding Order",
					description: "Could not place order on hold.",
					variant: "destructive",
				});
			}
		},

		resetCart: () => {
			get().disconnectCartSocket();
			set({
				...defaultCartState,
			});
			// No longer using localStorage for order ID.
		},

		loadCartFromOrderId: async (orderId) => {
			if (!orderId) {
				get().resetCart();
				return;
			}
			set({ isLoadingCart: true });
			try {
				const response = await orderService.getOrderById(orderId);
				const order = response.data;
				// Only resume if the order is in a workable state
				if (["PENDING", "HOLD", "DRAFT"].includes(order.status)) {
					get().resumeCart(order);
					get().showToast({
						title: "Cart Loaded",
						description: `${order.order_number} loaded.`,
					});
				} else {
					// If order is completed or canceled, start a fresh cart
					get().showToast({
						title: "Order Already Processed",
						description: "Starting a new order instead.",
					});
					get().resetCart();
				}
			} catch (err) {
				console.error("Failed to load cart from orderId:", err);
				get().showToast({
					title: "Error Loading Order",
					description:
						"Could not fetch the specified order. Starting a new one.",
					variant: "destructive",
				});
				get().resetCart();
			} finally {
				set({ isLoadingCart: false });
			}
		},

		resumeCart: (orderData) => {
			get().disconnectCartSocket(); // Disconnect from any previous socket

			set({
				items: orderData.items,
				orderId: orderData.id,
				orderStatus: orderData.status,
				total: safeParseFloat(orderData.grand_total),
				subtotal: safeParseFloat(orderData.subtotal),
				taxAmount: safeParseFloat(orderData.tax_total),
				totalDiscountsAmount: safeParseFloat(orderData.total_discounts_amount),
				appliedDiscounts: orderData.applied_discounts || [],
				isLoadingCart: false,
				socketConnected: false,
			});
			get().initializeCartSocket(); // Connect to the new order's socket
		},
	};
};
