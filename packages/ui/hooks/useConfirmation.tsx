import React from "react";
import type { LucideIcon } from "lucide-react";

// Configuration interfaces
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

export interface ConfirmationDialogProps extends ConfirmationConfig {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ConfirmationState extends ConfirmationConfig {
  open: boolean;
}

// Alert Dialog component interfaces (to be compatible with both apps)
export interface AlertDialogComponents {
  AlertDialog: React.ComponentType<{ open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }>;
  AlertDialogContent: React.ComponentType<{ className?: string; children: React.ReactNode }>;
  AlertDialogHeader: React.ComponentType<{ children: React.ReactNode }>;
  AlertDialogTitle: React.ComponentType<{ className?: string; children: React.ReactNode }>;
  AlertDialogDescription: React.ComponentType<{ className?: string; children: React.ReactNode }>;
  AlertDialogFooter: React.ComponentType<{ children: React.ReactNode }>;
  AlertDialogAction: React.ComponentType<{ onClick: () => void; className?: string; children: React.ReactNode }>;
  AlertDialogCancel: React.ComponentType<{ onClick: () => void; children: React.ReactNode }>;
}

// Configuration for the hook system
export interface ConfirmationHookConfig {
  alertDialogComponents: AlertDialogComponents;
  cn: (className: string) => string;
}

let hookConfig: ConfirmationHookConfig | null = null;

/**
 * Configure the confirmation hook with app-specific components
 * This must be called before using useConfirmation
 */
export function configureConfirmation(config: ConfirmationHookConfig) {
  hookConfig = config;
}

/**
 * Versatile confirmation dialog component
 * Can be used for deletions, confirmations, and other user decisions
 */
function ConfirmationDialog({
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
  if (!hookConfig) {
    throw new Error("useConfirmation must be configured before use. Call configureConfirmation() first.");
  }

  const {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogAction,
    AlertDialogCancel,
  } = hookConfig.alertDialogComponents;
  const { cn } = hookConfig;

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
              <div className={cn(`flex-shrink-0 ${iconColor}`)}>
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
      confirmText: "Confirm",
      cancelText: "Cancel",
      variant: "default",
      icon: undefined,
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

export { ConfirmationDialog };