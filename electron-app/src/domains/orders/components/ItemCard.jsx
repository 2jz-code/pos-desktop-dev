import { Card } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Package } from "lucide-react";
import { formatCurrency } from "@/shared/lib/utils";
import ModifierDisplay from "@/shared/components/ui/ModifierDisplay";

export const ItemCard = ({ item }) => {
  return (
    <Card className="p-4">
      <div className="flex gap-4">
        {/* Product Image/Icon */}
        <div className="w-12 h-12 bg-muted rounded-lg shrink-0 flex items-center justify-center">
          {item.product?.image ? (
            <img
              src={item.product.image}
              alt=""
              className="w-full h-full object-cover rounded-lg"
            />
          ) : (
            <Package className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        {/* Item Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-medium text-foreground">
                  {item.product?.name ||
                    item.custom_name ||
                    item.display_name ||
                    "Custom Item"}
                </h4>
                {!item.product && (
                  <Badge variant="outline" className="text-xs">
                    Custom
                  </Badge>
                )}
              </div>

              <div className="text-sm text-muted-foreground mt-1">
                Quantity: {item.quantity}
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="font-semibold text-foreground">
                {formatCurrency(item.price_at_sale * item.quantity)}
              </div>
              <div className="text-sm text-muted-foreground">
                {item.quantity} × {formatCurrency(item.price_at_sale)}
              </div>
            </div>
          </div>

          {/* Modifiers */}
          {item.selected_modifiers_snapshot &&
            item.selected_modifiers_snapshot.length > 0 && (
              <div className="mt-3 pt-3 border-t">
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