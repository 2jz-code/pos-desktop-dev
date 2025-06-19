import axios from "axios";
import path from "path";
import { promises as fs } from "fs";
import { app } from "electron";
import crypto from "crypto";

import {
	ProductRepository,
	CategoryRepository,
	UserRepository,
	DiscountRepository,
} from "./repositories.js";
import { databaseService } from "./database-service.js";

class SyncService {
	constructor() {
		// Load system-level configuration from environment variables (not user-configurable)
		this.systemConfig = {
			baseURL: process.env.VITE_API_BASE_URL || "http://127.0.0.1:8001/api",
			apiTimeout: parseInt(process.env.VITE_API_TIMEOUT_MS) || 10000,
			debugSync: process.env.VITE_DEBUG_SYNC === "true",
			maxConcurrentSyncs: parseInt(process.env.VITE_MAX_CONCURRENT_SYNCS) || 3,
		};

		// Default user settings (will be overridden from database)
		this.userSettings = {
			syncIntervalMinutes: 5,
			autoSyncEnabled: true,
		};

		this.repositories = {
			products: new ProductRepository(),
			categories: new CategoryRepository(),
			users: new UserRepository(),
			discounts: new DiscountRepository(),
		};
		this.imagesCacheDir = path.join(app.getPath("userData"), "cached_images");
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

		// Log system configuration
		if (this.systemConfig.debugSync) {
			console.log("📋 SyncService System Configuration:", {
				baseURL: this.systemConfig.baseURL,
				apiTimeout: this.systemConfig.apiTimeout,
				maxConcurrentSyncs: this.systemConfig.maxConcurrentSyncs,
			});
		}

		await this.ensureImagesCacheDir();

		// Load user settings from database
		await this.loadUserSettings();

		// Load API key from persistent storage
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

			if (result?.value) {
				const dbUserSettings = JSON.parse(result.value);

				// Apply user-configured sync settings
				if (dbUserSettings.syncIntervalMinutes) {
					this.userSettings.syncIntervalMinutes =
						dbUserSettings.syncIntervalMinutes;
				}

				if (dbUserSettings.autoSyncEnabled !== undefined) {
					this.userSettings.autoSyncEnabled = dbUserSettings.autoSyncEnabled;
				}

				console.log("⚙️ User sync settings loaded:", {
					syncInterval: this.userSettings.syncIntervalMinutes,
					autoSyncEnabled: this.userSettings.autoSyncEnabled,
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

			// Merge with existing settings
			let allUserSettings = result?.value ? JSON.parse(result.value) : {};
			allUserSettings = { ...allUserSettings, ...settings };

			const saveStmt = db.prepare(`
				INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) 
				VALUES (?, ?, CURRENT_TIMESTAMP)
			`);
			saveStmt.run("user_settings", JSON.stringify(allUserSettings));

			// Apply settings immediately
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
		// Clear any existing interval
		this.stopPeriodicSync();

		if (!this.apiKey) {
			console.log("🔐 Cannot start periodic sync: No API key available");
			return;
		}

		if (!this.userSettings.autoSyncEnabled) {
			console.log("⏸️ Auto-sync is disabled by user");
			return;
		}

		const intervalMs = this.userSettings.syncIntervalMinutes * 60 * 1000;
		console.log(
			`🔄 Starting periodic sync every ${this.userSettings.syncIntervalMinutes} minutes`
		);

		this.syncInterval = setInterval(async () => {
			// Prevent concurrent syncs from overwhelming the system
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

		// Save to user settings
		await this.saveUserSettings({ syncIntervalMinutes: minutes });

		// Restart periodic sync with new interval if it was running
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

		// Save to user settings
		await this.saveUserSettings({ autoSyncEnabled: enabled });

		// Start or stop periodic sync based on setting
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
			...additionalConfig,
		};

		if (this.apiKey) {
			config.headers = {
				"X-API-Key": this.apiKey,
				...config.headers,
			};
		}

		return config;
	}

	/**
	 * Check if the service is online
	 */
	async checkOnlineStatus() {
		try {
			// Use public health check endpoint with configurable timeout
			const response = await axios.get(`${this.systemConfig.baseURL}/health/`, {
				timeout: Math.min(this.systemConfig.apiTimeout, 5000), // Max 5 seconds for health check
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

			if (result?.value) {
				this.apiKey = result.value;
				console.log("🔑 API key loaded from storage");

				// Verify the API key is still valid
				const isValid = await this.verifyAPIKey();
				if (isValid) {
					console.log("🔑 API key verified successfully");

					// Perform a delta sync if auto-sync is enabled
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

					// Start periodic sync after successful initial sync
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

		// Start periodic sync when API key is set
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

			// Stop periodic sync when API key is cleared
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
		if (!this.apiKey) {
			return false;
		}

		try {
			// Test the API key with a simple authenticated endpoint
			const response = await axios.get(
				`${this.systemConfig.baseURL}/users/me/`,
				this.getRequestConfig({ timeout: 5000 })
			);
			return response.status === 200;
		} catch (error) {
			if (error.response?.status === 401) {
				console.warn("🔑 API key is invalid or expired");
				return false;
			}
			// Other errors (network, etc.) don't necessarily mean invalid key
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
		console.log("🔄 Starting initial sync...");

		// Check if backend is online
		const isOnline = await this.checkOnlineStatus();
		if (!isOnline) {
			console.log("📱 Backend offline - using cached data only");
			return { success: false, error: "Backend is offline" };
		}

		// Check if we have API key
		if (!this.apiKey) {
			console.log("🔐 No API key available - user needs to generate one first");
			return {
				success: false,
				error: "API key required - please generate an API key first",
			};
		}

		try {
			// Sync data in dependency order
			await this.syncCategories();
			await this.syncUsers();
			await this.syncProducts(); // This includes image caching
			await this.syncDiscounts();

			// Update last sync timestamp
			await this.updateLastSyncTimestamp();

			console.log("✅ Initial sync completed successfully");
			return { success: true };
		} catch (error) {
			console.error("❌ Initial sync failed:", error);
			if (error.response?.status === 401) {
				return {
					success: false,
					error: "Authentication failed - please check your API key",
				};
			}
			return { success: false, error: error.message };
		}
	}

	/**
	 * Perform delta sync (only fetch changed data)
	 */
	async performDeltaSync() {
		console.log("🔄 Starting delta sync...");

		const isOnline = await this.checkOnlineStatus();
		if (!isOnline) {
			return { success: false, error: "Backend is offline" };
		}

		// Check if we have API key
		if (!this.apiKey) {
			console.log("🔐 No API key available - user needs to generate one first");
			return {
				success: false,
				error: "API key required - please generate an API key first",
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
				// If no last sync, perform initial sync
				return await this.performInitialSync();
			}

			await this.updateLastSyncTimestamp();

			console.log("✅ Delta sync completed successfully");
			return { success: true };
		} catch (error) {
			console.error("❌ Delta sync failed:", error);
			if (error.response?.status === 401) {
				return {
					success: false,
					error: "Authentication failed - please check your API key",
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
					// Delta sync - update individual categories
					await this.repositories.categories.updateFromBackend(categories);
				} else {
					// Initial sync - replace all
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
				// Cache images for products that have them
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

			// Generate a unique filename for the image
			const imageUrl = product.image;
			const urlHash = crypto.createHash("md5").update(imageUrl).digest("hex");
			const extension = path.extname(imageUrl) || ".jpg";
			const filename = `product_${product.id}_${urlHash}${extension}`;
			const localPath = path.join(this.imagesCacheDir, filename);

			// Check if image already exists
			try {
				await fs.access(localPath);
				// File exists, update the local path in product data
				product.local_image_path = `file://${localPath}`;
				return;
			} catch {
				// File doesn't exist, download it
			}

			// Download the image
			const response = await axios.get(imageUrl, {
				responseType: "arraybuffer",
				timeout: 30000, // 30 second timeout
			});

			// Save the image locally
			await fs.writeFile(localPath, response.data);

			// Update the product with local image path
			product.local_image_path = `file://${localPath}`;

			console.log(`🖼️ Cached image for product ${product.id}`);
		} catch (error) {
			console.error(
				`❌ Failed to cache image for product ${product.id}:`,
				error
			);
			// Don't throw - continue with sync even if image caching fails
		}
	}

	/**
	 * Ensure images cache directory exists
	 */
	async ensureImagesCacheDir() {
		try {
			await fs.mkdir(this.imagesCacheDir, { recursive: true });
		} catch (error) {
			console.error("❌ Failed to create images cache directory:", error);
		}
	}

	/**
	 * Get last sync timestamp
	 */
	async getLastSyncTimestamp() {
		try {
			const record = this.repositories.products.db
				.prepare(
					`
				SELECT value FROM sync_metadata WHERE key = 'global_last_sync'
			`
				)
				.get();

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
			const now = new Date().toISOString();
			this.repositories.products.db
				.prepare(
					`
				INSERT OR REPLACE INTO sync_metadata (key, value, updated_at)
				VALUES ('global_last_sync', ?, CURRENT_TIMESTAMP)
			`
				)
				.run(now);
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
			hasData: await this.hasLocalData(),
		};
	}

	/**
	 * Check if we have local data
	 */
	async hasLocalData() {
		try {
			const productsCount = this.repositories.products.db
				.prepare(
					`
				SELECT COUNT(*) as count FROM products
			`
				)
				.get().count;

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
			{ id: 4, name: "Cold Drinks", parent_id: 1 },
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
				local_image_path: null,
			},
			{
				id: 2,
				name: "Sandwich",
				description: "Turkey and cheese sandwich",
				price: 8.99,
				category_id: 2,
				product_type_id: 1,
				is_active: 1,
				local_image_path: null,
			},
		];

		const sampleUsers = [
			{
				id: 1,
				email: "admin@example.com",
				username: "admin",
				first_name: "Admin",
				last_name: "User",
				role: "ADMIN",
				is_active: 1,
			},
		];

		const sampleDiscounts = [
			{
				id: 1,
				name: "10% Off",
				type: "PERCENTAGE",
				scope: "ORDER",
				value: 10.0,
				is_active: 1,
			},
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

export default SyncService;
