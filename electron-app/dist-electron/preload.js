const { contextBridge: s, ipcRenderer: n } = require("electron");
console.log("--- [Preload] Preload script started ---");
const c = [
  "POS_TO_CUSTOMER_STATE",
  "CUSTOMER_TO_POS_TIP",
  "CUSTOMER_REQUESTS_STATE"
], d = [
  "discover-printers",
  "print-receipt",
  "open-cash-drawer",
  "get-session-cookies",
  "get-machine-id",
  "get-device-fingerprint",
  // Hardware-based terminal identity
  "print-kitchen-ticket",
  "test-network-printer"
];
s.exposeInMainWorld("electronAPI", {
  shutdown: () => n.send("shutdown-app"),
  // --- Main API Bridge ---
  /**
   * Gets the unique machine ID from the main process.
   * @returns {Promise<string>} The unique machine ID.
   */
  getMachineId: () => n.invoke("get-machine-id"),
  /**
   * Gets the hardware-based device fingerprint (stable across reinstalls).
   * Used for terminal registration and location context.
   * @returns {Promise<string>} The hardware fingerprint (UUID format).
   */
  getDeviceFingerprint: () => n.invoke("get-device-fingerprint"),
  /**
   * Gets a list of connected printers from the main process.
   * @returns {Promise<Array>} A list of printer objects.
   */
  getPrinters: () => n.invoke("get-printers"),
  /**
   * Sends a receipt object to the main process for printing.
   * @param {object} data - The receipt data.
   */
  printReceipt: (e) => n.send("print-receipt", e),
  /**
   * Sends a kitchen order object to the main process for printing.
   * @param {object} data - The kitchen order data.
   */
  printKitchenOrder: (e) => n.send("print-kitchen-order", e),
  /**
   * Sends a command to open the cash drawer connected to a specific printer.
   * @param {object} printer - The printer object.
   */
  openCashDrawer: (e) => n.send("open-cash-drawer", e),
  /**
   * Sends data to the customer-facing display.
   * @param {string} channel - The event channel to emit on the customer display.
   * @param {object} data - The payload to send.
   */
  sendToCustomerDisplay: (e, r) => {
    n.send("to-customer-display", { channel: e, data: r });
  },
  sendActionToPos: (e, r) => {
    n.send("from-customer-display", { channel: e, data: r });
  },
  /**
   * Listens for actions coming from the customer-facing display.
   * @param {function} callback - The function to call with the action data.
   * @returns {function} A cleanup function to remove the listener.
   */
  onCustomerDisplayAction: (e) => {
    const r = ["CUSTOMER_TO_POS_TIP"], t = [];
    return r.forEach((o) => {
      const i = (l, a) => {
        e({ channel: o, data: a });
      };
      n.on(o, i), t.push({ channel: o, handler: i });
    }), () => {
      t.forEach(({ channel: o, handler: i }) => {
        n.removeListener(o, i);
      });
    };
  },
  requestInitialState: () => {
    n.send("CUSTOMER_REQUESTS_STATE");
  },
  onMessage: (e, r) => {
    if (c.includes(e)) {
      const t = (o, ...i) => r(...i);
      return n.on(e, t), () => n.removeListener(e, t);
    }
  },
  /**
   * Plays a notification sound via the main process.
   * @param {string|null} soundFile - The name of the sound file in public/sounds, or null for default.
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  playNotificationSound: async (e) => {
    try {
      return await n.invoke(
        "play-notification-sound",
        e
      );
    } catch (r) {
      return console.error("Error invoking playNotificationSound:", r), { success: !1, error: r.message };
    }
  }
});
s.exposeInMainWorld("hardwareApi", {
  invoke: (e, ...r) => (console.log(
    `[Preload] hardwareApi.invoke called with channel: "${e}"`
  ), d.includes(e) ? (console.log(
    `[Preload] Channel "${e}" is valid. Invoking main process.`
  ), n.invoke(e, ...r)) : (console.error(
    `[Preload] ERROR: Channel "${e}" is not a valid invoke channel.`
  ), Promise.reject(new Error(`Invalid IPC channel: ${e}`))))
});
