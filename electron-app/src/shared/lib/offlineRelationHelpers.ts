/**
 * Offline relation helpers
 *
 * These helpers fetch related data from cache for hydrating relations.
 * They work with existing cached datasets to avoid requiring new IPC methods.
 */

let categoriesCache: any[] | null = null;
let productTypesCache: any[] | null = null;
let taxesCache: any[] | null = null;

/**
 * Get category by ID from cached categories
 *
 * Uses an in-memory cache to avoid re-fetching on every call
 */
export async function getCachedCategoryById(categoryId: string | number): Promise<any | null> {
  // Load categories into cache if not already loaded
  if (!categoriesCache && window.offlineAPI?.getCachedCategories) {
    try {
      categoriesCache = await window.offlineAPI.getCachedCategories();
    } catch (err) {
      console.error('Failed to load categories cache:', err);
      return null;
    }
  }

  if (!categoriesCache) return null;

  // Find by ID (handle both string and number IDs)
  return categoriesCache.find((cat) =>
    cat.id == categoryId || cat.id === categoryId
  ) || null;
}

/**
 * Get product type by ID from cached product types
 *
 * Uses an in-memory cache to avoid re-fetching on every call
 */
export async function getCachedProductTypeById(productTypeId: string | number): Promise<any | null> {
  // Load product types into cache if not already loaded
  if (!productTypesCache && window.offlineAPI?.getCachedProductTypes) {
    try {
      productTypesCache = await window.offlineAPI.getCachedProductTypes();
    } catch (err) {
      console.error('Failed to load product types cache:', err);
      return null;
    }
  }

  if (!productTypesCache) return null;

  // Find by ID (handle both string and number IDs)
  return productTypesCache.find((pt) =>
    pt.id == productTypeId || pt.id === productTypeId
  ) || null;
}

/**
 * Get tax by ID from cached taxes
 *
 * Uses an in-memory cache to avoid re-fetching on every call
 */
export async function getCachedTaxById(taxId: string | number): Promise<any | null> {
  // Load taxes into cache if not already loaded
  if (!taxesCache && window.offlineAPI?.getCachedTaxes) {
    try {
      taxesCache = await window.offlineAPI.getCachedTaxes();
    } catch (err) {
      console.error('Failed to load taxes cache:', err);
      return null;
    }
  }

  if (!taxesCache) return null;

  // Find by ID (handle both string and number IDs)
  return taxesCache.find((tax) =>
    tax.id == taxId || tax.id === taxId
  ) || null;
}

/**
 * Clear cached relation data
 *
 * Call this when you know the underlying datasets have been updated
 */
export function clearRelationCache() {
  categoriesCache = null;
  productTypesCache = null;
  taxesCache = null;
  console.log('🧹 [Relations] Cleared relation caches');
}

// Expose globally for dev tools
if (typeof window !== 'undefined') {
  (window as any).clearRelationCache = clearRelationCache;
}

/**
 * Preload relation caches
 *
 * Call this on app initialization to warm up the cache
 */
export async function preloadRelationCaches(): Promise<void> {
  if (!window.offlineAPI) return;

  try {
    await Promise.all([
      getCachedCategoryById('_preload'), // Trigger cache load
      getCachedProductTypeById('_preload'),
      getCachedTaxById('_preload'),
    ]);
    console.log('✅ [Relations] Preloaded relation caches');
  } catch (err) {
    console.warn('⚠️ [Relations] Failed to preload caches:', err);
  }
}
