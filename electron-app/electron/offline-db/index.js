/**
 * Offline Database Module
 *
 * Main entry point for SQLite-based offline database.
 * Initializes connection, manages schema, and exports all sub-modules.
 */

import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { initializeSchema, dropAllTables } from './schema.js';
import * as datasets from './datasets.js';
import * as queue from './queue.js';
import * as meta from './meta.js';

let db = null;

/**
 * Get database file path
 * @returns {string} Path to offline-pos.db
 */
export function getDatabasePath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'offline-pos.db');
}

/**
 * Ensure backups directory exists
 */
function ensureBackupsDir() {
  const userDataPath = app.getPath('userData');
  const backupsDir = path.join(userDataPath, 'backups');

  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  return backupsDir;
}

/**
 * Create database backup
 */
export function createBackup() {
  if (!db) return null;

  const backupsDir = ensureBackupsDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupsDir, `offline-pos-${timestamp}.db.bak`);

  try {
    // Use SQLite backup API
    db.backup(backupPath);

    // Clean up old backups (keep last 7 days)
    cleanupOldBackups(backupsDir, 7);

    return backupPath;
  } catch (error) {
    console.error('Failed to create database backup:', error);
    return null;
  }
}

/**
 * Clean up old backup files
 */
function cleanupOldBackups(backupsDir, daysToKeep) {
  try {
    const files = fs.readdirSync(backupsDir);
    const now = Date.now();
    const maxAge = daysToKeep * 24 * 60 * 60 * 1000; // days to milliseconds

    for (const file of files) {
      if (!file.endsWith('.db.bak')) continue;

      const filePath = path.join(backupsDir, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtimeMs;

      if (age > maxAge) {
        fs.unlinkSync(filePath);
        console.log(`Deleted old backup: ${file}`);
      }
    }
  } catch (error) {
    console.error('Failed to cleanup old backups:', error);
  }
}

/**
 * Initialize the offline database
 * @param {Object} options
 * @param {boolean} options.verbose - Enable verbose logging
 * @param {boolean} options.reset - Drop all tables and reinitialize
 * @returns {Database} SQLite database instance
 */
export function initializeDatabase(options = {}) {
  if (db) {
    console.log('Database already initialized');
    return db;
  }

  const dbPath = getDatabasePath();
  console.log(`Initializing offline database at: ${dbPath}`);

  // Create database connection
  db = new Database(dbPath, {
    verbose: options.verbose ? console.log : null
  });

  // Drop tables if reset requested
  if (options.reset) {
    console.log('Resetting database (dropping all tables)...');
    dropAllTables(db);
  }

  // Initialize schema
  console.log('Initializing database schema...');
  initializeSchema(db);

  // Create initial backup
  console.log('Creating initial backup...');
  createBackup();

  console.log('Offline database initialized successfully');

  return db;
}

/**
 * Get database instance
 * @returns {Database}
 */
export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

/**
 * Close database connection
 */
export function closeDatabase() {
  if (db) {
    console.log('Closing offline database...');

    // Create final backup before closing
    createBackup();

    db.close();
    db = null;

    console.log('Offline database closed');
  }
}

/**
 * Vacuum database (compact and optimize)
 */
export function vacuumDatabase() {
  if (!db) return;

  console.log('Vacuuming database...');
  db.exec('VACUUM');
  console.log('Database vacuumed successfully');
}

/**
 * Get database statistics
 */
export function getDatabaseStats() {
  if (!db) return null;

  const stats = {
    path: getDatabasePath(),
    size_bytes: null,
    page_count: null,
    page_size: null,
    table_counts: {}
  };

  try {
    // Get file size
    const dbPath = getDatabasePath();
    if (fs.existsSync(dbPath)) {
      stats.size_bytes = fs.statSync(dbPath).size;
    }

    // Get page info
    const pageInfo = db.pragma('page_count; page_size');
    stats.page_count = pageInfo[0]?.page_count;
    stats.page_size = pageInfo[1]?.page_size;

    // Get record counts for each table
    const tables = [
      'datasets',
      'products',
      'categories',
      'modifier_sets',
      'discounts',
      'taxes',
      'product_types',
      'inventory_locations',
      'inventory_stocks',
      'settings',
      'users',
      'pending_operations',
      'offline_orders',
      'offline_payments',
      'offline_approvals',
      'device_meta'
    ];

    for (const table of tables) {
      const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
      stats.table_counts[table] = result.count;
    }
  } catch (error) {
    console.error('Failed to get database stats:', error);
  }

  return stats;
}

// Export sub-modules
export { datasets, queue, meta };

// Re-export frequently used functions at top level for convenience
export const {
  // Dataset operations
  updateDatasetVersion,
  getDatasetVersion,
  upsertProducts,
  upsertCategories,
  upsertModifierSets,
  upsertDiscounts,
  upsertTaxes,
  upsertProductTypes,
  upsertInventoryStocks,
  upsertInventoryLocations,
  upsertSettings,
  upsertUsers,
  deleteRecords,
  getProducts,
  getProductById,
  getProductByBarcode,
  getCategories,
  getDiscounts,
  getModifierSets,
  getTaxes,
  getProductTypes,
  getInventoryStocks,
  getInventoryByProductId,
  getInventoryLocations,
  getSettings,
  getUsers,
  getUserById
} = datasets;

export const {
  // Queue operations
  queueOperation,
  listPendingOperations,
  getOperationById,
  markOperationSynced,
  markOperationFailed,
  markOperationSending,
  incrementRetryCounter,
  deleteOperation,
  purgeSuccessfulOperations,
  clearAllPendingData,
  recordOfflineOrder,
  getOfflineOrder,
  updateOfflineOrderStatus,
  listOfflineOrders,
  recordOfflinePayment,
  getOfflinePayments,
  recordOfflineApproval,
  getUnsyncedApprovals,
  markApprovalsSynced,
  getQueueStats
} = queue;

export const {
  // Metadata operations
  getMetadata,
  setMetadata,
  getAllMetadata,
  incrementOfflineCounter,
  resetOfflineCounters,
  getOfflineExposure,
  updateNetworkStatus,
  getNetworkStatus,
  updateSyncTimestamp,
  getSyncStatus,
  checkLimitExceeded,
  getOfflineLimitsStatus,
  getCompleteStats,
  // Terminal pairing operations
  storePairingInfo,
  getPairingInfo,
  clearPairingInfo,
  isPaired
} = meta;
