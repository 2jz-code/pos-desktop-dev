import apiClient from "@/shared/lib/apiClient";
import { handleSyncComplete } from "@/shared/lib/offlineInitialization";
import { v4 as uuidv4 } from "uuid";

/**
 * OfflineSyncService
 * Manages offline dataset caching and queue synchronization
 *
 * Responsibilities:
 * - Poll backend sync endpoints to get latest data
 * - Cache datasets in local SQLite database
 * - Track dataset versions for incremental sync
 * - Flush pending operations queue when online
 *
 * PAYLOAD CONTRACT: See @/shared/types/offlineSync.ts for type definitions.
 * When modifying buildIngestPayload(), keep types in sync with:
 * - Frontend: offlineSync.ts (OfflineOrderIngestPayload)
 * - Backend: sync/serializers/ingest_serializers.py
 */
class OfflineSyncService {
	constructor() {
		this.syncInterval = null;
		this.heartbeatInterval = null;
		this.syncIntervalMs = 30000; // Sync every 30 seconds
		this.heartbeatIntervalMs = 60000; // Heartbeat every 60 seconds
		this.isSyncing = false;
		this.isFlushingQueue = false; // Guard against concurrent flush attempts
		this.datasetVersions = {}; // Track last synced version for each dataset
		this.versionsLoaded = false; // Flag to track if versions have been loaded from DB
		this.updatedDatasets = []; // Track which datasets were updated in current sync
		this.lastSyncSuccess = null; // Track last successful full sync timestamp
		this.lastFlushSuccess = null; // Track last successful queue flush timestamp
		this.offlineSince = null; // Track when we went offline
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

		// Start heartbeat (runs independently of sync)
		this.startHeartbeat();

		// Listen for reconnect to send immediate heartbeat
		this.setupReconnectListener();
	}

	/**
	 * Stop automatic syncing
	 */
	stop() {
		if (this.syncInterval) {
			clearInterval(this.syncInterval);
			this.syncInterval = null;
		}
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}
		// Remove reconnect listener
		if (this._onlineHandler) {
			window.removeEventListener('online', this._onlineHandler);
			this._onlineHandler = null;
		}
		console.log("⏹️ Stopped offline sync service");
	}

	/**
	 * Set up listener to send immediate heartbeat on reconnect
	 */
	setupReconnectListener() {
		if (this._onlineHandler) return; // Already set up

		this._onlineHandler = () => {
			console.log('🌐 [OfflineSync] Network reconnected, sending immediate heartbeat');
			this.sendHeartbeat();
		};

		if (typeof window !== 'undefined') {
			window.addEventListener('online', this._onlineHandler);
		}
	}

	/**
	 * Start heartbeat interval
	 * Heartbeats run independently of sync to keep backend informed of terminal status
	 */
	startHeartbeat() {
		if (this.heartbeatInterval) {
			return; // Already running
		}

		console.log(`💓 Starting heartbeat (every ${this.heartbeatIntervalMs}ms)`);

		// Initial heartbeat
		this.sendHeartbeat();

		// Set up periodic heartbeat
		this.heartbeatInterval = setInterval(() => {
			this.sendHeartbeat();
		}, this.heartbeatIntervalMs);
	}

	/**
	 * Send heartbeat to backend
	 * Reports terminal status including online/offline, pending counts, exposure
	 */
	async sendHeartbeat() {
		try {
			const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

			// Track offline_since
			if (!isOnline && !this.offlineSince) {
				this.offlineSince = new Date().toISOString();
			} else if (isOnline) {
				this.offlineSince = null;
			}

			// Skip heartbeat if offline (can't reach backend anyway)
			if (!isOnline) {
				console.log('💔 [Heartbeat] Offline, skipping');
				return;
			}

			// Get pairing info
			const pairingInfo = await window.offlineAPI?.getPairingInfo();
			if (!pairingInfo) {
				console.log('💔 [Heartbeat] No pairing info, skipping');
				return;
			}

			// Get queue stats
			const stats = await window.offlineAPI?.getQueueStats() || {};

			// Get exposure (correct API name from preload)
			const exposure = await window.offlineAPI?.getOfflineExposure?.() || { total_exposure: 0 };

			// Build heartbeat payload
			// Note: is_syncing only reflects queue flushing (what admin cares about),
			// not routine dataset syncs which run every 30s
			const payload = {
				device_id: pairingInfo.terminal_id,
				is_online: isOnline,
				is_syncing: this.isFlushingQueue, // Only true when flushing orders
				is_flushing: this.isFlushingQueue,
				pending_orders: stats.pending_orders || 0,
				pending_operations: stats.pending_operations || 0,
				conflict_orders: stats.conflict_orders || 0,
				failed_operations: stats.failed_operations || 0,
				exposure_amount: parseFloat(exposure.total_exposure || 0).toFixed(2),
				offline_since: this.offlineSince,
				last_sync_success: this.lastSyncSuccess,
				last_flush_success: this.lastFlushSuccess,
				client_timestamp: new Date().toISOString(),
			};

			// Send to backend
			const response = await apiClient.post('/sync/heartbeat/', payload);

			// Handle response instructions
			if (response.data.force_flush && !this.isFlushingQueue) {
				console.log('💓 [Heartbeat] Server requested flush');
				this.flushQueue();
			}

			if (response.data.force_sync && !this.isSyncing) {
				console.log('💓 [Heartbeat] Server requested sync');
				this.syncAll();
			}

		} catch (error) {
			// Heartbeat failures are non-critical, just log
			console.warn('💔 [Heartbeat] Failed:', error.message);
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
		this.updatedDatasets = []; // Reset tracking

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

			// Track successful sync
			this.lastSyncSuccess = new Date().toISOString();

			// Notify relation cache to invalidate if needed
			if (this.updatedDatasets.length > 0) {
				handleSyncComplete(this.updatedDatasets);
			}
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

			// Track if this dataset was updated
			const hasUpdates = (data && data.length > 0) || (deleted_ids && deleted_ids.length > 0);
			if (hasUpdates) {
				this.updatedDatasets.push('categories');
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

			// Track if this dataset was updated
			const hasUpdates = (data && data.length > 0) || (deleted_ids && deleted_ids.length > 0);
			if (hasUpdates) {
				this.updatedDatasets.push('taxes');
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

			// Track if this dataset was updated
			const hasUpdates = (data && data.length > 0) || (deleted_ids && deleted_ids.length > 0);
			if (hasUpdates) {
				this.updatedDatasets.push('product_types');
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
	 * Flush pending offline orders queue
	 * Sends queued complete orders to the backend
	 */
	async flushQueue() {
		// Guard against concurrent flush attempts (can happen from multiple sources)
		if (this.isFlushingQueue) {
			console.log('⏳ [OfflineSync] Flush already in progress, skipping');
			return;
		}

		this.isFlushingQueue = true;
		let syncedCount = 0;

		try {
			// Get pending ORDERS (not individual cart operations)
			// offline_orders table stores complete orders ready for sync
			const pendingOrders = await window.offlineAPI.listOfflineOrders("PENDING");

			if (pendingOrders.length === 0) {
				return; // Nothing to flush
			}

			console.log(`📤 Flushing ${pendingOrders.length} pending offline orders...`);

			// Get pairing info for device_id
			const pairingInfo = await window.offlineAPI.getPairingInfo();
			if (!pairingInfo) {
				console.error("❌ No pairing info available, cannot sync offline orders");
				return;
			}

			// Get dataset versions for conflict detection
			const versions = await window.offlineAPI.getAllDatasetVersions();
			const datasetVersions = {};
			for (const v of versions) {
				datasetVersions[v.key] = v.version;
			}

			for (const order of pendingOrders) {
				try {
					// Build the ingest payload from the stored order data
					const payload = this.buildIngestPayload(order, pairingInfo, datasetVersions);

					// Send to backend
					const response = await apiClient.post("/sync/offline-orders/", payload);

					// Handle response - orders are always accepted (industry standard)
					console.log(`[OfflineSync] Response status: "${response.data.status}"`, response.data);

					if (response.data.status === 'SUCCESS') {
						syncedCount++;

						// Log any warnings (informational only - order was still created)
						if (response.data.warnings?.length > 0) {
							console.warn(`⚠️ Order ${order.local_id} synced with warnings:`, response.data.warnings);
						}

						// Delete from local DB after successful sync - order now lives on backend
						try {
							const deleted = await window.offlineAPI.deleteOfflineOrder(order.local_id);
							console.log(`✅ Order ${order.local_id} synced as ${response.data.order_number} - delete result: ${deleted}`);
						} catch (deleteErr) {
							console.error(`❌ Failed to delete local order ${order.local_id}:`, deleteErr);
						}
					} else {
						throw new Error(response.data.errors?.join('; ') || 'Unknown error');
					}
				} catch (error) {
					// Mark order as failed but keep in queue for retry
					const errorMsg = error.response?.data?.errors?.join('; ') ||
						error.response?.data?.detail ||
						error.message;
					console.error(`❌ Failed to sync order ${order.local_id}:`, errorMsg);

					// Don't update status to FAILED immediately - allow retries
					// Only log the error for now
				}
			}

			// Track successful flush if we synced at least one order
			if (syncedCount > 0) {
				this.lastFlushSuccess = new Date().toISOString();
			}

			console.log(`✅ Order queue flush complete (${syncedCount}/${pendingOrders.length} synced)`);
		} catch (error) {
			console.error("❌ Failed to flush order queue:", error);
		} finally {
			this.isFlushingQueue = false;
			// Send heartbeat after flush to update backend with new counts/status
			this.sendHeartbeat();
		}
	}

	/**
	 * Build the ingest payload for the backend from stored order data
	 * Transforms the raw order payload into the format expected by /sync/offline-orders/
	 *
	 * @param {Object} order - The stored offline order record
	 * @param {Object} pairingInfo - Terminal pairing info
	 * @param {Object} datasetVersions - Current dataset versions
	 * @returns {Object} - Formatted payload for /sync/offline-orders/
	 */
	buildIngestPayload(order, pairingInfo, datasetVersions) {
		const payload = order.payload;

		// Use stable operation_id from order.local_id for idempotency
		// This ensures retries return cached results instead of creating duplicates
		const operationId = order.local_id || uuidv4();

		// IMPORTANT: created_at is used for auth freshness check (5 min window)
		// We must use current time for auth, but preserve original offline timestamp separately
		const authTimestamp = new Date().toISOString();
		const originalOfflineTimestamp = payload.created_offline_at || order.created_at;

		return {
			// Operation metadata
			operation_id: operationId,
			device_id: pairingInfo.terminal_id,
			nonce: uuidv4().replace(/-/g, '').substring(0, 32),
			created_at: authTimestamp,  // For auth (must be fresh)
			offline_created_at: originalOfflineTimestamp,  // For order creation time
			dataset_versions: datasetVersions,

			// Order details
			order: {
				order_type: payload.order_type || 'POS',
				dining_preference: payload.dining_preference || 'TAKE_OUT',
				status: 'COMPLETED',
				store_location_id: payload.store_location,
				cashier_id: payload.cashier_id,
				guest_first_name: payload.guest_first_name || '',

				// Items
				items: (payload.items || []).map(item => ({
					product_id: item.product_id,
					quantity: item.quantity,
					price_at_sale: item.price_at_sale,
					notes: item.notes || '',
					modifiers: (item.selected_modifiers_snapshot || item.selected_modifiers || [])
						.filter(mod => (mod.modifier_set_id || mod.set_id) && (mod.modifier_option_id || mod.option_id || mod.id))
						.map(mod => ({
							modifier_set_id: String(mod.modifier_set_id || mod.set_id),
							modifier_option_id: String(mod.modifier_option_id || mod.option_id || mod.id),
							price_delta: parseFloat(mod.price_delta ?? mod.price_at_sale ?? mod.price ?? 0),
						})),
					adjustments: (item.adjustments || [])
						.filter(adj => ['PRICE_OVERRIDE', 'TAX_EXEMPT', 'ONE_OFF_DISCOUNT', 'FEE_EXEMPT'].includes(adj.adjustment_type))
						.map(adj => ({
							adjustment_type: adj.adjustment_type,
							discount_type: adj.discount_type || null,
							// Clamp value to safe bound: 99999999.99 (8 digits + 2 decimal)
							value: parseFloat(Math.min(Math.abs(parseFloat(adj.value || 0)), 99999999.99).toFixed(2)),
							notes: adj.notes || '',
							approved_by_user_id: adj.approved_by_user_id || null,
						})),
				})),

				// Discounts
				discounts: (payload.discounts || []).map(d => ({
					discount_id: d.discount_id,
					amount: parseFloat(d.amount),
				})),

				// Order-level adjustments
				adjustments: (payload.adjustments || [])
					.filter(adj => ['ONE_OFF_DISCOUNT', 'FEE_EXEMPT', 'TAX_EXEMPT', 'PRICE_OVERRIDE'].includes(adj.adjustment_type))
					.map(adj => ({
						adjustment_type: adj.adjustment_type,
						discount_type: adj.discount_type || null,
						// Clamp value to safe bound: 99999999.99 (8 digits + 2 decimal)
						value: parseFloat(Math.min(Math.abs(parseFloat(adj.value || 0)), 99999999.99).toFixed(2)),
						notes: adj.notes || '',
						approved_by_user_id: adj.approved_by_user_id || null,
					})),

				// Totals
				subtotal: parseFloat(payload.subtotal || 0),
				tax: parseFloat(payload.tax_amount || 0),
				total: parseFloat(payload.total || 0),
			},

			// Payments
			payments: [{
				method: payload.payment?.method || 'CASH',
				amount: parseFloat(parseFloat(payload.payment?.amount || payload.total || 0).toFixed(2)),
				tip: parseFloat(parseFloat(payload.payment?.tip || 0).toFixed(2)),
				surcharge: 0,
				status: 'COMPLETED',
				cash_tendered: payload.payment?.tendered
					? parseFloat(parseFloat(payload.payment.tendered).toFixed(2))
					: null,
				change_given: payload.payment?.tendered
					? parseFloat(Math.max(0, parseFloat(payload.payment.tendered) - parseFloat(payload.payment.amount || payload.total || 0)).toFixed(2))
					: null,
			}],

			// Inventory deltas - backend computes from items
			inventory_deltas: [],
		};
	}

	/**
	 * Map dining preference to order type
	 */
	mapOrderType(diningPreference) {
		// POS orders are always type 'POS', dining preference is separate
		return 'POS';
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
				isFlushingQueue: this.isFlushingQueue,
				datasetVersions: this.datasetVersions,
				queue: stats.queue,
				exposure: stats.exposure,
				network: stats.network,
				sync: {
					...stats.sync,
					last_sync_success: this.lastSyncSuccess,
					last_flush_success: this.lastFlushSuccess,
				},
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
