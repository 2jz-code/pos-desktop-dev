
import React from 'react';
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import DraggableList from "@/shared/components/ui/draggable-list";
import {
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Star,
} from "lucide-react";

const OptionToggleGrid = ({ 
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
  
  const isOptionHidden = (optionId) => {
    return hiddenOptionIds.includes(optionId);
  };

  const handleToggle = (optionId, shouldHide) => {
    onToggle?.(modifierSetId, optionId, shouldHide);
  };

  const handleRemoveOption = (optionId) => {
    onRemoveProductOption?.(modifierSetId, optionId);
  };

  const handleAddOption = () => {
    onAddProductOption?.(modifierSetId);
  };

  const handleReorder = (reorderedOptions) => {
    onReorderOptions?.(modifierSetId, reorderedOptions);
  };

  const isProductSpecific = (option) => {
    return option.is_product_specific || option.isProductSpecific;
  };

  if (!options || options.length === 0) {
    return showEmptyState ? (
      <div className={`${className}`}>
        <div className="text-center text-muted-foreground text-sm py-4">
          {emptyStateMessage}
        </div>
        {onAddProductOption && (
          <div className="mt-3 pt-3 border-t border-border">
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
                  ? 'bg-muted opacity-60' 
                  : isProductOption
                    ? 'bg-blue-50'
                    : 'bg-background hover:bg-muted/40'
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
                    <Star className="h-3 w-3 text-blue-500" />
                  )}
                  {isHidden ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-green-500" />
                  )}
                </div>
                <span className={`font-medium transition-colors ${
                  isHidden ? 'text-muted-foreground line-through' : 'text-foreground'
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
                      isHidden ? 'bg-muted text-muted-foreground border-border' : ''
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
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 p-1 h-6 w-6"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
                <Label className={`text-sm font-medium ${
                  isHidden ? 'text-muted-foreground' : 'text-muted-foreground'
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
        <div className="mt-3 pt-3 border-t border-border">
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
