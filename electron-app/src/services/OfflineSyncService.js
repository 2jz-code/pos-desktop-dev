import apiClient from "@/shared/lib/apiClient";

/**
 * OfflineSyncService
 * Manages offline dataset caching and queue synchronization
 *
 * Responsibilities:
 * - Poll backend sync endpoints to get latest data
 * - Cache datasets in local SQLite database
 * - Track dataset versions for incremental sync
 * - Flush pending operations queue when online
 */
class OfflineSyncService {
	constructor() {
		this.syncInterval = null;
		this.syncIntervalMs = 30000; // Sync every 30 seconds
		this.isSyncing = false;
		this.datasetVersions = {}; // Track last synced version for each dataset
		this.versionsLoaded = false; // Flag to track if versions have been loaded from DB
	}

	/**
	 * Load dataset versions from SQLite on startup
	 * This enables incremental sync across app restarts
	 */
	async loadDatasetVersions() {
		if (this.versionsLoaded) return;

		try {
			const datasets = await window.offlineAPI.getAllDatasetVersions();

			// datasets = [{ key: 'products', version: '2025-...', synced_at: '...' }, ...]
			for (const ds of datasets) {
				this.datasetVersions[ds.key] = ds.version;
			}

			this.versionsLoaded = true;
			console.log("📦 Loaded dataset versions from SQLite:", this.datasetVersions);
		} catch (error) {
			console.error("❌ Failed to load dataset versions:", error);
			// Continue with empty versions (will do full sync)
		}
	}

	/**
	 * Start automatic syncing
	 */
	async start(intervalMs = 30000) {
		if (this.syncInterval) {
			console.log("⚠️ Sync service already running");
			return;
		}

		this.syncIntervalMs = intervalMs;
		console.log(`🔄 Starting offline sync service (every ${intervalMs}ms)`);

		// Load persisted versions before first sync
		await this.loadDatasetVersions();

		// Initial sync
		this.syncAll();

		// Set up periodic sync
		this.syncInterval = setInterval(() => {
			this.syncAll();
		}, this.syncIntervalMs);
	}

	/**
	 * Stop automatic syncing
	 */
	stop() {
		if (this.syncInterval) {
			clearInterval(this.syncInterval);
			this.syncInterval = null;
			console.log("⏹️ Stopped offline sync service");
		}
	}

	/**
	 * Sync all datasets
	 */
	async syncAll() {
		if (this.isSyncing) {
			console.log("⏭️ Sync already in progress, skipping...");
			return;
		}

		this.isSyncing = true;

		try {
			console.log("🔄 Starting full dataset sync...");

			// Sync all catalog datasets
			await this.syncProducts();
			await this.syncCategories();
			await this.syncModifiers();
			await this.syncDiscounts();
			await this.syncTaxes();
			await this.syncProductTypes();

			// Sync user data
			await this.syncUsers();

			// Sync inventory data
			await this.syncInventory();
			await this.syncInventoryLocations();

			// Sync settings
			await this.syncSettings();

			// Flush pending operations queue
			await this.flushQueue();

			console.log("✅ Full sync completed successfully");
		} catch (error) {
			console.error("❌ Sync failed:", error);
		} finally {
			this.isSyncing = false;
		}
	}

	/**
	 * Sync products dataset
	 */
	async syncProducts() {
		try {
			const since = this.datasetVersions.products || null;
			const body = since ? { since } : {};
			const response = await apiClient.post("/sync/catalog/", body);

			const { data, next_version, deleted_ids } = response.data;

			console.log(`📦 Products sync: ${data.length} records, ${deleted_ids?.length || 0} deletions`);

			// Cache products
			if (data && data.length > 0) {
				await window.offlineAPI.cacheDataset("products", data, next_version);
			}

			// Apply deletions
			if (deleted_ids && deleted_ids.length > 0) {
				await window.offlineAPI.deleteRecords("products", deleted_ids);
			}

			// Update version tracking
			this.datasetVersions.products = next_version;

			console.log(`✅ Products cached (version: ${next_version})`);
		} catch (error) {
			console.error("❌ Failed to sync products:", error);
			throw error;
		}
	}

	/**
	 * Sync categories dataset
	 */
	async syncCategories() {
		try {
			const since = this.datasetVersions.categories || null;
			const body = since ? { since } : {};
			const response = await apiClient.post("/sync/categories/", body);

			const { data, next_version, deleted_ids } = response.data;

			console.log(`📦 Categories sync: ${data.length} records, ${deleted_ids?.length || 0} deletions`);

			if (data && data.length > 0) {
				await window.offlineAPI.cacheDataset("categories", data, next_version);
			}

			if (deleted_ids && deleted_ids.length > 0) {
				await window.offlineAPI.deleteRecords("categories", deleted_ids);
			}

			this.datasetVersions.categories = next_version;

			console.log(`✅ Categories cached (version: ${next_version})`);
		} catch (error) {
			console.error("❌ Failed to sync categories:", error);
			throw error;
		}
	}

	/**
	 * Sync modifier sets dataset
	 */
	async syncModifiers() {
		try {
			const since = this.datasetVersions.modifier_sets || null;
			const body = since ? { since } : {};
			const response = await apiClient.post("/sync/modifiers/", body);

			const { data, next_version, deleted_ids } = response.data;

			console.log(`📦 Modifiers sync: ${data.length} records, ${deleted_ids?.length || 0} deletions`);

			if (data && data.length > 0) {
				await window.offlineAPI.cacheDataset("modifier_sets", data, next_version);
			}

			if (deleted_ids && deleted_ids.length > 0) {
				await window.offlineAPI.deleteRecords("modifier_sets", deleted_ids);
			}

			this.datasetVersions.modifier_sets = next_version;

			console.log(`✅ Modifiers cached (version: ${next_version})`);
		} catch (error) {
			console.error("❌ Failed to sync modifiers:", error);
			throw error;
		}
	}

	/**
	 * Sync discounts dataset
	 */
	async syncDiscounts() {
		try {
			const since = this.datasetVersions.discounts || null;
			const body = since ? { since } : {};
			const response = await apiClient.post("/sync/discounts/", body);

			const { data, next_version, deleted_ids } = response.data;

			console.log(`📦 Discounts sync: ${data.length} records, ${deleted_ids?.length || 0} deletions`);

			if (data && data.length > 0) {
				await window.offlineAPI.cacheDataset("discounts", data, next_version);
			}

			if (deleted_ids && deleted_ids.length > 0) {
				await window.offlineAPI.deleteRecords("discounts", deleted_ids);
			}

			this.datasetVersions.discounts = next_version;

			console.log(`✅ Discounts cached (version: ${next_version})`);
		} catch (error) {
			console.error("❌ Failed to sync discounts:", error);
			throw error;
		}
	}

	/**
	 * Sync taxes dataset
	 */
	async syncTaxes() {
		try {
			const since = this.datasetVersions.taxes || null;
			const body = since ? { since } : {};
			const response = await apiClient.post("/sync/taxes/", body);

			const { data, next_version, deleted_ids } = response.data;

			console.log(`📦 Taxes sync: ${data.length} records, ${deleted_ids?.length || 0} deletions`);

			if (data && data.length > 0) {
				await window.offlineAPI.cacheDataset("taxes", data, next_version);
			}

			if (deleted_ids && deleted_ids.length > 0) {
				await window.offlineAPI.deleteRecords("taxes", deleted_ids);
			}

			this.datasetVersions.taxes = next_version;

			console.log(`✅ Taxes cached (version: ${next_version})`);
		} catch (error) {
			console.error("❌ Failed to sync taxes:", error);
			throw error;
		}
	}

	/**
	 * Sync product types dataset
	 */
	async syncProductTypes() {
		try {
			const since = this.datasetVersions.product_types || null;
			const body = since ? { since } : {};
			const response = await apiClient.post("/sync/product-types/", body);

			const { data, next_version, deleted_ids } = response.data;

			console.log(`📦 Product types sync: ${data.length} records, ${deleted_ids?.length || 0} deletions`);

			if (data && data.length > 0) {
				await window.offlineAPI.cacheDataset("product_types", data, next_version);
			}

			if (deleted_ids && deleted_ids.length > 0) {
				await window.offlineAPI.deleteRecords("product_types", deleted_ids);
			}

			this.datasetVersions.product_types = next_version;

			console.log(`✅ Product types cached (version: ${next_version})`);
		} catch (error) {
			console.error("❌ Failed to sync product types:", error);
			throw error;
		}
	}

	/**
	 * Sync users dataset (POS staff)
	 */
	async syncUsers() {
		try {
			const since = this.datasetVersions.users || null;
			const body = since ? { since } : {};
			const response = await apiClient.post("/sync/users/", body);

			const { data, next_version, deleted_ids } = response.data;

			console.log(`📦 Users sync: ${data.length} records, ${deleted_ids?.length || 0} deletions`);

			if (data && data.length > 0) {
				await window.offlineAPI.cacheDataset("users", data, next_version);
			}

			if (deleted_ids && deleted_ids.length > 0) {
				await window.offlineAPI.deleteRecords("users", deleted_ids);
			}

			this.datasetVersions.users = next_version;

			console.log(`✅ Users cached (version: ${next_version})`);
		} catch (error) {
			console.error("❌ Failed to sync users:", error);
			throw error;
		}
	}

	/**
	 * Sync inventory stocks dataset
	 */
	async syncInventory() {
		try {
			const since = this.datasetVersions.inventory_stocks || null;
			const body = since ? { since } : {};
			const response = await apiClient.post("/sync/inventory/", body);

			const { data, next_version, deleted_ids } = response.data;

			console.log(`📦 Inventory stocks sync: ${data.length} records, ${deleted_ids?.length || 0} deletions`);

			if (data && data.length > 0) {
				await window.offlineAPI.cacheDataset("inventory_stocks", data, next_version);
			}

			if (deleted_ids && deleted_ids.length > 0) {
				await window.offlineAPI.deleteRecords("inventory_stocks", deleted_ids);
			}

			this.datasetVersions.inventory_stocks = next_version;

			console.log(`✅ Inventory stocks cached (version: ${next_version})`);
		} catch (error) {
			console.error("❌ Failed to sync inventory:", error);
			throw error;
		}
	}

	/**
	 * Sync inventory locations dataset
	 */
	async syncInventoryLocations() {
		try {
			const since = this.datasetVersions.inventory_locations || null;
			const body = since ? { since } : {};
			const response = await apiClient.post("/sync/inventory-locations/", body);

			const { data, next_version, deleted_ids } = response.data;

			console.log(`📦 Inventory locations sync: ${data.length} records, ${deleted_ids?.length || 0} deletions`);

			if (data && data.length > 0) {
				await window.offlineAPI.cacheDataset("inventory_locations", data, next_version);
			}

			if (deleted_ids && deleted_ids.length > 0) {
				await window.offlineAPI.deleteRecords("inventory_locations", deleted_ids);
			}

			this.datasetVersions.inventory_locations = next_version;

			console.log(`✅ Inventory locations cached (version: ${next_version})`);
		} catch (error) {
			console.error("❌ Failed to sync inventory locations:", error);
			throw error;
		}
	}

	/**
	 * Sync settings dataset (global settings and store location config)
	 */
	async syncSettings() {
		try {
			// Get last synced version
			const since = this.datasetVersions.settings || null;

			// Fetch from backend (POST required for device auth)
			const body = since ? { since } : {};
			const response = await apiClient.post("/sync/settings/", body);

			const { data, next_version } = response.data;

			// Guard: Ensure next_version is present
			if (!next_version) {
				console.error("❌ Settings sync response missing next_version:", response.data);
				throw new Error("Settings sync response missing required field: next_version");
			}

			console.log(`⚙️ Settings sync`);

			// Cache settings (special handling for object format)
			await window.offlineAPI.cacheDataset("settings", data, next_version);

			// Update version tracking
			this.datasetVersions.settings = next_version;

			console.log(`✅ Settings cached (version: ${next_version})`);
		} catch (error) {
			console.error("❌ Failed to sync settings:", error);
			throw error;
		}
	}

	/**
	 * Flush pending operations queue
	 * Sends queued offline operations to the backend
	 */
	async flushQueue() {
		try {
			// Get pending operations
			const pending = await window.offlineAPI.listPendingOperations({ status: "PENDING" });

			if (pending.length === 0) {
				return; // Nothing to flush
			}

			console.log(`📤 Flushing ${pending.length} pending operations...`);

			for (const operation of pending) {
				try {
					// Send to backend based on operation type
					let response;
					switch (operation.type) {
						case "ORDER":
							response = await apiClient.post("/sync/offline-orders/", operation.payload);
							break;
						case "APPROVAL":
							response = await apiClient.post("/sync/offline-approvals/", operation.payload);
							break;
						// Note: Payments are included in ORDER payloads, not sent separately
						// The /sync/offline-payments/ endpoint doesn't exist
						case "PAYMENT":
							console.warn(`⚠️ PAYMENT operations are included in ORDER payloads - skipping separate sync`);
							// Mark as synced since payments are handled within orders
							await window.offlineAPI.markOperationSynced(operation.id, { skipped: true, reason: "included_in_order" });
							continue;
						default:
							throw new Error(`Unknown operation type: ${operation.type}`);
					}

					// Mark as synced
					await window.offlineAPI.markOperationSynced(operation.id, response.data);
					console.log(`✅ Operation ${operation.id} synced successfully`);
				} catch (error) {
					// Mark as failed
					await window.offlineAPI.markOperationFailed(operation.id, error.message);
					console.error(`❌ Failed to sync operation ${operation.id}:`, error.message);
				}
			}

			console.log(`✅ Queue flush complete`);
		} catch (error) {
			console.error("❌ Failed to flush queue:", error);
		}
	}

	/**
	 * Force an immediate sync
	 */
	async forceSync() {
		await this.syncAll();
	}

	/**
	 * Get sync status
	 */
	async getStatus() {
		try {
			const stats = await window.offlineAPI.getCompleteStats();
			return {
				isSyncing: this.isSyncing,
				datasetVersions: this.datasetVersions,
				queue: stats.queue,
				exposure: stats.exposure,
				network: stats.network,
				sync: stats.sync,
				limits: stats.limits
			};
		} catch (error) {
			console.error("Failed to get sync status:", error);
			return null;
		}
	}
}

// Export singleton instance
const offlineSyncService = new OfflineSyncService();
export default offlineSyncService;
