/**
 * Shared Order Status Configuration
 *
 * This module contains status configuration logic shared between:
 * - Electron POS App
 * - Admin Site
 *
 * Provides consistent badge variants, colors, and labels for order
 * and payment statuses across both applications.
 */

export interface StatusConfig {
  variant: "default" | "secondary" | "outline" | "destructive";
  icon: any; // LucideIcon type would require importing lucide-react
  color: string;
  label: string;
}

export const getStatusConfig = (status: string): StatusConfig => {
  switch (status) {
    case "COMPLETED":
      return {
        variant: "default",
        icon: "CheckCircle", // Icon name as string - each app can map to actual icon
        color: "text-primary",
        label: "Completed"
      };
    case "PENDING":
      return {
        variant: "secondary",
        icon: "Clock",
        color: "text-accent-foreground",
        label: "Pending"
      };
    case "HOLD":
      return {
        variant: "outline",
        icon: "Clock",
        color: "text-muted-foreground",
        label: "On Hold"
      };
    case "CANCELLED":
    case "VOID":
      return {
        variant: "destructive",
        icon: "XCircle",
        color: "text-destructive",
        label: status === "CANCELLED" ? "Cancelled" : "Void"
      };
    default:
      return {
        variant: "outline",
        icon: "Clock",
        color: "text-muted-foreground",
        label: status
      };
  }
};

export const getPaymentStatusConfig = (status: string): StatusConfig => {
  switch (status) {
    case "PAID":
      return {
        variant: "default",
        icon: "DollarSign",
        color: "text-primary",
        label: "Paid"
      };
    case "PARTIALLY_PAID":
      return {
        variant: "secondary",
        icon: "DollarSign",
        color: "text-accent-foreground",
        label: "Partial"
      };
    case "UNPAID":
      return {
        variant: "destructive",
        icon: "XCircle",
        color: "text-destructive",
        label: "Unpaid"
      };
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return {
        variant: "outline",
        icon: "RefreshCw",
        color: "text-muted-foreground",
        label: status === "REFUNDED" ? "Refunded" : "Partial Refund"
      };
    default:
      return {
        variant: "outline",
        icon: "DollarSign",
        color: "text-muted-foreground",
        label: status
      };
  }
};