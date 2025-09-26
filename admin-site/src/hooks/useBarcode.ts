/**
 * Admin-site barcode wrapper that uses the shared @ajeen/ui barcode hook
 * Configured for admin dashboard with specific API client and toast implementation
 */
import {
	useBarcode as useSharedBarcode,
	configureBarcode,
	useProductBarcode as useSharedProductBarcode,
	useInventoryBarcode as useSharedInventoryBarcode,
	type BarcodeConfig,
} from "@ajeen/ui";
import { toast } from "@/components/ui/use-toast";
import apiClient from "@/services/api/client";

// Configure the shared hook with admin-site dependencies on module load
configureBarcode({
	apiClient,
	toast: {
		success: (message) => toast({ title: "Success", description: message }),
		error: (message) => toast({ title: "Error", description: message, variant: "destructive" }),
	},
	defaultEndpoints: {
		products: (barcode) => `/products/barcode/${barcode.trim()}/`,
		inventory: (barcode) => `/inventory/barcode/${barcode.trim()}/stock/`,
	},
	defaultMessages: {
		emptyBarcode: "Please enter a barcode",
		success: "Product found!",
		notFound: "Product not found",
		error: "Error scanning barcode",
	},
});

// Admin-site specific barcode hook for products with scroll functionality
export function useProductBarcodeWithScroll(onProductFound: (product: any) => void, scrollToItem?: (id: string) => void) {
	return useSharedBarcode({
		searchType: "products",
		onSuccess: (data) => {
			if (data.product) {
				onProductFound(data.product);
				// Scroll to the found item if scroll function is provided
				if (scrollToItem && data.product.id) {
					scrollToItem(data.product.id);
				}
			}
		},
		messages: {
			success: "Product found and highlighted!",
		},
	});
}

// Admin-site specific barcode hook for inventory with scroll functionality
export function useInventoryBarcodeWithScroll(onStockFound: (stock: any) => void, scrollToItem?: (id: string) => void) {
	return useSharedBarcode({
		searchType: "inventory",
		onSuccess: (data) => {
			onStockFound(data);
			// Scroll to the found item if scroll function is provided
			if (scrollToItem && data.product?.id) {
				scrollToItem(data.product.id);
			}
		},
		messages: {
			success: "Stock found and highlighted!",
		},
	});
}

// Re-export the standard hooks for general use
export const useProductBarcode = useSharedProductBarcode;
export const useInventoryBarcode = useSharedInventoryBarcode;

// Main barcode hook for custom configurations
export function useBarcode(config: BarcodeConfig) {
	return useSharedBarcode(config);
}