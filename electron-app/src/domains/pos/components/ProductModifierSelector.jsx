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
    
    // Start with base modifier sets (those that are always shown initially)
    // A modifier set is "base" if it's not triggered by any option
    const allTriggeredSetIds = new Set();
    modifierSets.forEach(modifierSet => {
      if (modifierSet.options) {
        modifierSet.options.forEach(option => {
          if (option.triggered_sets) {
            option.triggered_sets.forEach(triggeredSet => {
              allTriggeredSetIds.add(triggeredSet.id);
            });
          }
        });
      }
    });
    
    // Base sets are those not triggered by any option
    const baseModifierSets = modifierSets.filter(set => !allTriggeredSetIds.has(set.id));
    
    // Safety check: If no base sets exist but we have modifier sets, treat the first as base
    // This handles edge cases where all sets appear to be conditional
    if (baseModifierSets.length === 0 && modifierSets.length > 0) {
      console.warn('No base modifier sets found, treating first set as base:', modifierSets[0]);
      baseModifierSets.push(modifierSets[0]);
    }
    
    // Find triggered sets based on current selections
    const triggeredSets = [];
    const triggeredSetIds = new Set();
    
    Object.values(selectedModifiers).forEach(selections => {
      selections.forEach(selection => {
        const triggeringOption = findOptionInSets(selection.option_id);
        if (triggeringOption && triggeringOption.triggered_sets) {
          triggeringOption.triggered_sets.forEach(triggeredSet => {
            if (!triggeredSetIds.has(triggeredSet.id)) {
              triggeredSets.push(triggeredSet);
              triggeredSetIds.add(triggeredSet.id);
            }
          });
        }
      });
    });
    
    return [...baseModifierSets, ...triggeredSets];
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
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            Customize {product?.name || 'Item'}
            {visibleModifierSets.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {visibleModifierSets.length} option{visibleModifierSets.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {editMode ? 'Update your item with modifier options' : 'Select modifier options for this item'}
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {/* If no modifier sets, show simple quantity selector */}
            {!visibleModifierSets.length ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Quantity</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-8 text-center">{quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setQuantity(quantity + 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Special instructions..."
                    className="mt-1"
                  />
                </div>
              </div>
            ) : (
              /* Accordion-style modifier sections */
              visibleModifierSets.map((modifierSet, index) => {
                const status = getModifierSetStatus(modifierSet);
                const isOpen = Boolean(openSections[modifierSet.id]);
                const selections = selectedModifiers[modifierSet.id] || [];
                const selectionCount = selections.reduce((sum, sel) => sum + sel.quantity, 0);
                
                // Check if this is a triggered set
                const isTriggeredSet = !modifierSets.some(baseSet => baseSet.id === modifierSet.id);
                
                return (
                  <Card key={modifierSet.id} className={`transition-all duration-300 ${
                    status.status === 'error' ? 'border-red-300 bg-red-50/50' : 
                    status.status === 'complete' ? 'border-green-300 bg-green-50/50' : ''
                  } ${isTriggeredSet ? 'animate-in slide-in-from-top-2' : ''}`}>
                    <Collapsible open={isOpen} onOpenChange={() => toggleSection(modifierSet.id)}>
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-slate-50/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              <div>
                                <CardTitle className="text-base">{modifierSet.name}</CardTitle>
                                <div className="flex gap-2 mt-1">
                                  {isTriggeredSet && (
                                    <Badge variant="default" className="text-xs bg-blue-600">
                                      Conditional
                                    </Badge>
                                  )}
                                  {status.status === 'error' && (
                                    <Badge variant="destructive" className="text-xs">
                                      <AlertCircle className="h-3 w-3 mr-1" />
                                      {status.message}
                                    </Badge>
                                  )}
                                  {status.status === 'complete' && (
                                    <Badge variant="default" className="text-xs bg-green-600">
                                      <Check className="h-3 w-3 mr-1" />
                                      Complete
                                    </Badge>
                                  )}
                                  {status.status === 'required' && (
                                    <Badge variant="secondary" className="text-xs">
                                      Required ({selectionCount}/{modifierSet.min_selections})
                                    </Badge>
                                  )}
                                  {status.status === 'optional' && (
                                    <Badge variant="outline" className="text-xs">
                                      Optional
                                    </Badge>
                                  )}
                                  {modifierSet.max_selections && (
                                    <Badge variant="outline" className="text-xs">
                                      Max: {modifierSet.max_selections}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            {/* Show selection summary when collapsed */}
                            {!isOpen && selectionCount > 0 && (
                              <div className="text-sm text-slate-600">
                                {selectionCount} selected
                              </div>
                            )}
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      
                      <CollapsibleContent>
                        <CardContent className="pt-0">
                          <div className="grid gap-2">
                            {(modifierSet.options || [])
                              .filter(option => option && !option.is_hidden)
                              .map(option => {
                                const isSelected = isOptionSelected(modifierSet.id, option.id);
                                const optionQuantity = getOptionQuantity(modifierSet.id, option.id);
                                const priceText = option.price_delta !== "0.00" 
                                  ? ` (${parseFloat(option.price_delta) >= 0 ? '+' : ''}$${parseFloat(option.price_delta).toFixed(2)})`
                                  : '';
                                
                                return (
                                  <div
                                    key={option.id}
                                    className={`p-3 border rounded-lg cursor-pointer transition-all duration-200 ${
                                      isSelected 
                                        ? 'border-primary bg-primary/10 shadow-sm' 
                                        : 'border-border hover:border-primary/50 hover:bg-slate-50/50'
                                    }`}
                                    onClick={() => {
                                      handleModifierSelection(modifierSet.id, option, !isSelected);
                                    }}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        {isSelected && <Check className="h-4 w-4 text-primary" />}
                                        <div>
                                          <div className="font-medium">{option.name}</div>
                                          {priceText && (
                                            <div className="text-sm text-slate-600">{priceText}</div>
                                          )}
                                        </div>
                                      </div>
                                      
                                      {isSelected && modifierSet.selection_type === 'MULTIPLE' && (
                                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-6 w-6 p-0"
                                            onClick={() => handleModifierQuantityChange(
                                              modifierSet.id, 
                                              option.id, 
                                              optionQuantity - 1
                                            )}
                                          >
                                            <Minus className="h-3 w-3" />
                                          </Button>
                                          <span className="w-6 text-center text-sm font-medium">{optionQuantity}</span>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-6 w-6 p-0"
                                            onClick={() => handleModifierQuantityChange(
                                              modifierSet.id, 
                                              option.id, 
                                              optionQuantity + 1
                                            )}
                                          >
                                            <Plus className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                );
              })
            )}
            
            {/* Quantity and Notes Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Order Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Quantity</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-8 text-center font-medium">{quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setQuantity(quantity + 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Special instructions..."
                    className="mt-1 resize-none"
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
        
        <DialogFooter className="flex-shrink-0 border-t pt-4">
          <div className="flex items-center justify-between w-full">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-lg font-bold">
                  ${totalPrice.toFixed(2)}
                </div>
                {quantity > 1 && (
                  <div className="text-xs text-slate-500">
                    ${(totalPrice / quantity).toFixed(2)} each
                  </div>
                )}
              </div>
              <Button onClick={handleAddToCart} size="lg">
                <ShoppingCart className="h-4 w-4 mr-2" />
                {editMode ? 'Update Item' : 'Add to Cart'}
              </Button>
            </div>
          </div>
        </DialogFooter>
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