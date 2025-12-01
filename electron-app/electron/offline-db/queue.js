/**
 * Queue management for pending offline operations
 *
 * Handles:
 * - Queuing operations for sync
 * - Tracking operation status
 * - Recording offline orders and payments
 * - Retry logic
 * - Purging old records
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Queue an operation for syncing
 * @param {import('better-sqlite3').Database} db
 * @param {Object} params
 * @param {string} params.type - 'ORDER', 'INVENTORY', 'APPROVAL'
 * @param {Object} params.payload - Operation payload
 * @param {string} params.orderId - Optional local order ID reference
 * @param {string} params.deviceSignature - HMAC signature
 * @returns {string} Operation ID
 */
export function queueOperation(db, { type, payload, orderId, deviceSignature }) {
  const operationId = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO pending_operations (
      id, type, payload, order_id, status, retries, created_at, updated_at, device_signature
    ) VALUES (?, ?, ?, ?, 'PENDING', 0, ?, ?, ?)
  `);

  stmt.run(
    operationId,
    type,
    JSON.stringify(payload),
    orderId,
    now,
    now,
    deviceSignature
  );

  return operationId;
}

/**
 * List pending operations
 * @param {import('better-sqlite3').Database} db
 * @param {Object} filters
 * @param {string} filters.status - Filter by status
 * @param {string} filters.type - Filter by type
 * @returns {Array} Pending operations
 */
export function listPendingOperations(db, filters = {}) {
  let query = 'SELECT * FROM pending_operations WHERE 1=1';
  const params = [];

  if (filters.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }

  if (filters.type) {
    query += ' AND type = ?';
    params.push(filters.type);
  }

  query += ' ORDER BY created_at ASC';

  const stmt = db.prepare(query);
  const operations = stmt.all(...params);

  return operations.map(op => ({
    ...op,
    payload: JSON.parse(op.payload),
    server_response: op.server_response ? JSON.parse(op.server_response) : null
  }));
}

/**
 * Get operation by ID
 */
export function getOperationById(db, operationId) {
  const stmt = db.prepare('SELECT * FROM pending_operations WHERE id = ?');
  const op = stmt.get(operationId);

  if (!op) return null;

  return {
    ...op,
    payload: JSON.parse(op.payload),
    server_response: op.server_response ? JSON.parse(op.server_response) : null
  };
}

/**
 * Mark operation as synced (successful)
 * @param {import('better-sqlite3').Database} db
 * @param {string} operationId
 * @param {Object} serverResponse - Response from backend
 */
export function markOperationSynced(db, operationId, serverResponse) {
  const stmt = db.prepare(`
    UPDATE pending_operations
    SET status = 'SENT',
        server_response = ?,
        updated_at = datetime('now'),
        error_message = NULL
    WHERE id = ?
  `);

  stmt.run(JSON.stringify(serverResponse), operationId);
}

/**
 * Mark operation as failed
 * @param {import('better-sqlite3').Database} db
 * @param {string} operationId
 * @param {string} errorMessage
 */
export function markOperationFailed(db, operationId, errorMessage) {
  const stmt = db.prepare(`
    UPDATE pending_operations
    SET status = 'FAILED',
        error_message = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `);

  stmt.run(errorMessage, operationId);
}

/**
 * Mark operation as sending (in progress)
 */
export function markOperationSending(db, operationId) {
  const stmt = db.prepare(`
    UPDATE pending_operations
    SET status = 'SENDING',
        updated_at = datetime('now')
    WHERE id = ?
  `);

  stmt.run(operationId);
}

/**
 * Increment retry counter for operation
 */
export function incrementRetryCounter(db, operationId) {
  const stmt = db.prepare(`
    UPDATE pending_operations
    SET retries = retries + 1,
        status = 'PENDING',
        updated_at = datetime('now')
    WHERE id = ?
  `);

  stmt.run(operationId);
}

/**
 * Delete operation (after successful sync)
 */
export function deleteOperation(db, operationId) {
  const stmt = db.prepare('DELETE FROM pending_operations WHERE id = ?');
  stmt.run(operationId);
}

/**
 * Purge old successful operations
 * @param {import('better-sqlite3').Database} db
 * @param {number} daysOld - Delete operations older than this many days
 */
export function purgeSuccessfulOperations(db, daysOld = 7) {
  const stmt = db.prepare(`
    DELETE FROM pending_operations
    WHERE status = 'SENT'
      AND datetime(created_at) < datetime('now', '-' || ? || ' days')
  `);

  const result = stmt.run(daysOld);
  return result.changes;
}

/**
 * Clear all pending operations (for debugging/reset)
 * @param {import('better-sqlite3').Database} db
 * @returns {Object} Count of deleted records from each table
 */
export function clearAllPendingData(db) {
  const operations = db.prepare('DELETE FROM pending_operations').run();
  const orders = db.prepare('DELETE FROM offline_orders').run();
  const payments = db.prepare('DELETE FROM offline_payments').run();
  const approvals = db.prepare('DELETE FROM offline_approvals WHERE synced = 0').run();

  return {
    pending_operations: operations.changes,
    offline_orders: orders.changes,
    offline_payments: payments.changes,
    offline_approvals: approvals.changes
  };
}

/**
 * Record an offline order
 * @param {import('better-sqlite3').Database} db
 * @param {Object} orderPayload - Full order payload
 * @returns {string} Local order ID
 */
export function recordOfflineOrder(db, orderPayload) {
  const localId = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO offline_orders (local_id, payload, status, created_at)
    VALUES (?, ?, 'PENDING', ?)
  `);

  stmt.run(localId, JSON.stringify(orderPayload), now);

  return localId;
}

/**
 * Get offline order by local ID
 */
export function getOfflineOrder(db, localId) {
  const stmt = db.prepare('SELECT * FROM offline_orders WHERE local_id = ?');
  const order = stmt.get(localId);

  if (!order) return null;

  return {
    ...order,
    payload: JSON.parse(order.payload)
  };
}

/**
 * Update offline order status after sync
 */
export function updateOfflineOrderStatus(db, localId, status, serverOrderId = null, serverOrderNumber = null, conflictReason = null) {
  const stmt = db.prepare(`
    UPDATE offline_orders
    SET status = ?,
        server_order_id = ?,
        server_order_number = ?,
        conflict_reason = ?,
        synced_at = CASE WHEN ? = 'SYNCED' THEN datetime('now') ELSE synced_at END
    WHERE local_id = ?
  `);

  stmt.run(status, serverOrderId, serverOrderNumber, conflictReason, status, localId);
}

/**
 * Delete offline order from local DB (after successful sync)
 */
export function deleteOfflineOrder(db, localId) {
  const stmt = db.prepare('DELETE FROM offline_orders WHERE local_id = ?');
  const result = stmt.run(localId);
  return result.changes > 0;
}

/**
 * List offline orders
 */
export function listOfflineOrders(db, status = null) {
  let query = 'SELECT * FROM offline_orders';
  const params = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC';

  const stmt = db.prepare(query);
  const orders = stmt.all(...params);

  return orders.map(order => ({
    ...order,
    payload: JSON.parse(order.payload)
  }));
}

/**
 * Record an offline payment
 * @param {import('better-sqlite3').Database} db
 * @param {Object} paymentData
 */
export function recordOfflinePayment(db, paymentData) {
  const paymentId = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO offline_payments (
      id, local_order_id, method, amount, tip, surcharge, status,
      transaction_id, provider_response, cash_tendered, change_given, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    paymentId,
    paymentData.local_order_id,
    paymentData.method,
    paymentData.amount,
    paymentData.tip || 0,
    paymentData.surcharge || 0,
    paymentData.status,
    paymentData.transaction_id,
    paymentData.provider_response ? JSON.stringify(paymentData.provider_response) : null,
    paymentData.cash_tendered,
    paymentData.change_given,
    now
  );

  return paymentId;
}

/**
 * Get payments for an offline order
 */
export function getOfflinePayments(db, localOrderId) {
  const stmt = db.prepare('SELECT * FROM offline_payments WHERE local_order_id = ?');
  const payments = stmt.all(localOrderId);

  return payments.map(p => ({
    ...p,
    provider_response: p.provider_response ? JSON.parse(p.provider_response) : null
  }));
}

/**
 * Record an offline approval
 * @param {import('better-sqlite3').Database} db
 * @param {Object} approvalData
 */
export function recordOfflineApproval(db, approvalData) {
  const approvalId = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO offline_approvals (
      id, user_id, pin, action, reference, local_order_id, value, notes, timestamp, synced
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);

  stmt.run(
    approvalId,
    approvalData.user_id,
    approvalData.pin,
    approvalData.action,
    approvalData.reference || '',
    approvalData.local_order_id,
    approvalData.value,
    approvalData.notes || '',
    now
  );

  return approvalId;
}

/**
 * Get unsynced approvals
 */
export function getUnsyncedApprovals(db) {
  const stmt = db.prepare('SELECT * FROM offline_approvals WHERE synced = 0 ORDER BY timestamp ASC');
  return stmt.all();
}

/**
 * Mark approvals as synced
 */
export function markApprovalsSynced(db, approvalIds) {
  if (!approvalIds || approvalIds.length === 0) return;

  const placeholders = approvalIds.map(() => '?').join(',');
  const stmt = db.prepare(`
    UPDATE offline_approvals
    SET synced = 1
    WHERE id IN (${placeholders})
  `);

  stmt.run(...approvalIds);
}

/**
 * Get queue statistics
 */
export function getQueueStats(db) {
  const pending = db.prepare('SELECT COUNT(*) as count FROM pending_operations WHERE status = ?').get('PENDING');
  const sending = db.prepare('SELECT COUNT(*) as count FROM pending_operations WHERE status = ?').get('SENDING');
  const failed = db.prepare('SELECT COUNT(*) as count FROM pending_operations WHERE status = ?').get('FAILED');
  const sent = db.prepare('SELECT COUNT(*) as count FROM pending_operations WHERE status = ?').get('SENT');

  const offlineOrders = db.prepare('SELECT COUNT(*) as count FROM offline_orders WHERE status = ?').get('PENDING');
  const conflictOrders = db.prepare('SELECT COUNT(*) as count FROM offline_orders WHERE status = ?').get('CONFLICT');

  return {
    pending_operations: pending.count,
    sending_operations: sending.count,
    failed_operations: failed.count,
    sent_operations: sent.count,
    pending_orders: offlineOrders.count,
    conflict_orders: conflictOrders.count
  };
}
