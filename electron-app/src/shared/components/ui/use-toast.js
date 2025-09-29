/**
 * Electron-app toast wrapper that uses the shared @ajeen/ui toast hook
 * Configured for POS system with fast removal delay
 */
import {
	useToast as useSharedToast,
	toast as sharedToast,
	configureToast,
} from "@ajeen/ui";

// Configure toast for electron-app (POS system) on module load
configureToast({
	limit: 1,
	removeDelay: 100, // Fast removal like original electron implementation
	defaultDuration: 1500, // Default duration like original
});

// Re-export the shared hook and toast function
export const useToast = useSharedToast;
export const toast = sharedToast;
