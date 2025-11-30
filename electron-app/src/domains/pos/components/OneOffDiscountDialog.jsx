import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { Percent, DollarSign, FileText, Tag, ShoppingCart, Package } from "lucide-react";
import { usePosStore } from "@/domains/pos/store/posStore";
import { toast } from "@/shared/components/ui/use-toast";
import { useApprovalDialog } from "@/domains/approvals/hooks/useApprovalDialog.jsx";

export function OneOffDiscountDialog({ open, onClose }) {
  const [discountType, setDiscountType] = useState("PERCENTAGE");
  const [discountLevel, setDiscountLevel] = useState("order"); // "order" or "item"
  const [selectedItemId, setSelectedItemId] = useState("");
  const [formData, setFormData] = useState({
    discountValue: "",
    reason: "",
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { orderId, items, subtotal, adjustments, applyOneOffDiscount } = usePosStore((state) => ({
    orderId: state.orderId,
    items: state.items,
    subtotal: state.subtotal,
    adjustments: state.adjustments,
    applyOneOffDiscount: state.applyOneOffDiscount,
  }));

  const { showApprovalDialog, approvalDialog } = useApprovalDialog();

  const selectedItem = items.find((item) => item.id === selectedItemId);

  // Calculate existing fixed discounts on selected item
  const getExistingItemFixedDiscounts = () => {
    if (!selectedItem || !adjustments) return 0;

    const itemDiscounts = adjustments.filter(
      (adj) => adj.adjustment_type === "ONE_OFF_DISCOUNT" &&
               adj.discount_type === "FIXED" &&
               adj.order_item === selectedItem.id
    );

    return itemDiscounts.reduce((sum, adj) => sum + Math.abs(parseFloat(adj.discount_value || 0)), 0);
  };

  // Calculate remaining allowed discount for item-level fixed discounts
  const getRemainingAllowedDiscount = () => {
    if (!selectedItem || discountType !== "FIXED" || discountLevel !== "item") {
      return null;
    }

    const itemTotal = (parseFloat(selectedItem.price_at_sale) * selectedItem.quantity) || 0;
    const existingDiscounts = getExistingItemFixedDiscounts();
    return Math.max(0, itemTotal - existingDiscounts);
  };

  const calculateDiscountPreview = () => {
    if (!formData.discountValue) return null;

    const value = parseFloat(formData.discountValue);
    if (isNaN(value) || value <= 0) return null;

    // Calculate base amount based on level
    let baseAmount;
    if (discountLevel === "item" && selectedItem) {
      baseAmount = (parseFloat(selectedItem.price_at_sale) * selectedItem.quantity) || 0;
    } else {
      baseAmount = subtotal || 0;
    }

    if (discountType === "PERCENTAGE") {
      if (value > 100) return null;
      return (baseAmount * (value / 100)).toFixed(2);
    } else {
      // FIXED
      if (value > baseAmount) return null;
      return value.toFixed(2);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    const newErrors = {};
    const value = parseFloat(formData.discountValue);

    // Validate item selection if item-level
    if (discountLevel === "item" && !selectedItemId) {
      newErrors.selectedItem = "Please select an item";
    }

    // Calculate applicable amount for validation
    let applicableAmount;
    if (discountLevel === "item" && selectedItem) {
      applicableAmount = (parseFloat(selectedItem.price_at_sale) * selectedItem.quantity) || 0;
    } else {
      applicableAmount = subtotal || 0;
    }

    if (!formData.discountValue || isNaN(value) || value <= 0) {
      newErrors.discountValue = "Discount value must be greater than 0";
    } else if (discountType === "PERCENTAGE" && value > 100) {
      newErrors.discountValue = "Percentage cannot exceed 100%";
    } else if (discountType === "FIXED" && value > applicableAmount) {
      newErrors.discountValue = `Fixed discount cannot exceed ${discountLevel === "item" ? "item total" : "order subtotal"} ($${applicableAmount.toFixed(2)})`;
    }

    if (!formData.reason.trim()) {
      newErrors.reason = "Reason is required for audit trail";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await applyOneOffDiscount({
        discountType: discountType,
        discountValue: value,
        reason: formData.reason.trim(),
        orderItemId: discountLevel === "item" ? selectedItemId : null,
      });

      // Check if approval is required (online mode only)
      if (response.status === "pending_approval") {
        // Show approval dialog
        showApprovalDialog({
          approvalRequestId: response.approval_request_id,
          message: response.message,
          onApproved: () => {
            // Cart will update automatically via WebSocket
            const itemDescription = discountLevel === "item" && selectedItem
              ? ` to ${selectedItem.product?.name || selectedItem.custom_name}`
              : " to order";
            toast({
              title: "Discount Applied",
              description: `${discountType === "PERCENTAGE" ? `${value}%` : `$${value}`} discount applied${itemDescription}.`,
            });
          },
        });
        handleCancel();
      } else {
        // Discount applied successfully
        const itemDescription = discountLevel === "item" && selectedItem
          ? ` to ${selectedItem.product?.name || selectedItem.custom_name}`
          : " to order";
        toast({
          title: "Discount Applied",
          description: `${discountType === "PERCENTAGE" ? `${value}%` : `$${value}`} discount applied${itemDescription}.`,
        });
        handleCancel();
      }
    } catch (error) {
      console.error("Error applying discount:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to apply discount. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      discountValue: "",
      reason: "",
    });
    setErrors({});
    setDiscountType("PERCENTAGE");
    setDiscountLevel("order");
    setSelectedItemId("");
    onClose();
  };

  const handleInputChange = (field, value) => {
    // For discount value, enforce max limits for fixed discounts
    if (field === "discountValue" && discountType === "FIXED") {
      const numValue = parseFloat(value);
      // Calculate max allowed based on discount level
      let maxAllowed;
      if (discountLevel === "item" && selectedItem) {
        // For item-level fixed discounts, use remaining allowed (item price - existing discounts)
        const remaining = getRemainingAllowedDiscount();
        maxAllowed = remaining !== null ? remaining : 0;
      } else {
        // For order-level fixed discounts, use subtotal
        maxAllowed = subtotal || 0;
      }

      // Cap the value at the maximum
      if (!isNaN(numValue) && numValue > maxAllowed) {
        value = maxAllowed.toFixed(2);
      }
    }

    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field when user types
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  const handleItemSelect = (itemId) => {
    setSelectedItemId(itemId);
    if (errors.selectedItem) {
      setErrors((prev) => ({ ...prev, selectedItem: "" }));
    }
  };

  const handleDiscountLevelChange = (level) => {
    setDiscountLevel(level);
    // Clear item selection when switching to order level
    if (level === "order") {
      setSelectedItemId("");
      if (errors.selectedItem) {
        setErrors((prev) => ({ ...prev, selectedItem: "" }));
      }
    }
  };

  const discountPreview = calculateDiscountPreview();

  // Calculate applicable amount for display
  let applicableAmount;
  if (discountLevel === "item" && selectedItem) {
    applicableAmount = (parseFloat(selectedItem.price_at_sale) * selectedItem.quantity) || 0;
  } else {
    applicableAmount = subtotal || 0;
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Apply One-Off Discount
          </DialogTitle>
          <DialogDescription>
            Apply an ad-hoc discount to this order or a specific item
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Discount Level Selection */}
          <div className="space-y-2">
            <Label>Apply Discount To</Label>
            <Tabs value={discountLevel} onValueChange={handleDiscountLevelChange}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="order" className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  Entire Order
                </TabsTrigger>
                <TabsTrigger value="item" className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Specific Item
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Item Selection (only for item-level) */}
          {discountLevel === "item" && (
            <div className="space-y-2">
              <Label>Select Item *</Label>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items in cart</p>
              ) : (
                <RadioGroup value={selectedItemId} onValueChange={handleItemSelect}>
                  <div className="space-y-2 max-h-[150px] overflow-y-auto border rounded-md p-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center space-x-3 p-2 rounded-md hover:bg-muted/40 ${
                          selectedItemId === item.id ? "bg-muted/60" : ""
                        }`}
                      >
                        <RadioGroupItem value={item.id} id={item.id} />
                        <Label
                          htmlFor={item.id}
                          className="flex-1 cursor-pointer flex justify-between items-center"
                        >
                          <div>
                            <div className="font-medium">
                              {item.product?.name || item.custom_name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Qty: {item.quantity}
                            </div>
                          </div>
                          <div className="text-sm font-semibold">
                            ${((parseFloat(item.price_at_sale) * item.quantity) || 0).toFixed(2)}
                          </div>
                        </Label>
                      </div>
                    ))}
                  </div>
                </RadioGroup>
              )}
              {errors.selectedItem && (
                <p className="text-sm text-red-500">{errors.selectedItem}</p>
              )}
            </div>
          )}

          {/* Discount Type Selection */}
          <div className="space-y-2">
            <Label>Discount Type</Label>
            <Tabs value={discountType} onValueChange={setDiscountType}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="PERCENTAGE" className="flex items-center gap-2">
                  <Percent className="h-4 w-4" />
                  Percentage
                </TabsTrigger>
                <TabsTrigger value="FIXED" className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Fixed Amount
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Discount Value */}
          <div className="space-y-2">
            <Label htmlFor="discountValue" className="flex items-center gap-2">
              {discountType === "PERCENTAGE" ? (
                <Percent className="h-4 w-4" />
              ) : (
                <DollarSign className="h-4 w-4" />
              )}
              {discountType === "PERCENTAGE" ? "Percentage" : "Amount"} *
            </Label>
            <Input
              id="discountValue"
              type="number"
              step={discountType === "PERCENTAGE" ? "0.01" : "0.01"}
              min="0.01"
              max={discountType === "PERCENTAGE" ? "100" : (applicableAmount > 0 ? applicableAmount.toFixed(2) : undefined)}
              placeholder={discountType === "PERCENTAGE" ? "e.g., 15.00" : "e.g., 10.00"}
              value={formData.discountValue}
              onChange={(e) => handleInputChange("discountValue", e.target.value)}
              className={errors.discountValue ? "border-red-500" : ""}
              autoFocus
            />
            {errors.discountValue && (
              <p className="text-sm text-red-500">{errors.discountValue}</p>
            )}
            {discountType === "PERCENTAGE" && (
              <p className="text-xs text-muted-foreground">
                Enter percentage (0-100)
              </p>
            )}
            {discountType === "FIXED" && discountLevel === "item" && selectedItem && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>Item total: ${applicableAmount.toFixed(2)}</p>
                {(() => {
                  const existingDiscounts = getExistingItemFixedDiscounts();
                  const remaining = getRemainingAllowedDiscount();
                  if (existingDiscounts > 0) {
                    return (
                      <>
                        <p>Existing discounts: ${existingDiscounts.toFixed(2)}</p>
                        <p className="font-medium text-orange-600 dark:text-orange-400">
                          Remaining allowed: ${remaining.toFixed(2)}
                        </p>
                      </>
                    );
                  }
                  return <p>Maximum: ${applicableAmount.toFixed(2)}</p>;
                })()}
              </div>
            )}
            {discountType === "FIXED" && discountLevel === "order" && applicableAmount > 0 && (
              <p className="text-xs text-muted-foreground">
                Maximum: $${applicableAmount.toFixed(2)} (order subtotal)
              </p>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Reason *
            </Label>
            <Textarea
              id="reason"
              placeholder="e.g., Customer complaint, Promotional discount, Price adjustment"
              value={formData.reason}
              onChange={(e) => handleInputChange("reason", e.target.value)}
              className={errors.reason ? "border-red-500" : ""}
              rows={3}
            />
            {errors.reason && (
              <p className="text-sm text-red-500">{errors.reason}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Required for audit trail and reporting
            </p>
          </div>

          {/* Discount Preview */}
          {discountPreview && (discountLevel === "order" || selectedItem) && (
            <div className="rounded-lg bg-muted/40 p-3 border border-green-200 dark:border-green-800">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Discount Amount:</span>
                <span className="font-semibold text-green-600 dark:text-green-400">
                  -${discountPreview}
                </span>
              </div>
              {applicableAmount > 0 && (
                <div className="flex justify-between items-center text-sm mt-1">
                  <span className="text-muted-foreground">
                    New {discountLevel === "item" ? "Item" : "Subtotal"}:
                  </span>
                  <span className="font-semibold">
                    ${(applicableAmount - parseFloat(discountPreview)).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Applying..." : "Apply Discount"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
      {approvalDialog}
    </>
  );
}
