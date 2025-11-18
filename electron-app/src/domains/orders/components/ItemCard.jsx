import { Card } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/shared/components/ui/hover-card";
import { Package, ShieldOff } from "lucide-react";
import { formatCurrency } from "@ajeen/ui";
import ModifierDisplay from "@/shared/components/ui/ModifierDisplay";

export const ItemCard = ({ item, adjustments = [], compact = false }) => {
  const hasModifiers = item.selected_modifiers_snapshot && item.selected_modifiers_snapshot.length > 0;

  // Find price override for this specific item
  const priceOverride = adjustments.find(
    (adj) => adj.adjustment_type === "PRICE_OVERRIDE" && adj.order_item === item.id
  );

  // Find item-level one-off discounts for this specific item
  const itemDiscounts = adjustments.filter(
    (adj) => adj.adjustment_type === "ONE_OFF_DISCOUNT" && adj.order_item === item.id
  );

  // Find tax exemption for this specific item
  const taxExemption = adjustments.find(
    (adj) => adj.adjustment_type === "TAX_EXEMPT" && adj.order_item === item.id
  );

  // Calculate effective price
  const basePrice = parseFloat(item.price_at_sale);
  const totalItemDiscount = itemDiscounts.reduce((sum, disc) => sum + parseFloat(disc.amount || 0), 0);
  const hasItemDiscount = itemDiscounts.length > 0;
  const effectivePricePerUnit = hasItemDiscount
    ? basePrice + (totalItemDiscount / item.quantity) // discount.amount is negative
    : basePrice;

  const hasOriginalPrice = priceOverride && item.product?.price;
  const originalPrice = hasOriginalPrice ? parseFloat(item.product.price) : null;

  return (
    <Card className={`border border-border/60 bg-card/80 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex gap-3">
        {/* Product Image/Icon */}
        <div className={`bg-muted/20 rounded-lg shrink-0 flex items-center justify-center ${compact ? 'w-10 h-10' : 'w-12 h-12'}`}>
          {item.product?.image ? (
            <img
              src={item.product.image}
              alt=""
              className="w-full h-full object-cover rounded-lg"
            />
          ) : (
            <Package className={`text-muted-foreground/60 ${compact ? 'h-4 w-4' : 'h-5 w-5'}`} />
          )}
        </div>

        {/* Item Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className={`font-semibold text-foreground truncate ${compact ? 'text-sm' : ''}`}>
                  {item.product?.name ||
                    item.custom_name ||
                    item.display_name ||
                    "Custom Item"}
                </h4>
                {!item.product && (
                  <Badge variant="outline" className="text-xs shrink-0">
                    Custom
                  </Badge>
                )}
                {/* Tax Exempt Badge */}
                {taxExemption && (
                  <Badge
                    variant="outline"
                    className="text-xs px-1.5 py-0 border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 flex items-center gap-1 shrink-0"
                  >
                    <ShieldOff className="h-3 w-3" />
                    No Tax
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-muted-foreground font-medium ${compact ? 'text-xs' : 'text-sm'}`}>
                  Qty: {item.quantity}
                </span>
                <span className="text-muted-foreground">•</span>

                {/* Show original price if overridden or discounted */}
                {(hasOriginalPrice || hasItemDiscount) && (
                  <span className={`text-muted-foreground/60 line-through ${compact ? 'text-xs' : 'text-sm'}`}>
                    {formatCurrency(hasOriginalPrice ? originalPrice : basePrice)}
                  </span>
                )}

                <span className={`font-medium ${compact ? 'text-xs' : 'text-sm'} ${
                  priceOverride
                    ? "text-orange-600 dark:text-orange-400"
                    : hasItemDiscount
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground"
                }`}>
                  {formatCurrency(effectivePricePerUnit)} each
                </span>

                {/* Price Override Badge */}
                {priceOverride && (
                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <Badge
                        variant="outline"
                        className="text-xs px-1.5 py-0 border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 cursor-help"
                      >
                        Override
                      </Badge>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80" side="top">
                      <div className="space-y-2">
                        <div className="text-sm">
                          <span className="font-semibold">Reason:</span>
                          <p className="text-muted-foreground mt-1">{priceOverride.reason}</p>
                        </div>
                        {priceOverride.approved_by_name && (
                          <div className="text-xs text-muted-foreground border-t pt-2">
                            Approved by {priceOverride.approved_by_name}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground border-t pt-2">
                          {priceOverride.original_price && (
                            <div>Original: {formatCurrency(priceOverride.original_price)}</div>
                          )}
                          <div>New: {formatCurrency(priceOverride.new_price)}</div>
                        </div>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                )}

                {/* Item-Level Discount Badges */}
                {itemDiscounts.map((discount) => {
                  let discountLabel = "";
                  if (discount.discount_type === "PERCENTAGE") {
                    discountLabel = `${discount.discount_value}% off`;
                  } else {
                    discountLabel = `${formatCurrency(discount.discount_value)} off`;
                  }
                  return (
                    <HoverCard key={discount.id}>
                      <HoverCardTrigger asChild>
                        <Badge
                          variant="outline"
                          className="text-xs px-1.5 py-0 border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 cursor-help"
                        >
                          {discountLabel}
                        </Badge>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-80" side="top">
                        <div className="space-y-2">
                          <div className="text-sm">
                            <span className="font-semibold">Reason:</span>
                            <p className="text-muted-foreground mt-1">{discount.reason}</p>
                          </div>
                          {discount.approved_by_name && (
                            <div className="text-xs text-muted-foreground border-t pt-2">
                              Approved by {discount.approved_by_name}
                            </div>
                          )}
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  );
                })}
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className={`font-bold ${compact ? 'text-base' : 'text-lg'} ${
                priceOverride
                  ? "text-orange-600 dark:text-orange-400"
                  : hasItemDiscount
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-primary"
              }`}>
                {formatCurrency(item.quantity * effectivePricePerUnit)}
              </div>
            </div>
          </div>

          {/* Modifiers - More compact display */}
          {hasModifiers && (
            <div className={`pt-2 border-t border-border/40 ${compact ? 'mt-2' : 'mt-3'}`}>
              <ModifierDisplay
                modifiers={item.selected_modifiers_snapshot}
                compact={true}
                showTotal={false}
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};