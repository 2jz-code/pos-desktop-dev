
import React, { useState, useEffect } from 'react';
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import {
  Zap,
  ChevronRight,
  X,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/shared/components/ui/use-toast";
import * as modifierService from "@/domains/products/services/modifierService";

const ConditionalRuleBuilder = ({ 
  currentTriggerOption, 
  onTriggerChange, 
  excludeCurrentSet = null 
}) => {
  const [isConditional, setIsConditional] = useState(false);
  const [availableModifierSets, setAvailableModifierSets] = useState([]);
  const [selectedModifierSet, setSelectedModifierSet] = useState(null);
  const [availableOptions, setAvailableOptions] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isConditional) {
      fetchAvailableModifierSets();
    }
  }, [isConditional, excludeCurrentSet]);

  useEffect(() => {
    // Only update conditional state from currentTriggerOption if there's an actual trigger option
    // Don't force it to false if currentTriggerOption is null (user might want to set it to conditional)
    if (currentTriggerOption) {
      setIsConditional(true);
      setSelectedOption(currentTriggerOption);
      
      if (Array.isArray(availableModifierSets) && availableModifierSets.length > 0) {
        // Find which modifier set and option this trigger belongs to
        findTriggerDetails(currentTriggerOption);
      }
    } else if (currentTriggerOption === null && selectedOption !== null) {
      // Only clear selections if we had a trigger option before and now it's explicitly set to null
      setSelectedModifierSet(null);
      setAvailableOptions([]);
      setSelectedOption(null);
    }
  }, [currentTriggerOption, availableModifierSets]);

  const fetchAvailableModifierSets = async () => {
    try {
      setLoading(true);
      const response = await modifierService.getModifierSets();
      let modifierSets = response.data?.results || response.data || [];
      
      // Exclude the current modifier set to prevent self-referencing
      if (excludeCurrentSet) {
        modifierSets = modifierSets.filter(set => set.id !== excludeCurrentSet);
      }
      
      setAvailableModifierSets(modifierSets);
    } catch (error) {
      console.error('Error fetching modifier sets:', error);
      toast({
        title: "Error",
        description: "Failed to load modifier sets for conditional rules.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const findTriggerDetails = async (triggerOptionId) => {
    if (!triggerOptionId || !Array.isArray(availableModifierSets) || !availableModifierSets.length) return;
    
    // Find which modifier set contains this option
    for (const modifierSet of availableModifierSets) {
      const option = modifierSet.options?.find(opt => opt.id === triggerOptionId);
      if (option) {
        setSelectedModifierSet(modifierSet.id);
        setAvailableOptions(modifierSet.options || []);
        setSelectedOption(triggerOptionId);
        break;
      }
    }
  };

  const handleConditionalToggle = (enabled) => {
    setIsConditional(enabled);
    if (!enabled) {
      // Clear all selections
      setSelectedModifierSet(null);
      setAvailableOptions([]);
      setSelectedOption(null);
      onTriggerChange(null);
    }
  };

  const handleModifierSetChange = (modifierSetId) => {
    setSelectedModifierSet(modifierSetId);
    setSelectedOption(null);
    
    const modifierSet = Array.isArray(availableModifierSets) 
      ? availableModifierSets.find(set => set.id === parseInt(modifierSetId))
      : null;
    setAvailableOptions(modifierSet?.options || []);
    
    // Clear the trigger since we changed the set
    onTriggerChange(null);
  };

  const handleOptionChange = (optionId) => {
    setSelectedOption(parseInt(optionId));
    onTriggerChange(parseInt(optionId));
  };

  const clearConditionalRule = () => {
    setIsConditional(false);
    setSelectedModifierSet(null);
    setAvailableOptions([]);
    setSelectedOption(null);
    onTriggerChange(null);
  };

  const selectedModifierSetName = Array.isArray(availableModifierSets) 
    ? availableModifierSets.find(set => set.id === selectedModifierSet)?.name
    : null;
  const selectedOptionName = availableOptions.find(opt => opt.id === selectedOption)?.name;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-orange-500" />
          Conditional Rules
        </CardTitle>
        <CardDescription>
          Make this modifier set appear only when specific conditions are met
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div>
            <Label className="text-sm font-medium">Conditional Display</Label>
            <p className="text-xs text-gray-500 mt-1">
              {isConditional 
                ? "This modifier set will only show based on previous selections"
                : "This modifier set will always be visible"
              }
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Label className="text-sm">Always Show</Label>
            <Switch
              checked={isConditional}
              onCheckedChange={handleConditionalToggle}
            />
            <Label className="text-sm">Conditional</Label>
          </div>
        </div>

        {/* Conditional Rule Configuration */}
        {isConditional && (
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-4">
                <div className="animate-spin h-6 w-6 border-2 border-orange-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                <p className="text-sm text-gray-500">Loading modifier sets...</p>
              </div>
            ) : !Array.isArray(availableModifierSets) || availableModifierSets.length === 0 ? (
              <div className="text-center py-6 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertCircle className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
                <h4 className="text-sm font-medium text-yellow-800 mb-1">No Trigger Options Available</h4>
                <p className="text-xs text-yellow-700">
                  Create other modifier sets first to use as conditional triggers
                </p>
              </div>
            ) : (
              <>
                {/* Rule Builder */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Show this modifier set when:</Label>
                  
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-600">Customer selects</span>
                    
                    {/* Option Selector */}
                    <Select 
                      value={selectedOption?.toString() || ""} 
                      onValueChange={handleOptionChange}
                      disabled={!selectedModifierSet}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="option" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id.toString()}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <span className="text-gray-600">from</span>
                    
                    {/* Modifier Set Selector */}
                    <Select 
                      value={selectedModifierSet?.toString() || ""} 
                      onValueChange={handleModifierSetChange}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="modifier set" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableModifierSets.map((modifierSet) => (
                          <SelectItem key={modifierSet.id} value={modifierSet.id.toString()}>
                            {modifierSet.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Preview */}
                {selectedModifierSetName && selectedOptionName && (
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-orange-600" />
                      <span className="text-sm font-medium text-orange-800">Conditional Rule Preview</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm text-orange-700">
                      <span className="font-medium">{selectedModifierSetName}</span>
                      <ChevronRight className="h-3 w-3" />
                      <span className="font-medium">{selectedOptionName}</span>
                      <ChevronRight className="h-3 w-3" />
                      <span>triggers this modifier set</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearConditionalRule}
                      className="mt-2 text-orange-600 hover:text-orange-700 p-0 h-auto"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Remove rule
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ConditionalRuleBuilder;
