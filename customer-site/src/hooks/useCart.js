import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ordersAPI } from "../api/orders";

// Hook for getting and managing cart data
export const useCart = () => {
	const queryClient = useQueryClient();

	// Get current cart/order
	const {
		data: cartData,
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: ["cart"],
		queryFn: ordersAPI.createGuestOrder, // This gets or creates a guest order
		staleTime: 1 * 60 * 1000, // 1 minute
		cacheTime: 5 * 60 * 1000, // 5 minutes
	});

	// Calculate cart count
	const cartItemCount =
		cartData?.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;

	// Calculate subtotal
	const subtotal =
		cartData?.items?.reduce(
			(sum, item) =>
				sum + (item.quantity || 0) * (parseFloat(item.product.price) || 0),
			0
		) || 0;

	// Refresh cart data
	const refreshCartCount = useCallback(async () => {
		await refetch();
	}, [refetch]);

	// Add item to cart
	const addToCart = useCallback(
		async (productId, quantity = 1) => {
			try {
				if (!cartData?.id) {
					throw new Error("No cart found");
				}

				await ordersAPI.addItemToOrder(cartData.id, {
					product_id: productId,
					quantity,
				});

				// Invalidate and refetch cart data
				queryClient.invalidateQueries(["cart"]);
				toast.success("Item added to cart");

				return true;
			} catch (error) {
				console.error("Failed to add item to cart:", error);
				toast.error("Failed to add item to cart");
				return false;
			}
		},
		[cartData?.id, queryClient]
	);

	// Remove item from cart
	const removeFromCart = useCallback(
		async (itemId) => {
			try {
				await ordersAPI.removeOrderItem(cartData.id, itemId);

				// Invalidate and refetch cart data
				queryClient.invalidateQueries(["cart"]);
				toast.success("Item removed from cart");

				return true;
			} catch (error) {
				console.error("Failed to remove item from cart:", error);
				toast.error("Failed to remove item from cart");
				return false;
			}
		},
		[cartData?.id, queryClient]
	);

	return {
		cartData,
		cartItems: cartData?.items || [],
		cartItemCount,
		subtotal,
		isLoading,
		error,
		refreshCartCount,
		addToCart,
		removeFromCart,
		refetch,
	};
};

// Hook for product quantities in UI
export const useProductQuantities = () => {
	const [quantities, setQuantities] = useState({});

	const getQuantity = useCallback(
		(productId) => {
			return quantities[productId] || 1;
		},
		[quantities]
	);

	const setQuantity = useCallback((productId, quantity) => {
		setQuantities((prev) => ({
			...prev,
			[productId]: Math.max(1, Math.min(10, quantity)),
		}));
	}, []);

	const incrementQuantity = useCallback((productId) => {
		setQuantities((prev) => ({
			...prev,
			[productId]: Math.min((prev[productId] || 1) + 1, 10),
		}));
	}, []);

	const decrementQuantity = useCallback((productId) => {
		setQuantities((prev) => ({
			...prev,
			[productId]: Math.max((prev[productId] || 2) - 1, 1),
		}));
	}, []);

	const resetQuantity = useCallback((productId) => {
		setQuantities((prev) => ({
			...prev,
			[productId]: 1,
		}));
	}, []);

	return {
		quantities,
		getQuantity,
		setQuantity,
		incrementQuantity,
		decrementQuantity,
		resetQuantity,
	};
};
