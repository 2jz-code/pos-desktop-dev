import Database from "better-sqlite3";
import { app } from "electron";
import path from "node:path";
import fs from "node:fs";

class DatabaseService {
	constructor() {
		this.db = null;
		this.isInitialized = false;
	}

	/**
	 * Initialize the database connection and create tables if needed
	 */
	async initialize() {
		if (this.isInitialized) {
			return;
		}

		try {
			// Get the user data directory
			const userDataPath = app.getPath("userData");
			const dbPath = path.join(userDataPath, "pos-cache.db");

			// Ensure the directory exists
			const dbDir = path.dirname(dbPath);
			if (!fs.existsSync(dbDir)) {
				fs.mkdirSync(dbDir, { recursive: true });
			}

			console.log(`[DatabaseService] Initializing database at: ${dbPath}`);

			// Create database connection
			this.db = new Database(dbPath);

			// Enable WAL mode for better performance
			this.db.pragma("journal_mode = WAL");

			// Create tables
			await this.createTables();

			this.isInitialized = true;
			console.log("[DatabaseService] Database initialized successfully");
		} catch (error) {
			console.error("[DatabaseService] Failed to initialize database:", error);
			throw error;
		}
	}

	/**
	 * Create all necessary tables
	 */
	createTables() {
		const tables = [
			// Products table
			`CREATE TABLE IF NOT EXISTS products (
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
                backend_updated_at DATETIME
            )`,

			// Categories table
			`CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                parent_id INTEGER,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                backend_updated_at DATETIME
            )`,

			// Users table
			`CREATE TABLE IF NOT EXISTS users (
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
            )`,

			// Discounts table
			`CREATE TABLE IF NOT EXISTS discounts (
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
            )`,

			// Offline orders queue
			`CREATE TABLE IF NOT EXISTS offline_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_data TEXT NOT NULL,
                status TEXT DEFAULT 'PENDING_SYNC',
                retry_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_attempt_at DATETIME,
                error_message TEXT
            )`,

			// Sync metadata
			`CREATE TABLE IF NOT EXISTS sync_metadata (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
		];

		// Execute each table creation
		tables.forEach((sql) => {
			this.db.exec(sql);
		});

		// Create indexes for better performance
		const indexes = [
			"CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)",
			"CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active)",
			"CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",
			"CREATE INDEX IF NOT EXISTS idx_offline_orders_status ON offline_orders(status)",
			"CREATE INDEX IF NOT EXISTS idx_backend_updated_products ON products(backend_updated_at)",
			"CREATE INDEX IF NOT EXISTS idx_backend_updated_users ON users(backend_updated_at)",
			"CREATE INDEX IF NOT EXISTS idx_backend_updated_discounts ON discounts(backend_updated_at)",
		];

		indexes.forEach((sql) => {
			this.db.exec(sql);
		});

		console.log("[DatabaseService] Tables and indexes created successfully");
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
	updateLastSyncTimestamp(tableName, timestamp = new Date().toISOString()) {
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

			// Drop all tables
			const tables = [
				"products",
				"categories",
				"users",
				"discounts",
				"offline_orders",
				"sync_metadata",
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

			// Recreate all tables
			await this.createTables();

			console.log("[DatabaseService] Database reset successfully");
		} catch (error) {
			console.error("[DatabaseService] Failed to reset database:", error);
			throw error;
		}
	}
}

// Export singleton instance
export const databaseService = new DatabaseService();
