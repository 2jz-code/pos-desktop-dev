import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Plus,
  Library,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import * as modifierService from "@/services/api/modifierService";
import DraggableList from "@/components/ui/draggable-list";
import ModifierQuickCreate from "./ModifierQuickCreate";
import ModifierLibraryDrawer from "./ModifierLibraryDrawer";
import ModifierGroupCard from "./ModifierGroupCard";
import ProductSpecificOptionForm from "./ProductSpecificOptionForm";

interface ModifierOption {
  id: string | number;
  name: string;
  price_delta: number;
  is_hidden?: boolean;
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

interface ModifierSectionManagerProps {
  productId: string | number | null;
  onModifierChange?: () => void;
  className?: string;
}

const ModifierSectionManager: React.FC<ModifierSectionManagerProps> = ({ 
  productId, 
  onModifierChange, 
  className 
}) => {
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string | number>>(new Set());
  const [optimisticHiddenOptions, setOptimisticHiddenOptions] = useState<Map<string | number, Set<string | number>>>(new Map());
  const [productOptionForm, setProductOptionForm] = useState<{
    open: boolean;
    modifierSetId: string | number | null;
    modifierSetName: string;
    existingOptionNames: string[];
  }>({
    open: false,
    modifierSetId: null,
    modifierSetName: '',
    existingOptionNames: []
  });
  const { toast } = useToast();

  useEffect(() => {
    if (productId) {
      fetchProductModifiers();
    }
  }, [productId]);

  const fetchProductModifiers = async () => {
    try {
      setLoading(true);
      
      const modifiers = await modifierService.getProductModifiers(Number(productId), true);
      setModifierGroups(modifiers);
      
      // Initialize optimistic hidden options from the server data
      const hiddenOptionsMap = new Map<string | number, Set<string | number>>();
      modifiers.forEach(group => {
        const modifierSetId = group.modifier_set_id || group.modifier_set || group.id;
        const hiddenIds = group.options?.filter(opt => opt.is_hidden)?.map(opt => opt.id) || [];
        hiddenOptionsMap.set(modifierSetId, new Set(hiddenIds));
      });
      setOptimisticHiddenOptions(hiddenOptionsMap);
    } catch (error) {
      console.error('Error fetching product modifiers:', error);
      toast({
        title: "Error",
        description: "Failed to load modifier groups.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReorder = async (reorderedItems: any[], sourceIndex: number, destinationIndex: number) => {
    if (!productId) return;

    setModifierGroups(reorderedItems as ModifierGroup[]);

    try {
      const ordering = reorderedItems.map((item, index) => ({
        modifier_set_id: Number(item.modifier_set_id || item.modifier_set || item.id),
        display_order: index
      }));
      await modifierService.updateModifierOrdering(Number(productId), ordering);
      
      onModifierChange?.();
      
      toast({
        title: "Success",
        description: "Modifier order updated.",
      });
    } catch (error) {
      console.error('Error updating modifier order:', error);
      // Revert to original order on error
      fetchProductModifiers();
      toast({
        title: "Error",
        description: "Failed to update modifier order.",
        variant: "destructive",
      });
    }
  };

  const handleAddFromLibrary = () => {
    setIsLibraryOpen(true);
  };

  const handleLibraryModifierSelected = async (modifierSet: any) => {
    try {
      await modifierService.addModifierSetToProduct(Number(productId), modifierSet.id);
      
      await fetchProductModifiers();
      onModifierChange?.();
      
      toast({
        title: "Success",
        description: "Modifier group added to product.",
      });
      
      setIsLibraryOpen(false);
    } catch (error) {
      console.error('Error adding modifier set:', error);
      toast({
        title: "Error",
        description: "Failed to add modifier group.",
        variant: "destructive",
      });
    }
  };

  const handleRemoveModifierSet = async (modifierSetId: string | number) => {
    try {
      await modifierService.removeModifierSetFromProduct(Number(productId), Number(modifierSetId));
      
      await fetchProductModifiers();
      onModifierChange?.();
      
      toast({
        title: "Success",
        description: "Modifier group removed from product.",
      });
    } catch (error) {
      console.error('Error removing modifier set:', error);
      toast({
        title: "Error",
        description: "Failed to remove modifier group.",
        variant: "destructive",
      });
    }
  };

  const handleQuickCreateSuccess = async () => {
    await fetchProductModifiers();
    onModifierChange?.();
  };

  const handleOptionToggle = async (modifierSetId: string | number, optionId: string | number, shouldHide: boolean) => {
    // Optimistically update the UI immediately
    const currentHiddenIds = optimisticHiddenOptions.get(modifierSetId) || new Set();
    const newHiddenIds = new Set(currentHiddenIds);
    
    if (shouldHide) {
      newHiddenIds.add(optionId);
    } else {
      newHiddenIds.delete(optionId);
    }
    
    // Update optimistic state immediately for instant UI response
    const newOptimisticHiddenOptions = new Map(optimisticHiddenOptions);
    newOptimisticHiddenOptions.set(modifierSetId, newHiddenIds);
    setOptimisticHiddenOptions(newOptimisticHiddenOptions);
    
    // Update server in the background
    try {
      const hiddenIdsArray = Array.from(newHiddenIds).map(id => Number(id));
      await modifierService.updateHiddenOptions(Number(productId), Number(modifierSetId), hiddenIdsArray);
      
      onModifierChange?.();
    } catch (error) {
      console.error('Error updating option visibility:', error);
      
      // Revert optimistic update on error
      setOptimisticHiddenOptions(optimisticHiddenOptions);
      
      toast({
        title: "Error",
        description: "Failed to update option visibility.",
        variant: "destructive",
      });
    }
  };

  const handleReorderOptions = async (modifierSetId: string | number, reorderedOptions: ModifierOption[]) => {
    // Optimistically update the UI
    setModifierGroups(prevGroups => 
      prevGroups.map(group => {
        const groupModifierSetId = group.modifier_set_id || group.modifier_set || group.id;
        if (groupModifierSetId === modifierSetId) {
          return { ...group, options: reorderedOptions };
        }
        return group;
      })
    );

    try {
      const ordering = reorderedOptions.map((option, index) => ({
        option_id: Number(option.id),
        display_order: index
      }));
      
      await modifierService.updateOptionOrdering(Number(productId), Number(modifierSetId), ordering);
      
      onModifierChange?.();
    } catch (error) {
      console.error('Error updating option order:', error);
      // Revert on error
      fetchProductModifiers();
      toast({
        title: "Error",
        description: "Failed to update option order.",
        variant: "destructive",
      });
    }
  };

  const handleAddProductOption = async (modifierSetId: string | number) => {
    // Find the modifier group to get its name and existing options
    const group = modifierGroups.find(g => {
      const groupModifierSetId = g.modifier_set_id || g.modifier_set || g.id;
      return groupModifierSetId === modifierSetId;
    });

    if (!group) {
      toast({
        title: "Error",
        description: "Modifier group not found.",
        variant: "destructive",
      });
      return;
    }

    const existingOptionNames = group.options?.map(opt => opt.name) || [];

    setProductOptionForm({
      open: true,
      modifierSetId,
      modifierSetName: group.name,
      existingOptionNames
    });
  };

  const handleRemoveProductOption = async (modifierSetId: string | number, optionId: string | number) => {
    try {
      await modifierService.removeProductSpecificOption(Number(productId), Number(modifierSetId), Number(optionId));
      
      // Refresh the data
      await fetchProductModifiers();
      onModifierChange?.();
      
      toast({
        title: "Success",
        description: "Product-specific option removed.",
      });
    } catch (error) {
      console.error('Error removing product-specific option:', error);
      toast({
        title: "Error",
        description: "Failed to remove product-specific option.",
        variant: "destructive",
      });
    }
  };

  const handleProductOptionSuccess = async (optionData: { name: string; price_delta: number }) => {
    if (!productOptionForm.modifierSetId) return;

    try {
      await modifierService.addProductSpecificOption(
        Number(productId),
        Number(productOptionForm.modifierSetId),
        {
          name: optionData.name,
          price_delta: optionData.price_delta,
          display_order: productOptionForm.existingOptionNames.length
        }
      );

      // Refresh the data
      await fetchProductModifiers();
      onModifierChange?.();

    } catch (error) {
      console.error('Error adding product-specific option:', error);
      throw error; // Re-throw so the form can handle the error
    }
  };

  const toggleGroupExpansion = (groupId: string | number) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  if (!productId) {
    return (
      <div className={`p-4 bg-gray-50 rounded-lg ${className}`}>
        <p className="text-sm text-gray-500">
          Save the product first to manage modifiers.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-6">
        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button 
            type="button"
            variant="outline" 
            size="sm"
            onClick={handleAddFromLibrary}
            className="flex-1"
          >
            <Library className="mr-2 h-4 w-4" />
            Add from Library
          </Button>
          <Button 
            type="button"
            variant="default" 
            size="sm"
            onClick={() => setIsQuickCreateOpen(true)}
            className="flex-1"
          >
            <Plus className="mr-2 h-4 w-4" />
            Quick Create
          </Button>
        </div>

        {/* Modifier Groups List */}
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
            <p className="text-sm text-gray-500">Loading modifier groups...</p>
          </div>
        ) : modifierGroups.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <div className="mx-auto w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mb-4">
              <Plus className="h-6 w-6 text-gray-400" />
            </div>
            <h4 className="text-lg font-medium text-gray-900 mb-2">No modifier groups yet</h4>
            <p className="text-gray-500 mb-6 max-w-sm mx-auto">
              Add modifier groups to give customers options like size, extras, or cooking preferences.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-2">
              <Button 
                type="button"
                variant="outline" 
                size="sm"
                onClick={handleAddFromLibrary}
              >
                <Library className="mr-2 h-4 w-4" />
                Browse Library
              </Button>
              <Button 
                type="button"
                size="sm"
                onClick={() => setIsQuickCreateOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create New
              </Button>
            </div>
          </div>
        ) : (
          <DraggableList
            items={modifierGroups}
            onReorder={handleReorder}
            getItemId={(item) => item.modifier_set_id || item.modifier_set || item.id}
            tableStyle={true}
            showHeaders={true}
            headers={[
              { label: "Modifier Group", className: "flex-1" },
              { label: "Required", className: "w-20 text-center" },
              { label: "Actions", className: "w-24 text-center" }
            ]}
            emptyStateMessage="No modifier groups yet"
            renderItem={({ item: group, dragHandle }) => {
              const modifierSetId = group.modifier_set_id || group.modifier_set || group.id;
              
              if (!modifierSetId) {
                console.warn('Modifier group missing ID:', group);
                return null;
              }
              
              return (
                <div className="flex items-center gap-3 p-3">
                  {dragHandle}
                  <ModifierGroupCard
                    group={group}
                    dragHandle={null} // We're using the table drag handle
                    isExpanded={expandedGroups.has(modifierSetId)}
                    onToggleExpansion={toggleGroupExpansion}
                    onRemove={handleRemoveModifierSet}
                    onDuplicate={() => {/* Handle duplicate */}}
                    onOptionToggle={handleOptionToggle}
                    onReorderOptions={handleReorderOptions}
                    onAddProductOption={handleAddProductOption}
                    onRemoveProductOption={handleRemoveProductOption}
                    hiddenOptionIds={Array.from(optimisticHiddenOptions.get(modifierSetId) || [])}
                    className="flex-1 border-0 shadow-none bg-transparent"
                  />
                </div>
              );
            }}
          />
        )}
      </div>

      {/* Library Dialog */}
      <ModifierLibraryDrawer
        open={isLibraryOpen}
        onOpenChange={setIsLibraryOpen}
        onModifierSetSelected={handleLibraryModifierSelected}
        excludeModifierSetIds={modifierGroups.map(g => g.modifier_set_id || g.modifier_set || g.id)}
      />

      {/* Quick Create Dialog */}
      <ModifierQuickCreate
        open={isQuickCreateOpen}
        onOpenChange={setIsQuickCreateOpen}
        onSuccess={handleQuickCreateSuccess}
        productId={productId}
        autoAddToProduct={true}
      />

      {/* Product Specific Option Form */}
      <ProductSpecificOptionForm
        open={productOptionForm.open}
        onOpenChange={(open) => setProductOptionForm(prev => ({ ...prev, open }))}
        onSuccess={handleProductOptionSuccess}
        modifierSetName={productOptionForm.modifierSetName}
        existingOptionNames={productOptionForm.existingOptionNames}
      />
    </div>
  );
};

export default ModifierSectionManager;