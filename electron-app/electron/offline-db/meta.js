/**
 * Device metadata management
 *
 * Handles:
 * - Offline transaction limits and counters
 * - Network status tracking
 * - Sync timestamps
 * - Device state
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
 * Increment offline counter
 * @param {import('better-sqlite3').Database} db
 * @param {string} type - 'cash' or 'card'
 * @param {number} amount - Amount to add
 */
export function incrementOfflineCounter(db, type, amount) {
  const countKey = `offline_${type}_total`;
  const currentValue = parseFloat(getMetadata(db, countKey) || '0');
  const newValue = currentValue + amount;

  setMetadata(db, countKey, newValue.toFixed(2));

  // Also increment transaction count
  const countValue = parseInt(getMetadata(db, 'offline_transaction_count') || '0', 10);
  setMetadata(db, 'offline_transaction_count', String(countValue + 1));
}

/**
 * Reset offline counters (typically done daily or when synced)
 */
export function resetOfflineCounters(db) {
  setMetadata(db, 'offline_transaction_count', '0');
  setMetadata(db, 'offline_cash_total', '0');
  setMetadata(db, 'offline_card_total', '0');
}

/**
 * Get offline exposure (totals + counts)
 */
export function getOfflineExposure(db) {
  return {
    transaction_count: parseInt(getMetadata(db, 'offline_transaction_count') || '0', 10),
    cash_total: parseFloat(getMetadata(db, 'offline_cash_total') || '0'),
    card_total: parseFloat(getMetadata(db, 'offline_card_total') || '0'),
    total_exposure: parseFloat(getMetadata(db, 'offline_cash_total') || '0') + parseFloat(getMetadata(db, 'offline_card_total') || '0')
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

/**
 * Check if offline limit would be exceeded
 * @param {import('better-sqlite3').Database} db
 * @param {Object} limits - Terminal limits from backend
 * @param {string} type - 'cash' or 'card'
 * @param {number} amount - Proposed transaction amount
 * @returns {Object} { exceeded: boolean, reason: string }
 */
export function checkLimitExceeded(db, limits, type, amount) {
  if (!limits) {
    return { exceeded: false };
  }

  const exposure = getOfflineExposure(db);

  // Check transaction count limit
  if (limits.offline_transaction_count_limit && exposure.transaction_count >= limits.offline_transaction_count_limit) {
    return {
      exceeded: true,
      reason: `Transaction limit reached (${limits.offline_transaction_count_limit} transactions)`
    };
  }

  // Check single transaction limit (for cards)
  if (type === 'card' && limits.offline_transaction_limit && amount > limits.offline_transaction_limit) {
    return {
      exceeded: true,
      reason: `Single transaction limit exceeded ($${limits.offline_transaction_limit})`
    };
  }

  // Check daily total limit
  if (limits.offline_daily_limit) {
    const newTotal = exposure.total_exposure + amount;
    if (newTotal > limits.offline_daily_limit) {
      return {
        exceeded: true,
        reason: `Daily offline limit would be exceeded ($${limits.offline_daily_limit})`
      };
    }
  }

  return { exceeded: false };
}

/**
 * Get offline limits status
 */
export function getOfflineLimitsStatus(db, limits) {
  const exposure = getOfflineExposure(db);

  if (!limits) {
    return {
      transaction_count: { current: exposure.transaction_count, limit: null, percentage: 0 },
      cash_total: { current: exposure.cash_total, limit: null, percentage: 0 },
      card_total: { current: exposure.card_total, limit: null, percentage: 0 },
      daily_total: { current: exposure.total_exposure, limit: null, percentage: 0 }
    };
  }

  return {
    transaction_count: {
      current: exposure.transaction_count,
      limit: limits.offline_transaction_count_limit || null,
      percentage: limits.offline_transaction_count_limit
        ? (exposure.transaction_count / limits.offline_transaction_count_limit) * 100
        : 0
    },
    cash_total: {
      current: exposure.cash_total,
      limit: null, // No specific cash limit
      percentage: 0
    },
    card_total: {
      current: exposure.card_total,
      limit: null, // Tracked but no separate limit
      percentage: 0
    },
    daily_total: {
      current: exposure.total_exposure,
      limit: limits.offline_daily_limit || null,
      percentage: limits.offline_daily_limit
        ? (exposure.total_exposure / limits.offline_daily_limit) * 100
        : 0
    }
  };
}

/**
 * Get complete queue statistics including metadata
 */
export function getCompleteStats(db, limits = null) {
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
  const limitsStatus = getOfflineLimitsStatus(db, limits);

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
    sync: syncStatus,
    limits: limitsStatus
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
