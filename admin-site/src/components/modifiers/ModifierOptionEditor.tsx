import React from "react";
import DraggableList from "@/components/ui/draggable-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Trash2 } from "lucide-react";

interface ModifierOption {
  id?: string | number;
  name: string;
  price_delta: number;
  is_product_specific?: boolean;
  isProductSpecific?: boolean;
}

interface ModifierOptionEditorProps {
  options?: ModifierOption[];
  onOptionsChange?: (options: ModifierOption[]) => void;
  onRemoveOption?: (index: number) => void;
  onUpdateOption?: (index: number, field: string, value: any) => void;
  showHeaders?: boolean;
  showProductSpecific?: boolean;
  className?: string;
  showEmptyState?: boolean;
  emptyStateMessage?: string;
}

const ModifierOptionEditor: React.FC<ModifierOptionEditorProps> = ({
  options = [],
  onOptionsChange,
  onRemoveOption,
  onUpdateOption,
  showHeaders = true,
  showProductSpecific = true,
  className = "",
  showEmptyState = true,
  emptyStateMessage = "No options yet",
}) => {
  return (
    <DraggableList
      items={options}
      onReorder={(reorderedItems) => {
        onOptionsChange?.(reorderedItems as ModifierOption[]);
      }}
      getItemId={(item, index) => item.id || `option-${index}`}
      tableStyle={true}
      showHeaders={showHeaders}
      headers={
        showHeaders
          ? [
              { label: "Name", className: "flex-1" },
              { label: "Price (+/-)", className: "w-24 text-center" },
              { label: "", className: "w-9" }, // Spacer for delete button
            ]
          : []
      }
      showEmptyState={showEmptyState}
      emptyStateMessage={emptyStateMessage}
      className={className}
      renderItem={({ item: option, index, dragHandle }) => (
        <div>
          <div className="flex items-center gap-3 p-3">
            {dragHandle}

            <div className="flex-1">
              <Input
                value={option.name}
                onChange={(e) => onUpdateOption?.(index, "name", e.target.value)}
                placeholder={`Option ${index + 1}`}
                className="w-full"
              />
            </div>

            <div className="w-24">
              <Input
                type="number"
                step="0.01"
                value={option.price_delta}
                onChange={(e) =>
                  onUpdateOption?.(
                    index,
                    "price_delta",
                    parseFloat(e.target.value) || 0
                  )
                }
                placeholder="$0.00"
                className="w-full text-center"
              />
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRemoveOption?.(index)}
              disabled={options.length <= 1}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {showProductSpecific && (
            <div className="px-3 pb-3">
              <div className="flex items-center space-x-2">
                <Switch
                  checked={
                    option.is_product_specific || option.isProductSpecific
                  }
                  onCheckedChange={(checked) =>
                    onUpdateOption?.(
                      index,
                      option.is_product_specific !== undefined
                        ? "is_product_specific"
                        : "isProductSpecific",
                      checked
                    )
                  }
                  size="sm"
                />
                <Label className="text-sm">Product-specific option</Label>
                <div className="text-xs text-gray-500">
                  {option.is_product_specific || option.isProductSpecific
                    ? "Only for this product"
                    : "Available for all products"}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    />
  );
};

export default ModifierOptionEditor;