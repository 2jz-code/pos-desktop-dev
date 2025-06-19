import { app, ipcMain, session, BrowserWindow } from "electron";
import path from "node:path";
import process$1 from "node:process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import usb from "usb";
import Database from "better-sqlite3";
import fs from "node:fs";
import axios from "axios";
import path$1 from "path";
import { promises } from "fs";
import crypto from "crypto";
const require$1 = createRequire(import.meta.url);
const thermalPrinter = require$1("node-thermal-printer");
const { printer: ThermalPrinter, types: PrinterTypes } = thermalPrinter;
function printLine(printer, left, right) {
  printer.leftRight(left, right);
}
function formatReceipt(order) {
  var _a, _b;
  let printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    characterSet: "PC437_USA",
    interface: "tcp://dummy"
  });
  printer.alignCenter();
  printer.println("Ajeen Fresh");
  printer.println("2105 Cliff Rd #300");
  printer.println("Eagan, MN 55122");
  printer.println("Tel: (651) 412-5336");
  printer.println("");
  printer.alignLeft();
  const orderId = order.id || "N/A";
  const orderDate = new Date(order.created_at).toLocaleString("en-US", {
    timeZone: "America/Chicago"
  });
  printer.println(`Order #: ${orderId}`);
  printer.println(`Date: ${orderDate}`);
  printer.println("");
  printer.alignCenter();
  printer.bold(true);
  printer.println("ITEMS");
  printer.bold(false);
  printer.drawLine();
  printer.alignLeft();
  for (const item of order.items) {
    const price = parseFloat(item.price_at_sale) * item.quantity;
    const itemText = `${item.quantity}x ${item.product.name}`;
    printLine(printer, itemText, `$${price.toFixed(2)}`);
  }
  printer.drawLine();
  printLine(printer, "Subtotal:", `$${parseFloat(order.subtotal).toFixed(2)}`);
  if (parseFloat(order.total_discounts_amount) > 0) {
    printLine(
      printer,
      "Discount:",
      `-$${parseFloat(order.total_discounts_amount).toFixed(2)}`
    );
  }
  if (parseFloat(order.surcharges_total) > 0) {
    printLine(
      printer,
      "Service Fee:",
      `$${parseFloat(order.surcharges_total).toFixed(2)}`
    );
  }
  printLine(printer, "Tax:", `$${parseFloat(order.tax_total).toFixed(2)}`);
  const tip = ((_a = order.payment_details) == null ? void 0 : _a.tip) ? parseFloat(order.payment_details.tip) : 0;
  if (tip > 0) {
    printLine(printer, "Tip:", `$${tip.toFixed(2)}`);
  }
  printer.bold(true);
  printLine(
    printer,
    "TOTAL:",
    `$${parseFloat(order.total_with_tip).toFixed(2)}`
  );
  printer.bold(false);
  printer.println("");
  const transactions = ((_b = order.payment_details) == null ? void 0 : _b.transactions) || [];
  if (transactions.length > 0) {
    printer.bold(true);
    printer.println("Payment Details:");
    printer.bold(false);
    for (const [index, txn] of transactions.entries()) {
      const method = (txn.method || "N/A").toUpperCase();
      const amount = parseFloat(txn.amount).toFixed(2);
      printLine(printer, ` ${method} (${index + 1})`, `$${amount}`);
      if (method === "CASH") {
        const tendered = parseFloat(txn.cashTendered || 0).toFixed(2);
        const change = parseFloat(txn.change || 0).toFixed(2);
        if (parseFloat(tendered) > 0) {
          printLine(printer, "   Tendered:", `$${tendered}`);
          printLine(printer, "   Change:", `$${change}`);
        }
      } else if (method === "CREDIT" && txn.metadata) {
        const brand = txn.metadata.card_brand || "";
        const last4 = txn.metadata.card_last4 || "";
        if (brand && last4) {
          printer.println(`    ${brand} ****${last4}`);
        }
      }
    }
  }
  printer.println("");
  printer.alignCenter();
  printer.println("Thank You!");
  printer.println("Visit us at bakeajeen.com");
  printer.println("");
  printer.println("");
  printer.cut();
  return printer.getBuffer();
}
function formatOpenCashDrawer() {
  let printerInstance = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: "tcp://dummy"
  });
  printerInstance.openCashDrawer();
  return printerInstance.getBuffer();
}
function formatKitchenTicket(order, zoneName = "KITCHEN") {
  let printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    characterSet: "PC437_USA",
    interface: "tcp://dummy"
  });
  printer.alignCenter();
  printer.bold(true);
  printer.setTextSize(1, 1);
  printer.println(`${zoneName.toUpperCase()} TICKET`);
  printer.setTextNormal();
  printer.bold(false);
  printer.alignLeft();
  printer.println("");
  printer.bold(true);
  printer.println(`Order #: ${order.id}`);
  printer.bold(false);
  const orderDate = new Date(order.created_at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "America/Chicago"
  });
  printer.println(`Time: ${orderDate}`);
  printer.drawLine();
  for (const item of order.items) {
    printer.bold(true);
    printer.setTextSize(1, 1);
    printer.println(`${item.quantity}x ${item.product.name}`);
    printer.setTextNormal();
    printer.bold(false);
  }
  printer.println("");
  printer.println("");
  printer.cut();
  return printer.getBuffer();
}
class DatabaseService {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.backupInterval = null;
    this.config = {
      backupIntervalMinutes: parseInt(process.env.VITE_DEFAULT_BACKUP_INTERVAL_MINUTES) || 30,
      maxBackupsToKeep: parseInt(process.env.VITE_MAX_BACKUPS_TO_KEEP) || 10,
      autoBackupEnabled: process.env.VITE_AUTO_BACKUP_ENABLED !== "false"
    };
  }
  /**
   * Initialize the database connection and create tables if needed
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }
    try {
      const userDataPath = app.getPath("userData");
      const dbPath = path.join(userDataPath, "pos-cache.db");
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      const backupDir = path.join(userDataPath, "database-backups");
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      console.log(`[DatabaseService] Initializing database at: ${dbPath}`);
      this.db = new Database(dbPath);
      this.db.pragma("journal_mode = WAL");
      await this.createTables();
      await this.loadUserSettings();
      if (this.config.autoBackupEnabled) {
        this.startBackupSystem();
      }
      this.isInitialized = true;
      console.log("[DatabaseService] Database initialized successfully");
    } catch (error) {
      console.error("[DatabaseService] Failed to initialize database:", error);
      if (this.db) {
        try {
          console.log(
            "[DatabaseService] Attempting to recover by resetting database..."
          );
          this.db.close();
          const restored = await this.restoreFromBackup();
          if (restored) {
            console.log("[DatabaseService] Restored from backup successfully");
            this.db = new Database(
              path.join(app.getPath("userData"), "pos-cache.db")
            );
            this.db.pragma("journal_mode = WAL");
            this.isInitialized = true;
            if (this.config.autoBackupEnabled) {
              this.startBackupSystem();
            }
            return;
          }
          const userDataPath = app.getPath("userData");
          const dbPath = path.join(userDataPath, "pos-cache.db");
          if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
            console.log("[DatabaseService] Corrupted database file deleted");
          }
          this.db = new Database(dbPath);
          this.db.pragma("journal_mode = WAL");
          await this.createTables();
          this.isInitialized = true;
          if (this.config.autoBackupEnabled) {
            this.startBackupSystem();
          }
          console.log(
            "[DatabaseService] Database recovered and initialized successfully"
          );
        } catch (recoveryError) {
          console.error(
            "[DatabaseService] Failed to recover database:",
            recoveryError
          );
          throw recoveryError;
        }
      } else {
        throw error;
      }
    }
  }
  /**
   * Load user settings for backup configuration
   */
  async loadUserSettings() {
    try {
      const stmt = this.db.prepare(
        "SELECT value FROM sync_metadata WHERE key = ?"
      );
      const result = stmt.get("user_settings");
      if (result == null ? void 0 : result.value) {
        const userSettings = JSON.parse(result.value);
        if (userSettings.backupIntervalMinutes) {
          this.config.backupIntervalMinutes = userSettings.backupIntervalMinutes;
        }
        if (userSettings.maxBackupsToKeep) {
          this.config.maxBackupsToKeep = userSettings.maxBackupsToKeep;
        }
        if (userSettings.autoBackupEnabled !== void 0) {
          this.config.autoBackupEnabled = userSettings.autoBackupEnabled;
        }
        console.log("[DatabaseService] User backup settings loaded:", {
          interval: this.config.backupIntervalMinutes,
          maxBackups: this.config.maxBackupsToKeep,
          autoEnabled: this.config.autoBackupEnabled
        });
      }
    } catch (error) {
      console.warn(
        "[DatabaseService] Failed to load user backup settings:",
        error
      );
    }
  }
  /**
   * Start automatic backup system
   */
  startBackupSystem() {
    this.stopBackupSystem();
    if (!this.config.autoBackupEnabled) {
      console.log("[DatabaseService] Auto-backup is disabled");
      return;
    }
    const intervalMs = this.config.backupIntervalMinutes * 60 * 1e3;
    console.log(
      `[DatabaseService] Starting auto-backup every ${this.config.backupIntervalMinutes} minutes`
    );
    this.backupInterval = setInterval(() => {
      this.createBackup().catch((error) => {
        console.warn("[DatabaseService] Backup failed:", error);
      });
    }, intervalMs);
    setTimeout(() => {
      this.createBackup().catch((error) => {
        console.warn("[DatabaseService] Initial backup failed:", error);
      });
    }, 5e3);
  }
  /**
   * Stop automatic backup system
   */
  stopBackupSystem() {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = null;
      console.log("[DatabaseService] Auto-backup stopped");
    }
  }
  /**
   * Update backup configuration
   */
  async updateBackupConfig(settings) {
    if (settings.backupIntervalMinutes) {
      this.config.backupIntervalMinutes = settings.backupIntervalMinutes;
    }
    if (settings.maxBackupsToKeep) {
      this.config.maxBackupsToKeep = settings.maxBackupsToKeep;
    }
    if (settings.autoBackupEnabled !== void 0) {
      this.config.autoBackupEnabled = settings.autoBackupEnabled;
    }
    console.log("[DatabaseService] Backup configuration updated:", this.config);
    if (this.config.autoBackupEnabled) {
      this.startBackupSystem();
    } else {
      this.stopBackupSystem();
    }
  }
  /**
   * Create a backup of the current database
   */
  async createBackup() {
    if (!this.isInitialized || !this.db) return;
    try {
      const userDataPath = app.getPath("userData");
      const backupDir = path.join(userDataPath, "database-backups");
      const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
      const backupPath = path.join(
        backupDir,
        `pos-cache-backup-${timestamp}.db`
      );
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const sourceDbPath = path.join(userDataPath, "pos-cache.db");
      try {
        const stmt = this.db.prepare(`VACUUM INTO ?`);
        stmt.run(backupPath);
        console.log(
          `[DatabaseService] Backup created using VACUUM INTO: ${backupPath}`
        );
      } catch (vacuumError) {
        console.warn(
          "[DatabaseService] VACUUM INTO failed, trying file copy method:",
          vacuumError
        );
        try {
          this.db.checkpoint();
        } catch (checkpointError) {
          console.warn(
            "[DatabaseService] Checkpoint failed, continuing with backup:",
            checkpointError
          );
        }
        if (fs.existsSync(sourceDbPath)) {
          fs.copyFileSync(sourceDbPath, backupPath);
          console.log(
            `[DatabaseService] Backup created using file copy: ${backupPath}`
          );
        } else {
          throw new Error("Source database file does not exist");
        }
      }
      await this.cleanupOldBackups(backupDir);
      if (fs.existsSync(backupPath)) {
        const stats = fs.statSync(backupPath);
        if (stats.size > 0) {
          console.log(
            `[DatabaseService] Backup validation successful. Size: ${stats.size} bytes`
          );
        } else {
          console.warn("[DatabaseService] Backup file created but is empty");
        }
      } else {
        console.error("[DatabaseService] Backup file was not created");
      }
    } catch (error) {
      console.error("[DatabaseService] Failed to create backup:", error);
    }
  }
  /**
   * Manually trigger a backup (for testing or on-demand backup)
   */
  async createManualBackup() {
    console.log("[DatabaseService] Creating manual backup...");
    await this.createBackup();
    return true;
  }
  /**
   * Clean up old backup files
   */
  async cleanupOldBackups(backupDir) {
    try {
      const files = fs.readdirSync(backupDir).filter(
        (file) => file.startsWith("pos-cache-backup-") && file.endsWith(".db")
      ).map((file) => ({
        name: file,
        path: path.join(backupDir, file),
        stats: fs.statSync(path.join(backupDir, file))
      })).sort((a, b) => b.stats.mtime - a.stats.mtime);
      if (files.length > this.config.maxBackupsToKeep) {
        const filesToDelete = files.slice(this.config.maxBackupsToKeep);
        for (const file of filesToDelete) {
          fs.unlinkSync(file.path);
          console.log(`[DatabaseService] Cleaned up old backup: ${file.name}`);
        }
      }
    } catch (error) {
      console.warn("[DatabaseService] Failed to cleanup old backups:", error);
    }
  }
  /**
   * Restore database from the most recent backup
   */
  async restoreFromBackup() {
    try {
      const userDataPath = app.getPath("userData");
      const backupDir = path.join(userDataPath, "database-backups");
      if (!fs.existsSync(backupDir)) {
        console.log("[DatabaseService] No backup directory found");
        return false;
      }
      const backupFiles = fs.readdirSync(backupDir).filter(
        (file) => file.startsWith("pos-cache-backup-") && file.endsWith(".db")
      ).map((file) => ({
        name: file,
        path: path.join(backupDir, file),
        stats: fs.statSync(path.join(backupDir, file))
      })).sort((a, b) => b.stats.mtime - a.stats.mtime);
      if (backupFiles.length === 0) {
        console.log("[DatabaseService] No backup files found");
        return false;
      }
      const latestBackup = backupFiles[0];
      const dbPath = path.join(userDataPath, "pos-cache.db");
      fs.copyFileSync(latestBackup.path, dbPath);
      console.log(
        `[DatabaseService] Restored from backup: ${latestBackup.name}`
      );
      return true;
    } catch (error) {
      console.error("[DatabaseService] Failed to restore from backup:", error);
      return false;
    }
  }
  /**
   * Create all necessary tables
   */
  createTables() {
    try {
      this.db.exec(`CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                parent_id INTEGER,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                backend_updated_at DATETIME
            )`);
      this.db.exec(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                username TEXT UNIQUE,
                email TEXT,
                first_name TEXT,
                last_name TEXT,
                role TEXT,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                backend_updated_at DATETIME
            )`);
      this.db.exec(`CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                price REAL NOT NULL,
                category_id INTEGER,
                product_type_id INTEGER,
                image_url TEXT,
                local_image_path TEXT,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                backend_updated_at DATETIME,
                FOREIGN KEY (category_id) REFERENCES categories(id)
            )`);
      this.db.exec(`CREATE TABLE IF NOT EXISTS discounts (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                scope TEXT DEFAULT 'ORDER',
                value REAL NOT NULL,
                min_purchase_amount REAL NULL,
                buy_quantity INTEGER NULL,
                get_quantity INTEGER NULL,
                start_date DATETIME NULL,
                end_date DATETIME NULL,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                backend_updated_at DATETIME
            )`);
      this.db.exec(`CREATE TABLE IF NOT EXISTS offline_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_data TEXT NOT NULL,
                status TEXT DEFAULT 'PENDING_SYNC',
                retry_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_attempt_at DATETIME,
                error_message TEXT
            )`);
      this.db.exec(`CREATE TABLE IF NOT EXISTS sync_metadata (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
      const indexes = [
        "CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)",
        "CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active)",
        "CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id)",
        "CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active)",
        "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",
        "CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active)",
        "CREATE INDEX IF NOT EXISTS idx_discounts_active ON discounts(is_active)",
        "CREATE INDEX IF NOT EXISTS idx_discounts_type ON discounts(type)",
        "CREATE INDEX IF NOT EXISTS idx_offline_orders_status ON offline_orders(status)",
        "CREATE INDEX IF NOT EXISTS idx_backend_updated_products ON products(backend_updated_at)",
        "CREATE INDEX IF NOT EXISTS idx_backend_updated_categories ON categories(backend_updated_at)",
        "CREATE INDEX IF NOT EXISTS idx_backend_updated_users ON users(backend_updated_at)",
        "CREATE INDEX IF NOT EXISTS idx_backend_updated_discounts ON discounts(backend_updated_at)"
      ];
      indexes.forEach((sql) => {
        try {
          this.db.exec(sql);
        } catch (error) {
          console.warn(
            `[DatabaseService] Failed to create index: ${sql}`,
            error
          );
        }
      });
      console.log("[DatabaseService] Tables and indexes created successfully");
    } catch (error) {
      console.error("[DatabaseService] Failed to create tables:", error);
      throw error;
    }
  }
  /**
   * Get the database instance
   */
  getDatabase() {
    if (!this.isInitialized) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.db;
  }
  /**
   * Execute a transaction
   */
  transaction(callback) {
    return this.db.transaction(callback)();
  }
  /**
   * Close the database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
      console.log("[DatabaseService] Database connection closed");
    }
  }
  /**
   * Get last sync timestamp for a specific table
   */
  getLastSyncTimestamp(tableName) {
    const stmt = this.db.prepare(
      "SELECT value FROM sync_metadata WHERE key = ?"
    );
    const result = stmt.get(`${tableName}_last_sync`);
    return result ? result.value : null;
  }
  /**
   * Update last sync timestamp for a specific table
   */
  updateLastSyncTimestamp(tableName, timestamp = (/* @__PURE__ */ new Date()).toISOString()) {
    const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `);
    stmt.run(`${tableName}_last_sync`, timestamp);
  }
  /**
   * Clear/reset the database completely
   */
  async resetDatabase() {
    if (!this.isInitialized) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    try {
      console.log("[DatabaseService] Resetting database...");
      const tables = [
        "products",
        "categories",
        "users",
        "discounts",
        "offline_orders",
        "sync_metadata"
      ];
      tables.forEach((table) => {
        try {
          this.db.exec(`DROP TABLE IF EXISTS ${table}`);
        } catch (error) {
          console.warn(
            `[DatabaseService] Failed to drop table ${table}:`,
            error
          );
        }
      });
      await this.createTables();
      console.log("[DatabaseService] Database reset successfully");
    } catch (error) {
      console.error("[DatabaseService] Failed to reset database:", error);
      throw error;
    }
  }
}
const databaseService = new DatabaseService();
class BaseRepository {
  constructor(tableName) {
    this.tableName = tableName;
  }
  get db() {
    return databaseService.getDatabase();
  }
  /**
   * Sanitize data for SQLite compatibility
   */
  sanitizeRecord(record) {
    const sanitized = {};
    for (const [key, value] of Object.entries(record)) {
      if (value === null || value === void 0) {
        sanitized[key] = null;
      } else if (typeof value === "boolean") {
        sanitized[key] = value ? 1 : 0;
      } else if (typeof value === "object" && value !== null) {
        if (value instanceof Date) {
          sanitized[key] = value.toISOString();
        } else if (Array.isArray(value)) {
          sanitized[key] = JSON.stringify(value);
        } else {
          sanitized[key] = JSON.stringify(value);
        }
      } else if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
        sanitized[key] = value;
      } else {
        sanitized[key] = String(value);
      }
    }
    return sanitized;
  }
  /**
   * Get all records
   */
  getAll() {
    const stmt = this.db.prepare(
      `SELECT * FROM ${this.tableName} WHERE is_active = 1`
    );
    return stmt.all();
  }
  /**
   * Get record by ID
   */
  getById(id) {
    const stmt = this.db.prepare(
      `SELECT * FROM ${this.tableName} WHERE id = ?`
    );
    return stmt.get(id);
  }
  /**
   * Delete all records and insert new ones (for full sync)
   */
  replaceAll(records) {
    const transaction = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM ${this.tableName}`).run();
      if (records && records.length > 0) {
        this.insertMany(records);
      }
    });
    transaction();
  }
  /**
   * Insert multiple records
   */
  insertMany(records) {
    if (!records || records.length === 0) return;
    const sanitizedRecords = records.map(
      (record) => this.sanitizeRecord(record)
    );
    const columns = Object.keys(sanitizedRecords[0]);
    const placeholders = columns.map(() => "?").join(", ");
    const sql = `INSERT OR REPLACE INTO ${this.tableName} (${columns.join(
      ", "
    )}) VALUES (${placeholders})`;
    const stmt = this.db.prepare(sql);
    const insertMany = this.db.transaction((records2) => {
      for (const record of records2) {
        const values = columns.map((col) => record[col]);
        stmt.run(...values);
      }
    });
    insertMany(sanitizedRecords);
  }
  /**
   * Update records based on backend timestamp (for delta sync)
   */
  updateFromBackend(records) {
    if (!records || records.length === 0) return;
    const transaction = this.db.transaction(() => {
      for (const record of records) {
        const existing = this.getById(record.id);
        if (existing) {
          this.updateRecord(record);
        } else {
          this.insertRecord(record);
        }
      }
    });
    transaction();
  }
  /**
   * Insert a single record
   */
  insertRecord(record) {
    const sanitizedRecord = this.sanitizeRecord(record);
    const columns = Object.keys(sanitizedRecord);
    const placeholders = columns.map(() => "?").join(", ");
    const sql = `INSERT OR REPLACE INTO ${this.tableName} (${columns.join(
      ", "
    )}) VALUES (${placeholders})`;
    const stmt = this.db.prepare(sql);
    const values = columns.map((col) => sanitizedRecord[col]);
    return stmt.run(...values);
  }
  /**
   * Update a single record
   */
  updateRecord(record) {
    const sanitizedRecord = this.sanitizeRecord(record);
    const columns = Object.keys(sanitizedRecord).filter((col) => col !== "id");
    const setClause = columns.map((col) => `${col} = ?`).join(", ");
    const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    const values = columns.map((col) => sanitizedRecord[col]);
    values.push(sanitizedRecord.id);
    return stmt.run(...values);
  }
}
class ProductRepository extends BaseRepository {
  constructor() {
    super("products");
  }
  /**
   * Get all products with category information
   */
  getAll() {
    const stmt = this.db.prepare(`
            SELECT 
                p.*,
                c.id as category_id,
                c.name as category_name,
                c.description as category_description,
                c.parent_id as category_parent_id,
                parent_c.id as parent_category_id,
                parent_c.name as parent_category_name
            FROM ${this.tableName} p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN categories parent_c ON c.parent_id = parent_c.id
            WHERE p.is_active = 1
        `);
    const rows = stmt.all();
    return rows.map((row) => {
      const product = {
        id: row.id,
        name: row.name,
        description: row.description,
        price: row.price,
        product_type_id: row.product_type_id,
        image_url: row.image_url,
        local_image_path: row.local_image_path,
        is_active: row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at,
        backend_updated_at: row.backend_updated_at,
        category: null
      };
      if (row.category_id) {
        product.category = {
          id: row.category_id,
          name: row.category_name,
          description: row.category_description,
          parent_id: row.category_parent_id,
          parent: row.parent_category_id ? {
            id: row.parent_category_id,
            name: row.parent_category_name
          } : null
        };
      }
      return product;
    });
  }
  /**
   * Get record by ID with category information
   */
  getById(id) {
    const stmt = this.db.prepare(`
            SELECT 
                p.*,
                c.id as category_id,
                c.name as category_name,
                c.description as category_description,
                c.parent_id as category_parent_id,
                parent_c.id as parent_category_id,
                parent_c.name as parent_category_name
            FROM ${this.tableName} p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN categories parent_c ON c.parent_id = parent_c.id
            WHERE p.id = ?
        `);
    const row = stmt.get(id);
    if (!row) return null;
    const product = {
      id: row.id,
      name: row.name,
      description: row.description,
      price: row.price,
      product_type_id: row.product_type_id,
      image_url: row.image_url,
      local_image_path: row.local_image_path,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
      backend_updated_at: row.backend_updated_at,
      category: null
    };
    if (row.category_id) {
      product.category = {
        id: row.category_id,
        name: row.category_name,
        description: row.category_description,
        parent_id: row.category_parent_id,
        parent: row.parent_category_id ? {
          id: row.parent_category_id,
          name: row.parent_category_name
        } : null
      };
    }
    return product;
  }
  /**
   * Get products by category
   */
  getByCategory(categoryId) {
    const stmt = this.db.prepare(`
            SELECT 
                p.*,
                c.id as category_id,
                c.name as category_name,
                c.description as category_description,
                c.parent_id as category_parent_id,
                parent_c.id as parent_category_id,
                parent_c.name as parent_category_name
            FROM ${this.tableName} p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN categories parent_c ON c.parent_id = parent_c.id
            WHERE p.category_id = ? AND p.is_active = 1
        `);
    const rows = stmt.all(categoryId);
    return rows.map((row) => {
      const product = {
        id: row.id,
        name: row.name,
        description: row.description,
        price: row.price,
        product_type_id: row.product_type_id,
        image_url: row.image_url,
        local_image_path: row.local_image_path,
        is_active: row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at,
        backend_updated_at: row.backend_updated_at,
        category: null
      };
      if (row.category_id) {
        product.category = {
          id: row.category_id,
          name: row.category_name,
          description: row.category_description,
          parent_id: row.category_parent_id,
          parent: row.parent_category_id ? {
            id: row.parent_category_id,
            name: row.parent_category_name
          } : null
        };
      }
      return product;
    });
  }
  /**
   * Search products by name
   */
  searchByName(searchTerm) {
    const stmt = this.db.prepare(`
            SELECT 
                p.*,
                c.id as category_id,
                c.name as category_name,
                c.description as category_description,
                c.parent_id as category_parent_id,
                parent_c.id as parent_category_id,
                parent_c.name as parent_category_name
            FROM ${this.tableName} p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN categories parent_c ON c.parent_id = parent_c.id
            WHERE p.name LIKE ? AND p.is_active = 1
        `);
    const rows = stmt.all(`%${searchTerm}%`);
    return rows.map((row) => {
      const product = {
        id: row.id,
        name: row.name,
        description: row.description,
        price: row.price,
        product_type_id: row.product_type_id,
        image_url: row.image_url,
        local_image_path: row.local_image_path,
        is_active: row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at,
        backend_updated_at: row.backend_updated_at,
        category: null
      };
      if (row.category_id) {
        product.category = {
          id: row.category_id,
          name: row.category_name,
          description: row.category_description,
          parent_id: row.category_parent_id,
          parent: row.parent_category_id ? {
            id: row.parent_category_id,
            name: row.parent_category_name
          } : null
        };
      }
      return product;
    });
  }
  /**
   * Get products with local images
   */
  getProductsWithLocalImages() {
    const stmt = this.db.prepare(`
            SELECT * FROM ${this.tableName} 
            WHERE local_image_path IS NOT NULL AND is_active = 1
        `);
    return stmt.all();
  }
  /**
   * Update local image path for a product
   */
  updateLocalImagePath(productId, localPath) {
    const stmt = this.db.prepare(`
            UPDATE ${this.tableName} 
            SET local_image_path = ? 
            WHERE id = ?
        `);
    return stmt.run(localPath, productId);
  }
}
class CategoryRepository extends BaseRepository {
  constructor() {
    super("categories");
  }
  /**
   * Override replaceAll to handle hierarchical data properly
   * Categories have parent-child relationships that need special handling
   */
  replaceAll(records) {
    if (!records || records.length === 0) {
      const transaction2 = this.db.transaction(() => {
        this.db.prepare(`DELETE FROM products`).run();
        this.db.prepare(`DELETE FROM ${this.tableName}`).run();
      });
      transaction2();
      return;
    }
    const transaction = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM products`).run();
      this.db.prepare(`DELETE FROM ${this.tableName}`).run();
      this.insertCategoriesHierarchically(records);
    });
    transaction();
  }
  /**
   * Insert categories in the correct order to respect foreign key constraints.
   * This iterative method is robust against unordered data, orphans, and circular dependencies.
   */
  insertCategoriesHierarchically(categories) {
    const categoryMap = new Map(categories.map((c) => [c.id, c]));
    const recordsToInsert = [...categories];
    const insertedIds = /* @__PURE__ */ new Set();
    let lastRoundCount = -1;
    while (recordsToInsert.length > 0 && recordsToInsert.length !== lastRoundCount) {
      lastRoundCount = recordsToInsert.length;
      const remainingRecords = [];
      for (const record of recordsToInsert) {
        if (!record.parent_id || insertedIds.has(record.parent_id)) {
          try {
            this.insertRecord(record);
            insertedIds.add(record.id);
          } catch (e) {
            console.error(
              `Error inserting category ${record.name}: ${e.message}`
            );
          }
        } else {
          if (categoryMap.has(record.parent_id)) {
            remainingRecords.push(record);
          } else {
            console.error(
              `Skipping orphan category "${record.name}" (ID: ${record.id}). Parent ID ${record.parent_id} not found in sync payload.`
            );
          }
        }
      }
      recordsToInsert.splice(0, recordsToInsert.length, ...remainingRecords);
    }
    if (recordsToInsert.length > 0) {
      console.error(
        "Could not insert the following categories due to circular dependencies or missing parents:",
        recordsToInsert.map((r) => r.name)
      );
    }
  }
  /**
   * Get categories with product count
   */
  getCategoriesWithProductCount() {
    const stmt = this.db.prepare(`
            SELECT c.*, COUNT(p.id) as product_count
            FROM categories c
            LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
            WHERE c.is_active = 1
            GROUP BY c.id
        `);
    return stmt.all();
  }
}
class UserRepository extends BaseRepository {
  constructor() {
    super("users");
  }
  /**
   * Get user by username
   */
  getByUsername(username) {
    const stmt = this.db.prepare(`
            SELECT * FROM ${this.tableName} 
            WHERE username = ? AND is_active = 1
        `);
    return stmt.get(username);
  }
  /**
   * Get users by role
   */
  getByRole(role) {
    const stmt = this.db.prepare(`
            SELECT * FROM ${this.tableName} 
            WHERE role = ? AND is_active = 1
        `);
    return stmt.all(role);
  }
}
class DiscountRepository extends BaseRepository {
  constructor() {
    super("discounts");
  }
  /**
   * Get discounts by type
   */
  getByType(type) {
    const stmt = this.db.prepare(`
            SELECT * FROM ${this.tableName} 
            WHERE type = ? AND is_active = 1
        `);
    return stmt.all(type);
  }
  /**
   * Get active discounts
   */
  getActiveDiscounts() {
    return this.getAll();
  }
}
class OfflineOrderRepository {
  constructor() {
    this.tableName = "offline_orders";
  }
  get db() {
    return databaseService.getDatabase();
  }
  /**
   * Add order to offline queue
   */
  addToQueue(orderData) {
    const stmt = this.db.prepare(`
            INSERT INTO ${this.tableName} (order_data, status, created_at) 
            VALUES (?, 'PENDING_SYNC', CURRENT_TIMESTAMP)
        `);
    return stmt.run(JSON.stringify(orderData));
  }
  /**
   * Get all pending orders
   */
  getPendingOrders() {
    const stmt = this.db.prepare(`
            SELECT * FROM ${this.tableName} 
            WHERE status = 'PENDING_SYNC' 
            ORDER BY created_at ASC
        `);
    return stmt.all().map((row) => ({
      ...row,
      order_data: JSON.parse(row.order_data)
    }));
  }
  /**
   * Mark order as synced
   */
  markAsSynced(id) {
    const stmt = this.db.prepare(`
            UPDATE ${this.tableName} 
            SET status = 'SYNCED', last_attempt_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `);
    return stmt.run(id);
  }
  /**
   * Mark order as failed
   */
  markAsFailed(id, errorMessage) {
    const stmt = this.db.prepare(`
            UPDATE ${this.tableName} 
            SET status = 'FAILED', 
                error_message = ?, 
                retry_count = retry_count + 1, 
                last_attempt_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `);
    return stmt.run(errorMessage, id);
  }
  /**
   * Get orders that failed but can still be retried
   */
  getRetryableFailedOrders(maxRetries = 3) {
    const stmt = this.db.prepare(`
            SELECT * FROM ${this.tableName} 
            WHERE status = 'FAILED' AND retry_count < ?
            ORDER BY created_at ASC
        `);
    return stmt.all(maxRetries).map((row) => ({
      ...row,
      order_data: JSON.parse(row.order_data)
    }));
  }
  /**
   * Clean up old synced orders
   */
  cleanupOldOrders(daysOld = 7) {
    const stmt = this.db.prepare(`
            DELETE FROM ${this.tableName} 
            WHERE status = 'SYNCED' 
            AND created_at < datetime('now', '-${daysOld} days')
        `);
    return stmt.run();
  }
  /**
   * Get queue status summary
   */
  getQueueStatus() {
    const stmt = this.db.prepare(`
            SELECT 
                status, 
                COUNT(*) as count 
            FROM ${this.tableName} 
            GROUP BY status
        `);
    return stmt.all();
  }
}
const productRepository = new ProductRepository();
const categoryRepository = new CategoryRepository();
const userRepository = new UserRepository();
const discountRepository = new DiscountRepository();
const offlineOrderRepository = new OfflineOrderRepository();
class SyncService {
  constructor() {
    this.systemConfig = {
      baseURL: process.env.VITE_API_BASE_URL || "http://127.0.0.1:8001/api",
      apiTimeout: parseInt(process.env.VITE_API_TIMEOUT_MS) || 1e4,
      debugSync: process.env.VITE_DEBUG_SYNC === "true",
      maxConcurrentSyncs: parseInt(process.env.VITE_MAX_CONCURRENT_SYNCS) || 3
    };
    this.userSettings = {
      syncIntervalMinutes: 5,
      autoSyncEnabled: true
    };
    this.repositories = {
      products: new ProductRepository(),
      categories: new CategoryRepository(),
      users: new UserRepository(),
      discounts: new DiscountRepository()
    };
    this.imagesCacheDir = path$1.join(app.getPath("userData"), "cached_images");
    this.apiKey = null;
    this.isOnline = true;
    this.syncInterval = null;
    this.activeSyncs = 0;
  }
  /**
   * Initialize the sync service with user settings
   */
  async initialize() {
    console.log("🔄 Initializing SyncService...");
    if (this.systemConfig.debugSync) {
      console.log("📋 SyncService System Configuration:", {
        baseURL: this.systemConfig.baseURL,
        apiTimeout: this.systemConfig.apiTimeout,
        maxConcurrentSyncs: this.systemConfig.maxConcurrentSyncs
      });
    }
    await this.ensureImagesCacheDir();
    await this.loadUserSettings();
    await this.loadAPIKey();
  }
  /**
   * Load user settings from database
   */
  async loadUserSettings() {
    try {
      const db = databaseService.getDatabase();
      const stmt = db.prepare("SELECT value FROM sync_metadata WHERE key = ?");
      const result = stmt.get("user_settings");
      if (result == null ? void 0 : result.value) {
        const dbUserSettings = JSON.parse(result.value);
        if (dbUserSettings.syncIntervalMinutes) {
          this.userSettings.syncIntervalMinutes = dbUserSettings.syncIntervalMinutes;
        }
        if (dbUserSettings.autoSyncEnabled !== void 0) {
          this.userSettings.autoSyncEnabled = dbUserSettings.autoSyncEnabled;
        }
        console.log("⚙️ User sync settings loaded:", {
          syncInterval: this.userSettings.syncIntervalMinutes,
          autoSyncEnabled: this.userSettings.autoSyncEnabled
        });
      }
    } catch (error) {
      console.warn("⚠️ Failed to load user sync settings:", error);
    }
  }
  /**
   * Save user settings to database
   */
  async saveUserSettings(settings) {
    try {
      const db = databaseService.getDatabase();
      const stmt = db.prepare("SELECT value FROM sync_metadata WHERE key = ?");
      const result = stmt.get("user_settings");
      let allUserSettings = (result == null ? void 0 : result.value) ? JSON.parse(result.value) : {};
      allUserSettings = { ...allUserSettings, ...settings };
      const saveStmt = db.prepare(`
				INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) 
				VALUES (?, ?, CURRENT_TIMESTAMP)
			`);
      saveStmt.run("user_settings", JSON.stringify(allUserSettings));
      await this.loadUserSettings();
      console.log("💾 User sync settings saved and applied");
    } catch (error) {
      console.error("❌ Failed to save user sync settings:", error);
    }
  }
  /**
   * Start periodic sync timer
   */
  startPeriodicSync() {
    this.stopPeriodicSync();
    if (!this.apiKey) {
      console.log("🔐 Cannot start periodic sync: No API key available");
      return;
    }
    if (!this.userSettings.autoSyncEnabled) {
      console.log("⏸️ Auto-sync is disabled by user");
      return;
    }
    const intervalMs = this.userSettings.syncIntervalMinutes * 60 * 1e3;
    console.log(
      `🔄 Starting periodic sync every ${this.userSettings.syncIntervalMinutes} minutes`
    );
    this.syncInterval = setInterval(async () => {
      if (this.activeSyncs >= this.systemConfig.maxConcurrentSyncs) {
        console.log("⏸️ [Periodic] Skipping sync - too many active syncs");
        return;
      }
      try {
        this.activeSyncs++;
        console.log("🔄 [Periodic] Starting scheduled delta sync...");
        const isOnline = await this.checkOnlineStatus();
        if (isOnline) {
          const result = await this.performDeltaSync();
          if (result.success) {
            console.log("✅ [Periodic] Scheduled sync completed successfully");
          } else {
            console.warn("⚠️ [Periodic] Scheduled sync failed:", result.error);
          }
        } else {
          console.log(
            "📱 [Periodic] Backend offline - skipping scheduled sync"
          );
        }
      } catch (error) {
        console.error("❌ [Periodic] Scheduled sync error:", error.message);
      } finally {
        this.activeSyncs--;
      }
    }, intervalMs);
  }
  /**
   * Stop periodic sync timer
   */
  stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log("⏹️ Periodic sync stopped");
    }
  }
  /**
   * Update sync interval (in minutes) - user preference
   */
  async setSyncInterval(minutes) {
    this.userSettings.syncIntervalMinutes = minutes;
    console.log(`🔄 Sync interval updated to ${minutes} minutes`);
    await this.saveUserSettings({ syncIntervalMinutes: minutes });
    if (this.syncInterval && this.apiKey) {
      this.startPeriodicSync();
    }
  }
  /**
   * Toggle auto-sync enabled/disabled - user preference
   */
  async setAutoSyncEnabled(enabled) {
    this.userSettings.autoSyncEnabled = enabled;
    console.log(`🔄 Auto-sync ${enabled ? "enabled" : "disabled"}`);
    await this.saveUserSettings({ autoSyncEnabled: enabled });
    if (enabled && this.apiKey) {
      this.startPeriodicSync();
    } else {
      this.stopPeriodicSync();
    }
  }
  /**
   * Get axios config with authentication and timeout
   */
  getRequestConfig(additionalConfig = {}) {
    const config = {
      timeout: this.systemConfig.apiTimeout,
      ...additionalConfig
    };
    if (this.apiKey) {
      config.headers = {
        "X-API-Key": this.apiKey,
        ...config.headers
      };
    }
    return config;
  }
  /**
   * Check if the service is online
   */
  async checkOnlineStatus() {
    try {
      const response = await axios.get(`${this.systemConfig.baseURL}/health/`, {
        timeout: Math.min(this.systemConfig.apiTimeout, 5e3)
        // Max 5 seconds for health check
      });
      this.isOnline = response.status === 200;
      if (this.systemConfig.debugSync) {
        console.log("🟢 Backend connection successful");
      }
      return this.isOnline;
    } catch (error) {
      if (this.systemConfig.debugSync) {
        console.warn("🔴 Backend appears to be offline:", error.message);
      }
      this.isOnline = false;
      return false;
    }
  }
  /**
   * Load API key from persistent storage
   */
  async loadAPIKey() {
    try {
      const db = databaseService.getDatabase();
      const stmt = db.prepare("SELECT value FROM sync_metadata WHERE key = ?");
      const result = stmt.get("api_key");
      if (result == null ? void 0 : result.value) {
        this.apiKey = result.value;
        console.log("🔑 API key loaded from storage");
        const isValid = await this.verifyAPIKey();
        if (isValid) {
          console.log("🔑 API key verified successfully");
          if (this.userSettings.autoSyncEnabled) {
            try {
              const syncResult = await this.performDeltaSync();
              if (syncResult.success) {
                console.log("🔄 Auto-sync completed successfully");
              }
            } catch (error) {
              console.warn(
                "⚠️ Auto-sync failed, but API key is valid:",
                error.message
              );
            }
          }
          this.startPeriodicSync();
        } else {
          console.warn("🔑 Stored API key is invalid, clearing it");
          await this.clearAPIKey();
        }
      } else {
        console.log("🔑 No stored API key found");
      }
    } catch (error) {
      console.warn("⚠️ Failed to load API key from storage:", error);
    }
  }
  /**
   * Set API key for authentication and persist it
   */
  setAPIKey(apiKey) {
    this.apiKey = apiKey;
    this.saveAPIKey(apiKey);
    this.startPeriodicSync();
  }
  /**
   * Save API key to persistent storage
   */
  async saveAPIKey(apiKey) {
    try {
      const db = databaseService.getDatabase();
      const stmt = db.prepare(`
				INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) 
				VALUES (?, ?, CURRENT_TIMESTAMP)
			`);
      stmt.run("api_key", apiKey);
      console.log("🔑 API key saved to storage");
    } catch (error) {
      console.error("❌ Failed to save API key to storage:", error);
    }
  }
  /**
   * Clear API key from persistent storage
   */
  async clearAPIKey() {
    try {
      this.apiKey = null;
      this.stopPeriodicSync();
      const db = databaseService.getDatabase();
      const stmt = db.prepare("DELETE FROM sync_metadata WHERE key = ?");
      stmt.run("api_key");
      console.log("🔑 API key cleared from storage");
    } catch (error) {
      console.error("❌ Failed to clear API key from storage:", error);
    }
  }
  /**
   * Verify if the current API key is valid
   */
  async verifyAPIKey() {
    var _a;
    if (!this.apiKey) {
      return false;
    }
    try {
      const response = await axios.get(
        `${this.systemConfig.baseURL}/users/me/`,
        this.getRequestConfig({ timeout: 5e3 })
      );
      return response.status === 200;
    } catch (error) {
      if (((_a = error.response) == null ? void 0 : _a.status) === 401) {
        console.warn("🔑 API key is invalid or expired");
        return false;
      }
      console.warn(
        "🔴 Failed to verify API key due to network error:",
        error.message
      );
      return false;
    }
  }
  /**
   * Perform initial sync of all data
   */
  async performInitialSync() {
    var _a;
    console.log("🔄 Starting initial sync...");
    const isOnline = await this.checkOnlineStatus();
    if (!isOnline) {
      console.log("📱 Backend offline - using cached data only");
      return { success: false, error: "Backend is offline" };
    }
    if (!this.apiKey) {
      console.log("🔐 No API key available - user needs to generate one first");
      return {
        success: false,
        error: "API key required - please generate an API key first"
      };
    }
    try {
      await this.syncCategories();
      await this.syncUsers();
      await this.syncProducts();
      await this.syncDiscounts();
      await this.updateLastSyncTimestamp();
      console.log("✅ Initial sync completed successfully");
      return { success: true };
    } catch (error) {
      console.error("❌ Initial sync failed:", error);
      if (((_a = error.response) == null ? void 0 : _a.status) === 401) {
        return {
          success: false,
          error: "Authentication failed - please check your API key"
        };
      }
      return { success: false, error: error.message };
    }
  }
  /**
   * Perform delta sync (only fetch changed data)
   */
  async performDeltaSync() {
    var _a;
    console.log("🔄 Starting delta sync...");
    const isOnline = await this.checkOnlineStatus();
    if (!isOnline) {
      return { success: false, error: "Backend is offline" };
    }
    if (!this.apiKey) {
      console.log("🔐 No API key available - user needs to generate one first");
      return {
        success: false,
        error: "API key required - please generate an API key first"
      };
    }
    try {
      const lastSync = await this.getLastSyncTimestamp();
      const modifiedSince = lastSync ? lastSync.toISOString() : null;
      if (modifiedSince) {
        await this.syncCategories(modifiedSince);
        await this.syncUsers(modifiedSince);
        await this.syncProducts(modifiedSince);
        await this.syncDiscounts(modifiedSince);
      } else {
        return await this.performInitialSync();
      }
      await this.updateLastSyncTimestamp();
      console.log("✅ Delta sync completed successfully");
      return { success: true };
    } catch (error) {
      console.error("❌ Delta sync failed:", error);
      if (((_a = error.response) == null ? void 0 : _a.status) === 401) {
        return {
          success: false,
          error: "Authentication failed - please check your API key"
        };
      }
      return { success: false, error: error.message };
    }
  }
  /**
   * Sync categories from backend
   */
  async syncCategories(modifiedSince = null) {
    console.log("📂 Syncing categories...");
    try {
      const params = { sync: "true" };
      if (modifiedSince) {
        params.modified_since = modifiedSince;
      }
      const response = await axios.get(
        `${this.systemConfig.baseURL}/products/categories/`,
        this.getRequestConfig({ params })
      );
      const categories = response.data;
      if (categories.length > 0) {
        if (modifiedSince) {
          await this.repositories.categories.updateFromBackend(categories);
        } else {
          await this.repositories.categories.replaceAll(categories);
        }
        console.log(`📂 Synced ${categories.length} categories`);
      }
    } catch (error) {
      console.error("❌ Failed to sync categories:", error);
      throw error;
    }
  }
  /**
   * Sync users from backend
   */
  async syncUsers(modifiedSince = null) {
    console.log("👥 Syncing users...");
    try {
      const params = { sync: "true" };
      if (modifiedSince) {
        params.modified_since = modifiedSince;
      }
      const response = await axios.get(
        `${this.systemConfig.baseURL}/users/`,
        this.getRequestConfig({ params })
      );
      const users = response.data;
      if (users.length > 0) {
        if (modifiedSince) {
          await this.repositories.users.updateFromBackend(users);
        } else {
          await this.repositories.users.replaceAll(users);
        }
        console.log(`👥 Synced ${users.length} users`);
      }
    } catch (error) {
      console.error("❌ Failed to sync users:", error);
      throw error;
    }
  }
  /**
   * Sync products from backend and cache images
   */
  async syncProducts(modifiedSince = null) {
    console.log("🛍️ Syncing products...");
    try {
      const params = { sync: "true" };
      if (modifiedSince) {
        params.modified_since = modifiedSince;
      }
      const response = await axios.get(
        `${this.systemConfig.baseURL}/products/`,
        this.getRequestConfig({ params })
      );
      const products = response.data;
      if (products.length > 0) {
        for (const product of products) {
          if (product.image) {
            await this.cacheProductImage(product);
          }
        }
        if (modifiedSince) {
          await this.repositories.products.updateFromBackend(products);
        } else {
          await this.repositories.products.replaceAll(products);
        }
        console.log(`🛍️ Synced ${products.length} products`);
      }
    } catch (error) {
      console.error("❌ Failed to sync products:", error);
      throw error;
    }
  }
  /**
   * Sync discounts from backend
   */
  async syncDiscounts(modifiedSince = null) {
    console.log("💰 Syncing discounts...");
    try {
      const params = { sync: "true" };
      if (modifiedSince) {
        params.modified_since = modifiedSince;
      }
      const response = await axios.get(
        `${this.systemConfig.baseURL}/discounts/`,
        this.getRequestConfig({ params })
      );
      const discounts = response.data;
      if (discounts.length > 0) {
        if (modifiedSince) {
          await this.repositories.discounts.updateFromBackend(discounts);
        } else {
          await this.repositories.discounts.replaceAll(discounts);
        }
        console.log(`💰 Synced ${discounts.length} discounts`);
      }
    } catch (error) {
      console.error("❌ Failed to sync discounts:", error);
      throw error;
    }
  }
  /**
   * Cache a product image locally
   */
  async cacheProductImage(product) {
    try {
      if (!product.image) return;
      const imageUrl = product.image;
      const urlHash = crypto.createHash("md5").update(imageUrl).digest("hex");
      const extension = path$1.extname(imageUrl) || ".jpg";
      const filename = `product_${product.id}_${urlHash}${extension}`;
      const localPath = path$1.join(this.imagesCacheDir, filename);
      try {
        await promises.access(localPath);
        product.local_image_path = `file://${localPath}`;
        return;
      } catch {
      }
      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 3e4
        // 30 second timeout
      });
      await promises.writeFile(localPath, response.data);
      product.local_image_path = `file://${localPath}`;
      console.log(`🖼️ Cached image for product ${product.id}`);
    } catch (error) {
      console.error(
        `❌ Failed to cache image for product ${product.id}:`,
        error
      );
    }
  }
  /**
   * Ensure images cache directory exists
   */
  async ensureImagesCacheDir() {
    try {
      await promises.mkdir(this.imagesCacheDir, { recursive: true });
    } catch (error) {
      console.error("❌ Failed to create images cache directory:", error);
    }
  }
  /**
   * Get last sync timestamp
   */
  async getLastSyncTimestamp() {
    try {
      const record = this.repositories.products.db.prepare(
        `
				SELECT value FROM sync_metadata WHERE key = 'global_last_sync'
			`
      ).get();
      return record ? new Date(record.value) : null;
    } catch (error) {
      console.error("❌ Failed to get last sync timestamp:", error);
      return null;
    }
  }
  /**
   * Update last sync timestamp
   */
  async updateLastSyncTimestamp() {
    try {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      this.repositories.products.db.prepare(
        `
				INSERT OR REPLACE INTO sync_metadata (key, value, updated_at)
				VALUES ('global_last_sync', ?, CURRENT_TIMESTAMP)
			`
      ).run(now);
    } catch (error) {
      console.error("❌ Failed to update last sync timestamp:", error);
    }
  }
  /**
   * Get sync status
   */
  async getSyncStatus() {
    const lastSync = await this.getLastSyncTimestamp();
    return {
      isOnline: this.isOnline,
      lastSyncTime: lastSync,
      hasData: await this.hasLocalData()
    };
  }
  /**
   * Check if we have local data
   */
  async hasLocalData() {
    try {
      const productsCount = this.repositories.products.db.prepare(
        `
				SELECT COUNT(*) as count FROM products
			`
      ).get().count;
      return productsCount > 0;
    } catch {
      return false;
    }
  }
  /**
   * Insert sample data for testing (keeping for backwards compatibility)
   */
  async insertSampleData() {
    console.log("📝 Inserting sample data...");
    const sampleCategories = [
      { id: 1, name: "Beverages", parent_id: null },
      { id: 2, name: "Food", parent_id: null },
      { id: 3, name: "Hot Drinks", parent_id: 1 },
      { id: 4, name: "Cold Drinks", parent_id: 1 }
    ];
    const sampleProducts = [
      {
        id: 1,
        name: "Coffee",
        description: "Fresh brewed coffee",
        price: 3.5,
        category_id: 3,
        product_type_id: 1,
        is_active: 1,
        local_image_path: null
      },
      {
        id: 2,
        name: "Sandwich",
        description: "Turkey and cheese sandwich",
        price: 8.99,
        category_id: 2,
        product_type_id: 1,
        is_active: 1,
        local_image_path: null
      }
    ];
    const sampleUsers = [
      {
        id: 1,
        email: "admin@example.com",
        username: "admin",
        first_name: "Admin",
        last_name: "User",
        role: "ADMIN",
        is_active: 1
      }
    ];
    const sampleDiscounts = [
      {
        id: 1,
        name: "10% Off",
        type: "PERCENTAGE",
        scope: "ORDER",
        value: 10,
        is_active: 1
      }
    ];
    await this.repositories.categories.replaceAll(sampleCategories);
    await this.repositories.products.replaceAll(sampleProducts);
    await this.repositories.users.replaceAll(sampleUsers);
    await this.repositories.discounts.replaceAll(sampleDiscounts);
    await this.updateLastSyncTimestamp();
    console.log("✅ Sample data inserted successfully");
    return { success: true };
  }
}
const require2 = createRequire(import.meta.url);
const syncService = new SyncService();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
process$1.env.DIST = path.join(__dirname, "../dist");
process$1.env.PUBLIC = app.isPackaged ? process$1.env.DIST : path.join(process$1.env.DIST, "../public");
let mainWindow;
let customerWindow;
let lastKnownState = null;
const VITE_DEV_SERVER_URL = process$1.env["VITE_DEV_SERVER_URL"];
function createMainWindow() {
  const persistentSession = session.fromPartition("persist:electron-app");
  mainWindow = new BrowserWindow({
    icon: path.join(process$1.env.PUBLIC, "electron-vite.svg"),
    webPreferences: {
      session: persistentSession,
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow == null ? void 0 : mainWindow.webContents.send(
      "main-process-message",
      (/* @__PURE__ */ new Date()).toLocaleString()
    );
  });
  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(process$1.env.DIST, "index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
    if (customerWindow) {
      customerWindow.close();
    }
  });
}
function createCustomerWindow() {
  customerWindow = new BrowserWindow({
    x: 100,
    y: 100,
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });
  if (VITE_DEV_SERVER_URL) {
    customerWindow.loadURL(`${VITE_DEV_SERVER_URL}customer.html`);
  } else {
    customerWindow.loadFile(path.join(process$1.env.DIST, "customer.html"));
  }
  customerWindow.on("closed", () => {
    customerWindow = null;
  });
}
ipcMain.on("POS_TO_CUSTOMER_STATE", (event, state) => {
  lastKnownState = state;
  if (customerWindow) {
    customerWindow.webContents.send("POS_TO_CUSTOMER_STATE", state);
  }
});
ipcMain.on("CUSTOMER_REQUESTS_STATE", (event) => {
  if (lastKnownState) {
    event.sender.send("POS_TO_CUSTOMER_STATE", lastKnownState);
  }
});
ipcMain.on("CUSTOMER_TO_POS_TIP", (event, amount) => {
  if (mainWindow) {
    mainWindow.webContents.send("CUSTOMER_TO_POS_TIP", amount);
  }
});
ipcMain.handle("discover-printers", async () => {
  console.log("[Main Process] Discovering printers using node-usb...");
  try {
    const devices = usb.getDeviceList();
    const printers = devices.map((device) => {
      let deviceIsOpen = false;
      try {
        device.open();
        deviceIsOpen = true;
        if (device.interfaces && device.interfaces.length > 0) {
          const isPrinter = device.interfaces.some(
            (iface) => iface.descriptor.bInterfaceClass === 7
          );
          if (isPrinter) {
            return {
              name: device.product || `USB Device ${device.deviceDescriptor.idVendor}:${device.deviceDescriptor.idProduct}`,
              vendorId: device.deviceDescriptor.idVendor,
              productId: device.deviceDescriptor.idProduct
            };
          }
        }
        return null;
      } catch {
        return null;
      } finally {
        if (deviceIsOpen) {
          try {
            device.close();
          } catch {
          }
        }
      }
    }).filter((p) => p !== null);
    console.log(
      "[Main Process] Found printers:",
      JSON.stringify(printers, null, 2)
    );
    return printers;
  } catch (error) {
    console.error("[Main Process] Failed to discover printers:", error);
    return [];
  }
});
async function sendBufferToPrinter(printer, buffer) {
  let device = null;
  try {
    if (!printer || !printer.vendor_id || !printer.product_id) {
      throw new Error("Invalid printer object provided.");
    }
    const devices = usb.getDeviceList();
    device = devices.find(
      (d) => d.deviceDescriptor.idVendor == printer.vendor_id && d.deviceDescriptor.idProduct == printer.product_id
    );
    if (!device) {
      throw new Error("USB Printer not found. It may be disconnected.");
    }
    device.open();
    const an_interface = device.interfaces[0];
    an_interface.claim();
    const endpoint = an_interface.endpoints.find((e) => e.direction === "out");
    if (!endpoint) {
      throw new Error("Could not find an OUT endpoint on the printer.");
    }
    await new Promise((resolve, reject) => {
      endpoint.transfer(buffer, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  } finally {
    if (device) {
      try {
        if (device.interfaces[0] && device.interfaces[0].isClaimed()) {
          await new Promise((resolve) => {
            device.interfaces[0].release(true, () => resolve());
          });
        }
        device.close();
      } catch (cleanupError) {
        console.error("Error cleaning up USB device:", cleanupError);
      }
    }
  }
}
ipcMain.handle("print-receipt", async (event, { printer, data }) => {
  console.log("\n--- [Main Process] Using HYBRID print method ---");
  try {
    const buffer = formatReceipt(data);
    console.log(
      `[Main Process] Receipt buffer created (size: ${buffer.length}). Sending...`
    );
    await sendBufferToPrinter(printer, buffer);
    console.log("[Main Process] Hybrid print command sent successfully.");
    return { success: true };
  } catch (error) {
    console.error("[Main Process] ERROR IN HYBRID PRINT HANDLER:", error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle(
  "print-kitchen-ticket",
  async (event, { printer, order, zoneName }) => {
    console.log(
      `
--- [Main Process] KITCHEN TICKET HANDLER for zone: "${zoneName}" ---`
    );
    try {
      if ((printer == null ? void 0 : printer.connection_type) !== "network" || !printer.ip_address) {
        throw new Error("Invalid network printer configuration provided.");
      }
      const thermalPrinter2 = require2("node-thermal-printer");
      const { printer: ThermalPrinter2, types: PrinterTypes2 } = thermalPrinter2;
      let printerInstance = new ThermalPrinter2({
        type: PrinterTypes2.EPSON,
        interface: `tcp://${printer.ip_address}`,
        timeout: 5e3
      });
      const isConnected = await printerInstance.isPrinterConnected();
      if (!isConnected) {
        throw new Error(
          `Could not connect to kitchen printer at ${printer.ip_address}`
        );
      }
      console.log(
        `Successfully connected to kitchen printer at ${printer.ip_address}`
      );
      const buffer = formatKitchenTicket(order, zoneName);
      console.log(`Sending kitchen ticket buffer (size: ${buffer.length})`);
      await printerInstance.raw(buffer);
      console.log("Kitchen ticket sent successfully.");
      return { success: true };
    } catch (error) {
      console.error("\n--- [Main Process] ERROR IN KITCHEN TICKET HANDLER ---");
      console.error(error);
      return { success: false, error: error.message };
    }
  }
);
ipcMain.handle("open-cash-drawer", async (event, { printerName }) => {
  console.log("\n--- [Main Process] Using HYBRID open-drawer method ---");
  try {
    const devices = usb.getDeviceList();
    const foundDevice = devices.find(
      (d) => (d.product || `USB Device ${d.deviceDescriptor.idVendor}:${d.deviceDescriptor.idProduct}`) === printerName
    );
    if (!foundDevice) {
      throw new Error(`Printer with name "${printerName}" not found.`);
    }
    const printer = {
      vendor_id: foundDevice.deviceDescriptor.idVendor,
      product_id: foundDevice.deviceDescriptor.idProduct
    };
    const buffer = formatOpenCashDrawer();
    console.log(
      `[Main Process] Open-drawer buffer created (size: ${buffer.length}). Sending...`
    );
    await sendBufferToPrinter(printer, buffer);
    console.log("[Main Process] Hybrid open-drawer command sent successfully.");
    return { success: true };
  } catch (error) {
    console.error("[Main Process] ERROR IN HYBRID CASH DRAWER HANDLER:", error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("db:get-products", async () => {
  try {
    return productRepository.getAll();
  } catch (error) {
    console.error("[Main Process] Error getting products:", error);
    throw error;
  }
});
ipcMain.handle("db:get-product-by-id", async (event, id) => {
  try {
    return productRepository.getById(id);
  } catch (error) {
    console.error("[Main Process] Error getting product by id:", error);
    throw error;
  }
});
ipcMain.handle("db:get-products-by-category", async (event, categoryId) => {
  try {
    return productRepository.getByCategory(categoryId);
  } catch (error) {
    console.error("[Main Process] Error getting products by category:", error);
    throw error;
  }
});
ipcMain.handle("db:search-products", async (event, searchTerm) => {
  try {
    return productRepository.searchByName(searchTerm);
  } catch (error) {
    console.error("[Main Process] Error searching products:", error);
    throw error;
  }
});
ipcMain.handle("db:get-categories", async () => {
  try {
    return categoryRepository.getCategoriesWithProductCount();
  } catch (error) {
    console.error("[Main Process] Error getting categories:", error);
    throw error;
  }
});
ipcMain.handle("db:get-users", async () => {
  try {
    return userRepository.getAll();
  } catch (error) {
    console.error("[Main Process] Error getting users:", error);
    throw error;
  }
});
ipcMain.handle("db:get-user-by-username", async (event, username) => {
  try {
    return userRepository.getByUsername(username);
  } catch (error) {
    console.error("[Main Process] Error getting user by username:", error);
    throw error;
  }
});
ipcMain.handle("db:get-discounts", async () => {
  try {
    return discountRepository.getActiveDiscounts();
  } catch (error) {
    console.error("[Main Process] Error getting discounts:", error);
    throw error;
  }
});
ipcMain.handle("db:add-offline-order", async (event, orderData) => {
  try {
    return offlineOrderRepository.addToQueue(orderData);
  } catch (error) {
    console.error("[Main Process] Error adding offline order:", error);
    throw error;
  }
});
ipcMain.handle("db:get-pending-orders", async () => {
  try {
    return offlineOrderRepository.getPendingOrders();
  } catch (error) {
    console.error("[Main Process] Error getting pending orders:", error);
    throw error;
  }
});
ipcMain.handle("db:get-queue-status", async () => {
  try {
    return offlineOrderRepository.getQueueStatus();
  } catch (error) {
    console.error("[Main Process] Error getting queue status:", error);
    throw error;
  }
});
ipcMain.handle("db:reset", async () => {
  try {
    await databaseService.resetDatabase();
    return { success: true };
  } catch (error) {
    console.error("[Main Process] Error resetting database:", error);
    throw error;
  }
});
ipcMain.handle("db:get-settings", async () => {
  try {
    const db = databaseService.getDatabase();
    const stmt = db.prepare("SELECT value FROM sync_metadata WHERE key = ?");
    const result = stmt.get("user_settings");
    return (result == null ? void 0 : result.value) ? JSON.parse(result.value) : null;
  } catch (error) {
    console.error("[Main Process] Error getting settings:", error);
    throw error;
  }
});
ipcMain.handle("db:save-settings", async (event, settings) => {
  try {
    const db = databaseService.getDatabase();
    const stmt = db.prepare(`
			INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) 
			VALUES (?, ?, CURRENT_TIMESTAMP)
		`);
    stmt.run("user_settings", JSON.stringify(settings));
    if (settings.backupIntervalMinutes || settings.autoBackupEnabled !== void 0 || settings.maxBackupsToKeep) {
      await databaseService.updateBackupConfig({
        backupIntervalMinutes: settings.backupIntervalMinutes,
        autoBackupEnabled: settings.autoBackupEnabled,
        maxBackupsToKeep: settings.maxBackupsToKeep
      });
    }
    return { success: true };
  } catch (error) {
    console.error("[Main Process] Error saving settings:", error);
    throw error;
  }
});
ipcMain.handle("db:restore-from-backup", async () => {
  try {
    const restored = await databaseService.restoreFromBackup();
    return { success: restored };
  } catch (error) {
    console.error("[Main Process] Error restoring from backup:", error);
    throw error;
  }
});
ipcMain.handle("sync:get-status", async () => {
  try {
    return syncService.getSyncStatus();
  } catch (error) {
    console.error("[Main Process] Error getting sync status:", error);
    throw error;
  }
});
ipcMain.handle("sync:insert-sample-data", async () => {
  try {
    return await syncService.insertSampleData();
  } catch (error) {
    console.error("[Main Process] Error inserting sample data:", error);
    throw error;
  }
});
ipcMain.handle("sync:perform-initial-sync", async () => {
  try {
    return await syncService.performInitialSync();
  } catch (error) {
    console.error("[Main Process] Error performing initial sync:", error);
    throw error;
  }
});
ipcMain.handle("sync:perform-delta-sync", async () => {
  try {
    return await syncService.performDeltaSync();
  } catch (error) {
    console.error("[Main Process] Error performing delta sync:", error);
    throw error;
  }
});
ipcMain.handle("sync:check-online-status", async () => {
  try {
    return await syncService.checkOnlineStatus();
  } catch (error) {
    console.error("[Main Process] Error checking online status:", error);
    throw error;
  }
});
ipcMain.handle("sync:set-api-key", async (event, apiKey) => {
  try {
    syncService.setAPIKey(apiKey);
    return { success: true };
  } catch (error) {
    console.error("[Main Process] Error setting API key:", error);
    throw error;
  }
});
ipcMain.handle("sync:clear-api-key", async () => {
  try {
    await syncService.clearAPIKey();
    return { success: true };
  } catch (error) {
    console.error("[Main Process] Error clearing API key:", error);
    throw error;
  }
});
ipcMain.handle("sync:set-interval", async (event, minutes) => {
  try {
    await syncService.setSyncInterval(minutes);
    return { success: true };
  } catch (error) {
    console.error("[Main Process] Error setting sync interval:", error);
    throw error;
  }
});
ipcMain.handle("sync:set-auto-sync", async (event, enabled) => {
  try {
    await syncService.setAutoSyncEnabled(enabled);
    return { success: true };
  } catch (error) {
    console.error("[Main Process] Error setting auto-sync:", error);
    throw error;
  }
});
ipcMain.handle("sync:start-periodic", async () => {
  try {
    syncService.startPeriodicSync();
    return { success: true };
  } catch (error) {
    console.error("[Main Process] Error starting periodic sync:", error);
    throw error;
  }
});
ipcMain.handle("sync:stop-periodic", async () => {
  try {
    syncService.stopPeriodicSync();
    return { success: true };
  } catch (error) {
    console.error("[Main Process] Error stopping periodic sync:", error);
    throw error;
  }
});
ipcMain.handle("get-session-cookies", async (event, url) => {
  try {
    const { session: session2 } = require2("electron");
    const cookies = await session2.defaultSession.cookies.get({ url });
    console.log(`[Main Process] Found ${cookies.length} cookies for ${url}`);
    cookies.forEach((cookie, index) => {
      console.log(
        `[Main Process] Cookie ${index + 1}: ${cookie.name} (${cookie.httpOnly ? "HttpOnly" : "Regular"})`
      );
    });
    const cookieString = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    if (cookieString) {
      console.log(
        `[Main Process] Cookie string created (length: ${cookieString.length})`
      );
    } else {
      console.log("[Main Process] No cookies found - returning empty string");
    }
    return cookieString;
  } catch (error) {
    console.error("[Main Process] Error getting session cookies:", error);
    throw error;
  }
});
app.whenReady().then(async () => {
  try {
    await databaseService.initialize();
    console.log("[Main Process] Database initialized successfully");
  } catch (error) {
    console.error("[Main Process] Failed to initialize database:", error);
    console.error("Stack trace:", error.stack);
  }
  try {
    await syncService.initialize();
    console.log("[Main Process] Sync service initialized successfully");
    const status = await syncService.getSyncStatus();
    if (!status.hasData) {
      console.log(
        "[Main Process] No local data found, inserting sample data..."
      );
      await syncService.insertSampleData();
    }
  } catch (error) {
    console.error("[Main Process] Failed to initialize sync service:", error);
    console.error("Stack trace:", error.stack);
  }
  createMainWindow();
  createCustomerWindow();
});
app.on("window-all-closed", () => {
  if (process$1.platform !== "darwin") {
    app.quit();
  }
});
