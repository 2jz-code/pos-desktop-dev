/**
 * Offline data initialization
 *
 * Handles startup tasks for offline mode:
 * - Preload relation caches
 * - Check sync status
 * - Initialize network monitoring
 */

import { preloadRelationCaches, clearRelationCache } from './offlineRelationHelpers';

/**
 * Initialize offline mode on app startup
 *
 * Call this in your app's main initialization (e.g., in App.tsx useEffect)
 */
export async function initializeOfflineMode(): Promise<void> {
  console.log('🔄 [Offline] Initializing offline mode...');

  try {
    // Preload relation caches for faster hydration
    await preloadRelationCaches();

    console.log('✅ [Offline] Offline mode initialized');
  } catch (err) {
    console.error('❌ [Offline] Failed to initialize offline mode:', err);
    // Don't throw - app should still work without offline mode
  }
}

/**
 * Handle sync completion
 *
 * Call this after the OfflineSyncService completes a dataset sync
 * to ensure relation caches are refreshed with latest data
 *
 * @param datasetsUpdated - Array of dataset names that were updated (e.g., ['products', 'categories'])
 */
export function handleSyncComplete(datasetsUpdated: string[]): void {
  console.log(`🔄 [Offline] Sync completed for: ${datasetsUpdated.join(', ')}`);

  // Clear relation caches if any related datasets were updated
  const relationDatasets = ['categories', 'product_types', 'taxes'];
  const shouldClearCache = datasetsUpdated.some(ds => relationDatasets.includes(ds));

  if (shouldClearCache) {
    console.log('🗑️ [Offline] Clearing relation caches after sync');
    clearRelationCache();

    // Optionally preload again immediately
    preloadRelationCaches().catch(err => {
      console.warn('⚠️ [Offline] Failed to preload caches after sync:', err);
    });
  }
}

/**
 * Export for manual cache control
 */
export { clearRelationCache, preloadRelationCaches } from './offlineRelationHelpers';
