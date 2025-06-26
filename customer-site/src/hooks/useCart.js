import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cartAPI, ordersAPI } from "@/api/orders";
import { useCartStore } from "@/store/cartStore";
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

	return useQuery({
		queryKey: cartKeys.current(),
		queryFn: () => cartAPI.getCurrentCartSafe(checkoutCompleted),
		staleTime: 1000 * 30, // 30 seconds
		cacheTime: 1000 * 60 * 5, // 5 minutes
		refetchOnWindowFocus: true,
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

	const invalidateCart = () => {
		queryClient.invalidateQueries({ queryKey: cartKeys.current() });
	};

	const addToCartMutation = useMutation({
		mutationFn: ({ productId, quantity, notes }) =>
			cartAPI.addToCart(productId, quantity, notes),
		// Optimistic update for adding items
		onMutate: async () => {
			// Cancel any outgoing refetches
			await queryClient.cancelQueries({ queryKey: cartKeys.current() });

			// Snapshot the previous value
			const previousCart = queryClient.getQueryData(cartKeys.current());

			// Don't do optimistic updates for cart calculations
			// Let the backend handle all calculations to avoid discrepancies
			// The cart will update when onSettled refetches the data

			// Return a context with the previous cart for rollback
			return { previousCart };
		},
		onSuccess: () => {
			toast.success("Item added to cart");
		},
		onError: (error, variables, context) => {
			// Rollback on error
			if (context?.previousCart) {
				queryClient.setQueryData(cartKeys.current(), context.previousCart);
			}
			const errorMessage =
				error.response?.data?.detail || "Failed to add item to cart";
			toast.error(errorMessage);
		},
		onSettled: () => {
			// Always refetch after error or success to get accurate backend calculations
			invalidateCart();
		},
	});

	const updateCartItemMutation = useMutation({
		mutationFn: ({ itemId, quantity }) =>
			cartAPI.updateCartItem(itemId, quantity),
		// Optimistic update for quantity changes
		onMutate: async () => {
			// Cancel any outgoing refetches
			await queryClient.cancelQueries({ queryKey: cartKeys.current() });

			// Snapshot the previous value
			const previousCart = queryClient.getQueryData(cartKeys.current());

			// Don't do optimistic updates for cart calculations
			// Let the backend handle all calculations to avoid discrepancies
			// The cart will update when onSettled refetches the data

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
			const errorMessage =
				error.response?.data?.detail || "Failed to update cart";
			toast.error(errorMessage);
		},
		onSettled: () => {
			// Always refetch after error or success to get accurate backend calculations
			invalidateCart();
		},
	});

	const removeFromCartMutation = useMutation({
		mutationFn: (itemId) => cartAPI.removeFromCart(itemId),
		// Optimistic update for item removal
		onMutate: async (itemId) => {
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
		onSuccess: () => {
			invalidateCart();
			cartStore.setCheckoutCompleted(true);
			toast.success("Cart cleared");
		},
		onError: (error) => {
			const errorMessage =
				error.response?.data?.detail || "Failed to clear cart";
			toast.error(errorMessage);
		},
	});

	const updateGuestInfoMutation = useMutation({
		mutationFn: ({ orderId, contactData }) =>
			ordersAPI.updateGuestInfo(orderId, contactData),
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
		itemCount:
			cart?.items?.reduce((total, item) => total + item.quantity, 0) || 0,
		subtotal: cart?.subtotal || 0,
		tax: cart?.tax_total || 0,
		total: cart?.grand_total || 0,
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

		// Loading states - check if any mutation is loading
		isLoading:
			cartQuery.isLoading ||
			mutations.addToCart.isPending ||
			mutations.updateCartItem.isPending ||
			mutations.removeFromCart.isPending ||
			mutations.clearCart.isPending,
		isError: cartQuery.isError,
		error: cartQuery.error || cartStore.error,

		// Actions - these now return the mutation objects for better control
		addToCart: (product, quantity = 1, notes = "") => {
			const productId = typeof product === "object" ? product.id : product;
			return mutations.addToCart.mutate({
				productId,
				quantity,
				notes,
			});
		},

		updateCartItem: (itemId, quantity) =>
			mutations.updateCartItem.mutate({ itemId, quantity }),

		removeFromCart: (itemId) => mutations.removeFromCart.mutate(itemId),

		clearCart: () => mutations.clearCart.mutate(),

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
	};
};
