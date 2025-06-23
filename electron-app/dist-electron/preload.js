const { contextBridge, ipcRenderer } = require("electron");
console.log("--- [Preload] Preload script started ---");
const validIpcChannels = [
  "POS_TO_CUSTOMER_STATE",
  "CUSTOMER_TO_POS_TIP",
  "CUSTOMER_REQUESTS_STATE"
];
const validInvokeChannels = [
  "discover-printers",
  "print-receipt",
  "open-cash-drawer",
  "print-kitchen-ticket"
  // <-- ADD THIS LINE
];
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
  }
});
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
      console.error(
        `[Preload] ERROR: Channel "${channel}" is not a valid invoke channel.`
      );
      return Promise.reject(new Error(`Invalid IPC channel: ${channel}`));
    }
  }
});
