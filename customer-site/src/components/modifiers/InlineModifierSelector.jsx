import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Inline modifier selector component for product details page
 * Based on the POS ProductModifierSelector but simplified for customer-site
 */
const InlineModifierSelector = ({ 
	product, 
	onModifiersChange,
	className 
}) => {
	const [selectedModifiers, setSelectedModifiers] = useState({});
	const [validationErrors, setValidationErrors] = useState({});

	// Get modifier sets for this product
	const modifierSets = product?.modifier_groups || [];

	// Only process modifier sets when they exist
	const visibleModifierSets = useMemo(() => {
		if (!modifierSets.length) return [];
		
		// Build a map of which sets are triggered by which options
		const triggerMap = new Map();
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
			if (addedSetIds.has(modifierSet.id)) return;
			
			// Add base sets (not conditional/triggered sets)
			if (!allTriggeredSetIds.has(modifierSet.id)) {
				visibleSets.push(modifierSet);
				addedSetIds.add(modifierSet.id);
				
				// Check if any selected options trigger conditional sets
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
		
		return visibleSets;
	}, [modifierSets, selectedModifiers]);

	// Validation logic
	useEffect(() => {
		const newValidationErrors = {};
		
		visibleModifierSets.forEach(modifierSet => {
			const selections = selectedModifiers[modifierSet.id] || [];
			const selectionCount = selections.reduce((sum, sel) => sum + sel.quantity, 0);
			if (selectionCount < modifierSet.min_selections) {
				newValidationErrors[modifierSet.id] = `Select at least ${modifierSet.min_selections} option(s)`;
			}
		});
		
		setValidationErrors(newValidationErrors);
	}, [selectedModifiers, visibleModifierSets]);

	// Notify parent of changes
	useEffect(() => {
		// Flatten selected modifiers for the parent component
		const flattenedModifiers = [];
		Object.values(selectedModifiers).forEach(selections => {
			selections.forEach(selection => {
				flattenedModifiers.push(selection);
			});
		});
		
		const isValid = Object.keys(validationErrors).length === 0;
		onModifiersChange?.(flattenedModifiers, isValid);
	}, [selectedModifiers, validationErrors, onModifiersChange]);

	const findOptionInSets = (optionId) => {
		for (const modifierSet of modifierSets) {
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
				if (modifierSet?.selection_type === 'SINGLE') {
					// For single selection, clear previous selections and their triggered sets
					const previousSelections = current;
					previousSelections.forEach(prevSel => {
						const prevOption = findOptionInSets(prevSel.option_id);
						if (prevOption && prevOption.triggered_sets) {
							prevOption.triggered_sets.forEach(triggeredSet => {
								delete newState[triggeredSet.id];
							});
						}
					});
					
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
				// Remove selection and clear triggered sets
				newState[modifierSetId] = current.filter(sel => sel.option_id !== option.id);
				
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

	// Don't render if no modifiers
	if (!visibleModifierSets.length) return null;

	return (
		<div className={cn("space-y-8", className)}>
			{visibleModifierSets.map((modifierSet) => {
				const selections = selectedModifiers[modifierSet.id] || [];
				const selectionCount = selections.reduce((sum, sel) => sum + sel.quantity, 0);
				const hasError = validationErrors[modifierSet.id];
				
				return (
					<div key={modifierSet.id} className="space-y-4">
						{/* Section Title */}
						<div className="flex items-center justify-between">
							<div>
								<h3 className={cn(
									"text-lg font-semibold",
									hasError ? "text-red-600" : "text-accent-dark-green"
								)}>
									{modifierSet.name}
									{modifierSet.min_selections > 0 && (
										<span className="text-red-500 ml-1">*</span>
									)}
								</h3>
								{modifierSet.min_selections > 0 && (
									<p className="text-sm text-accent-dark-brown mt-1">
										Select at least {modifierSet.min_selections} option(s)
									</p>
								)}
							</div>
							{modifierSet.min_selections > 0 && (
								<span className={cn(
									"text-sm font-medium",
									hasError ? "text-red-600" : "text-accent-subtle-gray"
								)}>
									{selectionCount}/{modifierSet.min_selections} selected
								</span>
							)}
						</div>
						
						{/* Error message */}
						{hasError && (
							<p className="text-red-600 text-sm font-medium">{hasError}</p>
						)}
						
						{/* Options Grid - Responsive */}
						<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
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
											className={cn(
												"p-4 rounded-lg border-2 transition-all text-center relative",
												isSelected 
													? 'border-primary-green bg-primary-green/10 text-accent-dark-green' 
													: 'border-accent-subtle-gray hover:border-primary-green/50 hover:bg-accent-light-beige/30'
											)}
											onClick={() => {
												handleModifierSelection(modifierSet.id, option, !isSelected);
											}}
										>
											<div className="font-medium text-sm">{option.name}</div>
											{priceText && (
												<div className="text-xs text-accent-dark-brown mt-1">{priceText}</div>
											)}
											
											{/* Quantity display for multiple selection */}
											{isSelected && modifierSet.selection_type === 'MULTIPLE' && optionQuantity > 1 && (
												<div className="text-xs mt-2 font-medium text-primary-green">×{optionQuantity}</div>
											)}
											
											{/* Quantity controls for multiple selection */}
											{isSelected && modifierSet.selection_type === 'MULTIPLE' && (
												<div 
													className="flex items-center justify-center gap-1 mt-3" 
													onClick={(e) => e.stopPropagation()}
												>
													<button
														className="w-6 h-6 rounded-full border border-primary-green flex items-center justify-center hover:bg-primary-green hover:text-accent-light-beige transition-colors"
														onClick={() => handleModifierQuantityChange(
															modifierSet.id, 
															option.id, 
															optionQuantity - 1
														)}
													>
														<Minus className="h-3 w-3" />
													</button>
													<span className="w-6 text-center font-medium text-sm">{optionQuantity}</span>
													<button
														className="w-6 h-6 rounded-full border border-primary-green flex items-center justify-center hover:bg-primary-green hover:text-accent-light-beige transition-colors"
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
	);
};

export default InlineModifierSelector;