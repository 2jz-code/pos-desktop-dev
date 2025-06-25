import React, {
	createContext,
	useContext,
	useReducer,
	useEffect,
	useCallback,
} from "react";
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

	// Add item to cart
	const addToCart = useCallback(
		async (productId, quantity = 1, notes = "") => {
			try {
				dispatch({ type: CART_ACTIONS.SET_LOADING, payload: true });
				await cartAPI.addToCart(productId, quantity, notes);

				// Reload cart to get updated data
				await loadCart();

				return { success: true };
			} catch (error) {
				console.error("Failed to add to cart:", error);
				dispatch({ type: CART_ACTIONS.SET_ERROR, payload: error.message });
				return { success: false, error: error.message };
			}
		},
		[loadCart]
	);

	// Update cart item quantity
	const updateCartItem = useCallback(
		async (itemId, quantity) => {
			try {
				dispatch({ type: CART_ACTIONS.SET_LOADING, payload: true });

				if (quantity <= 0) {
					await cartAPI.removeFromCart(itemId);
				} else {
					await cartAPI.updateCartItem(itemId, quantity);
				}

				// Reload cart to get updated data
				await loadCart();

				return { success: true };
			} catch (error) {
				console.error("Failed to update cart item:", error);
				dispatch({ type: CART_ACTIONS.SET_ERROR, payload: error.message });
				return { success: false, error: error.message };
			}
		},
		[loadCart]
	);

	// Remove item from cart
	const removeFromCart = useCallback(
		async (itemId) => {
			try {
				dispatch({ type: CART_ACTIONS.SET_LOADING, payload: true });
				await cartAPI.removeFromCart(itemId);

				// Reload cart to get updated data
				await loadCart();

				return { success: true };
			} catch (error) {
				console.error("Failed to remove from cart:", error);
				dispatch({ type: CART_ACTIONS.SET_ERROR, payload: error.message });
				return { success: false, error: error.message };
			}
		},
		[loadCart]
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
	}, []);

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
