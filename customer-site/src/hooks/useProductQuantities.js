import { useState, useCallback } from "react";

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
