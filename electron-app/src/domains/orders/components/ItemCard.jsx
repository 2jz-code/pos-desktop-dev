import { Card } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Package } from "lucide-react";
import { formatCurrency } from "@ajeen/ui";
import ModifierDisplay from "@/shared/components/ui/ModifierDisplay";

export const ItemCard = ({ item, compact = false }) => {
  const hasModifiers = item.selected_modifiers_snapshot && item.selected_modifiers_snapshot.length > 0;

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
              </div>

              <div className="flex items-center gap-3 mt-1">
                <span className={`text-muted-foreground font-medium ${compact ? 'text-xs' : 'text-sm'}`}>
                  Qty: {item.quantity}
                </span>
                <span className={`text-muted-foreground ${compact ? 'text-xs' : 'text-sm'}`}>
                  {formatCurrency(item.price_at_sale)} each
                </span>
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className={`font-bold text-primary ${compact ? 'text-base' : 'text-lg'}`}>
                {formatCurrency(item.price_at_sale * item.quantity)}
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