import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { ordersAPI } from "@/api/orders";

export const useOrderConfirmation = (initialOrderData = null) => {
	const [searchParams] = useSearchParams();
	const [orderData, setOrderData] = useState(initialOrderData);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);

	// Check for order data in URL parameters (for guest users and navigation)
	const orderDataParam = searchParams.get("orderData");
	const orderIdParam = searchParams.get("orderId");

	const loadOrderData = useCallback(async (orderId) => {
		if (!orderId) return;

		setIsLoading(true);
		setError(null);

		try {
			const confirmationData = await ordersAPI.getOrderForConfirmation(orderId);
			setOrderData(confirmationData);
		} catch (err) {
			console.error("Failed to load order data:", err);
			setError(err.response?.data?.detail || "Failed to load order details");
		} finally {
			setIsLoading(false);
		}
	}, []);

	// Effect to handle changes in initialOrderData (e.g., when checkout completes)
	useEffect(() => {
		if (initialOrderData) {
			console.log(
				"useOrderConfirmation: Setting order data from initialOrderData:",
				initialOrderData
			);
			setOrderData(initialOrderData);
			setError(null);
			return;
		}
	}, [initialOrderData]);

	// Effect to handle URL parameters and fallback loading
	useEffect(() => {
		// If we already have data from initialOrderData, don't override it
		if (initialOrderData || orderData) {
			return;
		}

		console.log("useOrderConfirmation: Checking URL parameters...", {
			orderDataParam,
			orderIdParam,
		});

		// Try to parse order data from URL parameters (for guest checkouts)
		if (orderDataParam) {
			try {
				const parsedData = JSON.parse(decodeURIComponent(orderDataParam));
				console.log(
					"useOrderConfirmation: Parsed order data from URL:",
					parsedData
				);
				setOrderData(parsedData);
				setError(null);
				return;
			} catch (e) {
				console.error("Failed to parse order data from URL:", e);
				setError("Failed to parse order data from URL");
			}
		}

		// Fetch order data by ID if orderId is provided (for order history)
		if (orderIdParam) {
			console.log(
				"useOrderConfirmation: Loading order data by ID:",
				orderIdParam
			);
			loadOrderData(orderIdParam);
			return;
		}

		// If no data source is available, set error
		if (!initialOrderData && !orderDataParam && !orderIdParam) {
			console.log("useOrderConfirmation: No data source available");
			setError("No order data available");
		}
	}, [
		orderDataParam,
		orderIdParam,
		loadOrderData,
		initialOrderData,
		orderData,
	]);

	const refreshOrderData = useCallback(() => {
		if (orderData?.id) {
			loadOrderData(orderData.id);
		}
	}, [orderData?.id, loadOrderData]);

	console.log("useOrderConfirmation state:", {
		hasInitialOrderData: !!initialOrderData,
		hasOrderData: !!orderData,
		isLoading,
		error,
		orderDataParam: !!orderDataParam,
		orderIdParam: !!orderIdParam,
	});

	return {
		orderData,
		isLoading,
		error,
		refreshOrderData,
	};
};
