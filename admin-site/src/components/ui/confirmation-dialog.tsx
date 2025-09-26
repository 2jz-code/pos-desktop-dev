/**
 * Admin-site confirmation dialog wrapper that uses the shared @ajeen/ui confirmation hook
 * Configured for admin dashboard with shadcn/ui components
 */
import {
	useConfirmation as useSharedConfirmation,
	ConfirmationDialog as SharedConfirmationDialog,
	configureConfirmation,
	type ConfirmationConfig,
	type ConfirmationDialogProps,
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
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// Configure the shared hook with admin-site components on module load
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

// Re-export types for compatibility
export type { ConfirmationConfig, ConfirmationDialogProps, LucideIcon };