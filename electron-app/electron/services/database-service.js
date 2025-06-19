import Database from "better-sqlite3";
import { app } from "electron";
import path from "node:path";
import fs from "node:fs";

class DatabaseService {
	constructor() {
		this.db = null;
		this.isInitialized = false;
		this.backupInterval = null;

		// Load configuration from environment variables with defaults
		this.config = {
			backupIntervalMinutes:
				parseInt(process.env.VITE_DEFAULT_BACKUP_INTERVAL_MINUTES) || 30,
			maxBackupsToKeep: parseInt(process.env.VITE_MAX_BACKUPS_TO_KEEP) || 10,
			autoBackupEnabled: process.env.VITE_AUTO_BACKUP_ENABLED !== "false",
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
			// Get the user data directory
			const userDataPath = app.getPath("userData");
			const dbPath = path.join(userDataPath, "pos-cache.db");

			// Ensure the directory exists
			const dbDir = path.dirname(dbPath);
			if (!fs.existsSync(dbDir)) {
				fs.mkdirSync(dbDir, { recursive: true });
			}

			// Ensure backup directory exists
			const backupDir = path.join(userDataPath, "database-backups");
			if (!fs.existsSync(backupDir)) {
				fs.mkdirSync(backupDir, { recursive: true });
			}

			console.log(`[DatabaseService] Initializing database at: ${dbPath}`);

			// Create database connection
			this.db = new Database(dbPath);

			// Enable WAL mode for better performance
			this.db.pragma("journal_mode = WAL");

			// Create tables
			await this.createTables();

			// Load user settings for backup configuration
			await this.loadUserSettings();

			// Start automatic backup system if enabled
			if (this.config.autoBackupEnabled) {
				this.startBackupSystem();
			}

			this.isInitialized = true;
			console.log("[DatabaseService] Database initialized successfully");
		} catch (error) {
			console.error("[DatabaseService] Failed to initialize database:", error);

			// If initialization fails, try to recover by resetting the database
			if (this.db) {
				try {
					console.log(
						"[DatabaseService] Attempting to recover by resetting database..."
					);
					this.db.close();

					// Try to restore from backup first
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

					// Delete the corrupted database file
					const userDataPath = app.getPath("userData");
					const dbPath = path.join(userDataPath, "pos-cache.db");
					if (fs.existsSync(dbPath)) {
						fs.unlinkSync(dbPath);
						console.log("[DatabaseService] Corrupted database file deleted");
					}

					// Try to initialize again
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

			if (result?.value) {
				const userSettings = JSON.parse(result.value);

				// Apply user-configured backup settings
				if (userSettings.backupIntervalMinutes) {
					this.config.backupIntervalMinutes =
						userSettings.backupIntervalMinutes;
				}

				if (userSettings.maxBackupsToKeep) {
					this.config.maxBackupsToKeep = userSettings.maxBackupsToKeep;
				}

				if (userSettings.autoBackupEnabled !== undefined) {
					this.config.autoBackupEnabled = userSettings.autoBackupEnabled;
				}

				console.log("[DatabaseService] User backup settings loaded:", {
					interval: this.config.backupIntervalMinutes,
					maxBackups: this.config.maxBackupsToKeep,
					autoEnabled: this.config.autoBackupEnabled,
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
		// Stop any existing backup interval
		this.stopBackupSystem();

		if (!this.config.autoBackupEnabled) {
			console.log("[DatabaseService] Auto-backup is disabled");
			return;
		}

		// Create backup at configured interval
		const intervalMs = this.config.backupIntervalMinutes * 60 * 1000;
		console.log(
			`[DatabaseService] Starting auto-backup every ${this.config.backupIntervalMinutes} minutes`
		);

		this.backupInterval = setInterval(() => {
			this.createBackup().catch((error) => {
				console.warn("[DatabaseService] Backup failed:", error);
			});
		}, intervalMs);

		// Create initial backup after 5 seconds
		setTimeout(() => {
			this.createBackup().catch((error) => {
				console.warn("[DatabaseService] Initial backup failed:", error);
			});
		}, 5000);
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
		// Update local config
		if (settings.backupIntervalMinutes) {
			this.config.backupIntervalMinutes = settings.backupIntervalMinutes;
		}

		if (settings.maxBackupsToKeep) {
			this.config.maxBackupsToKeep = settings.maxBackupsToKeep;
		}

		if (settings.autoBackupEnabled !== undefined) {
			this.config.autoBackupEnabled = settings.autoBackupEnabled;
		}

		console.log("[DatabaseService] Backup configuration updated:", this.config);

		// Restart backup system with new settings
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
			const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
			const backupPath = path.join(
				backupDir,
				`pos-cache-backup-${timestamp}.db`
			);

			// Ensure backup directory exists
			if (!fs.existsSync(backupDir)) {
				fs.mkdirSync(backupDir, { recursive: true });
			}

			// For better-sqlite3, we'll use the VACUUM INTO command which is the safest
			// way to create a backup while the database is in use
			const sourceDbPath = path.join(userDataPath, "pos-cache.db");

			try {
				// Use VACUUM INTO to create a clean backup
				// This method works even when the database is in use and ensures consistency
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

				// Fallback to file copy method
				// Perform checkpoint to ensure all WAL data is written to the main database file
				try {
					this.db.checkpoint();
				} catch (checkpointError) {
					console.warn(
						"[DatabaseService] Checkpoint failed, continuing with backup:",
						checkpointError
					);
				}

				// Copy the main database file
				if (fs.existsSync(sourceDbPath)) {
					fs.copyFileSync(sourceDbPath, backupPath);
					console.log(
						`[DatabaseService] Backup created using file copy: ${backupPath}`
					);
				} else {
					throw new Error("Source database file does not exist");
				}
			}

			// Clean up old backups
			await this.cleanupOldBackups(backupDir);

			// Validate the backup was created successfully
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
			const files = fs
				.readdirSync(backupDir)
				.filter(
					(file) => file.startsWith("pos-cache-backup-") && file.endsWith(".db")
				)
				.map((file) => ({
					name: file,
					path: path.join(backupDir, file),
					stats: fs.statSync(path.join(backupDir, file)),
				}))
				.sort((a, b) => b.stats.mtime - a.stats.mtime); // Sort by modification time, newest first

			// Keep only the configured number of backups
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

			const backupFiles = fs
				.readdirSync(backupDir)
				.filter(
					(file) => file.startsWith("pos-cache-backup-") && file.endsWith(".db")
				)
				.map((file) => ({
					name: file,
					path: path.join(backupDir, file),
					stats: fs.statSync(path.join(backupDir, file)),
				}))
				.sort((a, b) => b.stats.mtime - a.stats.mtime); // Sort by modification time, newest first

			if (backupFiles.length === 0) {
				console.log("[DatabaseService] No backup files found");
				return false;
			}

			const latestBackup = backupFiles[0];
			const dbPath = path.join(userDataPath, "pos-cache.db");

			// Copy backup to main database location
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
			// Create tables in dependency order (categories first, then products)

			// Categories table first (no dependencies)
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

			// Users table (no dependencies)
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

			// Products table (depends on categories)
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

			// Discounts table (no dependencies)
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

			// Offline orders queue (no dependencies)
			this.db.exec(`CREATE TABLE IF NOT EXISTS offline_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_data TEXT NOT NULL,
                status TEXT DEFAULT 'PENDING_SYNC',
                retry_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_attempt_at DATETIME,
                error_message TEXT
            )`);

			// Sync metadata (no dependencies)
			this.db.exec(`CREATE TABLE IF NOT EXISTS sync_metadata (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

			// Create indexes for better performance
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
				"CREATE INDEX IF NOT EXISTS idx_backend_updated_discounts ON discounts(backend_updated_at)",
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
