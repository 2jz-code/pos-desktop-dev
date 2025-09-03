import { app as I, ipcMain as y, screen as M, session as V, BrowserWindow as B } from "electron";
import _ from "node:path";
import P from "node:process";
import { fileURLToPath as q } from "node:url";
import { createRequire as H } from "node:module";
import z from "node-machine-id";
import L from "usb";
import W from "child_process";
import Y from "util";
const Z = H(import.meta.url), G = Z("node-thermal-printer"), { printer: F, types: U } = G, J = q(import.meta.url);
_.dirname(J);
function T(r, o, t) {
  r.leftRight(o, t);
}
async function Q(r, o = null, t = !1) {
  var b, a, E, w;
  let e = new F({
    type: U.EPSON,
    characterSet: "PC437_USA",
    interface: "tcp://dummy"
  });
  e.alignCenter();
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
      const l = s.shift().trim(), p = s.join(",").trim();
      l && e.println(l), p && e.println(p);
    } else
      e.println(n);
  }
  e.println(`Tel: ${i}`), e.println(""), e.alignLeft();
  const c = r.order_number || r.id || "N/A", h = new Date(r.created_at).toLocaleString("en-US", {
    timeZone: "America/Chicago"
  }), d = r.customer_display_name || r.guest_first_name || ((b = r.payment_details) == null ? void 0 : b.customer_name) || ((a = r.customer) == null ? void 0 : a.full_name);
  d && e.println(`Customer: ${d}`), e.println(`Order #: ${c}`), e.println(`Date: ${h}`);
  const u = (r.dining_preference || "TAKE_OUT") === "DINE_IN" ? "Dine In" : "Take Out";
  e.println(`Service: ${u}`), t && (e.alignCenter(), e.bold(!0), e.println("--- TRANSACTION RECEIPT ---"), e.bold(!1), e.alignLeft(), r.status && e.println(`Order Status: ${r.status}`), e.println("** Payment Not Yet Processed **")), e.println(""), e.alignCenter(), e.bold(!0), e.println("ITEMS"), e.bold(!1), e.drawLine(), e.alignLeft();
  for (const s of r.items) {
    const l = parseFloat(s.price_at_sale) * s.quantity, p = `${s.quantity}x ${s.product.name}`;
    if (T(e, p, `$${l.toFixed(2)}`), s.selected_modifiers_snapshot && s.selected_modifiers_snapshot.length > 0)
      for (const f of s.selected_modifiers_snapshot) {
        const O = parseFloat(f.price_at_sale) * f.quantity * s.quantity;
        let v = `   - ${f.option_name}`;
        f.quantity > 1 && (v += ` (${f.quantity}x)`), parseFloat(f.price_at_sale) !== 0 ? T(e, v, `$${O.toFixed(2)}`) : e.println(v);
      }
  }
  e.drawLine(), T(e, "Subtotal:", `$${parseFloat(r.subtotal).toFixed(2)}`), parseFloat(r.total_discounts_amount) > 0 && T(
    e,
    "Discount:",
    `-$${parseFloat(r.total_discounts_amount).toFixed(2)}`
  ), parseFloat(r.surcharges_total) > 0 && T(
    e,
    "Service Fee:",
    `$${parseFloat(r.surcharges_total).toFixed(2)}`
  ), T(e, "Tax:", `$${parseFloat(r.tax_total).toFixed(2)}`);
  const D = (E = r.payment_details) != null && E.tip ? parseFloat(r.payment_details.tip) : 0;
  if (D > 0 && T(e, "Tip:", `$${D.toFixed(2)}`), e.bold(!0), T(
    e,
    "TOTAL:",
    `$${parseFloat(r.total_with_tip).toFixed(2)}`
  ), e.bold(!1), e.println(""), t)
    e.bold(!0), e.println("Payment Information:"), e.bold(!1), e.println("This is a transaction receipt."), e.println("Payment will be processed separately.");
  else {
    const s = ((w = r.payment_details) == null ? void 0 : w.transactions) || [];
    if (s.length > 0) {
      e.bold(!0), e.println("Payment Details:"), e.bold(!1);
      for (const [l, p] of s.entries()) {
        const f = (p.method || "N/A").toUpperCase(), O = parseFloat(p.amount).toFixed(2);
        if (T(e, ` ${f} (${l + 1})`, `$${O}`), f === "CASH") {
          const v = parseFloat(p.cashTendered || 0).toFixed(2), S = parseFloat(p.change || 0).toFixed(2);
          parseFloat(v) > 0 && (T(e, "   Tendered:", `$${v}`), T(e, "   Change:", `$${S}`));
        } else if (f === "CREDIT" && p.metadata) {
          const v = p.metadata.card_brand || "", S = p.metadata.card_last4 || "";
          v && S && e.println(`    ${v} ****${S}`);
        }
      }
    }
  }
  return e.println(""), e.alignCenter(), ((o == null ? void 0 : o.receipt_footer) || "Thank you for your business!").split(`
`).forEach((l) => {
    l.trim() && e.println(l.trim());
  }), o != null && o.receipt_footer || e.println("Visit us at bakeajeen.com"), e.println(""), e.println(""), e.cut(), e.getBuffer();
}
function X() {
  let r = new F({
    type: U.EPSON,
    interface: "tcp://dummy"
  });
  return r.openCashDrawer(), r.getBuffer();
}
function ee(r, o = "KITCHEN", t = null) {
  var u, D;
  let e = r.items || [];
  if (t && (e = e.filter(($) => {
    var a, E;
    const b = $.product;
    return !(t.productTypes && t.productTypes.length > 0 && !t.productTypes.includes("ALL") && !t.productTypes.includes(
      (a = b.product_type) == null ? void 0 : a.id
    ) || t.categories && t.categories.length > 0 && !t.categories.includes("ALL") && !t.categories.includes(
      (E = b.category) == null ? void 0 : E.id
    ));
  })), e.length === 0)
    return console.log(
      `[formatKitchenTicket] No items match filter for zone "${o}" - skipping ticket`
    ), null;
  let n = new F({
    type: U.EPSON,
    characterSet: "PC437_USA",
    interface: "tcp://dummy"
  });
  n.alignCenter(), n.bold(!0), n.setTextSize(1, 1), n.println(`${o.toUpperCase()} TICKET`), n.setTextNormal(), n.bold(!1), n.alignLeft(), n.println(""), n.setTextSize(2, 2), n.bold(!0), n.println(`${r.order_number || r.id}`), n.bold(!1), n.setTextNormal();
  const i = r.customer_display_name || r.guest_first_name || ((u = r.payment_details) == null ? void 0 : u.customer_name) || ((D = r.customer) == null ? void 0 : D.full_name);
  i && n.println(`Customer: ${i}`);
  const c = new Date(r.created_at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: !0,
    timeZone: "America/Chicago"
  });
  n.println(`Time: ${c}`);
  const d = (r.dining_preference || "TAKE_OUT") === "DINE_IN" ? "DINE IN" : "TAKE OUT";
  n.bold(!0), n.println(`SERVICE: ${d}`), n.bold(!1), n.drawLine();
  const g = e.reduce(($, b) => {
    var E;
    const a = ((E = b.product.category) == null ? void 0 : E.name) || "Miscellaneous";
    return $[a] || ($[a] = []), $[a].push(b), $;
  }, {});
  for (const $ in g) {
    n.bold(!0), n.underline(!0), n.println(`${$.toUpperCase()}:`), n.underline(!1), n.bold(!1);
    const b = g[$];
    for (const a of b) {
      if (n.bold(!0), n.setTextSize(1, 1), n.println(`${a.quantity}x ${a.product.name}`), n.setTextNormal(), n.bold(!1), a.selected_modifiers_snapshot && a.selected_modifiers_snapshot.length > 0) {
        const E = a.selected_modifiers_snapshot.reduce((w, s) => {
          const l = s.modifier_set_name || "Other";
          return w[l] || (w[l] = []), w[l].push(s), w;
        }, {});
        for (const [w, s] of Object.entries(E)) {
          const l = s.map((p) => {
            let f = p.option_name;
            return p.quantity > 1 && (f += ` (${p.quantity}x)`), f;
          }).join(", ");
          n.println(`   ${w} - ${l}`);
        }
      }
      a.notes && a.notes.trim() && n.println(`   NOTES: ${a.notes.trim()}`);
    }
    n.println("");
  }
  return n.println(""), n.println(""), n.cut(), n.getBuffer();
}
function te(r) {
  return r && r.__esModule && Object.prototype.hasOwnProperty.call(r, "default") ? r.default : r;
}
var N, j;
function ne() {
  return j || (j = 1, N = function(r) {
    var o = {};
    function t(e) {
      if (o[e]) return o[e].exports;
      var n = o[e] = { i: e, l: !1, exports: {} };
      return r[e].call(n.exports, n, n.exports, t), n.l = !0, n.exports;
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
        return e;
      };
      return t.d(n, "a", n), n;
    }, t.o = function(e, n) {
      return Object.prototype.hasOwnProperty.call(e, n);
    }, t.p = "", t(t.s = 0);
  }([function(r, o, t) {
    const { exec: e } = t(1), n = t(2).promisify(e);
    r.exports = { play: async (i, c = 0.5) => {
      const h = process.platform === "darwin" ? Math.min(2, 2 * c) : c, d = process.platform === "darwin" ? ((g, u) => `afplay "${g}" -v ${u}`)(i, h) : ((g, u) => `powershell -c Add-Type -AssemblyName presentationCore; $player = New-Object system.windows.media.mediaplayer; ${((D) => `$player.open('${D}');`)(g)} $player.Volume = ${u}; $player.Play(); Start-Sleep 1; Start-Sleep -s $player.NaturalDuration.TimeSpan.TotalSeconds;Exit;`)(i, h);
      try {
        await n(d);
      } catch (g) {
        throw g;
      }
    } };
  }, function(r, o) {
    r.exports = W;
  }, function(r, o) {
    r.exports = Y;
  }])), N;
}
var re = ne();
const oe = /* @__PURE__ */ te(re), { machineIdSync: ie } = z, k = H(import.meta.url), se = q(import.meta.url), A = _.dirname(se), ce = P.env.NODE_ENV === "development";
P.env.DIST = _.join(A, "../dist");
P.env.PUBLIC = I.isPackaged ? P.env.DIST : _.join(P.env.DIST, "../public");
let m, C, x = null;
const R = P.env.VITE_DEV_SERVER_URL;
function ae() {
  const r = M.getPrimaryDisplay(), o = V.defaultSession;
  m = new B({
    icon: _.join(P.env.PUBLIC, "logo.png"),
    x: r.bounds.x,
    y: r.bounds.y,
    fullscreen: !0,
    webPreferences: {
      session: o,
      preload: _.join(A, "../dist-electron/preload.js"),
      nodeIntegration: !1,
      contextIsolation: !0,
      enableRemoteModule: !1,
      // Production security settings
      allowRunningInsecureContent: !1,
      webSecurity: !0,
      experimentalFeatures: !1
    }
  }), m.webContents.on("did-finish-load", () => {
    m == null || m.webContents.send(
      "main-process-message",
      (/* @__PURE__ */ new Date()).toLocaleString()
    );
  }), R ? m.loadURL(R) : m.loadFile(_.join(P.env.DIST, "index.html")), m.on("closed", () => {
    m = null, C && C.close();
  });
}
function le() {
  const o = M.getAllDisplays().find(
    (t) => t.id !== M.getPrimaryDisplay().id
  );
  if (!o) {
    console.log("No secondary display found, not creating customer window.");
    return;
  }
  C = new B({
    icon: _.join(P.env.PUBLIC, "logo.png"),
    x: o.bounds.x,
    y: o.bounds.y,
    fullscreen: !0,
    webPreferences: {
      preload: _.join(A, "../dist-electron/preload.js")
    }
  }), R ? C.loadURL(`${R}customer.html`) : C.loadFile(_.join(P.env.DIST, "customer.html")), C.on("closed", () => {
    C = null;
  });
}
y.on("to-customer-display", (r, { channel: o, data: t }) => {
  o === "POS_TO_CUSTOMER_STATE" && (x = t), C && C.webContents.send(o, t);
});
y.on("from-customer-display", (r, { channel: o, data: t }) => {
  m && m.webContents.send(o, t);
});
y.on("CUSTOMER_REQUESTS_STATE", (r) => {
  x && r.sender.send("POS_TO_CUSTOMER_STATE", x);
});
y.handle("play-notification-sound", async (r, o) => {
  try {
    const t = o || "notification.wav", e = _.join(P.env.PUBLIC, "sounds", t);
    return console.log(`[IPC] Attempting to play sound: ${e}`), await oe.play(e), { success: !0 };
  } catch (t) {
    return console.error("[IPC] Error playing sound:", t), { success: !1, error: t.message };
  }
});
y.on("CUSTOMER_TO_POS_TIP", (r, o) => {
  m && m.webContents.send("CUSTOMER_TO_POS_TIP", o);
});
y.handle("discover-printers", async () => {
  console.log(
    "[Main Process] Discovering printers using node-usb (robust method)..."
  );
  try {
    const o = L.getDeviceList().map((t) => {
      try {
        return t.configDescriptor && t.configDescriptor.interfaces && t.configDescriptor.interfaces.some(
          (n) => n.some(
            (i) => i.bInterfaceClass === 7
            // 7 is the printer class
          )
        ) ? {
          name: t.product || `USB Device ${t.deviceDescriptor.idVendor}:${t.deviceDescriptor.idProduct}`,
          vendorId: t.deviceDescriptor.idVendor,
          productId: t.deviceDescriptor.idProduct
        } : null;
      } catch (e) {
        return console.warn(`Could not inspect device: ${e.message}`), null;
      }
    }).filter((t) => t !== null);
    return console.log(
      "[Main Process] Found printers:",
      JSON.stringify(o, null, 2)
    ), o;
  } catch (r) {
    return console.error("[Main Process] Failed to discover printers:", r), [];
  }
});
async function K(r, o) {
  let t = null;
  try {
    const e = parseInt(r.vendorId || r.vendor_id, 10), n = parseInt(r.productId || r.product_id, 10);
    if (!e || !n)
      throw new Error(
        `Invalid printer object provided. Missing or invalid vendor/product ID. Got: ${JSON.stringify(
          r
        )}`
      );
    if (t = L.getDeviceList().find(
      (d) => d.deviceDescriptor.idVendor === e && d.deviceDescriptor.idProduct === n
    ), !t)
      throw new Error("USB Printer not found. It may be disconnected.");
    t.open();
    const c = t.interfaces[0];
    c.claim();
    const h = c.endpoints.find((d) => d.direction === "out");
    if (!h)
      throw new Error("Could not find an OUT endpoint on the printer.");
    await new Promise((d, g) => {
      h.transfer(o, (u) => {
        if (u) return g(u);
        d();
      });
    });
  } finally {
    if (t)
      try {
        t.interfaces[0] && t.interfaces[0].isClaimed && await new Promise((e) => {
          t.interfaces[0].release(!0, () => e());
        }), t.close();
      } catch (e) {
        console.error("Error cleaning up USB device:", e);
      }
  }
}
y.handle(
  "print-receipt",
  async (r, { printer: o, data: t, storeSettings: e, isTransaction: n = !1 }) => {
    console.log(`
--- [Main Process] Using HYBRID print method ---`), console.log(
      "[Main Process] Store settings:",
      e ? "provided" : "not provided",
      "isTransaction:",
      n
    );
    try {
      const i = await Q(t, e, n);
      return console.log(
        `[Main Process] Receipt buffer created (size: ${i.length}). Sending...`
      ), await K(o, i), console.log("[Main Process] Hybrid print command sent successfully."), { success: !0 };
    } catch (i) {
      return console.error("[Main Process] ERROR IN HYBRID PRINT HANDLER:", i), { success: !1, error: i.message };
    }
  }
);
y.handle(
  "print-kitchen-ticket",
  async (r, { printer: o, order: t, zoneName: e, filterConfig: n }) => {
    console.log(
      `
--- [Main Process] KITCHEN TICKET HANDLER for zone: "${e}" ---`
    ), console.log("Filter config:", n);
    try {
      if ((o == null ? void 0 : o.connection_type) !== "network" || !o.ip_address)
        throw new Error("Invalid network printer configuration provided.");
      const i = k("node-thermal-printer"), { printer: c, types: h } = i;
      let d = new c({
        type: h.EPSON,
        interface: `tcp://${o.ip_address}`,
        timeout: 5e3
      });
      if (!await d.isPrinterConnected())
        throw new Error(
          `Could not connect to kitchen printer at ${o.ip_address}`
        );
      console.log(
        `Successfully connected to kitchen printer at ${o.ip_address}`
      );
      const u = ee(t, e, n);
      return u ? (console.log(`Sending kitchen ticket buffer (size: ${u.length})`), await d.raw(u), console.log("Kitchen ticket sent successfully."), { success: !0 }) : (console.log(`No items to print for zone "${e}" - skipping`), {
        success: !0,
        message: "No items matched filter - ticket skipped"
      });
    } catch (i) {
      return console.error(`
--- [Main Process] ERROR IN KITCHEN TICKET HANDLER ---`), console.error(i), { success: !1, error: i.message };
    }
  }
);
y.handle("test-network-printer", async (r, { ip_address: o }) => {
  console.log(
    `
--- [Main Process] TESTING NETWORK PRINTER at: ${o} ---`
  );
  try {
    if (!o)
      throw new Error("No IP address provided for testing.");
    const t = k("node-thermal-printer"), { printer: e, types: n } = t;
    let i = new e({
      type: n.EPSON,
      interface: `tcp://${o}`,
      timeout: 3e3
      // Shorter timeout for a quick test
    });
    if (await i.isPrinterConnected())
      return console.log(`SUCCESS: Connection to ${o} is OK.`), i.println("Connection Test OK"), i.cut(), await i.execute(), {
        success: !0,
        message: `Successfully connected to ${o}. A test slip may have been printed.`
      };
    throw new Error("Connection failed. The printer did not respond.");
  } catch (t) {
    console.error(`ERROR: Could not connect to printer at ${o}.`), console.error(t);
    let e = t.message;
    return t.message.includes("timed out") ? e = "Connection timed out. Check the IP address and ensure the printer is on the same network." : t.message.includes("ECONNREFUSED") && (e = "Connection refused. The printer is reachable but is not accepting connections on this port."), { success: !1, error: e };
  }
});
y.handle("open-cash-drawer", async (r, { printerName: o }) => {
  console.log(`
--- [Main Process] Using HYBRID open-drawer method ---`);
  try {
    const e = L.getDeviceList().find(
      (c) => (c.product || `USB Device ${c.deviceDescriptor.idVendor}:${c.deviceDescriptor.idProduct}`) === o
    );
    if (!e)
      throw new Error(`Printer with name "${o}" not found.`);
    const n = {
      vendorId: e.deviceDescriptor.idVendor,
      productId: e.deviceDescriptor.idProduct
    }, i = X();
    return console.log(
      `[Main Process] Open-drawer buffer created (size: ${i.length}). Sending...`
    ), await K(n, i), console.log("[Main Process] Hybrid open-drawer command sent successfully."), { success: !0 };
  } catch (t) {
    return console.error("[Main Process] ERROR IN HYBRID CASH DRAWER HANDLER:", t), { success: !1, error: t.message };
  }
});
y.handle("get-session-cookies", async (r, o) => {
  try {
    const { session: t } = k("electron"), e = await t.defaultSession.cookies.get({ url: o });
    console.log(`[Main Process] Found ${e.length} cookies for ${o}`), e.forEach((i, c) => {
      console.log(
        `[Main Process] Cookie ${c + 1}: ${i.name} (${i.httpOnly ? "HttpOnly" : "Regular"})`
      );
    });
    const n = e.map((i) => `${i.name}=${i.value}`).join("; ");
    return console.log(
      n ? `[Main Process] Cookie string created (length: ${n.length})` : "[Main Process] No cookies found - returning empty string"
    ), n;
  } catch (t) {
    throw console.error("[Main Process] Error getting session cookies:", t), t;
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
