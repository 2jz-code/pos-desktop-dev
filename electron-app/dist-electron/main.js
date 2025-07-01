import { app, ipcMain, session, BrowserWindow } from "electron";
import path from "node:path";
import process$1 from "node:process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import nodeMachineId from "node-machine-id";
import usb from "usb";
const require$1 = createRequire(import.meta.url);
const thermalPrinter = require$1("node-thermal-printer");
const { printer: ThermalPrinter, types: PrinterTypes } = thermalPrinter;
const __filename$1 = fileURLToPath(import.meta.url);
path.dirname(__filename$1);
function printLine(printer, left, right) {
  printer.leftRight(left, right);
}
async function formatReceipt(order, storeSettings = null) {
  var _a, _b;
  let printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    characterSet: "PC437_USA",
    interface: "tcp://dummy"
  });
  printer.alignCenter();
  try {
    const logoPath = path.join(process.env.PUBLIC, "logo.png");
    await printer.printImage(logoPath);
    printer.println("");
  } catch (error) {
    console.error("Could not print logo. Using text fallback.");
    console.error("Full logo printing error:", error);
    if (storeSettings == null ? void 0 : storeSettings.receipt_header) {
      printer.println(storeSettings.receipt_header);
      printer.println("");
    }
  }
  const storeAddress = (storeSettings == null ? void 0 : storeSettings.store_address) || "2105 Cliff Rd #300\nEagan, MN 55122";
  const storePhone = (storeSettings == null ? void 0 : storeSettings.store_phone) || "(651) 412-5336";
  {
    if (storeAddress.includes("\\n")) {
      const addressLines = storeAddress.split("\\n");
      addressLines.forEach((line) => {
        if (line.trim()) printer.println(line.trim());
      });
    } else {
      const parts = storeAddress.split(",");
      if (parts.length > 1) {
        const street = parts.shift().trim();
        const cityStateZip = parts.join(",").trim();
        if (street) printer.println(street);
        if (cityStateZip) printer.println(cityStateZip);
      } else {
        printer.println(storeAddress);
      }
    }
  }
  {
    printer.println(`Tel: ${storePhone}`);
  }
  printer.println("");
  printer.alignLeft();
  const orderId = order.order_number || order.id || "N/A";
  const orderDate = new Date(order.created_at).toLocaleString("en-US", {
    timeZone: "America/Chicago"
  });
  printer.println(`Order #: ${orderId}`);
  printer.println(`Date: ${orderDate}`);
  printer.println("");
  printer.alignCenter();
  printer.bold(true);
  printer.println("ITEMS");
  printer.bold(false);
  printer.drawLine();
  printer.alignLeft();
  for (const item of order.items) {
    const price = parseFloat(item.price_at_sale) * item.quantity;
    const itemText = `${item.quantity}x ${item.product.name}`;
    printLine(printer, itemText, `$${price.toFixed(2)}`);
  }
  printer.drawLine();
  printLine(printer, "Subtotal:", `$${parseFloat(order.subtotal).toFixed(2)}`);
  if (parseFloat(order.total_discounts_amount) > 0) {
    printLine(
      printer,
      "Discount:",
      `-$${parseFloat(order.total_discounts_amount).toFixed(2)}`
    );
  }
  if (parseFloat(order.surcharges_total) > 0) {
    printLine(
      printer,
      "Service Fee:",
      `$${parseFloat(order.surcharges_total).toFixed(2)}`
    );
  }
  printLine(printer, "Tax:", `$${parseFloat(order.tax_total).toFixed(2)}`);
  const tip = ((_a = order.payment_details) == null ? void 0 : _a.tip) ? parseFloat(order.payment_details.tip) : 0;
  if (tip > 0) {
    printLine(printer, "Tip:", `$${tip.toFixed(2)}`);
  }
  printer.bold(true);
  printLine(
    printer,
    "TOTAL:",
    `$${parseFloat(order.total_with_tip).toFixed(2)}`
  );
  printer.bold(false);
  printer.println("");
  const transactions = ((_b = order.payment_details) == null ? void 0 : _b.transactions) || [];
  if (transactions.length > 0) {
    printer.bold(true);
    printer.println("Payment Details:");
    printer.bold(false);
    for (const [index, txn] of transactions.entries()) {
      const method = (txn.method || "N/A").toUpperCase();
      const amount = parseFloat(txn.amount).toFixed(2);
      printLine(printer, ` ${method} (${index + 1})`, `$${amount}`);
      if (method === "CASH") {
        const tendered = parseFloat(txn.cashTendered || 0).toFixed(2);
        const change = parseFloat(txn.change || 0).toFixed(2);
        if (parseFloat(tendered) > 0) {
          printLine(printer, "   Tendered:", `$${tendered}`);
          printLine(printer, "   Change:", `$${change}`);
        }
      } else if (method === "CREDIT" && txn.metadata) {
        const brand = txn.metadata.card_brand || "";
        const last4 = txn.metadata.card_last4 || "";
        if (brand && last4) {
          printer.println(`    ${brand} ****${last4}`);
        }
      }
    }
  }
  printer.println("");
  printer.alignCenter();
  const receiptFooter = (storeSettings == null ? void 0 : storeSettings.receipt_footer) || "Thank you for your business!";
  {
    const footerLines = receiptFooter.split("\n");
    footerLines.forEach((line) => {
      if (line.trim()) printer.println(line.trim());
    });
  }
  if (!(storeSettings == null ? void 0 : storeSettings.receipt_footer)) {
    printer.println("Visit us at bakeajeen.com");
  }
  printer.println("");
  printer.println("");
  printer.cut();
  return printer.getBuffer();
}
function formatOpenCashDrawer() {
  let printerInstance = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: "tcp://dummy"
  });
  printerInstance.openCashDrawer();
  return printerInstance.getBuffer();
}
function formatKitchenTicket(order, zoneName = "KITCHEN", filterConfig = null) {
  let itemsToPrint = order.items || [];
  if (filterConfig) {
    itemsToPrint = itemsToPrint.filter((item) => {
      var _a, _b;
      const product = item.product;
      if (filterConfig.productTypes && filterConfig.productTypes.length > 0) {
        if (!filterConfig.productTypes.includes("ALL")) {
          const productTypeMatch = filterConfig.productTypes.includes(
            (_a = product.product_type) == null ? void 0 : _a.id
          );
          if (!productTypeMatch) return false;
        }
      }
      if (filterConfig.categories && filterConfig.categories.length > 0) {
        if (!filterConfig.categories.includes("ALL")) {
          const categoryMatch = filterConfig.categories.includes(
            (_b = product.category) == null ? void 0 : _b.id
          );
          if (!categoryMatch) return false;
        }
      }
      return true;
    });
  }
  if (itemsToPrint.length === 0) {
    console.log(
      `[formatKitchenTicket] No items match filter for zone "${zoneName}" - skipping ticket`
    );
    return null;
  }
  let printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    characterSet: "PC437_USA",
    interface: "tcp://dummy"
  });
  printer.alignCenter();
  printer.bold(true);
  printer.setTextSize(1, 1);
  printer.println(`${zoneName.toUpperCase()} TICKET`);
  printer.setTextNormal();
  printer.bold(false);
  printer.alignLeft();
  printer.println("");
  printer.setTextSize(2, 2);
  printer.bold(true);
  printer.println(`Order #${order.order_number || order.id}`);
  printer.bold(false);
  printer.setTextNormal();
  const orderDate = new Date(order.created_at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "America/Chicago"
  });
  printer.println(`Time: ${orderDate}`);
  printer.drawLine();
  const groupedItems = itemsToPrint.reduce((acc, item) => {
    var _a;
    const categoryName = ((_a = item.product.category) == null ? void 0 : _a.name) || "Miscellaneous";
    if (!acc[categoryName]) {
      acc[categoryName] = [];
    }
    acc[categoryName].push(item);
    return acc;
  }, {});
  for (const categoryName in groupedItems) {
    printer.bold(true);
    printer.underline(true);
    printer.println(`${categoryName.toUpperCase()}:`);
    printer.underline(false);
    printer.bold(false);
    const itemsInCategory = groupedItems[categoryName];
    for (const item of itemsInCategory) {
      printer.bold(true);
      printer.setTextSize(1, 1);
      printer.println(`${item.quantity}x ${item.product.name}`);
      printer.setTextNormal();
      printer.bold(false);
      if (item.notes && item.notes.trim()) {
        printer.println(`   Notes: ${item.notes.trim()}`);
      }
    }
    printer.println("");
  }
  printer.println("");
  printer.println("");
  printer.cut();
  return printer.getBuffer();
}
const { machineIdSync } = nodeMachineId;
const require2 = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
process$1.env.DIST = path.join(__dirname, "../dist");
process$1.env.PUBLIC = app.isPackaged ? process$1.env.DIST : path.join(process$1.env.DIST, "../public");
let mainWindow;
let customerWindow;
let lastKnownState = null;
const VITE_DEV_SERVER_URL = process$1.env["VITE_DEV_SERVER_URL"];
function createMainWindow() {
  const persistentSession = session.fromPartition("persist:electron-app");
  mainWindow = new BrowserWindow({
    icon: path.join(process$1.env.PUBLIC, "electron-vite.svg"),
    webPreferences: {
      session: persistentSession,
      preload: path.join(__dirname, "../dist-electron/preload.js"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow == null ? void 0 : mainWindow.webContents.send(
      "main-process-message",
      (/* @__PURE__ */ new Date()).toLocaleString()
    );
  });
  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(process$1.env.DIST, "index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
    if (customerWindow) {
      customerWindow.close();
    }
  });
}
function createCustomerWindow() {
  customerWindow = new BrowserWindow({
    x: 100,
    y: 100,
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "../dist-electron/preload.js")
    }
  });
  if (VITE_DEV_SERVER_URL) {
    customerWindow.loadURL(`${VITE_DEV_SERVER_URL}customer.html`);
  } else {
    customerWindow.loadFile(path.join(process$1.env.DIST, "customer.html"));
  }
  customerWindow.on("closed", () => {
    customerWindow = null;
  });
}
ipcMain.on("to-customer-display", (event, { channel, data }) => {
  if (channel === "POS_TO_CUSTOMER_STATE") {
    lastKnownState = data;
  }
  if (customerWindow) {
    customerWindow.webContents.send(channel, data);
  }
});
ipcMain.on("from-customer-display", (event, { channel, data }) => {
  if (mainWindow) {
    mainWindow.webContents.send(channel, data);
  }
});
ipcMain.on("CUSTOMER_REQUESTS_STATE", (event) => {
  if (lastKnownState) {
    event.sender.send("POS_TO_CUSTOMER_STATE", lastKnownState);
  }
});
ipcMain.on("CUSTOMER_TO_POS_TIP", (event, amount) => {
  if (mainWindow) {
    mainWindow.webContents.send("CUSTOMER_TO_POS_TIP", amount);
  }
});
ipcMain.handle("discover-printers", async () => {
  console.log(
    "[Main Process] Discovering printers using node-usb (robust method)..."
  );
  try {
    const devices = usb.getDeviceList();
    const printers = devices.map((device) => {
      try {
        if (device.configDescriptor && device.configDescriptor.interfaces) {
          const isPrinter = device.configDescriptor.interfaces.some(
            (iface) => {
              return iface.some(
                (alt) => alt.bInterfaceClass === 7
                // 7 is the printer class
              );
            }
          );
          if (isPrinter) {
            return {
              name: device.product || `USB Device ${device.deviceDescriptor.idVendor}:${device.deviceDescriptor.idProduct}`,
              vendorId: device.deviceDescriptor.idVendor,
              productId: device.deviceDescriptor.idProduct
            };
          }
        }
        return null;
      } catch (e) {
        console.warn(`Could not inspect device: ${e.message}`);
        return null;
      }
    }).filter((p) => p !== null);
    console.log(
      "[Main Process] Found printers:",
      JSON.stringify(printers, null, 2)
    );
    return printers;
  } catch (error) {
    console.error("[Main Process] Failed to discover printers:", error);
    return [];
  }
});
async function sendBufferToPrinter(printer, buffer) {
  let device = null;
  try {
    const vendorId = parseInt(printer.vendorId || printer.vendor_id, 10);
    const productId = parseInt(printer.productId || printer.product_id, 10);
    if (!vendorId || !productId) {
      throw new Error(
        `Invalid printer object provided. Missing or invalid vendor/product ID. Got: ${JSON.stringify(
          printer
        )}`
      );
    }
    const devices = usb.getDeviceList();
    device = devices.find(
      (d) => d.deviceDescriptor.idVendor === vendorId && d.deviceDescriptor.idProduct === productId
    );
    if (!device) {
      throw new Error("USB Printer not found. It may be disconnected.");
    }
    device.open();
    const an_interface = device.interfaces[0];
    an_interface.claim();
    const endpoint = an_interface.endpoints.find((e) => e.direction === "out");
    if (!endpoint) {
      throw new Error("Could not find an OUT endpoint on the printer.");
    }
    await new Promise((resolve, reject) => {
      endpoint.transfer(buffer, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  } finally {
    if (device) {
      try {
        if (device.interfaces[0] && device.interfaces[0].isClaimed) {
          await new Promise((resolve) => {
            device.interfaces[0].release(true, () => resolve());
          });
        }
        device.close();
      } catch (cleanupError) {
        console.error("Error cleaning up USB device:", cleanupError);
      }
    }
  }
}
ipcMain.handle(
  "print-receipt",
  async (event, { printer, data, storeSettings }) => {
    console.log("\n--- [Main Process] Using HYBRID print method ---");
    console.log(
      "[Main Process] Store settings:",
      storeSettings ? "provided" : "not provided"
    );
    try {
      const buffer = await formatReceipt(data, storeSettings);
      console.log(
        `[Main Process] Receipt buffer created (size: ${buffer.length}). Sending...`
      );
      await sendBufferToPrinter(printer, buffer);
      console.log("[Main Process] Hybrid print command sent successfully.");
      return { success: true };
    } catch (error) {
      console.error("[Main Process] ERROR IN HYBRID PRINT HANDLER:", error);
      return { success: false, error: error.message };
    }
  }
);
ipcMain.handle(
  "print-kitchen-ticket",
  async (event, { printer, order, zoneName, filterConfig }) => {
    console.log(
      `
--- [Main Process] KITCHEN TICKET HANDLER for zone: "${zoneName}" ---`
    );
    console.log(`Filter config:`, filterConfig);
    try {
      if ((printer == null ? void 0 : printer.connection_type) !== "network" || !printer.ip_address) {
        throw new Error("Invalid network printer configuration provided.");
      }
      const thermalPrinter2 = require2("node-thermal-printer");
      const { printer: ThermalPrinter2, types: PrinterTypes2 } = thermalPrinter2;
      let printerInstance = new ThermalPrinter2({
        type: PrinterTypes2.EPSON,
        interface: `tcp://${printer.ip_address}`,
        timeout: 5e3
      });
      const isConnected = await printerInstance.isPrinterConnected();
      if (!isConnected) {
        throw new Error(
          `Could not connect to kitchen printer at ${printer.ip_address}`
        );
      }
      console.log(
        `Successfully connected to kitchen printer at ${printer.ip_address}`
      );
      const buffer = formatKitchenTicket(order, zoneName, filterConfig);
      if (!buffer) {
        console.log(`No items to print for zone "${zoneName}" - skipping`);
        return {
          success: true,
          message: "No items matched filter - ticket skipped"
        };
      }
      console.log(`Sending kitchen ticket buffer (size: ${buffer.length})`);
      await printerInstance.raw(buffer);
      console.log("Kitchen ticket sent successfully.");
      return { success: true };
    } catch (error) {
      console.error("\n--- [Main Process] ERROR IN KITCHEN TICKET HANDLER ---");
      console.error(error);
      return { success: false, error: error.message };
    }
  }
);
ipcMain.handle("test-network-printer", async (event, { ip_address }) => {
  console.log(
    `
--- [Main Process] TESTING NETWORK PRINTER at: ${ip_address} ---`
  );
  try {
    if (!ip_address) {
      throw new Error("No IP address provided for testing.");
    }
    const thermalPrinter2 = require2("node-thermal-printer");
    const { printer: ThermalPrinter2, types: PrinterTypes2 } = thermalPrinter2;
    let printerInstance = new ThermalPrinter2({
      type: PrinterTypes2.EPSON,
      interface: `tcp://${ip_address}`,
      timeout: 3e3
      // Shorter timeout for a quick test
    });
    const isConnected = await printerInstance.isPrinterConnected();
    if (isConnected) {
      console.log(`SUCCESS: Connection to ${ip_address} is OK.`);
      printerInstance.println("Connection Test OK");
      printerInstance.cut();
      await printerInstance.execute();
      return {
        success: true,
        message: `Successfully connected to ${ip_address}. A test slip may have been printed.`
      };
    } else {
      throw new Error("Connection failed. The printer did not respond.");
    }
  } catch (error) {
    console.error(`ERROR: Could not connect to printer at ${ip_address}.`);
    console.error(error);
    let errorMessage = error.message;
    if (error.message.includes("timed out")) {
      errorMessage = "Connection timed out. Check the IP address and ensure the printer is on the same network.";
    } else if (error.message.includes("ECONNREFUSED")) {
      errorMessage = "Connection refused. The printer is reachable but is not accepting connections on this port.";
    }
    return { success: false, error: errorMessage };
  }
});
ipcMain.handle("open-cash-drawer", async (event, { printerName }) => {
  console.log("\n--- [Main Process] Using HYBRID open-drawer method ---");
  try {
    const devices = usb.getDeviceList();
    const foundDevice = devices.find(
      (d) => (d.product || `USB Device ${d.deviceDescriptor.idVendor}:${d.deviceDescriptor.idProduct}`) === printerName
    );
    if (!foundDevice) {
      throw new Error(`Printer with name "${printerName}" not found.`);
    }
    const printer = {
      vendorId: foundDevice.deviceDescriptor.idVendor,
      productId: foundDevice.deviceDescriptor.idProduct
    };
    const buffer = formatOpenCashDrawer();
    console.log(
      `[Main Process] Open-drawer buffer created (size: ${buffer.length}). Sending...`
    );
    await sendBufferToPrinter(printer, buffer);
    console.log("[Main Process] Hybrid open-drawer command sent successfully.");
    return { success: true };
  } catch (error) {
    console.error("[Main Process] ERROR IN HYBRID CASH DRAWER HANDLER:", error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("get-session-cookies", async (event, url) => {
  try {
    const { session: session2 } = require2("electron");
    const cookies = await session2.defaultSession.cookies.get({ url });
    console.log(`[Main Process] Found ${cookies.length} cookies for ${url}`);
    cookies.forEach((cookie, index) => {
      console.log(
        `[Main Process] Cookie ${index + 1}: ${cookie.name} (${cookie.httpOnly ? "HttpOnly" : "Regular"})`
      );
    });
    const cookieString = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    if (cookieString) {
      console.log(
        `[Main Process] Cookie string created (length: ${cookieString.length})`
      );
    } else {
      console.log("[Main Process] No cookies found - returning empty string");
    }
    return cookieString;
  } catch (error) {
    console.error("[Main Process] Error getting session cookies:", error);
    throw error;
  }
});
ipcMain.handle("get-machine-id", () => {
  return machineIdSync({ original: true });
});
app.whenReady().then(async () => {
  console.log("[Main Process] Starting Electron app - online-only mode");
  createMainWindow();
  createCustomerWindow();
});
app.on("window-all-closed", () => {
  if (process$1.platform !== "darwin") {
    app.quit();
  }
});
