/**
 * Electron-app barcode wrapper that uses the shared @ajeen/ui barcode hook
 * Configured for POS system with specific API client and toast implementation
 */
import {
	useBarcode as useSharedBarcode,
	configureBarcode,
	useProductBarcode as useSharedProductBarcode,
	useInventoryBarcode as useSharedInventoryBarcode,
	usePOSBarcode as useSharedPOSBarcode,
} from "@ajeen/ui";
import { toast } from "@/shared/components/ui/use-toast";
import apiClient from "../lib/apiClient";

// Configure the shared hook with electron-app dependencies on module load
configureBarcode({
	apiClient,
	toast: {
		success: (message) => toast({ title: "Success", description: message, variant: "default" }),
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

// Wrapper for backwards compatibility with existing electron-app usage
export const useBarcode = (onSuccess, searchType = "products") => {
	return useSharedBarcode({
		searchType,
		onSuccess,
	});
};

// Re-export the specialized hooks
export const useProductBarcode = useSharedProductBarcode;
export const useInventoryBarcode = useSharedInventoryBarcode;
export const usePOSBarcode = useSharedPOSBarcode;

export default useBarcode;
