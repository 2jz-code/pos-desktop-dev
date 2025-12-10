/**
 * Device metadata management
 *
 * Handles:
 * - Network status tracking
 * - Sync timestamps
 * - Device state
 * - Terminal pairing info
 */

/**
 * Get metadata value by key
 * @param {import('better-sqlite3').Database} db
 * @param {string} key
 * @returns {string|null}
 */
export function getMetadata(db, key) {
  const stmt = db.prepare('SELECT value FROM device_meta WHERE key = ?');
  const result = stmt.get(key);
  return result ? result.value : null;
}

/**
 * Set metadata value
 * @param {import('better-sqlite3').Database} db
 * @param {string} key
 * @param {string} value
 */
export function setMetadata(db, key, value) {
  const stmt = db.prepare(`
    INSERT INTO device_meta (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);

  stmt.run(key, String(value));
}

/**
 * Get all metadata as object
 */
export function getAllMetadata(db) {
  const stmt = db.prepare('SELECT key, value FROM device_meta');
  const rows = stmt.all();

  const meta = {};
  for (const row of rows) {
    meta[row.key] = row.value;
  }

  return meta;
}

/**
 * Get offline exposure stats (for telemetry/ops visibility, not limit enforcement)
 * Returns zeros since we don't track offline totals anymore - limits removed
 */
export function getOfflineExposure(db) {
  return {
    transaction_count: 0,
    cash_total: 0,
    card_total: 0,
    total_exposure: 0
  };
}

/**
 * Update network status
 * @param {import('better-sqlite3').Database} db
 * @param {boolean} isOnline
 */
export function updateNetworkStatus(db, isOnline) {
  const currentStatus = getMetadata(db, 'network_status');
  const newStatus = isOnline ? 'online' : 'offline';

  setMetadata(db, 'network_status', newStatus);

  // Track when we went offline
  if (!isOnline && currentStatus === 'online') {
    setMetadata(db, 'offline_since', new Date().toISOString());
  }

  // Clear offline_since when back online
  if (isOnline && currentStatus === 'offline') {
    setMetadata(db, 'offline_since', '');
  }
}

/**
 * Get network status
 */
export function getNetworkStatus(db) {
  const status = getMetadata(db, 'network_status');
  const offlineSince = getMetadata(db, 'offline_since');

  return {
    is_online: status === 'online',
    offline_since: offlineSince || null,
    offline_duration_minutes: offlineSince ? Math.floor((Date.now() - new Date(offlineSince).getTime()) / 1000 / 60) : 0
  };
}

/**
 * Update last sync timestamps
 * @param {import('better-sqlite3').Database} db
 * @param {boolean} success - Whether sync was successful
 */
export function updateSyncTimestamp(db, success = true) {
  const now = new Date().toISOString();

  setMetadata(db, 'last_sync_attempt', now);

  if (success) {
    setMetadata(db, 'last_sync_success', now);
  }
}

/**
 * Get sync status
 */
export function getSyncStatus(db) {
  const lastAttempt = getMetadata(db, 'last_sync_attempt');
  const lastSuccess = getMetadata(db, 'last_sync_success');

  return {
    last_sync_attempt: lastAttempt,
    last_sync_success: lastSuccess,
    minutes_since_last_sync: lastSuccess
      ? Math.floor((Date.now() - new Date(lastSuccess).getTime()) / 1000 / 60)
      : null
  };
}

// Offline spending limits removed - no limits enforced per product decision

/**
 * Get complete queue statistics including metadata
 */
export function getCompleteStats(db) {
  // Get queue stats
  const queueStats = db.prepare(`
    SELECT
      COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending,
      COUNT(CASE WHEN status = 'SENDING' THEN 1 END) as sending,
      COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed,
      COUNT(CASE WHEN status = 'SENT' THEN 1 END) as sent
    FROM pending_operations
  `).get();

  const offlineOrderStats = db.prepare(`
    SELECT
      COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending,
      COUNT(CASE WHEN status = 'CONFLICT' THEN 1 END) as conflicts
    FROM offline_orders
  `).get();

  const exposure = getOfflineExposure(db);
  const networkStatus = getNetworkStatus(db);
  const syncStatus = getSyncStatus(db);

  return {
    queue: {
      pending_operations: queueStats.pending,
      sending_operations: queueStats.sending,
      failed_operations: queueStats.failed,
      sent_operations: queueStats.sent,
      pending_orders: offlineOrderStats.pending,
      conflict_orders: offlineOrderStats.conflicts
    },
    exposure,
    network: networkStatus,
    sync: syncStatus
  };
}

/**
 * Store terminal pairing information
 * Called after successful terminal registration/pairing
 * @param {import('better-sqlite3').Database} db
 * @param {Object} pairingInfo
 * @param {string} pairingInfo.terminal_id - Terminal registration ID
 * @param {string} pairingInfo.tenant_id - Tenant UUID
 * @param {string} pairingInfo.tenant_slug - Tenant slug/name
 * @param {string} pairingInfo.location_id - Store location UUID
 * @param {string} pairingInfo.signing_secret - HMAC secret for device authentication
 */
export function storePairingInfo(db, { terminal_id, tenant_id, tenant_slug, location_id, signing_secret }) {
  const transaction = db.transaction(() => {
    setMetadata(db, 'terminal_id', terminal_id);
    setMetadata(db, 'tenant_id', tenant_id);
    setMetadata(db, 'tenant_slug', tenant_slug);
    setMetadata(db, 'location_id', location_id);
    setMetadata(db, 'signing_secret', signing_secret);
    setMetadata(db, 'paired_at', new Date().toISOString());
  });

  transaction();
}

/**
 * Get terminal pairing information
 * @param {import('better-sqlite3').Database} db
 * @returns {Object|null} Pairing info or null if not paired
 */
export function getPairingInfo(db) {
  const terminal_id = getMetadata(db, 'terminal_id');
  const tenant_id = getMetadata(db, 'tenant_id');
  const tenant_slug = getMetadata(db, 'tenant_slug');
  const location_id = getMetadata(db, 'location_id');
  const signing_secret = getMetadata(db, 'signing_secret');
  const paired_at = getMetadata(db, 'paired_at');

  // Return null if essential pairing info is missing
  if (!terminal_id || !tenant_id || !location_id) {
    return null;
  }

  return {
    terminal_id,
    tenant_id,
    tenant_slug,
    location_id,
    signing_secret,
    paired_at
  };
}

/**
 * Clear terminal pairing information
 * Called when terminal is unpaired or reset
 * @param {import('better-sqlite3').Database} db
 */
export function clearPairingInfo(db) {
  const transaction = db.transaction(() => {
    // Remove pairing metadata
    db.prepare('DELETE FROM device_meta WHERE key IN (?, ?, ?, ?, ?, ?)').run(
      'terminal_id',
      'tenant_id',
      'tenant_slug',
      'location_id',
      'signing_secret',
      'paired_at'
    );
  });

  transaction();
}

/**
 * Check if terminal is paired
 * @param {import('better-sqlite3').Database} db
 * @returns {boolean}
 */
export function isPaired(db) {
  return getPairingInfo(db) !== null;
}
