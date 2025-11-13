import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import cartAPI from "@/api/cart";
import { ordersAPI } from "@/api/orders";
import { useCartStore } from "@/store/cartStore";
import { useAuth } from "@/contexts/AuthContext";
import { useStoreStatus } from "@/contexts/StoreStatusContext";
import { toast } from "sonner";

// Cart query keys
export const cartKeys = {
	all: ["cart"],
	current: () => [...cartKeys.all, "current"],
	summary: () => [...cartKeys.all, "summary"],
};

// Hook for getting current cart data
export const useCartQuery = () => {
	const { checkoutCompleted } = useCartStore();
	const { isAuthenticated } = useAuth();

	return useQuery({
		queryKey: cartKeys.current(),
		queryFn: () => {
			if (checkoutCompleted) {
				return null;
			}
			// Use new cart API - returns empty cart structure if no cart exists
			return cartAPI.getCart();
		},
		staleTime: 1000 * 30, // 30 seconds
		cacheTime: 1000 * 60 * 5, // 5 minutes
		refetchOnWindowFocus: true,
		refetchOnMount: false, // ← CRITICAL: Prevent refetch on navigation after checkout
		retry: (failureCount) => {
			// Don't retry if checkout is completed
			if (checkoutCompleted) return false;
			return failureCount < 3;
		},
	});
};

// Hook for cart mutations with optimized invalidation and optimistic updates
export const useCartMutations = () => {
	const queryClient = useQueryClient();
	const cartStore = useCartStore();
	const { isAuthenticated } = useAuth();

	const invalidateCart = () => {
		queryClient.invalidateQueries({ queryKey: cartKeys.current() });
		// Also force refetch to ensure the cart updates
		queryClient.refetchQueries({ queryKey: cartKeys.current() });
	};

	const addToCartMutation = useMutation({
		mutationFn: async ({ productId, quantity, notes, selectedModifiers }) => {
			// Users can add to cart anytime - location selection during checkout will handle business hours
			// New cart API handles session creation automatically
			// Just call addItem - backend creates cart if needed
			return await cartAPI.addItem(productId, quantity, notes, selectedModifiers);
		},
		// Temporarily disable optimistic update to avoid state conflicts
		// onMutate: async ({ product, quantity }) => {
		// 	// Cancel any outgoing refetches
		// 	await queryClient.cancelQueries({ queryKey: cartKeys.current() });

		// 	// Snapshot the previous value
		// 	const previousCart = queryClient.getQueryData(cartKeys.current());

		// 	// Optimistically update to the new value
		// 	if (previousCart) {
		// 		const optimisticCart = { ...previousCart };
		// 		const existingItemIndex = optimisticCart.items.findIndex(
		// 			(item) => item.product.id === product.id
		// 		);

		// 		if (existingItemIndex > -1) {
		// 			// Update quantity if item exists
		// 			optimisticCart.items[existingItemIndex].quantity += quantity;
		// 		} else {
		// 			// Add new item with full product details
		// 			optimisticCart.items.push({
		// 				id: `temp-${Date.now()}`, // Temporary ID
		// 				product: product, // Use the full product object
		// 				quantity,
		// 				price_at_sale: product.price, // Use product's current price
		// 				notes: "",
		// 			});
		// 		}
		// 		queryClient.setQueryData(cartKeys.current(), optimisticCart);
		// 	}

		// 	// Return a context with the previous cart for rollback
		// 	return { previousCart };
		// },
		onSuccess: (data) => {
			toast.success("Item added to cart");
		},
		onError: (error, variables, context) => {
			// Rollback on error
			if (context?.previousCart) {
				queryClient.setQueryData(cartKeys.current(), context.previousCart);
			}

			// Handle stock-related errors with user-friendly messages
			const errorData = error.response?.data;
			const rawErrorMessage = errorData?.error || errorData?.detail || "Failed to add item to cart";

			// Check if this is a stock-related error and make it user-friendly
			let userFriendlyMessage = rawErrorMessage;
			if (rawErrorMessage.includes("out of stock") || rawErrorMessage.includes("No items available")) {
				userFriendlyMessage = "Sorry, this item is currently out of stock.";
			} else if (rawErrorMessage.includes("low stock") || rawErrorMessage.includes("Only") && rawErrorMessage.includes("available")) {
				// Extract available quantity from message like "Only 2 items available, but 3 requested"
				const availableMatch = rawErrorMessage.match(/Only (\d+(?:\.\d+)?)/);
				if (availableMatch) {
					const available = availableMatch[1];
					userFriendlyMessage = `Sorry, only ${available} ${available === '1' ? 'item is' : 'items are'} available in stock.`;
				} else {
					userFriendlyMessage = "Sorry, there isn't enough stock available for the requested quantity.";
				}
			}

			toast.error(userFriendlyMessage);
		},
		onSettled: () => {
			// Always refetch after error or success to get accurate backend calculations
			invalidateCart();
		},
	});

	const updateCartItemMutation = useMutation({
		mutationFn: ({ itemId, quantity }) =>
			cartAPI.updateItem(itemId, quantity),
		// Optimistic update for quantity changes
		onMutate: async ({ itemId, quantity }) => {
			// Cancel any outgoing refetches
			await queryClient.cancelQueries({ queryKey: cartKeys.current() });

			// Snapshot the previous value
			const previousCart = queryClient.getQueryData(cartKeys.current());

			// Optimistically update to the new value
			if (previousCart) {
				const optimisticCart = {
					...previousCart,
					items: previousCart.items.map((item) =>
						item.id === itemId ? { ...item, quantity } : item
					),
				};
				queryClient.setQueryData(cartKeys.current(), optimisticCart);
			}

			// Return a context with the previous cart
			return { previousCart };
		},
		onSuccess: () => {
			toast.success("Cart updated");
		},
		onError: (error, variables, context) => {
			// Rollback on error
			if (context?.previousCart) {
				queryClient.setQueryData(cartKeys.current(), context.previousCart);
			}

			// Handle stock-related errors with user-friendly messages
			const errorData = error.response?.data;
			const rawErrorMessage = errorData?.error || errorData?.detail || "Failed to update cart";

			// Check if this is a stock-related error and make it user-friendly
			let userFriendlyMessage = rawErrorMessage;
			if (rawErrorMessage.includes("out of stock") || rawErrorMessage.includes("No items available")) {
				userFriendlyMessage = "Sorry, this item is currently out of stock.";
			} else if (rawErrorMessage.includes("low stock") || rawErrorMessage.includes("Only") && rawErrorMessage.includes("available")) {
				// Extract available quantity from message like "Only 2 items available, but 3 requested"
				const availableMatch = rawErrorMessage.match(/Only (\d+(?:\.\d+)?)/);
				if (availableMatch) {
					const available = availableMatch[1];
					userFriendlyMessage = `Sorry, only ${available} ${available === '1' ? 'item is' : 'items are'} available in stock.`;
				} else {
					userFriendlyMessage = "Sorry, there isn't enough stock available for the requested quantity.";
				}
			}

			toast.error(userFriendlyMessage);
		},
		onSettled: () => {
			// Always refetch after error or success to get accurate backend calculations
			invalidateCart();
		},
	});

	const removeFromCartMutation = useMutation({
		mutationFn: ({ itemId }) =>
			cartAPI.removeItem(itemId),
		// Optimistic update for item removal
		onMutate: async ({ itemId }) => {
			// Cancel any outgoing refetches
			await queryClient.cancelQueries({ queryKey: cartKeys.current() });

			// Snapshot the previous value
			const previousCart = queryClient.getQueryData(cartKeys.current());

			// Optimistically update to the new value
			if (previousCart && previousCart.items) {
				const optimisticCart = {
					...previousCart,
					items: previousCart.items.filter((item) => item.id !== itemId),
				};

				queryClient.setQueryData(cartKeys.current(), optimisticCart);
			}

			// Return a context with the previous cart
			return { previousCart };
		},
		onSuccess: () => {
			toast.success("Item removed");
		},
		onError: (error, variables, context) => {
			// Rollback on error
			if (context?.previousCart) {
				queryClient.setQueryData(cartKeys.current(), context.previousCart);
			}
			const errorMessage =
				error.response?.data?.detail || "Failed to remove item";
			toast.error(errorMessage);
		},
		onSettled: () => {
			// Always refetch after error or success to get accurate backend calculations
			invalidateCart();
		},
	});

	const clearCartMutation = useMutation({
		mutationFn: () => cartAPI.clearCart(),
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey: cartKeys.current() });
			const previousCart = queryClient.getQueryData(cartKeys.current());
			if (previousCart) {
				queryClient.setQueryData(cartKeys.current(), {
					...previousCart,
					items: [],
				});
			}
			return { previousCart };
		},
		onSuccess: () => {
			invalidateCart();
			cartStore.setCheckoutCompleted(true);
			toast.success("Cart cleared");
		},
		onError: (error, variables, context) => {
			if (context?.previousCart) {
				queryClient.setQueryData(cartKeys.current(), context.previousCart);
			}
			const errorMessage =
				error.response?.data?.detail || "Failed to clear cart";
			toast.error(errorMessage);
		},
	});

	const updateGuestInfoMutation = useMutation({
		mutationFn: ({ orderId, contactData }) =>
			ordersAPI.updateCustomerInfo(orderId, contactData),
		onSuccess: () => {
			invalidateCart();
		},
	});

	const convertGuestToUserMutation = useMutation({
		mutationFn: ({ orderId, userData }) =>
			ordersAPI.convertGuestToUser(orderId, userData),
		onSuccess: () => {
			invalidateCart();
		},
	});

	return {
		addToCart: addToCartMutation,
		updateCartItem: updateCartItemMutation,
		removeFromCart: removeFromCartMutation,
		clearCart: clearCartMutation,
		updateGuestInfo: updateGuestInfoMutation,
		convertGuestToUser: convertGuestToUserMutation,
	};
};

// Computed cart summary hook
export const useCartSummary = () => {
	const { data: cart } = useCartQuery();

	return {
		cart,
		// New cart API returns totals in a nested object
		itemCount: cart?.totals?.item_count || 0,
		subtotal: parseFloat(cart?.totals?.subtotal || "0"),
		tax: parseFloat(cart?.totals?.tax_total || "0"),
		total: parseFloat(cart?.totals?.grand_total || "0"),
		discountTotal: parseFloat(cart?.totals?.discount_total || "0"),
		hasLocation: cart?.totals?.has_location || false,
		isEmpty: !cart?.items?.length,
		isLoading: false, // React Query handles loading state
	};
};

// Main cart hook that combines everything
export const useCart = () => {
	const cartQuery = useCartQuery();
	const mutations = useCartMutations();
	const summary = useCartSummary();
	const cartStore = useCartStore();

	return {
		// Data
		...summary,

		// Loading states - ONLY show loading on initial fetch.
		// Optimistic mutations should not trigger a global loading state.
		isLoading: cartQuery.isLoading && cartQuery.isFetching,
		isError: cartQuery.isError,
		error: cartQuery.error || cartStore.error,

		// Actions - these now return the mutation objects for better control
		addToCart: (product, quantity = 1, notes = "", selectedModifiers = []) => {
			// Reset checkout completed flag when starting to add items again
			if (cartStore.checkoutCompleted) {
				cartStore.setCheckoutCompleted(false);
			}

			return mutations.addToCart.mutate({
				productId: product.id,
				product, // Pass the full product object for optimistic update
				quantity,
				notes,
				selectedModifiers,
			});
		},

		updateCartItem: (itemId, quantity) => {
			// New cart API doesn't need orderId - backend finds cart automatically
			mutations.updateCartItem.mutate({ itemId, quantity });
		},

		removeFromCart: (itemId) => {
			// New cart API doesn't need orderId - backend finds cart automatically
			mutations.removeFromCart.mutate({ itemId });
		},

		updateCartItemWithModifiers: async (itemId, product, quantity, notes = "", selectedModifiers = []) => {
			// For modifier updates, we remove the old item and add a new one
			// This ensures all calculations and snapshots are handled correctly
			// Users can modify cart anytime - location selection during checkout will handle business hours

			try {
				// Remove the old item (no orderId needed)
				await mutations.removeFromCart.mutateAsync({ itemId });

				// Add the updated item
				return mutations.addToCart.mutateAsync({
					productId: product.id,
					product,
					quantity,
					notes,
					selectedModifiers,
				});
			} catch (error) {
				console.error("Failed to update cart item:", error);
				throw error;
			}
		},

		clearCart: () => {
			// New cart API doesn't need orderId - backend finds cart automatically
			mutations.clearCart.mutate();
		},

		updateGuestInfo: (contactData) => {
			if (!summary.cart?.id) throw new Error("No cart found");
			return mutations.updateGuestInfo.mutate({
				orderId: summary.cart.id,
				contactData,
			});
		},

		convertGuestToUser: (userData) => {
			if (!summary.cart?.id) throw new Error("No cart found");
			return mutations.convertGuestToUser.mutate({
				orderId: summary.cart.id,
				userData,
			});
		},

		// Store actions
		resetCheckoutState: () => cartStore.setCheckoutCompleted(false),
		setCheckoutCompleted: (completed) =>
			cartStore.setCheckoutCompleted(completed),

		// Aliases for compatibility
		cartItemCount: summary.itemCount,
		checkoutCompleted: cartStore.checkoutCompleted,

		// Expose mutation status if needed
		isAddingToCart: mutations.addToCart.isPending,
		isUpdatingCart: mutations.updateCartItem.isPending,
	};
};
