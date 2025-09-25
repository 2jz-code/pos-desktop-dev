import { app, ipcMain, screen, session, BrowserWindow } from "electron";
import path from "node:path";
import process$1 from "node:process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import nodeMachineId from "node-machine-id";
import usb from "usb";
import require$$0 from "child_process";
import require$$1 from "util";
const require$1 = createRequire(import.meta.url);
const thermalPrinter = require$1("node-thermal-printer");
const { printer: ThermalPrinter, types: PrinterTypes } = thermalPrinter;
const __filename$1 = fileURLToPath(import.meta.url);
path.dirname(__filename$1);
function printLine(printer, left, right) {
  printer.leftRight(left, right);
}
async function formatReceipt(order, storeSettings = null, isTransaction = false) {
  var _a, _b, _c;
  let printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    characterSet: "PC437_USA",
    interface: "tcp://dummy"
  });
  printer.alignCenter();
  try {
    const logoPath = path.join(process.env.PUBLIC, "logo-receipt.png");
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
  const customerName = order.customer_display_name || order.guest_first_name || ((_a = order.payment_details) == null ? void 0 : _a.customer_name) || ((_b = order.customer) == null ? void 0 : _b.full_name);
  if (customerName) {
    printer.println(`Customer: ${customerName}`);
  }
  printer.println(`Order #: ${orderId}`);
  printer.println(`Date: ${orderDate}`);
  const diningPreference = order.dining_preference || "TAKE_OUT";
  const diningLabel = diningPreference === "DINE_IN" ? "Dine In" : "Take Out";
  printer.println(`Service: ${diningLabel}`);
  if (order.order_type) {
    const orderTypeLabels = {
      "POS": "In-Store",
      "WEB": "Website",
      "APP": "App",
      "DOORDASH": "DoorDash",
      "UBER_EATS": "Uber Eats"
    };
    const sourceLabel = orderTypeLabels[order.order_type] || order.order_type;
    printer.println(`Source: ${sourceLabel}`);
  }
  if (isTransaction) {
    printer.alignCenter();
    printer.bold(true);
    printer.println("--- TRANSACTION RECEIPT ---");
    printer.bold(false);
    printer.alignLeft();
    if (order.status) {
      printer.println(`Order Status: ${order.status}`);
    }
    printer.println("** Payment Not Yet Processed **");
  }
  printer.println("");
  printer.alignCenter();
  printer.bold(true);
  printer.println("ITEMS");
  printer.bold(false);
  printer.drawLine();
  printer.alignLeft();
  for (const item of order.items) {
    const price = parseFloat(item.price_at_sale) * item.quantity;
    const itemName = item.product ? item.product.name : item.custom_name || "Custom Item";
    const itemText = `${item.quantity}x ${itemName}`;
    printLine(printer, itemText, `$${price.toFixed(2)}`);
    if (item.selected_modifiers_snapshot && item.selected_modifiers_snapshot.length > 0) {
      for (const modifier of item.selected_modifiers_snapshot) {
        const modPrice = parseFloat(modifier.price_at_sale) * modifier.quantity * item.quantity;
        let modText = `   - ${modifier.option_name}`;
        if (modifier.quantity > 1) {
          modText += ` (${modifier.quantity}x)`;
        }
        if (parseFloat(modifier.price_at_sale) !== 0) {
          printLine(printer, modText, `$${modPrice.toFixed(2)}`);
        } else {
          printer.println(modText);
        }
      }
    }
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
  if (parseFloat(order.total_surcharges || 0) > 0) {
    printLine(
      printer,
      "Service Fee:",
      `$${parseFloat(order.total_surcharges).toFixed(2)}`
    );
  }
  printLine(printer, "Tax:", `$${parseFloat(order.tax_total).toFixed(2)}`);
  if (parseFloat(order.total_tips || 0) > 0) {
    printLine(printer, "Tip:", `$${parseFloat(order.total_tips).toFixed(2)}`);
  }
  printer.bold(true);
  printLine(
    printer,
    "TOTAL:",
    `$${parseFloat(order.total_collected || order.grand_total || 0).toFixed(2)}`
  );
  printer.bold(false);
  printer.println("");
  if (!isTransaction) {
    let transactions = ((_c = order.payment_details) == null ? void 0 : _c.transactions) || [];
    if (order.order_type === "WEB") {
      transactions = transactions.filter((txn) => txn.status === "SUCCESSFUL");
    }
    if (transactions.length > 0) {
      printer.bold(true);
      printer.println("Payment Details:");
      printer.bold(false);
      for (const [index, txn] of transactions.entries()) {
        const method = (txn.method || "N/A").toUpperCase();
        const baseAmount = parseFloat(txn.amount || 0);
        const surcharge = parseFloat(txn.surcharge || 0);
        const tip = parseFloat(txn.tip || 0);
        const totalAmount = (baseAmount + surcharge + tip).toFixed(2);
        if (method === "CARD_ONLINE" || method === "CARD_TERMINAL") {
          const cardBrand = txn.card_brand || "";
          const cardLast4 = txn.card_last4 || "";
          if (cardBrand && cardLast4) {
            const displayName = `${cardBrand.toUpperCase()} ******${cardLast4}`;
            printLine(printer, ` ${displayName}`, `$${totalAmount}`);
          } else {
            printLine(printer, ` ${method} (${index + 1})`, `$${totalAmount}`);
          }
        } else {
          printLine(printer, ` ${method} (${index + 1})`, `$${totalAmount}`);
        }
        if (method === "CASH") {
          const tendered = parseFloat(txn.cashTendered || 0).toFixed(2);
          const change = parseFloat(txn.change || 0).toFixed(2);
          if (parseFloat(tendered) > 0) {
            printLine(printer, "   Tendered:", `$${tendered}`);
            printLine(printer, "   Change:", `$${change}`);
          }
        }
      }
    }
  } else {
    printer.bold(true);
    printer.println("Payment Information:");
    printer.bold(false);
    printer.println("This is a transaction receipt.");
    printer.println("Payment will be processed separately.");
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
  var _a, _b;
  let itemsToPrint = order.items || [];
  if (filterConfig) {
    itemsToPrint = itemsToPrint.filter((item) => {
      var _a2, _b2;
      const product = item.product;
      if (!product) {
        return true;
      }
      if (filterConfig.productTypes && filterConfig.productTypes.length > 0) {
        if (!filterConfig.productTypes.includes("ALL")) {
          const productTypeMatch = filterConfig.productTypes.includes(
            (_a2 = product.product_type) == null ? void 0 : _a2.id
          );
          if (!productTypeMatch) return false;
        }
      }
      if (filterConfig.categories && filterConfig.categories.length > 0) {
        if (!filterConfig.categories.includes("ALL")) {
          const categoryMatch = filterConfig.categories.includes(
            (_b2 = product.category) == null ? void 0 : _b2.id
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
  printer.println("");
  printer.println("");
  printer.println("");
  printer.println("");
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
  printer.println(`${order.order_number || order.id}`);
  printer.bold(false);
  printer.setTextNormal();
  const customerName = order.customer_display_name || order.guest_first_name || ((_a = order.payment_details) == null ? void 0 : _a.customer_name) || ((_b = order.customer) == null ? void 0 : _b.full_name);
  if (customerName) {
    printer.println(`Customer: ${customerName}`);
  }
  const orderDate = new Date(order.created_at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "America/Chicago"
  });
  printer.println(`Time: ${orderDate}`);
  const diningPreference = order.dining_preference || "TAKE_OUT";
  const diningLabel = diningPreference === "DINE_IN" ? "DINE IN" : "TAKE OUT";
  printer.bold(true);
  printer.println(`SERVICE: ${diningLabel}`);
  if (order.order_type) {
    const orderTypeLabels = {
      "POS": "IN-STORE",
      "WEB": "WEBSITE",
      "APP": "APP",
      "DOORDASH": "DOORDASH",
      "UBER_EATS": "UBER EATS"
    };
    const sourceLabel = orderTypeLabels[order.order_type] || order.order_type;
    printer.println(`SOURCE: ${sourceLabel}`);
  }
  printer.bold(false);
  printer.drawLine();
  const groupedItems = itemsToPrint.reduce((acc, item) => {
    var _a2;
    const categoryName = item.product ? ((_a2 = item.product.category) == null ? void 0 : _a2.name) || "Miscellaneous" : "Custom Items";
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
      const itemName = item.product ? item.product.name : item.custom_name || "Custom Item";
      printer.println(`${item.quantity}x ${itemName}`);
      printer.setTextNormal();
      printer.bold(false);
      if (item.selected_modifiers_snapshot && item.selected_modifiers_snapshot.length > 0) {
        const modifiersBySet = item.selected_modifiers_snapshot.reduce((acc, modifier) => {
          const setName = modifier.modifier_set_name || "Other";
          if (!acc[setName]) acc[setName] = [];
          acc[setName].push(modifier);
          return acc;
        }, {});
        for (const [setName, modifiers] of Object.entries(modifiersBySet)) {
          const optionsList = modifiers.map((modifier) => {
            let optionText = modifier.option_name;
            if (modifier.quantity > 1) {
              optionText += ` (${modifier.quantity}x)`;
            }
            return optionText;
          }).join(", ");
          printer.println(`   ${setName} - ${optionsList}`);
        }
      }
      if (item.notes && item.notes.trim()) {
        printer.println(`   NOTES: ${item.notes.trim()}`);
      }
    }
    printer.println("");
  }
  printer.cut();
  return printer.getBuffer();
}
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var main;
var hasRequiredMain;
function requireMain() {
  if (hasRequiredMain) return main;
  hasRequiredMain = 1;
  main = function(e) {
    var r = {};
    function t(n) {
      if (r[n]) return r[n].exports;
      var o = r[n] = { i: n, l: false, exports: {} };
      return e[n].call(o.exports, o, o.exports, t), o.l = true, o.exports;
    }
    return t.m = e, t.c = r, t.d = function(e2, r2, n) {
      t.o(e2, r2) || Object.defineProperty(e2, r2, { enumerable: true, get: n });
    }, t.r = function(e2) {
      "undefined" != typeof Symbol && Symbol.toStringTag && Object.defineProperty(e2, Symbol.toStringTag, { value: "Module" }), Object.defineProperty(e2, "__esModule", { value: true });
    }, t.t = function(e2, r2) {
      if (1 & r2 && (e2 = t(e2)), 8 & r2) return e2;
      if (4 & r2 && "object" == typeof e2 && e2 && e2.__esModule) return e2;
      var n = /* @__PURE__ */ Object.create(null);
      if (t.r(n), Object.defineProperty(n, "default", { enumerable: true, value: e2 }), 2 & r2 && "string" != typeof e2) for (var o in e2) t.d(n, o, (function(r3) {
        return e2[r3];
      }).bind(null, o));
      return n;
    }, t.n = function(e2) {
      var r2 = e2 && e2.__esModule ? function() {
        return e2.default;
      } : function() {
        return e2;
      };
      return t.d(r2, "a", r2), r2;
    }, t.o = function(e2, r2) {
      return Object.prototype.hasOwnProperty.call(e2, r2);
    }, t.p = "", t(t.s = 0);
  }([function(e, r, t) {
    const { exec: n } = t(1), o = t(2).promisify(n);
    e.exports = { play: async (e2, r2 = 0.5) => {
      const t2 = "darwin" === process.platform ? Math.min(2, 2 * r2) : r2, n2 = "darwin" === process.platform ? ((e3, r3) => `afplay "${e3}" -v ${r3}`)(e2, t2) : ((e3, r3) => `powershell -c Add-Type -AssemblyName presentationCore; $player = New-Object system.windows.media.mediaplayer; ${((e4) => `$player.open('${e4}');`)(e3)} $player.Volume = ${r3}; $player.Play(); Start-Sleep 1; Start-Sleep -s $player.NaturalDuration.TimeSpan.TotalSeconds;Exit;`)(e2, t2);
      try {
        await o(n2);
      } catch (e3) {
        throw e3;
      }
    } };
  }, function(e, r) {
    e.exports = require$$0;
  }, function(e, r) {
    e.exports = require$$1;
  }]);
  return main;
}
var mainExports = requireMain();
const sound = /* @__PURE__ */ getDefaultExportFromCjs(mainExports);
const { machineIdSync } = nodeMachineId;
const require2 = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = process$1.env.NODE_ENV === "development";
console.log("[Main Process] Configuring hardware acceleration and display settings...");
app.commandLine.appendSwitch("--enable-gpu-rasterization");
app.commandLine.appendSwitch("--enable-zero-copy");
app.commandLine.appendSwitch("--disable-software-rasterizer");
if (!isDev) {
  app.commandLine.appendSwitch("--enable-features", "VizDisplayCompositor");
  app.commandLine.appendSwitch("--force-color-profile", "srgb");
  console.log("[Main Process] Production mode - stable display features enabled");
} else {
  app.commandLine.appendSwitch("--ignore-certificate-errors");
  app.commandLine.appendSwitch("--allow-running-insecure-content");
  console.log("[Main Process] Development mode - debugging switches enabled");
}
process$1.env.DIST = path.join(__dirname, "../dist");
process$1.env.PUBLIC = app.isPackaged ? process$1.env.DIST : path.join(process$1.env.DIST, "../public");
let mainWindow;
let customerWindow;
let lastKnownState = null;
const VITE_DEV_SERVER_URL = process$1.env["VITE_DEV_SERVER_URL"];
function createMainWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const persistentSession = session.defaultSession;
  mainWindow = new BrowserWindow({
    icon: path.join(process$1.env.PUBLIC, "logo.png"),
    x: primaryDisplay.bounds.x,
    y: primaryDisplay.bounds.y,
    fullscreen: true,
    webPreferences: {
      session: persistentSession,
      preload: path.join(__dirname, "../dist-electron/preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      // Production security settings
      allowRunningInsecureContent: false,
      webSecurity: true,
      experimentalFeatures: false
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
  const displays = screen.getAllDisplays();
  const secondaryDisplay = displays.find(
    (display) => display.id !== screen.getPrimaryDisplay().id
  );
  if (!secondaryDisplay) {
    console.log("No secondary display found, not creating customer window.");
    return;
  }
  customerWindow = new BrowserWindow({
    icon: path.join(process$1.env.PUBLIC, "logo.png"),
    x: secondaryDisplay.bounds.x,
    y: secondaryDisplay.bounds.y,
    fullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, "../dist-electron/preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
      // Remove hardwareAcceleration override - let app-level settings handle it
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
ipcMain.handle("play-notification-sound", async (event, soundFile) => {
  try {
    const soundName = soundFile || "notification.wav";
    const soundPath = path.join(process$1.env.PUBLIC, "sounds", soundName);
    console.log(`[IPC] Attempting to play sound: ${soundPath}`);
    await sound.play(soundPath);
    return { success: true };
  } catch (error) {
    console.error("[IPC] Error playing sound:", error);
    return { success: false, error: error.message };
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
  async (event, { printer, data, storeSettings, isTransaction = false }) => {
    console.log("\n--- [Main Process] Using HYBRID print method ---");
    console.log(
      "[Main Process] Store settings:",
      storeSettings ? "provided" : "not provided",
      "isTransaction:",
      isTransaction
    );
    try {
      const buffer = await formatReceipt(data, storeSettings, isTransaction);
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
ipcMain.on("shutdown-app", () => {
  app.quit();
});
app.whenReady().then(async () => {
  console.log("[Main Process] Starting Electron app - online-only mode");
  console.log("[Main Process] Hardware acceleration and display settings applied at startup");
  createMainWindow();
  createCustomerWindow();
});
app.on("window-all-closed", () => {
  if (process$1.platform !== "darwin") {
    app.quit();
  }
});
