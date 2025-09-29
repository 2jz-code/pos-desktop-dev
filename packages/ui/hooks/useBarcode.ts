import { useState, useCallback } from "react";

// Types for barcode scanning
export interface BarcodeConfig {
  searchType?: string;
  onSuccess: (data: any) => void;
  onError?: (error: string) => void;
  apiEndpoints?: Record<string, (barcode: string) => string>;
  messages?: {
    emptyBarcode?: string;
    success?: string;
    notFound?: string;
    error?: string;
  };
}

export interface BarcodeHookConfig {
  // API client function - apps provide their own API implementation
  apiClient: {
    get: (url: string) => Promise<{ data: any }>;
  };
  // Toast function - apps provide their own toast implementation
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
  };
  // Default API endpoints for different search types
  defaultEndpoints?: Record<string, (barcode: string) => string>;
  // Default messages
  defaultMessages?: {
    emptyBarcode?: string;
    success?: string;
    notFound?: string;
    error?: string;
  };
}

// Global configuration
let hookConfig: BarcodeHookConfig | null = null;

/**
 * Configure the barcode hook with app-specific dependencies
 * This must be called before using useBarcode
 */
export function configureBarcode(config: BarcodeHookConfig) {
  hookConfig = config;
}

// Default configuration values
const DEFAULT_ENDPOINTS = {
  products: (barcode: string) => `/products/barcode/${barcode.trim()}/`,
  inventory: (barcode: string) => `/inventory/barcode/${barcode.trim()}/stock/`,
};

const DEFAULT_MESSAGES = {
  emptyBarcode: "Please enter a barcode",
  success: "Product found!",
  notFound: "Product not found",
  error: "Error scanning barcode",
};

/**
 * Flexible barcode scanning hook with configurable endpoints and behavior
 *
 * @param config Configuration for the barcode scanner
 * @returns Object with scanBarcode function and isScanning state
 */
export function useBarcode(config: BarcodeConfig) {
  if (!hookConfig) {
    throw new Error("useBarcode must be configured before use. Call configureBarcode() first.");
  }

  const {
    searchType = "products",
    onSuccess,
    onError,
    apiEndpoints = {},
    messages = {},
  } = config;

  const [isScanning, setIsScanning] = useState(false);

  // Merge configurations
  const endpoints = { ...DEFAULT_ENDPOINTS, ...hookConfig.defaultEndpoints, ...apiEndpoints };
  const msgs = { ...DEFAULT_MESSAGES, ...hookConfig.defaultMessages, ...messages };

  const scanBarcode = useCallback(
    async (barcode: string) => {
      if (!barcode?.trim()) {
        const errorMsg = msgs.emptyBarcode || DEFAULT_MESSAGES.emptyBarcode;
        hookConfig!.toast.error(errorMsg);
        onError?.(errorMsg);
        return;
      }

      setIsScanning(true);

      try {
        // Get the appropriate endpoint for the search type
        const endpointBuilder = endpoints[searchType as keyof typeof endpoints];
        if (!endpointBuilder) {
          throw new Error(`No endpoint configured for search type: ${searchType}`);
        }

        const url = endpointBuilder(barcode);
        const response = await hookConfig!.apiClient.get(url);

        if (response.data.success) {
          onSuccess(response.data);
          const successMsg = msgs.success || DEFAULT_MESSAGES.success;
          hookConfig!.toast.success(successMsg);
        } else {
          const notFoundMsg = msgs.notFound || DEFAULT_MESSAGES.notFound;
          hookConfig!.toast.error(notFoundMsg);
          onError?.(notFoundMsg);
        }
      } catch (error: any) {
        const errorMsg = error.response?.status === 404
          ? (msgs.notFound || DEFAULT_MESSAGES.notFound)
          : (msgs.error || DEFAULT_MESSAGES.error);

        hookConfig!.toast.error(errorMsg);
        onError?.(errorMsg);
      } finally {
        setIsScanning(false);
      }
    },
    [searchType, onSuccess, onError, endpoints, msgs]
  );

  return {
    scanBarcode,
    isScanning,
  };
}

// Helper function to create specialized barcode hooks
export function createBarcodeHook(
  searchType: string,
  dataExtractor?: (data: any) => any,
  customMessages?: BarcodeConfig['messages']
) {
  return (onSuccess: (data: any) => void, options?: Partial<BarcodeConfig>) => {
    return useBarcode({
      searchType,
      onSuccess: (data) => {
        const extractedData = dataExtractor ? dataExtractor(data) : data;
        onSuccess(extractedData);
      },
      messages: { ...customMessages, ...options?.messages },
      ...options,
    });
  };
}

// Pre-configured hooks for common use cases
export const useProductBarcode = createBarcodeHook(
  "products",
  (data) => data.product,
  { success: "Product found!" }
);

export const useInventoryBarcode = createBarcodeHook(
  "inventory",
  (data) => data,
  { success: "Stock information found!" }
);

// Specialized hook for POS that adds directly to cart
export function usePOSBarcode(addToCart: (product: any) => void) {
  return useBarcode({
    searchType: "products",
    onSuccess: (data) => {
      if (data.product) {
        addToCart(data.product);
      }
    },
    messages: {
      success: "Product added to cart!",
    },
  });
}

// Export the main hook as default for compatibility
export default useBarcode;