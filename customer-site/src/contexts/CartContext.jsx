import React, {
	createContext,
	useContext,
	useReducer,
	useEffect,
	useCallback,
} from "react";
import { toast } from "sonner";
import { cartAPI, ordersAPI } from "@/api/orders";

// Cart action types
const CART_ACTIONS = {
	SET_LOADING: "SET_LOADING",
	SET_CART: "SET_CART",
	SET_ERROR: "SET_ERROR",
	UPDATE_ITEM_COUNT: "UPDATE_ITEM_COUNT",
	CLEAR_CART: "CLEAR_CART",
};

// Initial cart state
const initialCartState = {
	cart: null,
	loading: false,
	error: null,
	itemCount: 0,
};

// Cart reducer
const cartReducer = (state, action) => {
	switch (action.type) {
		case CART_ACTIONS.SET_LOADING:
			return { ...state, loading: action.payload };

		case CART_ACTIONS.SET_CART: {
			const itemCount =
				action.payload?.items?.reduce(
					(total, item) => total + item.quantity,
					0
				) || 0;
			return {
				...state,
				cart: action.payload,
				loading: false,
				error: null,
				itemCount,
			};
		}

		case CART_ACTIONS.SET_ERROR:
			return { ...state, error: action.payload, loading: false };

		case CART_ACTIONS.UPDATE_ITEM_COUNT:
			return { ...state, itemCount: action.payload };

		case CART_ACTIONS.CLEAR_CART:
			return { ...state, cart: null, itemCount: 0 };

		default:
			return state;
	}
};

// Create cart context
const CartContext = createContext();

// Cart provider component
export const CartProvider = ({ children }) => {
	const [state, dispatch] = useReducer(cartReducer, initialCartState);

	// Load cart data
	const loadCart = useCallback(async () => {
		try {
			dispatch({ type: CART_ACTIONS.SET_LOADING, payload: true });
			const cart = await cartAPI.getCurrentCart();
			dispatch({ type: CART_ACTIONS.SET_CART, payload: cart });
		} catch (error) {
			console.error("Failed to load cart:", error);
			dispatch({ type: CART_ACTIONS.SET_ERROR, payload: error.message });
		}
	}, []);

	// Add item to cart with optimistic update
	const addToCart = useCallback(
		async (product, quantity = 1, notes = "") => {
			const originalCart = state.cart;
			dispatch({ type: CART_ACTIONS.SET_LOADING, payload: true });

			// --- Optimistic UI Update ---
			const optimisticCart = JSON.parse(
				JSON.stringify(originalCart || { items: [], subtotal: 0 })
			);

			const existingItemIndex = optimisticCart.items.findIndex(
				(item) => item.product.id === product.id && item.notes === notes
			);

			if (existingItemIndex > -1) {
				optimisticCart.items[existingItemIndex].quantity += quantity;
			} else {
				// Create a temporary item for the optimistic update
				const tempItem = {
					id: `temp-${Date.now()}`, // Temporary ID
					product: product,
					quantity: quantity,
					notes: notes,
					price_at_sale: product.price,
					total_price: (product.price * quantity).toFixed(2),
				};
				optimisticCart.items.push(tempItem);
			}

			// Recalculate totals for the optimistic cart
			optimisticCart.subtotal = optimisticCart.items.reduce(
				(sum, item) => sum + parseFloat(item.total_price || 0),
				0
			);

			dispatch({ type: CART_ACTIONS.SET_CART, payload: optimisticCart });
			// --- End Optimistic UI Update ---

			try {
				// The API now returns the entire updated cart object
				const updatedCart = await cartAPI.addToCart(
					product.id,
					quantity,
					notes
				);

				// Sync with the server's response
				dispatch({ type: CART_ACTIONS.SET_CART, payload: updatedCart });
				return { success: true };
			} catch (error) {
				console.error("Failed to add to cart:", error);
				dispatch({ type: CART_ACTIONS.SET_ERROR, payload: error.message });
				// Rollback on error
				dispatch({ type: CART_ACTIONS.SET_CART, payload: originalCart });
				toast.error("Failed to add item. Please try again.");
				return { success: false, error: error.message };
			}
		},
		[state.cart]
	);

	// Remove item from cart with optimistic update
	const removeFromCart = useCallback(
		async (itemId) => {
			const originalCart = state.cart;
			dispatch({ type: CART_ACTIONS.SET_LOADING, payload: true });

			// --- Optimistic UI Update ---
			const optimisticCart = { ...originalCart };
			optimisticCart.items = optimisticCart.items.filter(
				(item) => item.id !== itemId
			);
			optimisticCart.subtotal = optimisticCart.items.reduce(
				(sum, item) =>
					sum + item.quantity * parseFloat(item.product.price || 0),
				0
			);
			dispatch({ type: CART_ACTIONS.SET_CART, payload: optimisticCart });
			// --- End Optimistic UI Update ---

			try {
				// We still need to tell the server to remove it
				await cartAPI.removeFromCart(itemId);
				// Optionally, we can refetch the cart from the server to ensure 100% sync
				const updatedCart = await cartAPI.getCurrentCart();
				dispatch({ type: CART_ACTIONS.SET_CART, payload: updatedCart });
				toast.success("Item removed from cart");
				return { success: true };
			} catch (error) {
				console.error("Failed to remove from cart:", error);
				dispatch({ type: CART_ACTIONS.SET_ERROR, payload: error.message });
				dispatch({ type: CART_ACTIONS.SET_CART, payload: originalCart }); // Rollback
				toast.error("Failed to remove item. Please try again.");
				return { success: false, error: error.message };
			}
		},
		[state.cart]
	);

	// Update cart item quantity with optimistic update
	const updateCartItem = useCallback(
		async (itemId, quantity) => {
			if (quantity <= 0) {
				return removeFromCart(itemId);
			}

			const originalCart = state.cart;
			dispatch({ type: CART_ACTIONS.SET_LOADING, payload: true });

			// --- Optimistic UI Update ---
			const optimisticCart = JSON.parse(JSON.stringify(originalCart));
			const itemIndex = optimisticCart.items.findIndex(
				(item) => item.id === itemId
			);

			if (itemIndex > -1) {
				optimisticCart.items[itemIndex].quantity = quantity;
			}

			optimisticCart.subtotal = optimisticCart.items.reduce(
				(sum, item) =>
					sum + item.quantity * parseFloat(item.product.price || 0),
				0
			);
			dispatch({ type: CART_ACTIONS.SET_CART, payload: optimisticCart });
			// --- End Optimistic UI Update ---

			try {
				const updatedCart = await cartAPI.updateCartItem(itemId, quantity);
				dispatch({ type: CART_ACTIONS.SET_CART, payload: updatedCart });
				toast.success("Cart updated");
				return { success: true };
			} catch (error) {
				console.error("Failed to update cart item:", error);
				dispatch({ type: CART_ACTIONS.SET_ERROR, payload: error.message });
				dispatch({ type: CART_ACTIONS.SET_CART, payload: originalCart }); // Rollback
				toast.error("Failed to update cart. Please try again.");
				return { success: false, error: error.message };
			}
		},
		[state.cart, removeFromCart]
	);

	// Clear entire cart
	const clearCart = useCallback(async () => {
		try {
			dispatch({ type: CART_ACTIONS.SET_LOADING, payload: true });
			await cartAPI.clearCart();
			dispatch({ type: CART_ACTIONS.CLEAR_CART });

			return { success: true };
		} catch (error) {
			console.error("Failed to clear cart:", error);
			dispatch({ type: CART_ACTIONS.SET_ERROR, payload: error.message });
			return { success: false, error: error.message };
		}
	}, [state.cart]);

	// Update guest contact information
	const updateGuestInfo = useCallback(
		async (contactData) => {
			if (!state.cart?.id) {
				throw new Error("No cart found");
			}

			try {
				dispatch({ type: CART_ACTIONS.SET_LOADING, payload: true });
				const updatedCart = await ordersAPI.updateGuestInfo(
					state.cart.id,
					contactData
				);
				dispatch({ type: CART_ACTIONS.SET_CART, payload: updatedCart });

				return { success: true, cart: updatedCart };
			} catch (error) {
				console.error("Failed to update guest info:", error);
				dispatch({ type: CART_ACTIONS.SET_ERROR, payload: error.message });
				return { success: false, error: error.message };
			}
		},
		[state.cart?.id]
	);

	// Convert guest to user account
	const convertGuestToUser = useCallback(
		async (userData) => {
			if (!state.cart?.id) {
				throw new Error("No cart found");
			}

			try {
				dispatch({ type: CART_ACTIONS.SET_LOADING, payload: true });
				const result = await ordersAPI.convertGuestToUser(
					state.cart.id,
					userData
				);
				dispatch({ type: CART_ACTIONS.SET_CART, payload: result.order });

				return { success: true, user: result.user, order: result.order };
			} catch (error) {
				console.error("Failed to convert guest to user:", error);
				dispatch({ type: CART_ACTIONS.SET_ERROR, payload: error.message });
				return { success: false, error: error.message };
			}
		},
		[state.cart?.id]
	);

	// Get cart summary
	const getCartSummary = useCallback(() => {
		if (!state.cart) return null;

		return {
			itemCount: state.itemCount,
			subtotal: state.cart.subtotal || 0,
			tax: state.cart.tax_total || 0,
			total: state.cart.grand_total || 0,
			isEmpty: state.itemCount === 0,
		};
	}, [state.cart, state.itemCount]);

	// Load cart on mount
	useEffect(() => {
		loadCart();
	}, [loadCart]);

	// Context value
	const contextValue = {
		// State
		cart: state.cart,
		loading: state.loading,
		error: state.error,
		itemCount: state.itemCount,
		cartItemCount: state.itemCount, // Alias for navbar compatibility

		// Actions
		loadCart,
		addToCart,
		updateCartItem,
		removeFromCart,
		clearCart,
		updateGuestInfo,
		convertGuestToUser,

		// Computed values
		getCartSummary,
	};

	return (
		<CartContext.Provider value={contextValue}>{children}</CartContext.Provider>
	);
};

// eslint-disable-next-line react-refresh/only-export-components
export const useCart = () => {
	const context = useContext(CartContext);
	if (!context) {
		throw new Error("useCart must be used within a CartProvider");
	}
	return context;
};

export default CartContext;
