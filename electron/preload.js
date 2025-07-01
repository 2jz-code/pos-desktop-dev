// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
	getMachineId: () => ipcRenderer.invoke("get-machine-id"),
	getPrinters: () => ipcRenderer.invoke("get-printers"),
	printReceipt: (printer, data, storeSettings) =>
		ipcRenderer.invoke("print-receipt", printer, data, storeSettings),
	printKitchenTicket: (printer, data, zone, filterConfig) =>
		ipcRenderer.invoke(
			"print-kitchen-ticket",
			printer,
			data,
			zone,
			filterConfig
		),
	openCashDrawer: (printer) => ipcRenderer.invoke("open-cash-drawer", printer),
	playNotificationSound: (soundFile) =>
		ipcRenderer.invoke("play-notification-sound", soundFile),
});
