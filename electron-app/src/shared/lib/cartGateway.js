/**
 * CartGateway - Routes cart operations based on online/offline status
 *
 * This service acts as the single entry point for all cart mutations.
 * It determines whether to:
 * - Online: Create order via API, connect WebSocket, send operations live
 * - Offline: Use local UUID, skip WebSocket, queue operations for later sync
 *
 * Key behaviors:
 * - Online path: Create real order → WebSocket for live updates → ingest on checkout
 * - Offline path: Local UUID → local state only → queue full order on checkout
 *
 * PAYLOAD CONTRACT: See @/shared/types/offlineSync.ts for type definitions.
 * - buildOfflineOrderPayload() creates StoredOfflineOrderPayload (for SQLite)
 * - OfflineSyncService.buildIngestPayload() transforms to OfflineOrderIngestPayload (for API)
 */

import { v4 as uuidv4 } from 'uuid';
import { cartSocket } from './cartSocket';

// Gateway state
let _store = null;
let _isOfflineMode = false;
let _localOrderId = null; // Used when offline - temporary local UUID

// Local-first sync state
let _operationQueue = []; // Queue of pending operations to sync
let _syncTimeout = null; // Throttle timer for background sync
const SYNC_THROTTLE_MS = 100; // Throttle background sync to 100ms

/**
 * Check if device is currently online
 * Uses navigator.onLine as primary check
 */
const checkOnlineStatus = () => {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
};

/**
 * Initialize the gateway with the Zustand store
 * Must be called once when the store is created
 */
export function initCartGateway(zustandStore) {
  _store = zustandStore;

  // Listen for online/offline events
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Also listen for Electron IPC network status if available
    if (window.electronAPI?.onNetworkStatusChanged) {
      window.electronAPI.onNetworkStatusChanged((status) => {
        if (status.isOnline) {
          handleOnline();
        } else {
          handleOffline();
        }
      });
    }
  }

  console.log('✅ [CartGateway] Initialized');
}

/**
 * Handle device coming online
 * Attempt to flush queued operations
 */
async function handleOnline() {
  console.log('🌐 [CartGateway] Device is online');
  _isOfflineMode = false;

  // Attempt to flush any pending offline orders
  // Wrap in try-catch to prevent errors from breaking the online handler
  try {
    const result = await flushOfflineOrders();
    if (result.synced > 0) {
      console.log(`🔄 [CartGateway] Auto-flushed on reconnect: ${result.synced} synced`);
    }
  } catch (error) {
    console.error('❌ [CartGateway] Failed to auto-flush on reconnect:', error);
  }
}

/**
 * Handle device going offline
 */
function handleOffline() {
  console.log('📡 [CartGateway] Device is offline');
  _isOfflineMode = true;

  // Disconnect WebSocket - no point keeping it open
  cartSocket.disconnect();
}

/**
 * Determine if we should operate in offline mode
 * Considers: network status, WebSocket connection, explicit offline flag
 */
export function isOfflineMode() {
  // Check network status
  const isOnline = checkOnlineStatus();

  // If explicitly set to offline mode or network is down
  return _isOfflineMode || !isOnline;
}

/**
 * Generate a local order ID for offline orders
 * These will be mapped to real server IDs after sync
 */
export function generateLocalOrderId() {
  _localOrderId = `local-${uuidv4()}`;
  return _localOrderId;
}

/**
 * Get the current local order ID (if in offline mode)
 */
export function getLocalOrderId() {
  return _localOrderId;
}

/**
 * Clear the local order ID (after sync or reset)
 */
export function clearLocalOrderId() {
  _localOrderId = null;
}

/**
 * Check if an order ID is a local (offline) ID
 */
export function isLocalOrderId(orderId) {
  return orderId && orderId.startsWith('local-');
}

// ============================================================================
// CART OPERATIONS - These route through the gateway
// ============================================================================

/**
 * Create or get order ID for cart operations
 *
 * Online: Creates order via API, returns real order ID
 * Offline: Returns local UUID, no API call
 *
 * @param {object} orderData - Order creation data
 * @param {function} createOrderFn - Function to create order via API
 * @returns {Promise<{orderId: string, isLocal: boolean}>}
 */
export async function getOrCreateOrderId(orderData, createOrderFn) {
  const state = _store?.getState();
  const existingOrderId = state?.orderId;

  // If we already have an order ID, use it
  if (existingOrderId) {
    return {
      orderId: existingOrderId,
      isLocal: isLocalOrderId(existingOrderId),
    };
  }

  // Check if we're offline
  if (isOfflineMode()) {
    console.log('📡 [CartGateway] Offline - creating local order ID');
    const localId = generateLocalOrderId();
    return {
      orderId: localId,
      isLocal: true,
    };
  }

  // Online - create real order via API
  try {
    console.log('🌐 [CartGateway] Online - creating order via API');
    const response = await createOrderFn(orderData);
    const orderId = response.data?.id || response.id;

    return {
      orderId,
      isLocal: false,
    };
  } catch (error) {
    console.error('❌ [CartGateway] Failed to create order, falling back to offline mode:', error);

    // Fall back to offline mode on failure
    _isOfflineMode = true;
    const localId = generateLocalOrderId();
    return {
      orderId: localId,
      isLocal: true,
    };
  }
}

/**
 * Initialize WebSocket connection if online and have real order ID
 *
 * @param {string} orderId - The order ID to connect to
 * @returns {Promise<boolean>} - Whether connection was established
 */
export async function initializeConnection(orderId) {
  // Don't connect if offline or using local order ID
  if (isOfflineMode() || isLocalOrderId(orderId)) {
    console.log('📡 [CartGateway] Skipping WebSocket - offline or local order');
    return false;
  }

  try {
    await cartSocket.connect(orderId);
    console.log('✅ [CartGateway] WebSocket connected');
    return true;
  } catch (error) {
    console.warn('⚠️ [CartGateway] WebSocket connection failed:', error);
    return false;
  }
}

/**
 * Flush operation queue to server via WebSocket
 * Called by throttled timer - sends all queued operations
 */
function flushOperationQueue() {
  if (_operationQueue.length === 0) return;
  if (isOfflineMode()) {
    console.log(`📡 [CartGateway] Skipping flush - offline mode`);
    return;
  }

  const operations = [..._operationQueue];
  _operationQueue = [];

  console.log(`🔄 [CartGateway] Flushing ${operations.length} operations to server`);

  // Send each operation via WebSocket
  // Could batch into single message if backend supports it
  for (const op of operations) {
    cartSocket.sendMessage(op);
  }
}

/**
 * Schedule a throttled flush of the operation queue
 * Ensures operations are batched and not sent individually
 */
function scheduleSync() {
  // If already scheduled, don't reschedule
  if (_syncTimeout) return;

  _syncTimeout = setTimeout(() => {
    _syncTimeout = null;
    flushOperationQueue();
  }, SYNC_THROTTLE_MS);
}

/**
 * Queue a cart operation for background sync
 *
 * LOCAL-FIRST APPROACH:
 * - Cart mutations update local state immediately (in cartSlice)
 * - Operations are queued here for background sync to server
 * - Throttled sync sends batched operations every SYNC_THROTTLE_MS
 * - Server broadcasts for admin visibility, reconciles on drift
 *
 * Offline: Operations stay local, only final order synced at checkout
 *
 * @param {object} message - The operation message to queue
 * @param {object} options - Options (immediate: true to bypass queue)
 * @returns {Promise<{sent: boolean, queued: boolean}>}
 */
export async function sendCartOperation(message, options = {}) {
  // Check if we're offline
  if (isOfflineMode()) {
    // When offline, cart operations are handled locally in cartSlice
    // They don't need to be queued - only the final order is synced at checkout
    console.log(`📡 [CartGateway] Offline - operation handled locally: ${message.type}`);
    return { sent: false, queued: false };
  }

  // If immediate flag is set, send directly (for critical operations)
  if (options.immediate) {
    cartSocket.sendMessage(message);
    return { sent: true, queued: false };
  }

  // Queue operation for background sync
  _operationQueue.push(message);
  console.log(`📥 [CartGateway] Queued operation: ${message.type} (queue size: ${_operationQueue.length})`);

  // Schedule throttled sync
  scheduleSync();

  return { sent: false, queued: true };
}

/**
 * Queue a complete offline order for sync
 * Called at checkout when offline
 *
 * @param {object} orderPayload - Complete order data including items, payments, etc.
 * @returns {Promise<{localId: string}>}
 */
export async function queueOfflineOrder(orderPayload) {
  if (!window.offlineAPI?.recordOfflineOrder) {
    throw new Error('Offline API not available');
  }

  console.log('📦 [CartGateway] Queueing offline order for sync');

  // recordOfflineOrder returns a string (the localId), not an object
  const localId = await window.offlineAPI.recordOfflineOrder(orderPayload);

  console.log(`✅ [CartGateway] Offline order queued with local ID: ${localId}`);

  // Return object with localId for consistency
  return { localId };
}

/**
 * Get count of pending offline orders
 * @returns {Promise<number>}
 */
export async function getPendingOrderCount() {
  if (!window.offlineAPI?.getQueueStats) {
    return 0;
  }

  try {
    const stats = await window.offlineAPI.getQueueStats();
    // getQueueStats returns: pending_orders, pending_operations, conflict_orders, etc.
    return (stats?.pending_orders || 0) + (stats?.pending_operations || 0);
  } catch (error) {
    console.error('❌ [CartGateway] Failed to get queue stats:', error);
    return 0;
  }
}

/**
 * Check if there are pending operations that need sync
 * @returns {Promise<boolean>}
 */
export async function hasPendingSync() {
  const count = await getPendingOrderCount();
  return count > 0;
}

// ============================================================================
// CHECKOUT FLOW
// ============================================================================

/**
 * Process checkout based on online/offline status
 *
 * Online: Standard payment flow via API
 * Offline: Queue order + cash payment for sync
 *
 * @param {object} checkoutData - Checkout data including payment info
 * @param {object} handlers - Handler functions for different scenarios
 * @returns {Promise<{success: boolean, isQueued: boolean, error?: string}>}
 */
export async function processCheckout(checkoutData, handlers = {}) {
  const { onOnlineCheckout, onOfflineCheckout, onError } = handlers;

  const state = _store?.getState();
  const orderId = state?.orderId;
  const isLocal = isLocalOrderId(orderId);

  // If offline or local order, queue for sync
  if (isOfflineMode() || isLocal) {
    console.log('📡 [CartGateway] Offline checkout - queueing order');

    // Only cash payments allowed offline
    if (checkoutData.paymentMethod !== 'CASH') {
      const error = 'Only cash payments are available offline';
      onError?.(error);
      return { success: false, isQueued: false, error };
    }

    try {
      // Build complete order payload
      const orderPayload = buildOfflineOrderPayload(state, checkoutData);

      // Queue the order
      const result = await queueOfflineOrder(orderPayload);

      // Call offline checkout handler
      await onOfflineCheckout?.(result);

      return { success: true, isQueued: true, localId: result.localId };
    } catch (error) {
      console.error('❌ [CartGateway] Failed to queue offline order:', error);
      onError?.(error.message);
      return { success: false, isQueued: false, error: error.message };
    }
  }

  // Online checkout
  console.log('🌐 [CartGateway] Online checkout');

  try {
    await onOnlineCheckout?.(checkoutData);
    return { success: true, isQueued: false };
  } catch (error) {
    console.error('❌ [CartGateway] Online checkout failed:', error);

    // If online checkout fails, offer to queue
    if (checkoutData.paymentMethod === 'CASH') {
      console.log('⚠️ [CartGateway] Online failed - attempting offline queue');
      _isOfflineMode = true;
      return processCheckout(checkoutData, handlers);
    }

    onError?.(error.message);
    return { success: false, isQueued: false, error: error.message };
  }
}

/**
 * Build offline order payload for queueing
 *
 * Supports two modes based on order ID type:
 * 1. local_order_id: Order created entirely offline (local-xxx ID)
 * 2. server_order_id: Order created online, then went offline mid-order (real UUID)
 *
 * The backend ingest service handles both:
 * - local_order_id → CREATE new order
 * - server_order_id → UPDATE existing order
 */
function buildOfflineOrderPayload(state, checkoutData) {
  // Determine if this is a server order (real UUID) or local order (local-xxx)
  const isServerOrder = !isLocalOrderId(state.orderId);

  return {
    // Order identification - mutually exclusive
    // server_order_id: Order was created online but went offline mid-order (UPDATE mode)
    // local_order_id: Order was created entirely offline (CREATE mode)
    ...(isServerOrder
      ? { server_order_id: state.orderId }
      : { local_order_id: state.orderId }),

    // Order metadata
    order_type: 'POS',
    dining_preference: state.diningPreference || 'TAKE_OUT',
    store_location: checkoutData.storeLocation,
    cashier_id: checkoutData.cashierId,

    // Customer info
    guest_first_name: state.customerFirstName,

    // Items
    items: state.items.map(item => ({
      product_id: item.product?.id || item.product_id,
      quantity: item.quantity,
      price_at_sale: item.price_at_sale,
      notes: item.notes,
      selected_modifiers: item.selected_modifiers_snapshot || item.modifiers,
    })),

    // Discounts
    discounts: state.appliedDiscounts?.map(d => ({
      discount_id: d.discount?.id || d.id,
      amount: d.amount,
    })) || [],

    // Adjustments
    adjustments: state.adjustments || [],

    // Totals (for verification on sync)
    subtotal: state.subtotal,
    tax_amount: state.taxAmount,
    total_discounts: state.totalDiscountsAmount,
    total_adjustments: state.totalAdjustmentsAmount,
    total: state.total,

    // Payment (cash only for offline)
    payment: {
      method: 'CASH',
      amount: checkoutData.cashAmount,
      tip: checkoutData.tip || 0,
    },

    // Timestamp
    created_offline_at: new Date().toISOString(),

    // Debug info
    _mode: isServerOrder ? 'UPDATE' : 'CREATE',
  };
}

// ============================================================================
// SYNC OPERATIONS
// ============================================================================

/**
 * Flush pending offline orders to server
 * Called when coming back online or explicitly triggered
 *
 * Delegates to OfflineSyncService.flushQueue() to avoid duplicate implementations
 *
 * @returns {Promise<{synced: number, failed: number}>}
 */
export async function flushOfflineOrders() {
  // Don't try to flush while offline
  if (isOfflineMode()) {
    console.log('📡 [CartGateway] Still offline, skipping flush');
    return { synced: 0, failed: 0 };
  }

  try {
    // Delegate to OfflineSyncService which has the consolidated flush logic
    const offlineSyncService = (await import('@/services/OfflineSyncService')).default;
    await offlineSyncService.flushQueue();

    // OfflineSyncService doesn't return counts, so we check remaining
    const remaining = await window.offlineAPI?.listOfflineOrders?.('PENDING') || [];
    const synced = remaining.length === 0 ? 1 : 0; // Approximate

    return { synced, failed: remaining.length };
  } catch (error) {
    console.error('❌ [CartGateway] Failed to flush:', error);
    return { synced: 0, failed: 1 };
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Disconnect and cleanup
 */
export function disconnectCartGateway() {
  cartSocket.disconnect();
  clearLocalOrderId();
  _isOfflineMode = false;

  // Clear sync state
  _operationQueue = [];
  if (_syncTimeout) {
    clearTimeout(_syncTimeout);
    _syncTimeout = null;
  }

  if (typeof window !== 'undefined') {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  }

  console.log('🔌 [CartGateway] Disconnected');
}

// Export the gateway object
export const cartGateway = {
  init: initCartGateway,
  isOfflineMode,
  generateLocalOrderId,
  getLocalOrderId,
  clearLocalOrderId,
  isLocalOrderId,
  getOrCreateOrderId,
  initializeConnection,
  sendCartOperation,
  queueOfflineOrder,
  getPendingOrderCount,
  hasPendingSync,
  processCheckout,
  flushOfflineOrders,
  disconnect: disconnectCartGateway,
};

export default cartGateway;
