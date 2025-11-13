import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { ordersAPI } from "@/api/orders";

export const useOrderConfirmation = (initialOrderData = null) => {
	const { orderId } = useParams(); // Get orderId from route params
	const [orderData, setOrderData] = useState(initialOrderData);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);

	const loadOrderData = useCallback(async (id) => {
		if (!id) {
			setError("No order ID provided");
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			// Try to get cached data from sessionStorage for instant display
			const cachedData = sessionStorage.getItem(`order_${id}`);
			if (cachedData) {
				try {
					const parsedCache = JSON.parse(cachedData);
					setOrderData(parsedCache);
					console.log("useOrderConfirmation: Loaded from sessionStorage cache");
				} catch (e) {
					console.warn("Failed to parse cached order data:", e);
				}
			}

			// Fetch fresh data from API as source of truth
			console.log("useOrderConfirmation: Fetching order from API:", id);
			const confirmationData = await ordersAPI.getOrderForConfirmation(id);
			setOrderData(confirmationData);

			// Update cache with fresh data
			sessionStorage.setItem(`order_${id}`, JSON.stringify(confirmationData));
			console.log("useOrderConfirmation: Loaded fresh data from API");
		} catch (err) {
			console.error("Failed to load order data:", err);
			const errorMsg = err.response?.data?.detail || "Failed to load order details";
			setError(errorMsg);
		} finally {
			setIsLoading(false);
		}
	}, []); // Empty dependency array - this function doesn't depend on any external values

	// Effect to load order data when component mounts or orderId changes
	useEffect(() => {
		// If initialOrderData is provided (from checkout flow), use it
		if (initialOrderData) {
			console.log("useOrderConfirmation: Using initialOrderData:", initialOrderData);
			setOrderData(initialOrderData);
			setError(null);
			return;
		}

		// Otherwise, load by orderId from route params
		if (orderId) {
			loadOrderData(orderId);
		} else {
			setError("No order ID provided");
		}
	}, [orderId, initialOrderData, loadOrderData]);

	const refreshOrderData = useCallback(() => {
		if (orderId) {
			loadOrderData(orderId);
		} else if (orderData?.id) {
			loadOrderData(orderData.id);
		}
	}, [orderId, orderData?.id, loadOrderData]);

	console.log("useOrderConfirmation state:", {
		orderId,
		hasInitialOrderData: !!initialOrderData,
		hasOrderData: !!orderData,
		isLoading,
		error,
	});

	return {
		orderData,
		isLoading,
		error,
		refreshOrderData,
	};
};
