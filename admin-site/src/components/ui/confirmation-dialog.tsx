import React from "react";
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

export interface ConfirmationDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	title: string;
	description?: string;
	confirmText?: string;
	cancelText?: string;
	variant?: "default" | "destructive" | "warning" | "success";
	icon?: LucideIcon;
	children?: React.ReactNode;
}

/**
 * Versatile confirmation dialog component
 * Can be used for deletions, confirmations, and other user decisions
 */
export function ConfirmationDialog({
	open,
	onOpenChange,
	onConfirm,
	title,
	description,
	confirmText = "Confirm",
	cancelText = "Cancel",
	variant = "default",
	icon: Icon,
	children,
}: ConfirmationDialogProps) {
	const handleConfirm = () => {
		onConfirm?.();
		onOpenChange?.(false);
	};

	const handleCancel = () => {
		onOpenChange?.(false);
	};

	// Variant styles
	const getVariantStyles = () => {
		switch (variant) {
			case "destructive":
				return {
					iconColor: "text-red-600",
					confirmButtonClass: "bg-red-600 hover:bg-red-700 focus:ring-red-600",
				};
			case "warning":
				return {
					iconColor: "text-yellow-600",
					confirmButtonClass: "bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-600",
				};
			case "success":
				return {
					iconColor: "text-green-600",
					confirmButtonClass: "bg-green-600 hover:bg-green-700 focus:ring-green-600",
				};
			default:
				return {
					iconColor: "text-blue-600",
					confirmButtonClass: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-600",
				};
		}
	};

	const { iconColor, confirmButtonClass } = getVariantStyles();

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="sm:max-w-[425px]">
				<AlertDialogHeader>
					<div className="flex items-center gap-3">
						{Icon && (
							<div className={cn("flex-shrink-0", iconColor)}>
								<Icon className="h-6 w-6" />
							</div>
						)}
						<div className="flex-1">
							<AlertDialogTitle className="text-left">
								{title}
							</AlertDialogTitle>
							{description && (
								<AlertDialogDescription className="text-left mt-2">
									{description}
								</AlertDialogDescription>
							)}
						</div>
					</div>
				</AlertDialogHeader>

				{children && (
					<div className="py-4">
						{children}
					</div>
				)}

				<AlertDialogFooter>
					<AlertDialogCancel onClick={handleCancel}>
						{cancelText}
					</AlertDialogCancel>
					<AlertDialogAction 
						onClick={handleConfirm}
						className={cn(confirmButtonClass)}
					>
						{confirmText}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export interface ConfirmationConfig {
	title: string;
	description?: string;
	confirmText?: string;
	cancelText?: string;
	variant?: "default" | "destructive" | "warning" | "success";
	icon?: LucideIcon;
	onConfirm: () => void;
	children?: React.ReactNode;
}

interface ConfirmationState extends ConfirmationConfig {
	open: boolean;
}

/**
 * Hook for managing confirmation dialog state
 * Usage:
 * 
 * const confirmation = useConfirmation();
 * 
 * const handleDelete = () => {
 *   confirmation.show({
 *     title: "Delete Item",
 *     description: "Are you sure you want to delete this item?",
 *     variant: "destructive",
 *     onConfirm: () => {
 *       // Delete logic here
 *     }
 *   });
 * };
 */
export function useConfirmation() {
	const [config, setConfig] = React.useState<ConfirmationState>({
		open: false,
		title: "",
		description: "",
		confirmText: "Confirm",
		cancelText: "Cancel",
		variant: "default",
		icon: undefined,
		onConfirm: () => {},
		children: undefined,
	});

	const show = React.useCallback((newConfig: ConfirmationConfig) => {
		setConfig({
			open: true,
			title: "",
			description: "",
			confirmText: "Confirm",
			cancelText: "Cancel",
			variant: "default",
			icon: undefined,
			onConfirm: () => {},
			children: undefined,
			...newConfig,
		});
	}, []);

	const hide = React.useCallback(() => {
		setConfig(prev => ({ ...prev, open: false }));
	}, []);

	const dialog = (
		<ConfirmationDialog
			{...config}
			onOpenChange={hide}
		/>
	);

	return {
		show,
		hide,
		dialog,
	};
}