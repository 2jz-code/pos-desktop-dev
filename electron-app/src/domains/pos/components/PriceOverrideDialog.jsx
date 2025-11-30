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
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { DollarSign, FileText, Edit3, TrendingUp, TrendingDown } from "lucide-react";
import { usePosStore } from "@/domains/pos/store/posStore";
import { toast } from "@/shared/components/ui/use-toast";
import { useApprovalDialog } from "@/domains/approvals/hooks/useApprovalDialog.jsx";

export function PriceOverrideDialog({ open, onClose }) {
  const [selectedItemId, setSelectedItemId] = useState("");
  const [formData, setFormData] = useState({
    newPrice: "",
    reason: "",
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { orderId, items, applyPriceOverride } = usePosStore((state) => ({
    orderId: state.orderId,
    items: state.items,
    applyPriceOverride: state.applyPriceOverride,
  }));

  const { showApprovalDialog, approvalDialog } = useApprovalDialog();

  const selectedItem = items.find((item) => item.id === selectedItemId);
  const originalPrice = parseFloat(selectedItem?.price_at_sale) || 0;
  const newPrice = parseFloat(formData.newPrice) || 0;
  const priceDiff = newPrice - originalPrice;
  const totalDiff = Math.abs(priceDiff * (selectedItem?.quantity || 1));

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    const newErrors = {};

    if (!selectedItemId) {
      newErrors.selectedItem = "Please select an item";
    }

    if (!formData.newPrice || isNaN(newPrice) || newPrice < 0) {
      newErrors.newPrice = "Price must be 0 or greater";
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
      const response = await applyPriceOverride({
        orderItemId: selectedItemId,
        newPrice: newPrice,
        reason: formData.reason.trim(),
      });

      // Check if approval is required (online mode only)
      if (response.status === "pending_approval") {
        // Show approval dialog
        showApprovalDialog({
          approvalRequestId: response.approval_request_id,
          message: response.message,
          onApproved: () => {
            // Cart will update automatically via WebSocket
            toast({
              title: "Price Override Applied",
              description: `Item price updated from $${originalPrice.toFixed(2)} to $${newPrice.toFixed(2)}.`,
            });
          },
        });
        handleCancel();
      } else {
        // Price override applied successfully
        toast({
          title: "Price Override Applied",
          description: `Item price updated from $${originalPrice.toFixed(2)} to $${newPrice.toFixed(2)}.`,
        });
        handleCancel();
      }
    } catch (error) {
      console.error("Error applying price override:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to apply price override. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setSelectedItemId("");
    setFormData({
      newPrice: "",
      reason: "",
    });
    setErrors({});
    onClose();
  };

  const handleInputChange = (field, value) => {
    // For new price, prevent negative values
    if (field === "newPrice") {
      const numValue = parseFloat(value);
      // Cap at 0 if negative
      if (!isNaN(numValue) && numValue < 0) {
        value = "0.00";
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
    const item = items.find((i) => i.id === itemId);
    if (item) {
      // Pre-fill with current price
      setFormData((prev) => ({ ...prev, newPrice: (parseFloat(item.price_at_sale) || 0).toString() }));
    }
    if (errors.selectedItem) {
      setErrors((prev) => ({ ...prev, selectedItem: "" }));
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="h-5 w-5" />
            Modify Item Price
          </DialogTitle>
          <DialogDescription>
            Override the price for a specific item in this order
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Select Item *</Label>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No items in cart</p>
            ) : (
              <RadioGroup value={selectedItemId} onValueChange={handleItemSelect}>
                <div className="space-y-2 max-h-[200px] overflow-y-auto border rounded-md p-2">
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
                          ${(parseFloat(item.price_at_sale) || 0).toFixed(2)}
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

          {selectedItem && (
            <>
              <div className="space-y-2">
                <Label htmlFor="newPrice" className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  New Price *
                </Label>
                <Input
                  id="newPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formData.newPrice}
                  onChange={(e) => handleInputChange("newPrice", e.target.value)}
                  className={errors.newPrice ? "border-red-500" : ""}
                />
                {errors.newPrice && (
                  <p className="text-sm text-red-500">{errors.newPrice}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Current price: ${originalPrice.toFixed(2)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Reason *
                </Label>
                <Textarea
                  id="reason"
                  placeholder="e.g., Price match, Damaged item, Promotional adjustment"
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

              {formData.newPrice && !isNaN(newPrice) && (
                <div
                  className={`rounded-lg p-3 border ${
                    priceDiff > 0
                      ? "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800"
                      : priceDiff < 0
                      ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                      : "bg-muted/40 border-border"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Price Change:</span>
                      <span
                        className={`font-semibold flex items-center gap-1 ${
                          priceDiff > 0
                            ? "text-orange-600 dark:text-orange-400"
                            : priceDiff < 0
                            ? "text-green-600 dark:text-green-400"
                            : ""
                        }`}
                      >
                        {priceDiff > 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : priceDiff < 0 ? (
                          <TrendingDown className="h-3 w-3" />
                        ) : null}
                        {priceDiff > 0 ? "+" : ""}${priceDiff.toFixed(2)} per item
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">
                        Total Difference (qty: {selectedItem.quantity}):
                      </span>
                      <span className="font-semibold">
                        {priceDiff > 0 ? "+" : priceDiff < 0 ? "-" : ""}${totalDiff.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || items.length === 0}>
              {isSubmitting ? "Applying..." : "Apply Override"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
      {approvalDialog}
    </>
  );
}
