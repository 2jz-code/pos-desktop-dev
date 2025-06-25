import { useState, useCallback } from "react";
import { toast } from "sonner";
import apiClient from "../lib/apiClient";

/**
 * Simple, flexible barcode hook that enhances existing functionality
 * Can be used in any context - POS, products, inventory, etc.
 */
export const useBarcode = (onSuccess, searchType = "products") => {
	const [isScanning, setIsScanning] = useState(false);

	const scanBarcode = useCallback(
		async (barcode) => {
			if (!barcode?.trim()) {
				toast.error("Please enter a barcode");
				return;
			}

			setIsScanning(true);

			try {
				let response;

				// Choose endpoint based on search type
				switch (searchType) {
					case "inventory":
						response = await apiClient.get(
							`/inventory/barcode/${barcode.trim()}/stock/`
						);
						break;
					case "products":
					default:
						response = await apiClient.get(
							`/products/barcode/${barcode.trim()}/`
						);
						break;
				}

				if (response.data.success) {
					onSuccess(response.data);
					toast.success("Product found!");
				} else {
					toast.error("Product not found");
				}
			} catch (error) {
				const message =
					error.response?.status === 404
						? "Product not found"
						: "Error scanning barcode";
				toast.error(message);
			} finally {
				setIsScanning(false);
			}
		},
		[onSuccess, searchType]
	);

	return {
		scanBarcode,
		isScanning,
	};
};

// Specific hooks for common use cases
export const useProductBarcode = (onProductFound) => {
	return useBarcode((data) => onProductFound(data.product), "products");
};

export const useInventoryBarcode = (onStockFound) => {
	return useBarcode((data) => onStockFound(data), "inventory");
};

// Hook for POS - directly adds to cart
export const usePOSBarcode = (addToCart) => {
	return useBarcode((data) => {
		if (data.product) {
			addToCart(data.product);
		}
	}, "products");
};

export default useBarcode;
