
import React from 'react';
import { Badge } from "@/shared/components/ui/badge";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import {
  Eye,
  EyeOff,
} from "lucide-react";

const OptionToggleGrid = ({ 
  options = [],
  hiddenOptionIds = [],
  onToggle,
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

  if (!options || options.length === 0) {
    return showEmptyState ? (
      <div className={`text-center text-gray-500 text-sm py-4 ${className}`}>
        {emptyStateMessage}
      </div>
    ) : null;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {options.map((option) => {
        const isHidden = isOptionHidden(option.id);
        return (
          <div
            key={option.id}
            className={`flex items-center justify-between p-3 rounded-lg border transition-all duration-200 ${
              isHidden 
                ? 'bg-gray-100 border-gray-300 opacity-60' 
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2 flex-1">
              <div className="flex items-center gap-1">
                {isHidden ? (
                  <EyeOff className="h-4 w-4 text-gray-400" />
                ) : (
                  <Eye className="h-4 w-4 text-green-500" />
                )}
              </div>
              <span className={`font-medium transition-colors ${
                isHidden ? 'text-gray-500 line-through' : 'text-gray-900'
              }`}>
                {option.name}
              </span>
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
                size="sm"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default OptionToggleGrid;
