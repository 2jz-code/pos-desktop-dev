import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import DraggableList from "@/components/ui/draggable-list";
import {
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Star,
} from "lucide-react";

interface ModifierOption {
  id: string | number;
  name: string;
  price_delta: number;
  is_product_specific?: boolean;
  isProductSpecific?: boolean;
}

interface OptionToggleGridProps {
  options?: ModifierOption[];
  hiddenOptionIds?: (string | number)[];
  onToggle?: (modifierSetId: string | number, optionId: string | number, shouldHide: boolean) => void;
  onAddProductOption?: (modifierSetId: string | number) => void;
  onRemoveProductOption?: (modifierSetId: string | number, optionId: string | number) => void;
  onReorderOptions?: (modifierSetId: string | number, reorderedOptions: ModifierOption[]) => void;
  modifierSetId: string | number;
  className?: string;
  showEmptyState?: boolean;
  emptyStateMessage?: string;
}

const OptionToggleGrid: React.FC<OptionToggleGridProps> = ({ 
  options = [],
  hiddenOptionIds = [],
  onToggle,
  onAddProductOption,
  onRemoveProductOption,
  onReorderOptions,
  modifierSetId,
  className = "",
  showEmptyState = true,
  emptyStateMessage = "No options available"
}) => {
  
  const isOptionHidden = (optionId: string | number): boolean => {
    return hiddenOptionIds.includes(optionId);
  };

  const handleToggle = (optionId: string | number, shouldHide: boolean) => {
    onToggle?.(modifierSetId, optionId, shouldHide);
  };

  const handleRemoveOption = (optionId: string | number) => {
    onRemoveProductOption?.(modifierSetId, optionId);
  };

  const handleAddOption = () => {
    onAddProductOption?.(modifierSetId);
  };

  const handleReorder = (reorderedOptions: ModifierOption[]) => {
    onReorderOptions?.(modifierSetId, reorderedOptions);
  };

  const isProductSpecific = (option: ModifierOption): boolean => {
    return option.is_product_specific || option.isProductSpecific || false;
  };

  if (!options || options.length === 0) {
    return showEmptyState ? (
      <div className={`${className}`}>
        <div className="text-center text-gray-500 text-sm py-4">
          {emptyStateMessage}
        </div>
        {onAddProductOption && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddOption}
              className="w-full"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Product-Specific Option
            </Button>
          </div>
        )}
      </div>
    ) : null;
  }

  return (
    <div className={className}>
      <DraggableList
        items={options}
        onReorder={handleReorder}
        getItemId={(option) => option.id}
        tableStyle={true}
        showHeaders={false}
        renderItem={({ item: option, dragHandle }) => {
          const isHidden = isOptionHidden(option.id);
          const isProductOption = isProductSpecific(option);
          
          return (
            <div 
              className={`flex items-center gap-3 p-3 ${
                isHidden 
                  ? 'bg-gray-100 opacity-60' 
                  : isProductOption
                    ? 'bg-blue-50'
                    : 'bg-white hover:bg-gray-50'
              }`}
              onMouseDown={(e) => {
                // Prevent collapsible from closing when dragging starts
                e.stopPropagation();
              }}
            >
              {dragHandle}
              
              <div className="flex items-center gap-2 flex-1">
                <div className="flex items-center gap-1">
                  {isProductOption && (
                    <Star className="h-3 w-3 text-primary" />
                  )}
                  {isHidden ? (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-emerald-600" />
                  )}
                </div>
                <span className={`font-medium transition-colors ${
                  isHidden ? 'text-gray-500 line-through' : 'text-gray-900'
                }`}>
                  {option.name}
                </span>
                {isProductOption && (
                  <Badge variant="outline" className="text-xs bg-blue-100 text-blue-700 border-blue-300">
                    Product-Specific
                  </Badge>
                )}
                {option.price_delta !== 0 && (
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${
                      isHidden ? 'bg-gray-200 text-gray-500 border-gray-400' : ''
                    }`}
                  >
                    {option.price_delta > 0 ? '+' : ''}${option.price_delta}
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {isProductOption && onRemoveProductOption && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveOption(option.id);
                    }}
                    className="text-destructive hover:text-red-700 hover:bg-red-50 p-1 h-6 w-6"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
                <Label className={`text-sm font-medium ${
                  isHidden ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  {isHidden ? 'Hidden' : 'Visible'}
                </Label>
                <Switch
                  checked={!isHidden}
                  onCheckedChange={(checked) => {
                    handleToggle(option.id, !checked);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  size="sm"
                />
              </div>
            </div>
          );
        }}
      />
      
      {/* Add Product Option Button */}
      {onAddProductOption && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddOption}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Product-Specific Option
          </Button>
        </div>
      )}
    </div>
  );
};

export default OptionToggleGrid;