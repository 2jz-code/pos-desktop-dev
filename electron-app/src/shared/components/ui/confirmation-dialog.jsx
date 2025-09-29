/**
 * Electron-app confirmation dialog wrapper that uses the shared @ajeen/ui confirmation hook
 * Configured for POS system with shadcn/ui components
 */
import {
	useConfirmation as useSharedConfirmation,
	ConfirmationDialog as SharedConfirmationDialog,
	configureConfirmation,
} from "@ajeen/ui";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { cn } from "@/shared/lib/utils";

// Configure the shared hook with electron-app components on module load
configureConfirmation({
	alertDialogComponents: {
		AlertDialog,
		AlertDialogContent,
		AlertDialogHeader,
		AlertDialogTitle,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogAction,
		AlertDialogCancel,
	},
	cn,
});

// Re-export the shared hook and components
export const useConfirmation = useSharedConfirmation;
export const ConfirmationDialog = SharedConfirmationDialog;