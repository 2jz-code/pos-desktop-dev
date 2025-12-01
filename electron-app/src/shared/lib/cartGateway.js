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
 */

import { v4 as uuidv4 } from 'uuid';
import { cartSocket } from './cartSocket';

// Gateway state
let _store = null;
let _isOfflineMode = false;
let _localOrderId = null; // Used when offline - temporary local UUID

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
 * Send a cart operation message
 *
 * Online: Sends via WebSocket
 * Offline: Operations are handled locally in cartSlice - NOT queued for sync
 *
 * Individual cart operations (ADD_ITEM, REMOVE_ITEM, etc.) are NOT queued
 * for later sync - only complete orders are queued at checkout time via
 * queueOfflineOrder(). Cart state is ephemeral and managed locally.
 *
 * @param {object} message - The message to send
 * @param {object} options - Options (deprecated, ignored)
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

  // Online - send via WebSocket
  cartSocket.sendMessage(message);
  return { sent: true, queued: false };
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
 */
function buildOfflineOrderPayload(state, checkoutData) {
  return {
    // Order metadata
    local_order_id: state.orderId,
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
      discount_id: d.id,
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

/**
 * Build the ingest payload for the backend
 * Maps from local storage format to backend API format
 */
function buildIngestPayload(order, pairingInfo, datasetVersions) {
  const payload = order.payload;

  // Use stable operation_id from local order for idempotency
  // This ensures retries return the cached result instead of creating duplicates
  const operationId = order.local_id || uuidv4();

  // IMPORTANT: created_at is used for auth freshness check (5 min window)
  // We must use current time for auth, but preserve the original offline timestamp separately
  const authTimestamp = new Date().toISOString();
  const originalOfflineTimestamp = payload.created_offline_at || order.created_at;

  return {
    // Operation metadata
    operation_id: operationId,
    device_id: pairingInfo.terminal_id,
    nonce: uuidv4().replace(/-/g, '').substring(0, 32), // 32-char hex nonce
    // created_at must be fresh for auth validation (5 min window)
    created_at: authTimestamp,
    // Store original offline timestamp separately for order creation
    offline_created_at: originalOfflineTimestamp,
    dataset_versions: datasetVersions,

    // Order details - nested in 'order' object
    order: {
      order_type: payload.order_type || 'POS',
      dining_preference: payload.dining_preference || 'TAKE_OUT',
      status: 'COMPLETED', // Offline orders are always completed at checkout
      store_location_id: payload.store_location,
      cashier_id: payload.cashier_id,
      guest_first_name: payload.guest_first_name || '',

      // Items with modifiers and item-level adjustments
      items: (payload.items || []).map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        price_at_sale: item.price_at_sale,
        notes: item.notes || '',
        // Map modifiers from snapshot (which now includes IDs) or selected_modifiers
        modifiers: extractModifiers(item),
        // Item-level adjustments - all types can apply at item level
        adjustments: (item.adjustments || [])
          .filter(adj => ['PRICE_OVERRIDE', 'TAX_EXEMPT', 'ONE_OFF_DISCOUNT', 'FEE_EXEMPT'].includes(adj.adjustment_type))
          .map(adj => ({
            adjustment_type: adj.adjustment_type,
            discount_type: adj.discount_type || null,
            // Clamp value to safe bound: 99999999.99 (8 digits + 2 decimal = 10 total)
            // Backend allows max_digits=12 but we use safer bound to prevent overflow
            value: parseFloat(Math.min(Math.abs(parseFloat(adj.value || 0)), 99999999.99).toFixed(2)),
            notes: adj.notes || '',
            approved_by_user_id: adj.approved_by_user_id || null,
          })),
      })),

      // Promotional/code discounts
      discounts: (payload.discounts || []).map(d => ({
        discount_id: d.discount_id,
        amount: parseFloat(d.amount),
      })),

      // Order-level adjustments - all types can apply at order level
      adjustments: (payload.adjustments || [])
        .filter(adj => ['ONE_OFF_DISCOUNT', 'FEE_EXEMPT', 'TAX_EXEMPT', 'PRICE_OVERRIDE'].includes(adj.adjustment_type))
        .map(adj => ({
          adjustment_type: adj.adjustment_type,
          discount_type: adj.discount_type || null,
          // Clamp value to safe bound: 99999999.99 (8 digits + 2 decimal = 10 total)
          // Backend allows max_digits=12 but we use safer bound to prevent overflow
          value: parseFloat(Math.min(Math.abs(parseFloat(adj.value || 0)), 99999999.99).toFixed(2)),
          notes: adj.notes || '',
          approved_by_user_id: adj.approved_by_user_id || null,
        })),

      // Totals
      subtotal: parseFloat(payload.subtotal || 0),
      tax: parseFloat(payload.tax_amount || 0),
      surcharge: parseFloat(payload.surcharge || 0),
      discount_total: parseFloat(payload.total_discounts || 0),
      total: parseFloat(payload.total || 0),
    },

    // Payments
    payments: [{
      method: payload.payment?.method || 'CASH',
      amount: parseFloat(parseFloat(payload.payment?.amount || payload.total || 0).toFixed(2)),
      tip: parseFloat(parseFloat(payload.payment?.tip || 0).toFixed(2)),
      surcharge: parseFloat(parseFloat(payload.payment?.surcharge || 0).toFixed(2)),
      status: 'COMPLETED',
      cash_tendered: payload.payment?.tendered
        ? parseFloat(parseFloat(payload.payment.tendered).toFixed(2))
        : null,
      change_given: payload.payment?.tendered
        ? parseFloat(Math.max(0, parseFloat(payload.payment.tendered) - parseFloat(payload.payment.amount || payload.total || 0)).toFixed(2))
        : null,
    }],

    // Inventory deltas - computed from items
    inventory_deltas: computeInventoryDeltas(payload, pairingInfo),

    // Approvals - collected from adjustments that required approval
    approvals: collectApprovals(payload),
  };
}

/**
 * Extract modifiers from item, handling both new and old data structures
 * New structure: selected_modifiers_snapshot with modifier_set_id and modifier_option_id
 * Old structure: selected_modifiers with option_id only
 */
function extractModifiers(item) {
  // Prefer snapshot which has full data including IDs
  const modifiers = item.selected_modifiers_snapshot || item.selected_modifiers || [];

  return modifiers
    .filter(mod => {
      // Must have both modifier_set_id and modifier_option_id (or option_id)
      const setId = mod.modifier_set_id;
      const optionId = mod.modifier_option_id || mod.option_id;
      return setId && optionId;
    })
    .map(mod => ({
      modifier_set_id: mod.modifier_set_id,
      modifier_option_id: mod.modifier_option_id || mod.option_id,
      price_delta: parseFloat(mod.price_delta ?? mod.price_at_sale ?? mod.price ?? 0),
    }));
}

/**
 * Compute inventory deltas from order items
 * Each item sold decrements stock at the terminal's location
 */
function computeInventoryDeltas(payload, pairingInfo) {
  const deltas = [];
  const locationId = payload.store_location || pairingInfo.location_id;

  if (!locationId) {
    console.warn('[CartGateway] No location ID for inventory deltas');
    return deltas;
  }

  for (const item of payload.items || []) {
    if (item.product_id && item.quantity > 0) {
      deltas.push({
        product_id: item.product_id,
        location_id: locationId,
        quantity_change: -item.quantity, // Negative = decrement
        reason: 'ORDER_DEDUCTION',
      });
    }
  }

  return deltas;
}

/**
 * Collect any approvals from adjustments that required manager approval
 */
function collectApprovals(payload) {
  const approvals = [];

  // Check order-level adjustments for approvals
  (payload.adjustments || []).forEach(adj => {
    if (adj.approved_by_user_id) {
      approvals.push({
        user_id: adj.approved_by_user_id,
        pin: adj.approval_pin || '', // May be empty if approval was done differently
        action: mapAdjustmentToApprovalAction(adj.adjustment_type),
        reference: payload.local_order_id,
        timestamp: payload.created_offline_at,
      });
    }
  });

  // Check item-level adjustments for approvals
  (payload.items || []).forEach(item => {
    (item.adjustments || []).forEach(adj => {
      if (adj.approved_by_user_id) {
        approvals.push({
          user_id: adj.approved_by_user_id,
          pin: adj.approval_pin || '',
          action: mapAdjustmentToApprovalAction(adj.adjustment_type),
          reference: `${payload.local_order_id}:${item.product_id}`,
          timestamp: payload.created_offline_at,
        });
      }
    });
  });

  return approvals;
}

/**
 * Map adjustment type to approval action
 */
function mapAdjustmentToApprovalAction(adjustmentType) {
  switch (adjustmentType) {
    case 'ONE_OFF_DISCOUNT':
      return 'DISCOUNT';
    case 'PRICE_OVERRIDE':
      return 'PRICE_OVERRIDE';
    case 'TAX_EXEMPT':
    case 'FEE_EXEMPT':
      return 'DISCOUNT'; // Tax/fee exemptions are similar to discounts
    default:
      return 'DISCOUNT';
  }
}


/**
 * Disconnect and cleanup
 */
export function disconnectCartGateway() {
  cartSocket.disconnect();
  clearLocalOrderId();
  _isOfflineMode = false;

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
