//eslint-disable-next-line
const { contextBridge, ipcRenderer } = require("electron");

console.log("--- [Preload] Preload script started ---");

// --- Channels for state management between windows ---
const validIpcChannels = [
	"POS_TO_CUSTOMER_STATE",
	"CUSTOMER_TO_POS_TIP",
	"CUSTOMER_REQUESTS_STATE",
];

// --- REFACTOR: These are the channels for our NEW hardware functions ---
const validInvokeChannels = [
	"discover-printers",
	"print-receipt",
	"open-cash-drawer",
	"print-kitchen-ticket", // <-- ADD THIS LINE
];

// --- Database channels ---
const validDbChannels = [
	"db:get-products",
	"db:get-product-by-id",
	"db:get-products-by-category",
	"db:search-products",
	"db:get-categories",
	"db:get-users",
	"db:get-user-by-username",
	"db:get-discounts",
	"db:add-offline-order",
	"db:get-pending-orders",
	"db:get-queue-status",
	"db:reset",
];

// --- Sync channels ---
const validSyncChannels = [
	"sync:get-status",
	"sync:insert-sample-data",
	"sync:perform-initial-sync",
	"sync:perform-delta-sync",
	"sync:check-online-status",
	"sync:set-api-key",
	"get-session-cookies",
];

// --- Unchanged: Expose state management IPC ---
contextBridge.exposeInMainWorld("ipcApi", {
	send: (channel, data) => {
		if (validIpcChannels.includes(channel)) {
			ipcRenderer.send(channel, data);
		}
	},
	receive: (channel, func) => {
		if (validIpcChannels.includes(channel)) {
			const subscription = (event, ...args) => func(...args);
			ipcRenderer.on(channel, subscription);
			return () => {
				ipcRenderer.removeListener(channel, subscription);
			};
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

// --- Expose the database API ---
contextBridge.exposeInMainWorld("dbApi", {
	invoke: (channel, ...args) => {
		console.log(`[Preload] dbApi.invoke called with channel: "${channel}"`);
		if (validDbChannels.includes(channel)) {
			console.log(
				`[Preload] DB Channel "${channel}" is valid. Invoking main process.`
			);
			return ipcRenderer.invoke(channel, ...args);
		} else {
			console.error(
				`[Preload] ERROR: DB Channel "${channel}" is not a valid invoke channel.`
			);
			return Promise.reject(new Error(`Invalid DB IPC channel: ${channel}`));
		}
	},

	// Convenience methods for common operations
	getProducts: () => ipcRenderer.invoke("db:get-products"),
	getProductById: (id) => ipcRenderer.invoke("db:get-product-by-id", id),
	getProductsByCategory: (categoryId) =>
		ipcRenderer.invoke("db:get-products-by-category", categoryId),
	searchProducts: (searchTerm) =>
		ipcRenderer.invoke("db:search-products", searchTerm),
	getCategories: () => ipcRenderer.invoke("db:get-categories"),
	getUsers: () => ipcRenderer.invoke("db:get-users"),
	getUserByUsername: (username) =>
		ipcRenderer.invoke("db:get-user-by-username", username),
	getDiscounts: () => ipcRenderer.invoke("db:get-discounts"),
	addOfflineOrder: (orderData) =>
		ipcRenderer.invoke("db:add-offline-order", orderData),
	getPendingOrders: () => ipcRenderer.invoke("db:get-pending-orders"),
	getQueueStatus: () => ipcRenderer.invoke("db:get-queue-status"),
	reset: () => ipcRenderer.invoke("db:reset"),
});

// --- Expose the sync API ---
contextBridge.exposeInMainWorld("syncApi", {
	invoke: (channel, ...args) => {
		console.log(`[Preload] syncApi.invoke called with channel: "${channel}"`);
		if (validSyncChannels.includes(channel)) {
			console.log(
				`[Preload] Sync Channel "${channel}" is valid. Invoking main process.`
			);
			return ipcRenderer.invoke(channel, ...args);
		} else {
			console.error(
				`[Preload] ERROR: Sync Channel "${channel}" is not a valid invoke channel.`
			);
			return Promise.reject(new Error(`Invalid Sync IPC channel: ${channel}`));
		}
	},

	// Convenience methods for sync operations
	getStatus: () => ipcRenderer.invoke("sync:get-status"),
	insertSampleData: () => ipcRenderer.invoke("sync:insert-sample-data"),
	performInitialSync: () => ipcRenderer.invoke("sync:perform-initial-sync"),
	performDeltaSync: () => ipcRenderer.invoke("sync:perform-delta-sync"),
	checkOnlineStatus: () => ipcRenderer.invoke("sync:check-online-status"),
	setAPIKey: (apiKey) => ipcRenderer.invoke("sync:set-api-key", apiKey),
	// Keep cookie testing for debugging purposes
	testCookies: async () => {
		const cookies = await ipcRenderer.invoke(
			"get-session-cookies",
			"http://localhost:8001"
		);
		console.log("[Preload] Test cookies result:", cookies);
		return cookies;
	},
	onStatusUpdate(callback) {
		ipcRenderer.on("sync:status-update", (event, status) => callback(status));
	},
	removeStatusListener() {
		ipcRenderer.removeAllListeners("sync:status-update");
	},
});
