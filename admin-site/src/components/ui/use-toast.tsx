/**
 * Admin-site toast wrapper that uses the shared @ajeen/ui toast hook
 * Configured for admin dashboard with long removal delay
 */
import {
	useToast as useSharedToast,
	toast as sharedToast,
	configureToast,
	type ToasterToast,
	type ToastActionElement,
	type ToastProps
} from "@ajeen/ui";

// Configure toast for admin site on module load
configureToast({
	limit: 1,
	removeDelay: 1000000, // Very long delay like original admin implementation
	defaultDuration: 3000,
});

// Re-export the shared hook and toast function
export const useToast = useSharedToast;
export const toast = sharedToast;

// Re-export types for compatibility
export type { ToasterToast, ToastActionElement, ToastProps };
