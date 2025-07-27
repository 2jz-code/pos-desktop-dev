import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Switch } from "@/shared/components/ui/switch";
import { Separator } from "@/shared/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import {
  Plus,
  GripVertical,
  Settings,
  Eye,
  EyeOff,
  Copy,
  Trash2,
  ChevronDown,
  ChevronRight,
  Library,
  Zap,
  Users,
  Loader2
} from "lucide-react";
import { useToast } from "@/shared/components/ui/use-toast";
import * as modifierService from "@/domains/products/services/modifierService";

const ModifierSectionManager = ({ productId, onModifierChange, className }) => {
  const [modifierGroups, setModifierGroups] = useState([]);
  const [availableModifierSets, setAvailableModifierSets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [pendingChanges, setPendingChanges] = useState(new Map()); // Map of modifierSetId -> Set of hidden option IDs
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const { toast } = useToast();

  // Quick create form state
  const [quickCreateForm, setQuickCreateForm] = useState({
    name: '',
    type: 'SINGLE',
    options: [{ name: '', price_delta: 0.00, isProductSpecific: false }]
  });

  useEffect(() => {
    if (productId) {
      fetchProductModifiers();
    }
  }, [productId]);

  const fetchProductModifiers = async () => {
    try {
      setLoading(true);
      
      // Get modifier groups with all options (including hidden ones with is_hidden field)
      const modifiers = await modifierService.getProductModifiers(productId);
      
      setModifierGroups(modifiers);
      // Note: Don't clear pending changes here - only clear them in save/discard functions
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

  const fetchAvailableModifierSets = async (searchTerm = '') => {
    try {
      const params = {};
      if (searchTerm) params.search = searchTerm;
      
      const response = await modifierService.getModifierSets(params);
      setAvailableModifierSets(response.data || []);
    } catch (error) {
      console.error('Error fetching modifier sets:', error);
      toast({
        title: "Error",
        description: "Failed to load modifier library.",
        variant: "destructive",
      });
    }
  };

  const handleDragEnd = async (result) => {
    if (!result.destination || !productId) return;

    const items = Array.from(modifierGroups);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setModifierGroups(items);

    try {
      const ordering = items.map((item, index) => ({
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
      setModifierGroups(modifierGroups); // Revert on error
      toast({
        title: "Error",
        description: "Failed to update modifier order.",
        variant: "destructive",
      });
    }
  };

  const handleAddFromLibrary = () => {
    fetchAvailableModifierSets();
    setIsLibraryOpen(true);
  };

  const handleAddModifierSet = async (modifierSetId) => {
    try {
      await modifierService.addModifierSetToProduct(productId, modifierSetId);
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

  const handleQuickCreate = async () => {
    try {
      const templateData = {
        name: quickCreateForm.name,
        type: quickCreateForm.type,
        options: quickCreateForm.options.filter(opt => opt.name.trim())
      };

      // Check if any options are product-specific
      const hasProductSpecificOptions = templateData.options.some(opt => opt.isProductSpecific);
      
      if (hasProductSpecificOptions) {
        // Use the new function that handles product-specific options
        await modifierService.createModifierFromTemplateWithProductSpecific(templateData, productId);
      } else {
        // Use the original function for regular options
        const createdModifierSet = await modifierService.createModifierFromTemplate(templateData);
        await modifierService.addModifierSetToProduct(productId, createdModifierSet.id);
      }
      
      await fetchProductModifiers();
      onModifierChange?.();
      
      toast({
        title: "Success",
        description: "Modifier group created and added to product.",
      });
      
      setIsQuickCreateOpen(false);
      setQuickCreateForm({ name: '', type: 'SINGLE', options: [{ name: '', price_delta: 0.00, isProductSpecific: false }] });
    } catch (error) {
      console.error('Error creating modifier from template:', error);
      toast({
        title: "Error",
        description: "Failed to create modifier group.",
        variant: "destructive",
      });
    }
  };


  const isOptionHidden = (modifierSetId, optionId) => {
    const modifierGroup = modifierGroups.find(g => 
      (g.modifier_set_id || g.modifier_set || g.id) === modifierSetId
    );
    
    // If there are pending changes for this modifier set, use those
    const pendingHiddenIds = pendingChanges.get(modifierSetId);
    if (pendingHiddenIds) {
      return pendingHiddenIds.has(optionId);
    }
    
    // Otherwise, use the is_hidden field from the backend
    const option = modifierGroup?.options?.find(opt => opt.id === optionId);
    const isHidden = option?.is_hidden || false;
    return isHidden;
  };

  const handleOptionToggle = (modifierSetId, optionId, shouldHide) => {
    const modifierGroup = modifierGroups.find(g => 
      (g.modifier_set_id || g.modifier_set || g.id) === modifierSetId
    );
    
    // Get current hidden IDs from the options' is_hidden field
    const currentHiddenIds = modifierGroup?.options
      ?.filter(opt => opt.is_hidden)
      ?.map(opt => opt.id) || [];
    
    const pendingHiddenIds = pendingChanges.get(modifierSetId) || new Set(currentHiddenIds);
    
    const newPendingHiddenIds = new Set(pendingHiddenIds);
    if (shouldHide) {
      newPendingHiddenIds.add(optionId);
    } else {
      newPendingHiddenIds.delete(optionId);
    }
    
    // Update pending changes
    const newPendingChanges = new Map(pendingChanges);
    newPendingChanges.set(modifierSetId, newPendingHiddenIds);
    setPendingChanges(newPendingChanges);
    setHasUnsavedChanges(true);
  };

  const handleSaveChanges = async () => {
    try {
      setLoading(true);
      
      
      // Apply all pending changes
      const savePromises = [];
      for (const [modifierSetId, hiddenIds] of pendingChanges) {
        const hiddenIdsArray = Array.from(hiddenIds);
        savePromises.push(
          modifierService.updateHiddenOptions(productId, modifierSetId, hiddenIdsArray)
        );
      }
      
      await Promise.all(savePromises);
      
      // Clear pending changes BEFORE refetching to avoid race conditions
      setPendingChanges(new Map());
      setHasUnsavedChanges(false);
      
      // Refetch the updated data
      await fetchProductModifiers();
      onModifierChange?.();
      
      toast({
        title: "Success",
        description: "Modifier visibility changes saved successfully.",
      });
    } catch (error) {
      console.error('Error saving visibility changes:', error);
      toast({
        title: "Error",
        description: "Failed to save visibility changes.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDiscardChanges = () => {
    setPendingChanges(new Map());
    setHasUnsavedChanges(false);
    toast({
      title: "Changes Discarded",
      description: "All unsaved visibility changes have been reverted.",
    });
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

  const getModifierTypeColor = (type, isRequired) => {
    if (isRequired) return 'bg-blue-100 border-blue-300 text-blue-800';
    if (type === 'MULTIPLE') return 'bg-green-100 border-green-300 text-green-800';
    return 'bg-gray-100 border-gray-300 text-gray-800';
  };

  const getModifierTypeIcon = (type) => {
    return type === 'MULTIPLE' ? '☑' : '○';
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
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="modifier-groups">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-3"
                >
                  {modifierGroups.map((group, index) => {
                    // Handle different possible field names for the modifier set ID
                    const modifierSetId = group.modifier_set_id || group.modifier_set || group.id;
                    
                    if (!modifierSetId) {
                      console.warn('Modifier group missing ID:', group);
                      return null;
                    }
                    
                    return (
                      <Draggable
                        key={modifierSetId}
                        draggableId={modifierSetId.toString()}
                        index={index}
                      >
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`border rounded-lg bg-white transition-shadow ${
                            snapshot.isDragging ? 'shadow-lg border-blue-300' : 'shadow-sm hover:shadow-md'
                          }`}
                        >
                          <Collapsible>
                            <div className="p-4">
                              <div className="flex items-center gap-3">
                                <div
                                  {...provided.dragHandleProps}
                                  className="cursor-grab hover:bg-gray-100 p-1 rounded"
                                >
                                  <GripVertical className="h-4 w-4 text-gray-400" />
                                </div>

                                <CollapsibleTrigger
                                  onClick={() => toggleGroupExpansion(modifierSetId)}
                                  className="flex items-center gap-2 flex-1 text-left"
                                >
                                  {expandedGroups.has(modifierSetId) ? (
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
                                      {group.options?.filter(opt => opt.is_hidden).length > 0 && 
                                        ` • ${group.options.filter(opt => opt.is_hidden).length} hidden`
                                      }
                                    </p>
                                  </div>
                                </CollapsibleTrigger>

                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                      <Settings className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => {/* Handle duplicate */}}
                                    >
                                      <Copy className="mr-2 h-4 w-4" />
                                      Duplicate
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleRemoveModifierSet(modifierSetId)}
                                      className="text-red-600"
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Remove from Product
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>

                            <CollapsibleContent>
                              <div className="px-4 pb-4 pt-0">
                                <div className="bg-gray-50 rounded-lg p-3">
                                  <div className="space-y-2">
                                    {group.options?.map((option) => {
                                      const isHidden = isOptionHidden(modifierSetId, option.id);
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
                                                handleOptionToggle(modifierSetId, option.id, !checked);
                                              }}
                                              size="sm"
                                            />
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {(!group.options || group.options.length === 0) && (
                                      <div className="text-center text-gray-500 text-sm py-4">
                                        No options available
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        </div>
                      )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
        
        {/* Save Button */}
        {hasUnsavedChanges && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-blue-700 font-medium">
                  You have unsaved visibility changes
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDiscardChanges}
                  disabled={loading}
                >
                  Discard Changes
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveChanges}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Library Dialog */}
      <Dialog open={isLibraryOpen} onOpenChange={setIsLibraryOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier Library</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Search modifier sets..."
              onChange={(e) => fetchAvailableModifierSets(e.target.value)}
            />
            <div className="grid gap-2 max-h-96 overflow-y-auto">
              {availableModifierSets.map((set) => (
                <div
                  key={set.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                >
                  <div>
                    <h4 className="font-medium">{set.name}</h4>
                    <p className="text-sm text-gray-500">
                      {set.selection_type} • {set.options?.length || 0} options
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleAddModifierSet(set.id)}
                    disabled={modifierGroups.some(g => (g.modifier_set_id || g.modifier_set || g.id) === set.id)}
                  >
                    {modifierGroups.some(g => (g.modifier_set_id || g.modifier_set || g.id) === set.id) ? 'Added' : 'Add'}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Create Dialog */}
      <Dialog open={isQuickCreateOpen} onOpenChange={setIsQuickCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Create Modifier Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Group Name</Label>
              <Input
                id="name"
                value={quickCreateForm.name}
                onChange={(e) => setQuickCreateForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Size Options"
              />
            </div>
            <div>
              <Label htmlFor="type">Selection Type</Label>
              <Select
                value={quickCreateForm.type}
                onValueChange={(value) => setQuickCreateForm(prev => ({ ...prev, type: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SINGLE">Single Choice (○)</SelectItem>
                  <SelectItem value="MULTIPLE">Multiple Choice (☑)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Options</Label>
              {quickCreateForm.options.map((option, index) => (
                <div key={index} className="space-y-2 mt-3 p-3 border rounded-lg bg-gray-50">
                  <div className="flex gap-2">
                    <Input
                      value={option.name}
                      onChange={(e) => {
                        const newOptions = [...quickCreateForm.options];
                        newOptions[index] = { ...newOptions[index], name: e.target.value };
                        setQuickCreateForm(prev => ({ ...prev, options: newOptions }));
                      }}
                      placeholder={`Option ${index + 1}`}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      value={option.price_delta}
                      onChange={(e) => {
                        const newOptions = [...quickCreateForm.options];
                        newOptions[index] = { ...newOptions[index], price_delta: parseFloat(e.target.value) || 0.00 };
                        setQuickCreateForm(prev => ({ ...prev, options: newOptions }));
                      }}
                      placeholder="$0.00"
                      className="w-24"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newOptions = quickCreateForm.options.filter((_, i) => i !== index);
                        setQuickCreateForm(prev => ({ ...prev, options: newOptions }));
                      }}
                      disabled={quickCreateForm.options.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id={`option-${index}-product-specific`}
                      checked={option.isProductSpecific}
                      onCheckedChange={(checked) => {
                        const newOptions = [...quickCreateForm.options];
                        newOptions[index] = { ...newOptions[index], isProductSpecific: checked };
                        setQuickCreateForm(prev => ({ ...prev, options: newOptions }));
                      }}
                    />
                    <Label htmlFor={`option-${index}-product-specific`} className="text-sm">
                      Product-specific option
                    </Label>
                    <div className="text-xs text-gray-500">
                      {option.isProductSpecific 
                        ? "Only for this product" 
                        : "Available for all products"
                      }
                    </div>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setQuickCreateForm(prev => ({ ...prev, options: [...prev.options, { name: '', price_delta: 0.00, isProductSpecific: false }] }));
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Option
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsQuickCreateOpen(false)}>
              Cancel
            </Button>
            <Button 
              type="button"
              onClick={handleQuickCreate}
              disabled={!quickCreateForm.name || quickCreateForm.options.filter(o => o.name.trim()).length === 0}
            >
              Create & Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default ModifierSectionManager;