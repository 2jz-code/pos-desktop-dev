import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/components/ui/collapsible";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Plus, Minus, ShoppingCart, ChevronDown, ChevronRight, Check, AlertCircle } from "lucide-react";
import { useToast } from "@/shared/components/ui/use-toast";

const ProductModifierSelectorContent = ({ 
  product, 
  open, 
  onOpenChange, 
  onAddToCart,
  initialQuantity = 1,
  editMode = false,
  existingSelections = []
}) => {
  const [quantity, setQuantity] = useState(initialQuantity);
  const [notes, setNotes] = useState("");
  const [selectedModifiers, setSelectedModifiers] = useState({});
  const [totalPrice, setTotalPrice] = useState(0);
  const [openSections, setOpenSections] = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  const { toast } = useToast();

  // Check if any modifiers are selected
  const hasModifiersSelected = useMemo(() => {
    return Object.values(selectedModifiers).some(selections => 
      selections && selections.length > 0
    );
  }, [selectedModifiers]);

  // Get modifier sets for this product (they should already be in the correct order)
  const modifierSets = product?.modifier_groups || [];

  // Helper function to find option in modifier sets
  const findOptionInSets = (optionId) => {
    for (const modifierSet of modifierSets) {
      if (!modifierSet || !modifierSet.options) continue;
      const option = modifierSet.options.find(opt => opt && opt.id === optionId);
      if (option) return option;
    }
    return null;
  };

  // Initialize existing selections for edit mode
  useEffect(() => {
    if (editMode && existingSelections?.length > 0) {
      const initialSelections = {};
      
      // Group existing selections by modifier set
      existingSelections.forEach(selection => {
        // Find which modifier set this option belongs to
        for (const modifierSet of modifierSets) {
          const option = modifierSet.options?.find(opt => opt.name === selection.option_name);
          if (option) {
            if (!initialSelections[modifierSet.id]) {
              initialSelections[modifierSet.id] = [];
            }
            initialSelections[modifierSet.id].push({
              option_id: option.id,
              quantity: selection.quantity || 1
            });
            break;
          }
        }
      });
      
      setSelectedModifiers(initialSelections);
    }
  }, [editMode, existingSelections, modifierSets]);

  // Only process modifier sets when dialog is open
  const visibleModifierSets = useMemo(() => {
    if (!open || !modifierSets.length) return [];
    
    // Build a map of which sets are triggered by which options
    const triggerMap = new Map(); // optionId -> triggeredSets[]
    const allTriggeredSetIds = new Set();
    
    modifierSets.forEach(modifierSet => {
      if (modifierSet.options) {
        modifierSet.options.forEach(option => {
          if (option.triggered_sets && option.triggered_sets.length > 0) {
            triggerMap.set(option.id, option.triggered_sets);
            option.triggered_sets.forEach(triggeredSet => {
              allTriggeredSetIds.add(triggeredSet.id);
            });
          }
        });
      }
    });
    
    // Build the visible list in order
    const visibleSets = [];
    const addedSetIds = new Set();
    
    // Process modifier sets in their original order
    modifierSets.forEach(modifierSet => {
      // Skip if already added (might have been added as a triggered set)
      if (addedSetIds.has(modifierSet.id)) return;
      
      // Add base sets (not conditional/triggered sets)
      if (!allTriggeredSetIds.has(modifierSet.id)) {
        visibleSets.push(modifierSet);
        addedSetIds.add(modifierSet.id);
        
        // After adding a base set, check if any of its selected options trigger conditional sets
        const selections = selectedModifiers[modifierSet.id] || [];
        selections.forEach(selection => {
          const triggeredSets = triggerMap.get(selection.option_id);
          if (triggeredSets) {
            triggeredSets.forEach(triggeredSet => {
              if (!addedSetIds.has(triggeredSet.id)) {
                visibleSets.push(triggeredSet);
                addedSetIds.add(triggeredSet.id);
              }
            });
          }
        });
      }
    });
    
    // Safety check: ensure we have at least one visible set
    if (visibleSets.length === 0 && modifierSets.length > 0) {
      console.warn('No visible modifier sets found, showing first set as fallback:', modifierSets[0]);
      visibleSets.push(modifierSets[0]);
    }
    
    return visibleSets;
  }, [open, modifierSets, selectedModifiers]);

  // Track validation errors when selections change (only when dialog is open)
  useEffect(() => {
    if (!open) return;
    
    const newValidationErrors = {};
    
    visibleModifierSets.forEach(modifierSet => {
      const selections = selectedModifiers[modifierSet.id] || [];
      const selectionCount = selections.reduce((sum, sel) => sum + sel.quantity, 0);
      if (selectionCount < modifierSet.min_selections) {
        newValidationErrors[modifierSet.id] = `Select at least ${modifierSet.min_selections} option(s)`;
      }
    });
    
    setValidationErrors(newValidationErrors);
  }, [open, selectedModifiers, visibleModifierSets]);

  // Handle auto-opening of sections when modifier sets change (only when dialog is open)
  useEffect(() => {
    if (!open || visibleModifierSets.length === 0) return;
    
    setOpenSections(prevOpenSections => {
      const newOpenSections = { ...prevOpenSections };
      
      visibleModifierSets.forEach((modifierSet, index) => {
        // Auto-open sections with required selections, first section, or newly triggered sections
        const wasVisible = prevOpenSections.hasOwnProperty(modifierSet.id);
        if (modifierSet.min_selections > 0 || index === 0 || !wasVisible) {
          newOpenSections[modifierSet.id] = true;
        }
      });
      
      // Remove sections that are no longer visible
      const visibleSetIds = new Set(visibleModifierSets.map(ms => ms.id));
      Object.keys(newOpenSections).forEach(setId => {
        if (!visibleSetIds.has(setId)) {
          delete newOpenSections[setId];
        }
      });
      
      // Only update if there are actual changes
      const hasChanges = JSON.stringify(newOpenSections) !== JSON.stringify(prevOpenSections);
      return hasChanges ? newOpenSections : prevOpenSections;
    });
  }, [open, visibleModifierSets]);

  // Calculate total price including modifiers
  useEffect(() => {
    if (!product) return;
    
    let basePrice = parseFloat(product.price);
    let modifierTotal = 0;
    
    Object.values(selectedModifiers).forEach(selections => {
      selections.forEach(selection => {
        const option = findOptionById(selection.option_id);
        if (option) {
          modifierTotal += parseFloat(option.price_delta) * selection.quantity;
        }
      });
    });
    
    setTotalPrice((basePrice + modifierTotal) * quantity);
  }, [product, selectedModifiers, quantity]);

  const findOptionById = (optionId) => {
    // Search in all modifier sets (both base and triggered)
    const allSets = [...modifierSets];
    
    // Also search in any triggered sets from options
    const triggeredSets = [];
    modifierSets.forEach(modifierSet => {
      if (modifierSet.options) {
        modifierSet.options.forEach(option => {
          if (option.triggered_sets) {
            option.triggered_sets.forEach(triggeredSet => {
              if (!triggeredSets.find(ts => ts.id === triggeredSet.id)) {
                triggeredSets.push(triggeredSet);
              }
            });
          }
        });
      }
    });
    
    const searchSets = [...allSets, ...triggeredSets];
    
    for (const modifierSet of searchSets) {
      if (!modifierSet || !modifierSet.options) continue;
      const option = modifierSet.options.find(opt => opt && opt.id === optionId);
      if (option) return option;
    }
    
    return null;
  };

  const handleModifierSelection = (modifierSetId, option, isSelected) => {
    setSelectedModifiers(prev => {
      const current = prev[modifierSetId] || [];
      const modifierSet = visibleModifierSets.find(ms => ms.id === modifierSetId);
      let newState = { ...prev };
      
      if (isSelected) {
        // Add/select this option
        if (modifierSet?.selection_type === 'SINGLE') {
          // For single selection, clear any previous selections and their triggered sets first
          const previousSelections = current;
          previousSelections.forEach(prevSel => {
            const prevOption = findOptionInSets(prevSel.option_id);
            if (prevOption && prevOption.triggered_sets) {
              prevOption.triggered_sets.forEach(triggeredSet => {
                delete newState[triggeredSet.id];
              });
            }
          });
          
          // Set the new selection
          newState[modifierSetId] = [{ option_id: option.id, quantity: 1 }];
        } else {
          // Add selection for multiple
          const existing = current.find(sel => sel.option_id === option.id);
          if (existing) {
            existing.quantity += 1;
            newState[modifierSetId] = [...current];
          } else {
            newState[modifierSetId] = [...current, { option_id: option.id, quantity: 1 }];
          }
        }
      } else {
        // Remove/deselect this option and clear any triggered sets
        newState[modifierSetId] = current.filter(sel => sel.option_id !== option.id);
        
        // Clear selections from any sets that were triggered by this option
        if (option.triggered_sets) {
          option.triggered_sets.forEach(triggeredSet => {
            delete newState[triggeredSet.id];
          });
        }
      }
      
      return newState;
    });
  };

  const handleModifierQuantityChange = (modifierSetId, optionId, newQuantity) => {
    if (newQuantity <= 0) {
      // Find the full option object to ensure triggered sets are cleared
      const option = findOptionInSets(optionId);
      if (option) {
        handleModifierSelection(modifierSetId, option, false);
      }
      return;
    }
    
    setSelectedModifiers(prev => {
      const current = prev[modifierSetId] || [];
      const existing = current.find(sel => sel.option_id === optionId);
      
      if (existing) {
        existing.quantity = newQuantity;
        return { ...prev, [modifierSetId]: [...current] };
      }
      
      return prev;
    });
  };

  const isOptionSelected = (modifierSetId, optionId) => {
    const selections = selectedModifiers[modifierSetId] || [];
    return selections.some(sel => sel.option_id === optionId);
  };

  const getOptionQuantity = (modifierSetId, optionId) => {
    const selections = selectedModifiers[modifierSetId] || [];
    const selection = selections.find(sel => sel.option_id === optionId);
    return selection ? selection.quantity : 0;
  };

  const validateSelections = () => {
    let hasErrors = false;
    const errors = {};
    
    for (const modifierSet of visibleModifierSets) {
      const selections = selectedModifiers[modifierSet.id] || [];
      const selectionCount = selections.reduce((sum, sel) => sum + sel.quantity, 0);
      
      // Check minimum requirements
      if (selectionCount < modifierSet.min_selections) {
        errors[modifierSet.id] = `Select at least ${modifierSet.min_selections} option(s)`;
        hasErrors = true;
        
        // Auto-open section with error
        setOpenSections(prev => ({ ...prev, [modifierSet.id]: true }));
      }
      
      // Check maximum limits
      if (modifierSet.max_selections && selectionCount > modifierSet.max_selections) {
        errors[modifierSet.id] = `Maximum ${modifierSet.max_selections} option(s) allowed`;
        hasErrors = true;
        
        // Auto-open section with error
        setOpenSections(prev => ({ ...prev, [modifierSet.id]: true }));
      }
    }
    
    setValidationErrors(errors);
    
    if (hasErrors) {
      toast({
        title: "Please check your selections",
        description: "Some modifier options need attention",
        variant: "destructive"
      });
    }
    
    return !hasErrors;
  };

  const getModifierSetStatus = (modifierSet) => {
    const selections = selectedModifiers[modifierSet.id] || [];
    const selectionCount = selections.reduce((sum, sel) => sum + sel.quantity, 0);
    const hasError = validationErrors[modifierSet.id];
    
    if (hasError) return { status: 'error', message: hasError };
    if (selectionCount >= modifierSet.min_selections) return { status: 'complete', message: 'Complete' };
    if (modifierSet.min_selections > 0) return { status: 'required', message: 'Required' };
    return { status: 'optional', message: 'Optional' };
  };

  const handleAddToCart = () => {
    if (!validateSelections()) return;
    
    // Flatten selected modifiers for the API
    const flattenedModifiers = [];
    Object.values(selectedModifiers).forEach(selections => {
      selections.forEach(selection => {
        flattenedModifiers.push(selection);
      });
    });
    
    console.log('Adding to cart - selectedModifiers:', selectedModifiers);
    console.log('Adding to cart - flattenedModifiers:', flattenedModifiers);
    console.log('Product modifier groups:', product.modifier_groups);
    
    onAddToCart({
      product_id: product.id,
      quantity: quantity,
      notes: notes,
      selected_modifiers: flattenedModifiers
    });
    
    // Reset and close
    setSelectedModifiers({});
    setNotes("");
    setQuantity(initialQuantity);
    onOpenChange(false);
  };

  const toggleSection = (modifierSetId) => {
    setOpenSections(prev => ({
      ...prev,
      [modifierSetId]: !prev[modifierSetId]
    }));
  };


  // Safety check for malformed data
  try {

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] flex flex-col p-6">
        {/* Simple Header */}
        <div className="flex-shrink-0 pb-4 border-b">
          <h2 className="text-xl font-semibold">{product?.name || 'Item'}</h2>
          <p className="text-sm text-slate-600 mt-1">Select your options</p>
        </div>
        
        {/* Main Content - Horizontal Layout */}
        <div className="flex-1 overflow-y-auto py-6">
          <div className="space-y-6">
            {visibleModifierSets.map((modifierSet) => {
              const status = getModifierSetStatus(modifierSet);
              const selections = selectedModifiers[modifierSet.id] || [];
              const selectionCount = selections.reduce((sum, sel) => sum + sel.quantity, 0);
              
              return (
                <div key={modifierSet.id} className="space-y-3">
                  {/* Section Title */}
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-medium">{modifierSet.name}</h3>
                    {status.status === 'error' && (
                      <span className="text-red-600 text-sm font-medium">Required</span>
                    )}
                    {modifierSet.min_selections > 0 && status.status !== 'error' && (
                      <span className="text-slate-500 text-sm">
                        {selectionCount}/{modifierSet.min_selections} selected
                      </span>
                    )}
                  </div>
                  
                  {/* Options - Horizontal Grid */}
                  <div className="grid grid-cols-8 gap-3">
                    {(modifierSet.options || [])
                      .filter(option => option && !option.is_hidden)
                      .map(option => {
                        const isSelected = isOptionSelected(modifierSet.id, option.id);
                        const optionQuantity = getOptionQuantity(modifierSet.id, option.id);
                        const priceText = option.price_delta !== "0.00" 
                          ? `${parseFloat(option.price_delta) >= 0 ? '+' : ''}$${parseFloat(option.price_delta).toFixed(2)}`
                          : '';
                        
                        return (
                          <button
                            key={option.id}
                            className={`p-4 rounded-lg border-2 transition-all text-center ${
                              isSelected 
                                ? 'border-blue-500 bg-blue-50 text-blue-900' 
                                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                            onClick={() => {
                              handleModifierSelection(modifierSet.id, option, !isSelected);
                            }}
                          >
                            <div className="font-medium">{option.name}</div>
                            {priceText && (
                              <div className="text-sm text-slate-600 mt-1">{priceText}</div>
                            )}
                            {isSelected && modifierSet.selection_type === 'MULTIPLE' && optionQuantity > 1 && (
                              <div className="text-xs mt-2 font-medium">×{optionQuantity}</div>
                            )}
                            
                            {/* Quantity controls for multiple selection */}
                            {isSelected && modifierSet.selection_type === 'MULTIPLE' && (
                              <div 
                                className="flex items-center justify-center gap-2 mt-3" 
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  className="w-7 h-7 rounded-full border border-slate-300 flex items-center justify-center hover:bg-slate-100"
                                  onClick={() => handleModifierQuantityChange(
                                    modifierSet.id, 
                                    option.id, 
                                    optionQuantity - 1
                                  )}
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <span className="w-6 text-center font-medium">{optionQuantity}</span>
                                <button
                                  className="w-7 h-7 rounded-full border border-slate-300 flex items-center justify-center hover:bg-slate-100"
                                  onClick={() => handleModifierQuantityChange(
                                    modifierSet.id, 
                                    option.id, 
                                    optionQuantity + 1
                                  )}
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </button>
                        );
                      })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Bottom Section - Quantity, Notes, Actions */}
        <div className="flex-shrink-0 border-t pt-4 space-y-4">
          {/* Quantity and Notes Row */}
          <div className="flex gap-6">
            <div className="flex items-center gap-3">
              <span className="font-medium">Quantity:</span>
              <div className="flex items-center gap-2">
                <button
                  className="w-8 h-8 rounded-full border border-slate-300 flex items-center justify-center hover:bg-slate-100"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center font-semibold text-lg">{quantity}</span>
                <button
                  className="w-8 h-8 rounded-full border border-slate-300 flex items-center justify-center hover:bg-slate-100"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            <div className="flex-1">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Special instructions or notes..."
                className="resize-none"
                rows={2}
              />
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-2xl font-bold">
                  ${totalPrice.toFixed(2)}
                </div>
                {quantity > 1 && (
                  <div className="text-sm text-slate-500">
                    ${(totalPrice / quantity).toFixed(2)} each
                  </div>
                )}
              </div>
              <Button onClick={handleAddToCart} size="lg" className="px-8">
                <ShoppingCart className="h-4 w-4 mr-2" />
                {editMode 
                  ? 'Update Item' 
                  : quantity > 1 
                    ? `Add ${quantity} Items`
                    : 'Add to Cart'
                }
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
  
  } catch (error) {
    console.error("ProductModifierSelector error:", error, { product, modifierSets });
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Error Loading Modifiers</DialogTitle>
          </DialogHeader>
          <p>There was an error loading the modifier options for this product.</p>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
};

const ProductModifierSelector = (props) => {
  // Only render content when dialog should be open and product exists
  if (!props.product || !props.open) {
    return null;
  }
  
  return <ProductModifierSelectorContent {...props} />;
};

export default ProductModifierSelector;