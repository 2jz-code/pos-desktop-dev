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
