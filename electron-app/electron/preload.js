const { contextBridge, ipcRenderer } = require("electron");

console.log("--- [Preload] Preload script started ---");

// --- Channels for state management between windows ---
const validIpcChannels = [
	"POS_TO_CUSTOMER_STATE",
	"CUSTOMER_TO_POS_TIP",
	"CUSTOMER_REQUESTS_STATE",
	"CUSTOMER_HEALTH_CHECK_PING", // Health check from main process
];

// --- REFACTOR: These are the channels for our NEW hardware functions ---
const validInvokeChannels = [
	"discover-printers",
	"print-receipt",
	"open-cash-drawer",
	"get-session-cookies",
	"get-machine-id",
	"get-device-fingerprint", // Hardware-based terminal identity
	"print-kitchen-ticket",
	"test-network-printer",
];

// Database and sync channels removed - moving to online-only architecture

// --- Unchanged: Expose state management IPC ---
contextBridge.exposeInMainWorld("electronAPI", {
	shutdown: () => ipcRenderer.send("shutdown-app"),
	// --- Main API Bridge ---

	/**
	 * Gets the unique machine ID from the main process.
	 * @returns {Promise<string>} The unique machine ID.
	 */
	getMachineId: () => ipcRenderer.invoke("get-machine-id"),

	/**
	 * Gets the hardware-based device fingerprint (stable across reinstalls).
	 * Used for terminal registration and location context.
	 * @returns {Promise<string>} The hardware fingerprint (UUID format).
	 */
	getDeviceFingerprint: () => ipcRenderer.invoke("get-device-fingerprint"),

	/**
	 * Gets a list of connected printers from the main process.
	 * @returns {Promise<Array>} A list of printer objects.
	 */
	getPrinters: () => ipcRenderer.invoke("get-printers"),

	/**
	 * Sends a receipt object to the main process for printing.
	 * @param {object} data - The receipt data.
	 */
	printReceipt: (data) => ipcRenderer.send("print-receipt", data),

	/**
	 * Sends a kitchen order object to the main process for printing.
	 * @param {object} data - The kitchen order data.
	 */
	printKitchenOrder: (data) => ipcRenderer.send("print-kitchen-order", data),

	/**
	 * Sends a command to open the cash drawer connected to a specific printer.
	 * @param {object} printer - The printer object.
	 */
	openCashDrawer: (printer) => ipcRenderer.send("open-cash-drawer", printer),

	/**
	 * Sends data to the customer-facing display.
	 * @param {string} channel - The event channel to emit on the customer display.
	 * @param {object} data - The payload to send.
	 */
	sendToCustomerDisplay: (channel, data) => {
		ipcRenderer.send("to-customer-display", { channel, data });
	},

	sendActionToPos: (channel, data) => {
		ipcRenderer.send("from-customer-display", { channel, data });
	},

	/**
	 * Listens for actions coming from the customer-facing display.
	 * @param {function} callback - The function to call with the action data.
	 * @returns {function} A cleanup function to remove the listener.
	 */
	onCustomerDisplayAction: (callback) => {
		const customerChannels = ["CUSTOMER_TO_POS_TIP"];
		const handlers = [];

		customerChannels.forEach((channel) => {
			const handler = (_event, data) => {
				const action = { channel, data };
				callback(action);
			};
			ipcRenderer.on(channel, handler);
			handlers.push({ channel, handler });
		});

		// Return a cleanup function to be called on component unmount
		return () => {
			handlers.forEach(({ channel, handler }) => {
				ipcRenderer.removeListener(channel, handler);
			});
		};
	},

	requestInitialState: () => {
		ipcRenderer.send("CUSTOMER_REQUESTS_STATE");
	},

	/**
	 * Sends a health check pong response back to the main process.
	 * Called in response to CUSTOMER_HEALTH_CHECK_PING.
	 */
	sendHealthCheckPong: () => {
		ipcRenderer.send("CUSTOMER_HEALTH_CHECK_PONG");
	},

	onMessage: (channel, callback) => {
		if (validIpcChannels.includes(channel)) {
			const handler = (_event, ...args) => callback(...args);
			ipcRenderer.on(channel, handler);
			return () => ipcRenderer.removeListener(channel, handler);
		}
	},

	/**
	 * Plays a notification sound via the main process.
	 * @param {string|null} soundFile - The name of the sound file in public/sounds, or null for default.
	 * @returns {Promise<{success: boolean, error?: string}>}
	 */
	playNotificationSound: async (soundFile) => {
		try {
			const result = await ipcRenderer.invoke(
				"play-notification-sound",
				soundFile
			);
			return result;
		} catch (error) {
			console.error("Error invoking playNotificationSound:", error);
			return { success: false, error: error.message };
		}
	},
});

// --- Expose the hardware API with logging ---
contextBridge.exposeInMainWorld("hardwareApi", {
	invoke: (channel, ...args) => {
		console.log(
			`[Preload] hardwareApi.invoke called with channel: "${channel}"`
		);
		if (validInvokeChannels.includes(channel)) {
			console.log(
				`[Preload] Channel "${channel}" is valid. Invoking main process.`
			);
			return ipcRenderer.invoke(channel, ...args);
		} else {
			// This will now show an error in your browser console if you call an invalid channel
			console.error(
				`[Preload] ERROR: Channel "${channel}" is not a valid invoke channel.`
			);
			return Promise.reject(new Error(`Invalid IPC channel: ${channel}`));
		}
	},
});

// --- Offline Mode API (Phase 2) ---
contextBridge.exposeInMainWorld("offlineAPI", {
	// Dataset caching
	cacheDataset: (datasetName, rows, version) =>
		ipcRenderer.invoke("offline:cache-dataset", datasetName, rows, version),
	deleteRecords: (tableName, deletedIds) =>
		ipcRenderer.invoke("offline:delete-records", tableName, deletedIds),

	// Get cached data
	getCachedProducts: (filters) => ipcRenderer.invoke("offline:get-cached-products", filters),
	getCachedCategories: () =>
		ipcRenderer.invoke("offline:get-cached-categories"),
	getCachedDiscounts: (options) => ipcRenderer.invoke("offline:get-cached-discounts", options),
	getCachedModifierSets: () =>
		ipcRenderer.invoke("offline:get-cached-modifier-sets"),
	getCachedTaxes: () => ipcRenderer.invoke("offline:get-cached-taxes"),
	getCachedProductTypes: () =>
		ipcRenderer.invoke("offline:get-cached-product-types"),
	getCachedInventory: () => ipcRenderer.invoke("offline:get-cached-inventory"),
	getCachedInventoryLocations: () => ipcRenderer.invoke("offline:get-cached-inventory-locations"),
	getCachedSettings: () => ipcRenderer.invoke("offline:get-cached-settings"),
	getCachedUsers: (options) => ipcRenderer.invoke("offline:get-cached-users", options),

	// Offline authentication
	authenticate: (username, pin) => ipcRenderer.invoke("offline:authenticate", { username, pin }),

	// Developer tools
	clearCache: () => ipcRenderer.invoke("offline:clear-cache"),

	// Get specific records
	getProductById: (productId) =>
		ipcRenderer.invoke("offline:get-product-by-id", productId),
	getProductByBarcode: (barcode) =>
		ipcRenderer.invoke("offline:get-product-by-barcode", barcode),
	getUserById: (userId) =>
		ipcRenderer.invoke("offline:get-user-by-id", userId),
	getInventoryByProductId: (productId) =>
		ipcRenderer.invoke("offline:get-inventory-by-product", productId),

	// Dataset versions
	getDatasetVersion: (datasetName) =>
		ipcRenderer.invoke("offline:get-dataset-version", datasetName),
	getAllDatasetVersions: () =>
		ipcRenderer.invoke("offline:get-all-dataset-versions"),

	// Queue operations
	queueOperation: (operation) =>
		ipcRenderer.invoke("offline:queue-operation", operation),
	listPendingOperations: (filters) =>
		ipcRenderer.invoke("offline:list-pending", filters),
	markOperationSynced: (operationId, serverResponse) =>
		ipcRenderer.invoke(
			"offline:mark-synced",
			operationId,
			serverResponse
		),
	markOperationFailed: (operationId, errorMessage) =>
		ipcRenderer.invoke("offline:mark-failed", operationId, errorMessage),

	// Offline orders
	recordOfflineOrder: (orderPayload) =>
		ipcRenderer.invoke("offline:record-order", orderPayload),
	getOfflineOrder: (localOrderId) =>
		ipcRenderer.invoke("offline:get-order", localOrderId),
	listOfflineOrders: (status) =>
		ipcRenderer.invoke("offline:list-orders", status),
	updateOfflineOrderStatus: (localOrderId, status, serverData) =>
		ipcRenderer.invoke(
			"offline:update-order-status",
			localOrderId,
			status,
			serverData
		),
	deleteOfflineOrder: (localOrderId) =>
		ipcRenderer.invoke("offline:delete-order", localOrderId),

	// Offline payments
	recordOfflinePayment: (paymentData) =>
		ipcRenderer.invoke("offline:record-payment", paymentData),
	getOfflinePayments: (localOrderId) =>
		ipcRenderer.invoke("offline:get-payments", localOrderId),

	// Offline approvals
	recordOfflineApproval: (approvalData) =>
		ipcRenderer.invoke("offline:record-approval", approvalData),
	getUnsyncedApprovals: () =>
		ipcRenderer.invoke("offline:get-unsynced-approvals"),

	// Metadata & stats
	getQueueStats: () => ipcRenderer.invoke("offline:get-queue-stats"),
	getOfflineExposure: () => ipcRenderer.invoke("offline:get-exposure"),
	getNetworkStatus: () => ipcRenderer.invoke("offline:get-network-status"),
	getSyncStatus: () => ipcRenderer.invoke("offline:get-sync-status"),
	getCompleteStats: () => ipcRenderer.invoke("offline:get-complete-stats"),
	checkLimitExceeded: (type, amount) =>
		ipcRenderer.invoke("offline:check-limit", type, amount),
	clearAllPendingData: () => ipcRenderer.invoke("offline:clear-all-pending"),

	// Network events
	onNetworkStatusChanged: (callback) => {
		const handler = (_event, status) => callback(status);
		ipcRenderer.on("offline:network-status-changed", handler);
		return () =>
			ipcRenderer.removeListener(
				"offline:network-status-changed",
				handler
			);
	},

	// Database operations
	getDatabaseStats: () => ipcRenderer.invoke("offline:get-db-stats"),
	createBackup: () => ipcRenderer.invoke("offline:create-backup"),
	vacuumDatabase: () => ipcRenderer.invoke("offline:vacuum-db"),

	// Terminal pairing operations
	storePairingInfo: (pairingInfo) =>
		ipcRenderer.invoke("offline:store-pairing", pairingInfo),
	getPairingInfo: () => ipcRenderer.invoke("offline:get-pairing"),
	isPaired: () => ipcRenderer.invoke("offline:is-paired"),
	clearPairingInfo: () => ipcRenderer.invoke("offline:clear-pairing"),
});
