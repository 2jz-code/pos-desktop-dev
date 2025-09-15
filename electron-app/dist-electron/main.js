import { app as I, ipcMain as y, screen as L, session as V, BrowserWindow as B } from "electron";
import _ from "node:path";
import P from "node:process";
import { fileURLToPath as H } from "node:url";
import { createRequire as q } from "node:module";
import W from "node-machine-id";
import x from "usb";
import z from "child_process";
import Y from "util";
const Z = q(import.meta.url), G = Z("node-thermal-printer"), { printer: U, types: A } = G, J = H(import.meta.url);
_.dirname(J);
function w(r, o, t) {
  r.leftRight(o, t);
}
async function Q(r, o = null, t = !1) {
  var f, a, E, O;
  let e = new U({
    type: A.EPSON,
    characterSet: "PC437_USA",
    interface: "tcp://dummy"
  });
  printer.alignCenter();
  try {
    const s = _.join(process.env.PUBLIC, "logo-receipt.png");
    await e.printImage(s), e.println("");
  } catch (s) {
    console.error("Could not print logo. Using text fallback."), console.error("Full logo printing error:", s), o != null && o.receipt_header && (e.println(o.receipt_header), e.println(""));
  }
  const n = (o == null ? void 0 : o.store_address) || `2105 Cliff Rd #300
Eagan, MN 55122`, i = (o == null ? void 0 : o.store_phone) || "(651) 412-5336";
  if (n.includes("\\n"))
    n.split("\\n").forEach((l) => {
      l.trim() && e.println(l.trim());
    });
  else {
    const s = n.split(",");
    if (s.length > 1) {
      const l = s.shift().trim(), d = s.join(",").trim();
      l && e.println(l), d && e.println(d);
    } else
      e.println(n);
  }
  e.println(`Tel: ${i}`), e.println(""), e.alignLeft();
  const c = r.order_number || r.id || "N/A", h = new Date(r.created_at).toLocaleString("en-US", {
    timeZone: "America/Chicago"
  }), p = r.customer_display_name || r.guest_first_name || ((f = r.payment_details) == null ? void 0 : f.customer_name) || ((a = r.customer) == null ? void 0 : a.full_name);
  p && e.println(`Customer: ${p}`), e.println(`Order #: ${c}`), e.println(`Date: ${h}`);
  const u = (r.dining_preference || "TAKE_OUT") === "DINE_IN" ? "Dine In" : "Take Out";
  if (e.println(`Service: ${u}`), r.order_type) {
    const l = {
      POS: "In-Store",
      WEB: "Website",
      APP: "App",
      DOORDASH: "DoorDash",
      UBER_EATS: "Uber Eats"
    }[r.order_type] || r.order_type;
    e.println(`Source: ${l}`);
  }
  t && (e.alignCenter(), e.bold(!0), e.println("--- TRANSACTION RECEIPT ---"), e.bold(!1), e.alignLeft(), r.status && e.println(`Order Status: ${r.status}`), e.println("** Payment Not Yet Processed **")), e.println(""), e.alignCenter(), e.bold(!0), e.println("ITEMS"), e.bold(!1), e.drawLine(), e.alignLeft();
  for (const s of r.items) {
    const l = parseFloat(s.price_at_sale) * s.quantity, d = s.product ? s.product.name : s.custom_name || "Custom Item", b = `${s.quantity}x ${d}`;
    if (w(e, b, `$${l.toFixed(2)}`), s.selected_modifiers_snapshot && s.selected_modifiers_snapshot.length > 0)
      for (const $ of s.selected_modifiers_snapshot) {
        const D = parseFloat($.price_at_sale) * $.quantity * s.quantity;
        let v = `   - ${$.option_name}`;
        $.quantity > 1 && (v += ` (${$.quantity}x)`), parseFloat($.price_at_sale) !== 0 ? w(e, v, `$${D.toFixed(2)}`) : e.println(v);
      }
  }
  e.drawLine(), w(e, "Subtotal:", `$${parseFloat(r.subtotal).toFixed(2)}`), parseFloat(r.total_discounts_amount) > 0 && w(
    e,
    "Discount:",
    `-$${parseFloat(r.total_discounts_amount).toFixed(2)}`
  ), parseFloat(r.surcharges_total) > 0 && w(
    e,
    "Service Fee:",
    `$${parseFloat(r.surcharges_total).toFixed(2)}`
  ), w(e, "Tax:", `$${parseFloat(r.tax_total).toFixed(2)}`);
  const C = (E = r.payment_details) != null && E.tip ? parseFloat(r.payment_details.tip) : 0;
  if (C > 0 && w(e, "Tip:", `$${C.toFixed(2)}`), e.bold(!0), w(
    e,
    "TOTAL:",
    `$${parseFloat(r.total_with_tip).toFixed(2)}`
  ), e.bold(!1), e.println(""), t)
    e.bold(!0), e.println("Payment Information:"), e.bold(!1), e.println("This is a transaction receipt."), e.println("Payment will be processed separately.");
  else {
    const s = ((O = r.payment_details) == null ? void 0 : O.transactions) || [];
    if (s.length > 0) {
      e.bold(!0), e.println("Payment Details:"), e.bold(!1);
      for (const [l, d] of s.entries()) {
        const b = (d.method || "N/A").toUpperCase(), $ = parseFloat(d.amount).toFixed(2);
        if (w(e, ` ${b} (${l + 1})`, `$${$}`), b === "CASH") {
          const D = parseFloat(d.cashTendered || 0).toFixed(2), v = parseFloat(d.change || 0).toFixed(2);
          parseFloat(D) > 0 && (w(e, "   Tendered:", `$${D}`), w(e, "   Change:", `$${v}`));
        } else if (b === "CREDIT" && d.metadata) {
          const D = d.metadata.card_brand || "", v = d.metadata.card_last4 || "";
          D && v && e.println(`    ${D} ****${v}`);
        }
      }
    }
  }
  return e.println(""), e.alignCenter(), ((o == null ? void 0 : o.receipt_footer) || "Thank you for your business!").split(`
`).forEach((l) => {
    l.trim() && e.println(l.trim());
  }), o != null && o.receipt_footer || e.println("Visit us at bakeajeen.com"), e.println(""), e.println(""), e.cut(), e.getBuffer();
}
function formatOpenCashDrawer() {
  let printerInstance = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: "tcp://dummy"
  });
  printerInstance.openCashDrawer();
  return printerInstance.getBuffer();
}
function ee(r, o = "KITCHEN", t = null) {
  var u, C;
  let e = r.items || [];
  if (t && (e = e.filter((T) => {
    var a, E;
    const f = T.product;
    return f ? !(t.productTypes && t.productTypes.length > 0 && !t.productTypes.includes("ALL") && !t.productTypes.includes(
      (a = f.product_type) == null ? void 0 : a.id
    ) || t.categories && t.categories.length > 0 && !t.categories.includes("ALL") && !t.categories.includes(
      (E = f.category) == null ? void 0 : E.id
    )) : !0;
  })), e.length === 0)
    return console.log(
      `[formatKitchenTicket] No items match filter for zone "${o}" - skipping ticket`
    ), null;
  let n = new U({
    type: A.EPSON,
    characterSet: "PC437_USA",
    interface: "tcp://dummy"
  });
  n.println(""), n.println(""), n.println(""), n.println(""), n.alignCenter(), n.bold(!0), n.setTextSize(1, 1), n.println(`${o.toUpperCase()} TICKET`), n.setTextNormal(), n.bold(!1), n.alignLeft(), n.println(""), n.setTextSize(2, 2), n.bold(!0), n.println(`${r.order_number || r.id}`), n.bold(!1), n.setTextNormal();
  const i = r.customer_display_name || r.guest_first_name || ((u = r.payment_details) == null ? void 0 : u.customer_name) || ((C = r.customer) == null ? void 0 : C.full_name);
  i && n.println(`Customer: ${i}`);
  const c = new Date(r.created_at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "America/Chicago"
  });
  n.println(`Time: ${c}`);
  const p = (r.dining_preference || "TAKE_OUT") === "DINE_IN" ? "DINE IN" : "TAKE OUT";
  if (n.bold(!0), n.println(`SERVICE: ${p}`), r.order_type) {
    const f = {
      POS: "IN-STORE",
      WEB: "WEBSITE",
      APP: "APP",
      DOORDASH: "DOORDASH",
      UBER_EATS: "UBER EATS"
    }[r.order_type] || r.order_type;
    n.println(`SOURCE: ${f}`);
  }
  n.bold(!1), n.drawLine();
  const g = e.reduce((T, f) => {
    var E;
    const a = f.product ? ((E = f.product.category) == null ? void 0 : E.name) || "Miscellaneous" : "Custom Items";
    return T[a] || (T[a] = []), T[a].push(f), T;
  }, {});
  for (const T in g) {
    n.bold(!0), n.underline(!0), n.println(`${T.toUpperCase()}:`), n.underline(!1), n.bold(!1);
    const f = g[T];
    for (const a of f) {
      n.bold(!0), n.setTextSize(1, 1);
      const E = a.product ? a.product.name : a.custom_name || "Custom Item";
      if (n.println(`${a.quantity}x ${E}`), n.setTextNormal(), n.bold(!1), a.selected_modifiers_snapshot && a.selected_modifiers_snapshot.length > 0) {
        const O = a.selected_modifiers_snapshot.reduce((s, l) => {
          const d = l.modifier_set_name || "Other";
          return s[d] || (s[d] = []), s[d].push(l), s;
        }, {});
        for (const [s, l] of Object.entries(O)) {
          const d = l.map((b) => {
            let $ = b.option_name;
            return b.quantity > 1 && ($ += ` (${b.quantity}x)`), $;
          }).join(", ");
          n.println(`   ${s} - ${d}`);
        }
      }
      a.notes && a.notes.trim() && n.println(`   NOTES: ${a.notes.trim()}`);
    }
    n.println("");
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
    return t.m = r, t.c = o, t.d = function(e, n, i) {
      t.o(e, n) || Object.defineProperty(e, n, { enumerable: !0, get: i });
    }, t.r = function(e) {
      typeof Symbol < "u" && Symbol.toStringTag && Object.defineProperty(e, Symbol.toStringTag, { value: "Module" }), Object.defineProperty(e, "__esModule", { value: !0 });
    }, t.t = function(e, n) {
      if (1 & n && (e = t(e)), 8 & n || 4 & n && typeof e == "object" && e && e.__esModule) return e;
      var i = /* @__PURE__ */ Object.create(null);
      if (t.r(i), Object.defineProperty(i, "default", { enumerable: !0, value: e }), 2 & n && typeof e != "string") for (var c in e) t.d(i, c, (function(h) {
        return e[h];
      }).bind(null, c));
      return i;
    }, t.n = function(e) {
      var n = e && e.__esModule ? function() {
        return e.default;
      } : function() {
        return e2;
      };
      return t.d(r2, "a", r2), r2;
    }, t.o = function(e2, r2) {
      return Object.prototype.hasOwnProperty.call(e2, r2);
    }, t.p = "", t(t.s = 0);
  }([function(r, o, t) {
    const { exec: e } = t(1), n = t(2).promisify(e);
    r.exports = { play: async (i, c = 0.5) => {
      const h = process.platform === "darwin" ? Math.min(2, 2 * c) : c, p = process.platform === "darwin" ? ((g, u) => `afplay "${g}" -v ${u}`)(i, h) : ((g, u) => `powershell -c Add-Type -AssemblyName presentationCore; $player = New-Object system.windows.media.mediaplayer; ${((C) => `$player.open('${C}');`)(g)} $player.Volume = ${u}; $player.Play(); Start-Sleep 1; Start-Sleep -s $player.NaturalDuration.TimeSpan.TotalSeconds;Exit;`)(i, h);
      try {
        await n(p);
      } catch (g) {
        throw g;
      }
    } };
  }, function(e, r) {
    e.exports = require$$0;
  }, function(e, r) {
    e.exports = require$$1;
  }]);
  return main;
}
var re = ne();
const oe = /* @__PURE__ */ te(re), { machineIdSync: ie } = W, F = q(import.meta.url), se = H(import.meta.url), k = _.dirname(se), ce = P.env.NODE_ENV === "development";
P.env.DIST = _.join(k, "../dist");
P.env.PUBLIC = I.isPackaged ? P.env.DIST : _.join(P.env.DIST, "../public");
let m, S, M = null;
const R = P.env.VITE_DEV_SERVER_URL;
function ae() {
  const r = L.getPrimaryDisplay(), o = V.defaultSession;
  m = new B({
    icon: _.join(P.env.PUBLIC, "logo.png"),
    x: r.bounds.x,
    y: r.bounds.y,
    fullscreen: !0,
    webPreferences: {
      session: o,
      preload: _.join(k, "../dist-electron/preload.js"),
      nodeIntegration: !1,
      contextIsolation: !0,
      enableRemoteModule: !1,
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
  }), R ? m.loadURL(R) : m.loadFile(_.join(P.env.DIST, "index.html")), m.on("closed", () => {
    m = null, S && S.close();
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
  S = new B({
    icon: _.join(P.env.PUBLIC, "logo.png"),
    x: o.bounds.x,
    y: o.bounds.y,
    fullscreen: !0,
    webPreferences: {
      preload: _.join(k, "../dist-electron/preload.js")
    }
  }), R ? S.loadURL(`${R}customer.html`) : S.loadFile(_.join(P.env.DIST, "customer.html")), S.on("closed", () => {
    S = null;
  });
}
y.on("to-customer-display", (r, { channel: o, data: t }) => {
  o === "POS_TO_CUSTOMER_STATE" && (M = t), S && S.webContents.send(o, t);
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
    const t = o || "notification.wav", e = _.join(P.env.PUBLIC, "sounds", t);
    return console.log(`[IPC] Attempting to play sound: ${e}`), await oe.play(e), { success: !0 };
  } catch (t) {
    return console.error("[IPC] Error playing sound:", t), { success: !1, error: t.message };
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
    if (t = x.getDeviceList().find(
      (p) => p.deviceDescriptor.idVendor === e && p.deviceDescriptor.idProduct === n
    ), !t)
      throw new Error("USB Printer not found. It may be disconnected.");
    t.open();
    const c = t.interfaces[0];
    c.claim();
    const h = c.endpoints.find((p) => p.direction === "out");
    if (!h)
      throw new Error("Could not find an OUT endpoint on the printer.");
    await new Promise((p, g) => {
      h.transfer(o, (u) => {
        if (u) return g(u);
        p();
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
      const i = F("node-thermal-printer"), { printer: c, types: h } = i;
      let p = new c({
        type: h.EPSON,
        interface: `tcp://${o.ip_address}`,
        timeout: 5e3
      });
      if (!await p.isPrinterConnected())
        throw new Error(
          `Could not connect to kitchen printer at ${printer.ip_address}`
        );
      }
      console.log(
        `Successfully connected to kitchen printer at ${printer.ip_address}`
      );
      const u = ee(t, e, n);
      return u ? (console.log(`Sending kitchen ticket buffer (size: ${u.length})`), await p.raw(u), console.log("Kitchen ticket sent successfully."), { success: !0 }) : (console.log(`No items to print for zone "${e}" - skipping`), {
        success: !0,
        message: "No items matched filter - ticket skipped"
      });
    } catch (i) {
      return console.error(`
--- [Main Process] ERROR IN KITCHEN TICKET HANDLER ---`), console.error(i), { success: !1, error: i.message };
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
    const e = x.getDeviceList().find(
      (c) => (c.product || `USB Device ${c.deviceDescriptor.idVendor}:${c.deviceDescriptor.idProduct}`) === o
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
    const { session: t } = F("electron"), e = await t.defaultSession.cookies.get({ url: o });
    console.log(`[Main Process] Found ${e.length} cookies for ${o}`), e.forEach((i, c) => {
      console.log(
        `[Main Process] Cookie ${c + 1}: ${i.name} (${i.httpOnly ? "HttpOnly" : "Regular"})`
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
y.handle("get-machine-id", () => ie({ original: !0 }));
y.on("shutdown-app", () => {
  I.quit();
});
I.whenReady().then(async () => {
  console.log("[Main Process] Starting Electron app - online-only mode"), ce ? (I.commandLine.appendSwitch("--ignore-certificate-errors"), I.commandLine.appendSwitch("--allow-running-insecure-content"), console.log("[Main Process] Development mode - security switches enabled")) : (I.commandLine.appendSwitch("--enable-features", "VizDisplayCompositor"), I.commandLine.appendSwitch("--force-color-profile", "srgb"), console.log("[Main Process] Production mode - security features enabled")), ae(), le();
});
I.on("window-all-closed", () => {
  P.platform !== "darwin" && I.quit();
});
