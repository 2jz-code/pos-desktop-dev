const { contextBridge, ipcRenderer } = require("electron");

const validChannels = [
	"POS_TO_CUSTOMER_STATE",
	"CUSTOMER_TO_POS_TIP",
	"CUSTOMER_REQUESTS_STATE",
];

contextBridge.exposeInMainWorld("ipcApi", {
	send: (channel, data) => {
		if (validChannels.includes(channel)) {
			ipcRenderer.send(channel, data);
		}
	},
	receive: (channel, func) => {
		if (validChannels.includes(channel)) {
			const subscription = (event, ...args) => func(...args);
			ipcRenderer.on(channel, subscription);
			return () => {
				ipcRenderer.removeListener(channel, subscription);
			};
		}
	},
});
