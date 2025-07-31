import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Settings,
  Copy,
  Trash2,
  ChevronDown,
  ChevronRight,
  Zap,
} from "lucide-react";
import OptionToggleGrid from "./OptionToggleGrid";

interface ModifierOption {
  id: string | number;
  name: string;
  price_delta: number;
}

interface ModifierGroup {
  id: string | number;
  modifier_set_id?: string | number;
  modifier_set?: string | number;
  name: string;
  selection_type: 'SINGLE' | 'MULTIPLE';
  min_selections: number;
  options?: ModifierOption[];
  triggered_by_option?: boolean;
}

interface ModifierGroupCardProps {
  group: ModifierGroup;
  dragHandle?: React.ReactNode;
  isExpanded?: boolean;
  onToggleExpansion?: (modifierSetId: string | number) => void;
  onRemove?: (modifierSetId: string | number) => void;
  onDuplicate?: (group: ModifierGroup) => void;
  onOptionToggle?: (modifierSetId: string | number, optionId: string | number, shouldHide: boolean) => void;
  hiddenOptionIds?: (string | number)[];
  className?: string;
}

const ModifierGroupCard: React.FC<ModifierGroupCardProps> = ({
  group,
  dragHandle,
  isExpanded = false,
  onToggleExpansion,
  onRemove,
  onDuplicate,
  onOptionToggle,
  hiddenOptionIds = [],
  className = ""
}) => {
  
  const modifierSetId = group.modifier_set_id || group.modifier_set || group.id;
  
  const getModifierTypeColor = (type: string, isRequired: boolean): string => {
    if (isRequired) return 'bg-blue-100 border-blue-300 text-blue-800';
    if (type === 'MULTIPLE') return 'bg-green-100 border-green-300 text-green-800';
    return 'bg-gray-100 border-gray-300 text-gray-800';
  };

  const getModifierTypeIcon = (type: string): string => {
    return type === 'MULTIPLE' ? '☑' : '○';
  };

  const handleToggleExpansion = () => {
    onToggleExpansion?.(modifierSetId);
  };

  const hiddenCount = hiddenOptionIds.length;

  return (
    <div className={className}>
      <div className="border rounded-lg bg-white">
        <div className="p-4">
          <div className="flex items-center gap-3">
            {dragHandle}

            <button
              onClick={handleToggleExpansion}
              className="flex items-center gap-2 flex-1 text-left hover:bg-gray-50 p-2 rounded-md transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400" />
              )}
              
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{group.name}</span>
                  <Badge 
                    variant="outline"
                    className={getModifierTypeColor(
                      group.selection_type,
                      group.min_selections > 0
                    )}
                  >
                    {getModifierTypeIcon(group.selection_type)} {' '}
                    {group.selection_type === 'MULTIPLE' ? 'Multi' : 'Single'}
                    {group.min_selections > 0 && ' • Required'}
                  </Badge>
                  {group.triggered_by_option && (
                    <Badge variant="outline" className="bg-orange-100 border-orange-300 text-orange-800">
                      <Zap className="mr-1 h-3 w-3" />
                      Conditional
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-gray-500">
                  {group.options?.length || 0} options
                  {hiddenCount > 0 && ` • ${hiddenCount} hidden`}
                </p>
              </div>
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => onDuplicate?.(group)}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onRemove?.(modifierSetId)}
                  className="text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove from Product
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {isExpanded && (
          <div className="px-4 pb-4 pt-0">
            <div className="bg-gray-50 rounded-lg p-3">
              <OptionToggleGrid
                options={group.options || []}
                hiddenOptionIds={hiddenOptionIds}
                onToggle={onOptionToggle}
                modifierSetId={modifierSetId}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModifierGroupCard;