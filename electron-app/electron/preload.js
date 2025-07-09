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
	"get-session-cookies",
	"get-machine-id",
	"print-kitchen-ticket",
	"test-network-printer",
];

// Database and sync channels removed - moving to online-only architecture

// --- Unchanged: Expose state management IPC ---
contextBridge.exposeInMainWorld("electronAPI", {
	// --- Main API Bridge ---

	/**
	 * Gets the unique machine ID from the main process.
	 * @returns {Promise<string>} The unique machine ID.
	 */
	getMachineId: () => ipcRenderer.invoke("get-machine-id"),

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

// Database API removed - moving to online-only architecture

// Sync API removed - moving to online-only architecture
