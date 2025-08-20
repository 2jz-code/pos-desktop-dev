import React, { useState, useEffect } from 'react';
import { Button } from "@/shared/components/ui/button";
import {
  Plus,
  Library,
} from "lucide-react";
import { useToast } from "@/shared/components/ui/use-toast";
import * as modifierService from "@/domains/products/services/modifierService";
import DraggableList from "@/shared/components/ui/draggable-list";
import ModifierQuickCreate from "./ModifierQuickCreate";
import ModifierLibraryDrawer from "./ModifierLibraryDrawer";
import ModifierGroupCard from "./ModifierGroupCard";
import ProductSpecificOptionForm from "./ProductSpecificOptionForm";
import { usePosStore } from "@/domains/pos/store/posStore";

const ModifierSectionManager = ({ productId, onModifierChange, className }) => {
  const [modifierGroups, setModifierGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [isProductOptionFormOpen, setIsProductOptionFormOpen] = useState(false);
  const [selectedModifierSetId, setSelectedModifierSetId] = useState(null);
  const [selectedModifierSetName, setSelectedModifierSetName] = useState('');
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [optimisticHiddenOptions, setOptimisticHiddenOptions] = useState(new Map()); // Map of modifierSetId -> Set of hidden option IDs
  const { toast } = useToast();
  
  // Get POS store function to refresh products
  const fetchProducts = usePosStore(state => state.fetchProducts);

  useEffect(() => {
    if (productId) {
      fetchProductModifiers();
    }
  }, [productId]);

  const fetchProductModifiers = async () => {
    try {
      setLoading(true);
      
      // Get modifier groups with all options (including hidden ones with is_hidden field)
      // Use includeAll=true to get all associated modifier sets, including conditional ones
      console.log(`Fetching modifiers for product ${productId}`);
      const modifiers = await modifierService.getProductModifiers(productId, true);
      console.log('Fetched modifiers:', modifiers);
      
      setModifierGroups(modifiers);
      
      // Initialize optimistic hidden options from the server data
      const hiddenOptionsMap = new Map();
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


  const handleReorder = async (reorderedItems, sourceIndex, destinationIndex) => {
    if (!productId) return;

    setModifierGroups(reorderedItems);

    try {
      const ordering = reorderedItems.map((item, index) => ({
        modifier_set_id: item.modifier_set_id || item.modifier_set || item.id,
        display_order: index
      }));
      
      await modifierService.updateModifierOrdering(productId, ordering);
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

  const handleLibraryModifierSelected = async (modifierSet) => {
    try {
      console.log(`Adding modifier set ${modifierSet.id} to product ${productId}`);
      const result = await modifierService.addModifierSetToProduct(productId, modifierSet.id);
      console.log('Add modifier result:', result);
      
      console.log('Refreshing product modifiers...');
      await fetchProductModifiers();
      console.log('Product modifiers refreshed');
      
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

  const handleRemoveModifierSet = async (modifierSetId) => {
    try {
      await modifierService.removeModifierSetFromProduct(productId, modifierSetId);
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

  const handleAddProductSpecificOption = (modifierSetId) => {
    // Find the modifier group to get its name and existing options
    const group = modifierGroups.find(g => 
      (g.modifier_set_id || g.modifier_set || g.id) === modifierSetId
    );
    
    setSelectedModifierSetId(modifierSetId);
    setSelectedModifierSetName(group?.name || '');
    setIsProductOptionFormOpen(true);
  };

  // Get existing option names for the selected modifier set
  const getExistingOptionNames = () => {
    if (!selectedModifierSetId) return [];
    
    const group = modifierGroups.find(g => 
      (g.modifier_set_id || g.modifier_set || g.id) === selectedModifierSetId
    );
    
    return group?.options?.map(option => option.name) || [];
  };

  const handleProductOptionFormSubmit = async (optionData) => {
    if (!selectedModifierSetId || !productId) return;

    try {
      await modifierService.addProductSpecificOption(productId, selectedModifierSetId, optionData);
      await fetchProductModifiers();
      onModifierChange?.();
      
      // Refresh POS products to include the new product-specific option
      if (fetchProducts) {
        console.log('Refreshing POS products after adding product-specific option');
        await fetchProducts();
      }
      
      toast({
        title: "Success",
        description: `Product-specific option "${optionData.name}" added successfully.`,
      });
    } catch (error) {
      console.error('Error adding product-specific option:', error);
      toast({
        title: "Error", 
        description: "Failed to add product-specific option.",
        variant: "destructive",
      });
      throw error; // Re-throw to let the form handle it
    }
  };

  const handleRemoveProductSpecificOption = async (modifierSetId, optionId) => {
    if (!productId) return;

    try {
      await modifierService.removeProductSpecificOption(productId, modifierSetId, optionId);
      await fetchProductModifiers();
      onModifierChange?.();
      
      // Refresh POS products to remove the deleted product-specific option
      if (fetchProducts) {
        console.log('Refreshing POS products after removing product-specific option');
        await fetchProducts();
      }
      
      toast({
        title: "Success",
        description: "Product-specific option removed successfully.",
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

  const handleReorderOptions = async (modifierSetId, reorderedOptions) => {
    if (!productId) return;

    try {
      // Update the local state immediately for smooth UX
      setModifierGroups(prevGroups => 
        prevGroups.map(group => {
          const groupModifierSetId = group.modifier_set_id || group.modifier_set || group.id;
          if (groupModifierSetId === modifierSetId) {
            return {
              ...group,
              options: reorderedOptions
            };
          }
          return group;
        })
      );

      // Create ordering array with new display_order values
      const ordering = reorderedOptions.map((option, index) => ({
        option_id: option.id,
        display_order: index
      }));
      
      // Call API to update option ordering in the background
      await modifierService.updateOptionOrdering(productId, modifierSetId, ordering);
      
      // Don't refresh data - we already updated the local state
      // This prevents the dropdown from closing
      onModifierChange?.();
      
      toast({
        title: "Success",
        description: "Option order updated successfully.",
      });
    } catch (error) {
      console.error('Error updating option order:', error);
      
      // Revert the optimistic update on error
      await fetchProductModifiers();
      
      toast({
        title: "Error",
        description: "Failed to update option order.",
        variant: "destructive",
      });
    }
  };



  const handleOptionToggle = async (modifierSetId, optionId, shouldHide) => {
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
      const hiddenIdsArray = Array.from(newHiddenIds);
      await modifierService.updateHiddenOptions(productId, modifierSetId, hiddenIdsArray);
      
      // Optionally call onModifierChange to notify parent component
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



  const toggleGroupExpansion = (groupId) => {
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
                    onAddProductOption={handleAddProductSpecificOption}
                    onRemoveProductOption={handleRemoveProductSpecificOption}
                    onReorderOptions={handleReorderOptions}
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
        open={isProductOptionFormOpen}
        onOpenChange={setIsProductOptionFormOpen}
        onSuccess={handleProductOptionFormSubmit}
        modifierSetName={selectedModifierSetName}
        existingOptionNames={getExistingOptionNames()}
      />

    </div>
  );
};

export default ModifierSectionManager;