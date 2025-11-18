import { Badge } from "@/shared/components/ui/badge";
import { formatCurrency } from "@ajeen/ui";
import { format } from "date-fns";
import { Percent, DollarSign, Tag, User, CheckCircle, Clock, XCircle, ShieldOff, Ban } from "lucide-react";

/**
 * AdjustmentRow - Displays a single order adjustment (one-off discount or price override)
 *
 * @param {Object} adjustment - The adjustment object from the API
 * @param {boolean} compact - Whether to display in compact mode (for multiple adjustments)
 */
export const AdjustmentRow = ({ adjustment, compact = false }) => {
  // Determine adjustment type and styling
  const isDiscount = adjustment.adjustment_type === "ONE_OFF_DISCOUNT";
  const isPriceOverride = adjustment.adjustment_type === "PRICE_OVERRIDE";
  const isTaxExempt = adjustment.adjustment_type === "TAX_EXEMPT";
  const isFeeExempt = adjustment.adjustment_type === "FEE_EXEMPT";

  // Get approval status
  const approvalStatus = adjustment.approval_status || "approved"; // Default to approved for backward compatibility
  const isPending = approvalStatus === "pending";
  const isApproved = approvalStatus === "approved";
  const isDenied = approvalStatus === "denied";

  // Type badge configuration
  const getTypeBadge = () => {
    if (isDiscount) {
      return {
        label: "Discount",
        variant: "default",
        className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
        icon: Percent,
      };
    }
    if (isPriceOverride) {
      return {
        label: "Price Override",
        variant: "default",
        className: "bg-blue-500/10 text-blue-700 border-blue-500/20",
        icon: Tag,
      };
    }
    if (isTaxExempt) {
      return {
        label: "Tax Exemption",
        variant: "default",
        className: "bg-orange-500/10 text-orange-700 border-orange-500/20",
        icon: ShieldOff,
      };
    }
    if (isFeeExempt) {
      return {
        label: "Fee Exemption",
        variant: "default",
        className: "bg-blue-500/10 text-blue-700 border-blue-500/20",
        icon: Ban,
      };
    }
    return {
      label: "Adjustment",
      variant: "outline",
      icon: DollarSign,
    };
  };

  // Approval status badge configuration
  const getStatusBadge = () => {
    if (isPending) {
      return {
        label: "Pending Approval",
        variant: "secondary",
        className: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
        icon: Clock,
      };
    }
    if (isDenied) {
      return {
        label: "Denied",
        variant: "destructive",
        className: "bg-red-500/10 text-red-700 border-red-500/20",
        icon: XCircle,
      };
    }
    if (isApproved) {
      return {
        label: "Approved",
        variant: "default",
        className: "bg-green-500/10 text-green-700 border-green-500/20",
        icon: CheckCircle,
      };
    }
    return null;
  };

  const typeBadge = getTypeBadge();
  const statusBadge = getStatusBadge();
  const TypeIcon = typeBadge.icon;
  const StatusIcon = statusBadge?.icon;

  // Format the adjustment value display
  const getValueDisplay = () => {
    if (isDiscount) {
      if (adjustment.discount_type === "PERCENTAGE") {
        return `${adjustment.discount_value}% off`;
      }
      return `${formatCurrency(adjustment.discount_value)} off`;
    }
    if (isPriceOverride && adjustment.new_price !== null) {
      return `New price: ${formatCurrency(adjustment.new_price)}`;
    }
    if (isTaxExempt) {
      return `Tax exempted: ${formatCurrency(Math.abs(parseFloat(adjustment.amount || 0)))}`;
    }
    if (isFeeExempt) {
      return `Fee exempted: ${formatCurrency(Math.abs(parseFloat(adjustment.amount || 0)))}`;
    }
    return "N/A";
  };

  // Calculate the effective amount (negative for discounts and exemptions)
  const getAmountDisplay = () => {
    const amount = parseFloat(adjustment.amount || 0);
    const isNegative = isDiscount || isTaxExempt || isFeeExempt;

    // Color based on type
    let colorClass = "text-foreground font-semibold";
    if (isDiscount) {
      colorClass = "text-emerald-600 font-semibold";
    } else if (isTaxExempt) {
      colorClass = "text-orange-600 font-semibold";
    } else if (isFeeExempt) {
      colorClass = "text-blue-600 font-semibold";
    }

    return (
      <span className={colorClass}>
        {isNegative ? "-" : ""}{formatCurrency(Math.abs(amount))}
      </span>
    );
  };

  if (compact) {
    // Compact view for when there are multiple adjustments
    return (
      <div className="flex items-center justify-between py-2 px-3 bg-muted/10 rounded-md border border-border/40">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="flex size-7 items-center justify-center bg-muted rounded-md shrink-0">
            <TypeIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`${typeBadge.className} text-xs px-2 py-0.5`}>
                {typeBadge.label}
              </Badge>
              {statusBadge && !isApproved && (
                <Badge className={`${statusBadge.className} text-xs px-2 py-0.5`}>
                  {statusBadge.label}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {adjustment.reason || "No reason provided"}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0 ml-2">
          {getAmountDisplay()}
        </div>
      </div>
    );
  }

  // Full view with all details
  return (
    <div className="p-4 bg-muted/10 rounded-lg border border-border/40 space-y-3">
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="flex size-9 items-center justify-center bg-primary/10 text-primary rounded-lg shrink-0">
            <TypeIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge className={typeBadge.className}>
                {typeBadge.label}
              </Badge>
              {statusBadge && !isApproved && (
                <Badge className={statusBadge.className}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusBadge.label}
                </Badge>
              )}
            </div>
            <p className="text-sm text-foreground font-medium">
              {getValueDisplay()}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          {getAmountDisplay()}
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/40">
        {/* Reason */}
        {adjustment.reason && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Reason</p>
            <p className="text-sm text-foreground">{adjustment.reason}</p>
          </div>
        )}

        {/* Item (for price overrides) */}
        {isPriceOverride && adjustment.order_item_name && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Item</p>
            <p className="text-sm text-foreground">{adjustment.order_item_name}</p>
          </div>
        )}

        {/* Original Price (for price overrides) */}
        {isPriceOverride && adjustment.original_price !== null && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Original Price</p>
            <p className="text-sm text-foreground line-through text-muted-foreground">
              {formatCurrency(adjustment.original_price)}
            </p>
          </div>
        )}

        {/* Applied By */}
        {adjustment.applied_by_name && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Applied By</p>
            <div className="flex items-center gap-1.5">
              <User className="h-3 w-3 text-muted-foreground" />
              <p className="text-sm text-foreground">{adjustment.applied_by_name}</p>
            </div>
          </div>
        )}

        {/* Approved By */}
        {adjustment.approved_by_name && isApproved && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Approved By</p>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-3 w-3 text-green-600" />
              <p className="text-sm text-foreground">{adjustment.approved_by_name}</p>
            </div>
          </div>
        )}

        {/* Timestamp */}
        {adjustment.created_at && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Applied On</p>
            <p className="text-sm text-foreground">
              {format(new Date(adjustment.created_at), "MMM d, yyyy 'at' h:mm a")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
