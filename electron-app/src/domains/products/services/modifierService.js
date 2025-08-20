import apiClient from "@/shared/lib/apiClient";

/**
 * Comprehensive Modifier Service
 * Handles all modifier-related operations including:
 * - Product modifier management
 * - Global modifier sets (library)
 * - Smart suggestions and templates
 * - Usage analytics
 */

// ==========================================
// PRODUCT MODIFIER MANAGEMENT
// ==========================================

/**
 * Get all modifiers for a specific product with full relationship data
 */
export const getProductModifiers = async (productId, includeAll = false) => {
  const url = includeAll 
    ? `/products/${productId}/?include_all_modifiers=true`
    : `/products/${productId}/`;
  const response = await apiClient.get(url);
  return response.data.modifier_groups || [];
};

/**
 * Get product modifier relationships directly
 */
export const getProductModifierRelationships = async (productId) => {
  try {
    const response = await apiClient.get(`/products/${productId}/modifier-sets/`);
    return response.data.results || response.data;
  } catch (error) {
    console.error('Error fetching product modifier relationships:', error);
    throw error;
  }
};

/**
 * Add a modifier set to a product
 */
export const addModifierSetToProduct = async (productId, modifierSetId) => {
  // First check if the modifier set is already added to this product
  try {
    const existingRelationships = await getProductModifierRelationships(productId);
    const alreadyExists = existingRelationships.some(rel => 
      rel.id === modifierSetId || rel.id === parseInt(modifierSetId)
    );
    
    if (alreadyExists) {
      console.log(`Modifier set ${modifierSetId} is already added to product ${productId}`);
      // Return a success-like response since the desired state is already achieved
      return { data: { message: 'Modifier set already added to product' } };
    }
  } catch (error) {
    console.warn('Could not check existing relationships, proceeding with add:', error);
  }

  // Try different URL patterns
  const urlPatterns = [
    `/products/${productId}/modifier-sets/`,
    `/products/products/${productId}/modifier-sets/`,
  ];
  
  for (const urlPattern of urlPatterns) {
    try {
      const response = await apiClient.post(urlPattern, {
        product: productId,
        modifier_set_id: modifierSetId,
        display_order: 0 // Default to 0, can be updated later
      });
      console.log(`Successfully used URL pattern: ${urlPattern}`);
      return response;
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`URL pattern failed: ${urlPattern}`);
        continue; // Try next pattern
      }
      
      // Handle the specific duplicate error more gracefully
      if (error.response?.status === 400 && 
          error.response?.data?.non_field_errors?.[0]?.includes('must make a unique set')) {
        console.log(`Modifier set ${modifierSetId} is already added to product ${productId}`);
        // Return a success-like response since the desired state is already achieved
        return { data: { message: 'Modifier set already added to product' } };
      }
      
      throw error; // Other errors should be thrown
    }
  }
  
  throw new Error('No working URL pattern found for product modifier sets');
};

/**
 * Remove a modifier set from a product
 */
export const removeModifierSetFromProduct = async (productId, modifierSetId) => {
  // First, get the current relationships to find the relationship ID
  const relationships = await getProductModifierRelationships(productId);
  const relationship = relationships.find(rel => 
    rel.id === modifierSetId || rel.id === parseInt(modifierSetId)
  );
  
  if (!relationship) {
    throw new Error('Modifier set relationship not found');
  }
  
  // Use the relationship_id for deletion, fallback to id if not available
  const relationshipId = relationship.relationship_id || relationship.id;

  // Try different URL patterns for deletion
  const urlPatterns = [
    `/products/${productId}/modifier-sets/${relationshipId}/`,
    `/products/products/${productId}/modifier-sets/${relationshipId}/`,
  ];
  
  for (const urlPattern of urlPatterns) {
    try {
      await apiClient.delete(urlPattern);
      console.log(`Successfully deleted using URL pattern: ${urlPattern}`);
      return { success: true };
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`Delete URL pattern failed: ${urlPattern}`);
        continue; // Try next pattern
      }
      throw error; // Other errors should be thrown
    }
  }
  
  throw new Error('No working URL pattern found for deleting product modifier sets');
};

/**
 * Update modifier sets for a product (add/remove/reorder) - DEPRECATED
 * Use addModifierSetToProduct and removeModifierSetFromProduct instead
 */
export const updateProductModifierSets = async (productId, modifierSetIds) => {
  // This function is deprecated but kept for backwards compatibility
  console.warn('updateProductModifierSets is deprecated. Use addModifierSetToProduct/removeModifierSetFromProduct instead.');
  
  if (modifierSetIds.length === 0) return { success: true };
  
  // For now, just add the last modifier set
  const latestModifierSetId = modifierSetIds[modifierSetIds.length - 1];
  return addModifierSetToProduct(productId, latestModifierSetId);
};

/**
 * Update display order of modifier sets for a product
 */
export const updateModifierOrdering = async (productId, modifierSetOrdering) => {
  // Get the relationships using the correct URL pattern
  const relationships = await getProductModifierRelationships(productId);
  
  // Update each relationship's display_order individually
  for (const orderItem of modifierSetOrdering) {
    const relationship = relationships.find(rel => 
      rel.id === orderItem.modifier_set_id || rel.id === parseInt(orderItem.modifier_set_id)
    );
    
    if (relationship) {
      const relationshipId = relationship.relationship_id || relationship.id;
      await apiClient.patch(`/products/${productId}/modifier-sets/${relationshipId}/`, {
        display_order: orderItem.display_order
      });
    }
  }
  
  return { success: true };
};

/**
 * Hide/show specific options for a product's modifier set
 */
export const updateHiddenOptions = async (productId, modifierSetId, hiddenOptionIds) => {
  // Get the relationship object first using the correct URL pattern
  const relationships = await getProductModifierRelationships(productId);
  
  const relationship = relationships.find(rel => {
    // Convert both to strings for comparison to handle type mismatches
    return String(rel.id) === String(modifierSetId);
  });
  
  if (relationship) {
    const relationshipId = relationship.relationship_id || relationship.id;
    const response = await apiClient.patch(`/products/${productId}/modifier-sets/${relationshipId}/`, {
      hidden_options: hiddenOptionIds
    });
    return response;
  }
  
  throw new Error('Product modifier set relationship not found');
};

/**
 * Add product-specific modifier option to a modifier set
 * @param {string|number} productId - The product ID
 * @param {string|number} modifierSetId - The modifier set ID
 * @param {Object} optionData - Option data including name, price_delta, display_order
 */
export const addProductSpecificOption = async (productId, modifierSetId, optionData) => {
  // First, find the ProductModifierSet relationship
  const relationships = await getProductModifierRelationships(productId);
  const relationship = relationships.find(rel => 
    rel.id === modifierSetId || rel.id === parseInt(modifierSetId)
  );
  
  if (!relationship) {
    throw new Error('Product modifier set relationship not found');
  }

  // Use the proper endpoint for adding product-specific options
  const relationshipId = relationship.relationship_id || relationship.id;
  const urlPatterns = [
    `/products/${productId}/modifier-sets/${relationshipId}/add-product-specific-option/`,
    `/products/products/${productId}/modifier-sets/${relationshipId}/add-product-specific-option/`,
  ];
  
  for (const urlPattern of urlPatterns) {
    try {
      const response = await apiClient.post(urlPattern, optionData);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        continue; // Try next pattern
      }
      throw error; // Other errors should be thrown
    }
  }
  
  throw new Error('No working URL pattern found for adding product-specific options');
};

/**
 * Remove product-specific modifier option
 * @param {string|number} productId - The product ID
 * @param {string|number} modifierSetId - The modifier set ID
 * @param {string|number} optionId - The option ID to remove
 */
export const removeProductSpecificOption = async (productId, modifierSetId, optionId) => {
  // First, find the ProductModifierSet relationship
  const relationships = await getProductModifierRelationships(productId);
  const relationship = relationships.find(rel => 
    rel.id === modifierSetId || rel.id === parseInt(modifierSetId)
  );
  
  if (!relationship) {
    throw new Error('Product modifier set relationship not found');
  }

  // Use the proper endpoint for removing product-specific options
  const relationshipId = relationship.relationship_id || relationship.id;
  const urlPatterns = [
    `/products/${productId}/modifier-sets/${relationshipId}/remove-product-specific-option/${optionId}/`,
    `/products/products/${productId}/modifier-sets/${relationshipId}/remove-product-specific-option/${optionId}/`,
  ];
  
  for (const urlPattern of urlPatterns) {
    try {
      const response = await apiClient.delete(urlPattern);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        continue; // Try next pattern
      }
      throw error; // Other errors should be thrown
    }
  }
  
  throw new Error('No working URL pattern found for removing product-specific options');
};

// ==========================================
// GLOBAL MODIFIER SETS (LIBRARY)
// ==========================================

/**
 * Get all modifier sets with optional filters
 */
export const getModifierSets = (params) => {
  return apiClient.get("/products/modifier-sets/", { params });
};

/**
 * Get a specific modifier set with all options
 */
export const getModifierSet = (modifierSetId) => {
  return apiClient.get(`/products/modifier-sets/${modifierSetId}/`);
};

/**
 * Create a new modifier set
 */
export const createModifierSet = (modifierSetData) => {
  return apiClient.post("/products/modifier-sets/", modifierSetData);
};

/**
 * Update an existing modifier set
 */
export const updateModifierSet = (modifierSetId, modifierSetData) => {
  return apiClient.patch(`/products/modifier-sets/${modifierSetId}/`, modifierSetData);
};

/**
 * Delete a modifier set
 */
export const deleteModifierSet = (modifierSetId) => {
  return apiClient.delete(`/products/modifier-sets/${modifierSetId}/`);
};

// ==========================================
// MODIFIER OPTIONS MANAGEMENT
// ==========================================

/**
 * Add option to modifier set
 * @param {string|number} modifierSetId - The modifier set ID
 * @param {Object} optionData - Option data including name, price_delta, display_order, and optionally is_product_specific
 */
export const addModifierOption = (modifierSetId, optionData) => {
  return apiClient.post("/products/modifier-options/", {
    ...optionData,
    modifier_set: modifierSetId,
    is_product_specific: optionData.is_product_specific ?? false
  });
};

/**
 * Update modifier option
 */
export const updateModifierOption = (modifierSetId, optionId, optionData) => {
  return apiClient.patch(`/products/modifier-options/${optionId}/`, optionData);
};

/**
 * Delete modifier option
 */
export const deleteModifierOption = (modifierSetId, optionId) => {
  return apiClient.delete(`/products/modifier-options/${optionId}/`);
};

/**
 * Reorder options within a modifier set
 */
export const reorderModifierOptions = (modifierSetId, optionOrdering) => {
  // Note: This endpoint might not exist yet in backend
  return apiClient.patch(`/products/modifier-sets/${modifierSetId}/reorder-options/`, {
    ordering: optionOrdering
  });
};

// ==========================================
// SMART SUGGESTIONS & TEMPLATES
// ==========================================

/**
 * Get modifier suggestions based on product category
 */
export const getModifierSuggestions = async (params) => {
  // This endpoint doesn't exist yet, so return fallback suggestions
  const categoryName = params.category_name || params.category_id;
  return { data: getFallbackSuggestions(categoryName) };
};

/**
 * Get fallback suggestions when API is unavailable
 */
export const getFallbackSuggestions = (categoryName) => {
  const CATEGORY_DEFAULTS = {
    'burgers': [
      { name: 'Size Options', type: 'SINGLE', options: ['Small', 'Medium', 'Large'] },
      { name: 'Add-ons', type: 'MULTIPLE', options: ['Extra Cheese', 'Bacon', 'Avocado'] },
      { name: 'Cooking Style', type: 'SINGLE', options: ['Rare', 'Medium', 'Well Done'] }
    ],
    'beverages': [
      { name: 'Size Options', type: 'SINGLE', options: ['Small', 'Medium', 'Large'] },
      { name: 'Temperature', type: 'SINGLE', options: ['Hot', 'Cold', 'Iced'] },
      { name: 'Sweetness Level', type: 'SINGLE', options: ['No Sugar', 'Light', 'Regular', 'Extra Sweet'] }
    ],
    'pizza': [
      { name: 'Size Options', type: 'SINGLE', options: ['Personal', 'Medium', 'Large', 'Extra Large'] },
      { name: 'Crust Type', type: 'SINGLE', options: ['Thin', 'Regular', 'Thick'] },
      { name: 'Toppings', type: 'MULTIPLE', options: ['Pepperoni', 'Mushrooms', 'Peppers', 'Olives'] }
    ]
  };

  return CATEGORY_DEFAULTS[categoryName?.toLowerCase()] || [];
};

/**
 * Create modifier set from template
 */
export const createModifierFromTemplate = async (templateData) => {
  try {
    // Create the modifier set
    const modifierSetResponse = await createModifierSet({
      name: templateData.name,
      internal_name: templateData.name.toLowerCase().replace(/\s+/g, '-'),
      selection_type: templateData.type,
      min_selections: templateData.min_selections !== undefined ? templateData.min_selections : (templateData.type === 'SINGLE' ? 1 : 0),
      max_selections: templateData.max_selections !== undefined ? templateData.max_selections : (templateData.type === 'SINGLE' ? 1 : null)
    });

    const modifierSet = modifierSetResponse.data;

    // Add only NON-product-specific options to the modifier set
    for (let i = 0; i < templateData.options.length; i++) {
      const option = templateData.options[i];
      
      // Skip product-specific options in this function - they should be handled separately
      if (option.isProductSpecific) {
        console.log(`Skipping product-specific option: ${option.name}`);
        continue;
      }
      
      const optionData = {
        name: option.name || option, // Handle both new object format and legacy string format
        price_delta: option.price_delta || 0.00,
        display_order: i,
        is_product_specific: false
      };
      
      // Create the option as a regular modifier option
      await addModifierOption(modifierSet.id, optionData);
    }

    return modifierSet;
  } catch (error) {
    console.error('Error creating modifier from template:', error);
    throw error;
  }
};

/**
 * Create modifier set from template with product-specific options
 * @param {Object} templateData - Template data including options with isProductSpecific flags
 * @param {string|number} productId - The product ID to add product-specific options to
 */
export const createModifierFromTemplateWithProductSpecific = async (templateData, productId) => {
  try {
    // Create the modifier set first with only non-product-specific options
    const modifierSet = await createModifierFromTemplate({
      name: templateData.name,
      type: templateData.type,
      options: templateData.options.filter(opt => !opt.isProductSpecific)
    });

    // Add the modifier set to the product
    await addModifierSetToProduct(productId, modifierSet.id);

    // Add product-specific options with correct display order
    const productSpecificOptions = templateData.options.filter(opt => opt.isProductSpecific);
    for (let i = 0; i < productSpecificOptions.length; i++) {
      const option = productSpecificOptions[i];
      
      // Find the original index of this option in the template to maintain order
      const originalIndex = templateData.options.findIndex(opt => opt === option);
      
      await addProductSpecificOption(productId, modifierSet.id, {
        name: option.name,
        price_delta: option.price_delta || 0.00,
        display_order: originalIndex
      });
    }

    return modifierSet;
  } catch (error) {
    console.error('Error creating modifier from template with product-specific options:', error);
    throw error;
  }
};

/**
 * Copy modifiers from another product
 */
export const copyModifiersFromProduct = (sourceProductId, targetProductId) => {
  return apiClient.post(`/products/${targetProductId}/copy-modifiers/`, {
    source_product_id: sourceProductId
  });
};

// ==========================================
// USAGE ANALYTICS
// ==========================================

/**
 * Get modifier set usage analytics
 */
export const getModifierSetUsage = (modifierSetId) => {
  return apiClient.get(`/products/modifier-sets/${modifierSetId}/usage/`);
};

/**
 * Get products using a specific modifier set
 */
export const getProductsUsingModifierSet = (modifierSetId) => {
  return apiClient.get(`/products/modifier-sets/${modifierSetId}/products/`);
};

/**
 * Get modifier sets that are safe to delete (not used by any products)
 */
export const getSafeToDeleteModifierSets = () => {
  return apiClient.get("/products/modifier-sets/safe-to-delete/");
};

// ==========================================
// BULK OPERATIONS
// ==========================================

/**
 * Apply modifier set to all products in a category
 */
export const applyToCategory = (modifierSetId, categoryId) => {
  return apiClient.post(`/products/modifier-sets/${modifierSetId}/apply-to-category/`, {
    category_id: categoryId
  });
};

/**
 * Replace modifier set across multiple products
 */
export const replaceModifierSet = (oldModifierSetId, newModifierSetId, productIds = null) => {
  return apiClient.post("/products/modifier-sets/replace/", {
    old_modifier_set_id: oldModifierSetId,
    new_modifier_set_id: newModifierSetId,
    product_ids: productIds
  });
};

// ==========================================
// CONDITIONAL LOGIC
// ==========================================

/**
 * Set conditional trigger for modifier set
 */
export const setConditionalTrigger = (modifierSetId, triggerOptionId) => {
  return apiClient.patch(`/products/modifier-sets/${modifierSetId}/`, {
    triggered_by_option: triggerOptionId
  });
};

/**
 * Remove conditional trigger from modifier set
 */
export const removeConditionalTrigger = (modifierSetId) => {
  return apiClient.patch(`/products/modifier-sets/${modifierSetId}/`, {
    triggered_by_option: null
  });
};