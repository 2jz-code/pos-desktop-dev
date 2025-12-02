import { useState, useEffect, useCallback, useRef } from 'react';
import { useOnlineStatus } from './useOnlineStatus';

/**
 * Hook to track sync status for the POS terminal
 *
 * Provides real-time sync status including:
 * - Online/offline network state
 * - Syncing/flushing progress
 * - Pending order counts
 * - Offline exposure (transaction count, totals)
 * - Last sync timestamps
 *
 * Updates on:
 * - Network status changes
 * - Periodic polling (every 30s while online, 10s while offline)
 * - Manual refresh via refetch()
 *
 * @returns {Object} Sync status object
 */
export function useSyncStatus() {
  const isOnline = useOnlineStatus();
  const [status, setStatus] = useState({
    // Network
    isOnline: true,

    // Sync state
    isSyncing: false,
    isFlushingQueue: false,

    // Queue counts
    pendingOrders: 0,
    conflictOrders: 0,
    pendingOperations: 0,
    failedOperations: 0,

    // Exposure (offline transaction totals)
    exposure: {
      transactionCount: 0,
      cashTotal: 0,
      cardTotal: 0,
      totalExposure: 0,
      offlineSince: null,
    },

    // Timestamps
    lastSyncAttempt: null,
    lastSyncSuccess: null,
    lastFlushSuccess: null,
    minutesSinceLastSync: null,

    // Loading state
    isLoading: true,
    error: null,
  });

  const pollIntervalRef = useRef(null);

  /**
   * Fetch current status from OfflineSyncService
   */
  const fetchStatus = useCallback(async () => {
    try {
      // Dynamic import to avoid circular dependencies
      const offlineSyncService = (await import('@/services/OfflineSyncService')).default;
      const fullStatus = await offlineSyncService.getStatus();

      if (!fullStatus) {
        // Service not ready or error
        setStatus(prev => ({
          ...prev,
          isOnline,
          isLoading: false,
          error: 'Failed to get sync status',
        }));
        return;
      }

      setStatus({
        // Network
        isOnline,

        // Sync state from service
        isSyncing: fullStatus.isSyncing || false,
        isFlushingQueue: offlineSyncService.isFlushingQueue || false,

        // Queue counts
        pendingOrders: fullStatus.queue?.pending_orders || 0,
        conflictOrders: fullStatus.queue?.conflict_orders || 0,
        pendingOperations: fullStatus.queue?.pending_operations || 0,
        failedOperations: fullStatus.queue?.failed_operations || 0,

        // Exposure
        exposure: {
          transactionCount: fullStatus.exposure?.transaction_count || 0,
          cashTotal: fullStatus.exposure?.cash_total || 0,
          cardTotal: fullStatus.exposure?.card_total || 0,
          totalExposure: fullStatus.exposure?.total_exposure || 0,
          offlineSince: fullStatus.exposure?.offline_since || null,
        },

        // Timestamps
        lastSyncAttempt: fullStatus.sync?.last_sync_attempt || null,
        lastSyncSuccess: fullStatus.sync?.last_sync_success || null,
        lastFlushSuccess: fullStatus.sync?.last_flush_success || null,
        minutesSinceLastSync: fullStatus.sync?.minutes_since_last_sync || null,

        // Loading state
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('[useSyncStatus] Failed to fetch status:', error);
      setStatus(prev => ({
        ...prev,
        isOnline,
        isLoading: false,
        error: error.message,
      }));
    }
  }, [isOnline]);

  /**
   * Set up polling based on online status
   */
  useEffect(() => {
    // Initial fetch
    fetchStatus();

    // Poll more frequently when offline (10s) vs online (30s)
    const pollInterval = isOnline ? 30000 : 10000;

    pollIntervalRef.current = setInterval(fetchStatus, pollInterval);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isOnline, fetchStatus]);

  /**
   * Update immediately when network status changes
   */
  useEffect(() => {
    setStatus(prev => ({ ...prev, isOnline }));
    // Fetch fresh status when network changes
    fetchStatus();
  }, [isOnline, fetchStatus]);

  /**
   * Manual refetch function
   */
  const refetch = useCallback(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    ...status,
    refetch,

    // Computed helpers
    hasPendingWork: status.pendingOrders > 0 || status.pendingOperations > 0,
    hasConflicts: status.conflictOrders > 0,
    hasErrors: status.failedOperations > 0,
    isBusy: status.isSyncing || status.isFlushingQueue,

    // Summary for UI display
    statusSummary: getStatusSummary(status, isOnline),
  };
}

/**
 * Get human-readable status summary
 */
function getStatusSummary(status, isOnline) {
  if (!isOnline) {
    if (status.pendingOrders > 0) {
      return `Offline - ${status.pendingOrders} order${status.pendingOrders > 1 ? 's' : ''} pending`;
    }
    return 'Offline';
  }

  if (status.isSyncing) {
    return 'Syncing...';
  }

  if (status.isFlushingQueue) {
    return 'Uploading orders...';
  }

  if (status.pendingOrders > 0) {
    return `${status.pendingOrders} order${status.pendingOrders > 1 ? 's' : ''} pending sync`;
  }

  if (status.conflictOrders > 0) {
    return `${status.conflictOrders} order${status.conflictOrders > 1 ? 's' : ''} need review`;
  }

  if (status.failedOperations > 0) {
    return `${status.failedOperations} failed operation${status.failedOperations > 1 ? 's' : ''}`;
  }

  return 'Online';
}

export default useSyncStatus;
