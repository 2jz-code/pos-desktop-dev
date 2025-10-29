import { app as b, ipcMain as h, screen as F, session as G, BrowserWindow as q } from "electron";
import T from "node:path";
import E from "node:process";
import { fileURLToPath as K } from "node:url";
import { createRequire as V } from "node:module";
import z from "node-machine-id";
import A from "usb";
import Z from "child_process";
import J from "util";
import Q from "crypto";
import C from "os";
const X = V(import.meta.url), ee = X("node-thermal-printer"), { printer: U, types: k } = ee, te = K(import.meta.url);
T.dirname(te);
function y(r, o, n) {
  r.leftRight(o, n);
}
async function ne(r, o = null, n = !1) {
  var g, f, l;
  let e = new U({
    type: k.EPSON,
    characterSet: "PC437_USA",
    interface: "tcp://dummy"
  });
  e.alignCenter();
  try {
    const s = T.join(process.env.PUBLIC, "logo-receipt.png");
    await e.printImage(s), e.println("");
  } catch (s) {
    console.error("Could not print logo. Using text fallback."), console.error("Full logo printing error:", s), o != null && o.receipt_header && (e.println(o.receipt_header), e.println(""));
  }
  const t = (o == null ? void 0 : o.store_address) || `2105 Cliff Rd #300
Eagan, MN 55122`, i = (o == null ? void 0 : o.store_phone) || "(651) 412-5336";
  if (t.includes("\\n"))
    t.split("\\n").forEach((c) => {
      c.trim() && e.println(c.trim());
    });
  else {
    const s = t.split(",");
    if (s.length > 1) {
      const c = s.shift().trim(), d = s.join(",").trim();
      c && e.println(c), d && e.println(d);
    } else
      e.println(t);
  }
  e.println(`Tel: ${i}`), e.println(""), e.alignLeft();
  const a = r.order_number || r.id || "N/A", P = new Date(r.created_at).toLocaleString("en-US", {
    timeZone: "America/Chicago"
  }), p = r.customer_display_name || r.guest_first_name || ((g = r.payment_details) == null ? void 0 : g.customer_name) || ((f = r.customer) == null ? void 0 : f.full_name);
  p && e.println(`Customer: ${p}`), e.println(`Order #: ${a}`), e.println(`Date: ${P}`);
  const u = (r.dining_preference || "TAKE_OUT") === "DINE_IN" ? "Dine In" : "Take Out";
  if (e.println(`Service: ${u}`), r.order_type) {
    const c = {
      POS: "In-Store",
      WEB: "Website",
      APP: "App",
      DOORDASH: "DoorDash",
      UBER_EATS: "Uber Eats"
    }[r.order_type] || r.order_type;
    e.println(`Source: ${c}`);
  }
  n && (e.alignCenter(), e.bold(!0), e.println("--- TRANSACTION RECEIPT ---"), e.bold(!1), e.alignLeft(), r.status && e.println(`Order Status: ${r.status}`), e.println("** Payment Not Yet Processed **")), e.println(""), e.alignCenter(), e.bold(!0), e.println("ITEMS"), e.bold(!1), e.drawLine(), e.alignLeft();
  for (const s of r.items) {
    const c = parseFloat(s.price_at_sale) * s.quantity, d = s.product ? s.product.name : s.custom_name || "Custom Item", $ = `${s.quantity}x ${d}`;
    if (y(e, $, `$${c.toFixed(2)}`), s.selected_modifiers_snapshot && s.selected_modifiers_snapshot.length > 0)
      for (const m of s.selected_modifiers_snapshot) {
        const v = parseFloat(m.price_at_sale) * m.quantity * s.quantity;
        let S = `   - ${m.option_name}`;
        m.quantity > 1 && (S += ` (${m.quantity}x)`), parseFloat(m.price_at_sale) !== 0 ? y(e, S, `$${v.toFixed(2)}`) : e.println(S);
      }
  }
  if (e.drawLine(), y(e, "Subtotal:", `$${parseFloat(r.subtotal).toFixed(2)}`), parseFloat(r.total_discounts_amount) > 0 && y(
    e,
    "Discount:",
    `-$${parseFloat(r.total_discounts_amount).toFixed(2)}`
  ), parseFloat(r.total_surcharges || 0) > 0 && y(
    e,
    "Service Fee:",
    `$${parseFloat(r.total_surcharges).toFixed(2)}`
  ), y(e, "Tax:", `$${parseFloat(r.tax_total).toFixed(2)}`), parseFloat(r.total_tips || 0) > 0 && y(e, "Tip:", `$${parseFloat(r.total_tips).toFixed(2)}`), e.bold(!0), y(
    e,
    "TOTAL:",
    `$${parseFloat(r.total_collected || r.grand_total || 0).toFixed(2)}`
  ), e.bold(!1), e.println(""), n)
    e.bold(!0), e.println("Payment Information:"), e.bold(!1), e.println("This is a transaction receipt."), e.println("Payment will be processed separately.");
  else {
    let s = ((l = r.payment_details) == null ? void 0 : l.transactions) || [];
    if (r.order_type === "WEB" && (s = s.filter((c) => c.status === "SUCCESSFUL")), s.length > 0) {
      e.bold(!0), e.println("Payment Details:"), e.bold(!1);
      for (const [c, d] of s.entries()) {
        const $ = (d.method || "N/A").toUpperCase(), m = parseFloat(d.amount || 0), v = parseFloat(d.surcharge || 0), S = parseFloat(d.tip || 0), L = (m + v + S).toFixed(2);
        if ($ === "CARD_ONLINE" || $ === "CARD_TERMINAL") {
          const R = d.card_brand || "", O = d.card_last4 || "";
          if (R && O) {
            const Y = `${R.toUpperCase()} ******${O}`;
            y(e, ` ${Y}`, `$${L}`);
          } else
            y(e, ` ${$} (${c + 1})`, `$${L}`);
        } else
          y(e, ` ${$} (${c + 1})`, `$${L}`);
        if ($ === "CASH") {
          const R = parseFloat(d.cashTendered || 0).toFixed(2), O = parseFloat(d.change || 0).toFixed(2);
          parseFloat(R) > 0 && (y(e, "   Tendered:", `$${R}`), y(e, "   Change:", `$${O}`));
        }
      }
    }
  }
  return e.println(""), e.alignCenter(), ((o == null ? void 0 : o.receipt_footer) || "Thank you for your business!").split(`
`).forEach((c) => {
    c.trim() && e.println(c.trim());
  }), o != null && o.receipt_footer || e.println("Visit us at bakeajeen.com"), e.println(""), e.println(""), e.cut(), e.getBuffer();
}
function re() {
  let r = new U({
    type: k.EPSON,
    interface: "tcp://dummy"
  });
  return r.openCashDrawer(), r.getBuffer();
}
function oe(r, o = "KITCHEN", n = null) {
  var u, D;
  let e = r.items || [];
  if (n && (e = e.filter((g) => {
    var l, s;
    const f = g.product;
    return f ? !(n.productTypes && n.productTypes.length > 0 && !n.productTypes.includes("ALL") && !n.productTypes.includes(
      (l = f.product_type) == null ? void 0 : l.id
    ) || n.categories && n.categories.length > 0 && !n.categories.includes("ALL") && !n.categories.includes(
      (s = f.category) == null ? void 0 : s.id
    )) : !0;
  })), e.length === 0)
    return console.log(
      `[formatKitchenTicket] No items match filter for zone "${o}" - skipping ticket`
    ), null;
  let t = new U({
    type: k.EPSON,
    characterSet: "PC437_USA",
    interface: "tcp://dummy"
  });
  t.println(""), t.println(""), t.println(""), t.println(""), t.alignCenter(), t.bold(!0), t.setTextSize(1, 1), t.println(`${o.toUpperCase()} TICKET`), t.setTextNormal(), t.bold(!1), t.alignLeft(), t.println(""), t.setTextSize(2, 2), t.bold(!0), t.println(`${r.order_number || r.id}`), t.bold(!1), t.setTextNormal();
  const i = r.customer_display_name || r.guest_first_name || ((u = r.payment_details) == null ? void 0 : u.customer_name) || ((D = r.customer) == null ? void 0 : D.full_name);
  i && t.println(`Customer: ${i}`);
  const a = new Date(r.created_at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: !0,
    timeZone: "America/Chicago"
  });
  t.println(`Time: ${a}`);
  const p = (r.dining_preference || "TAKE_OUT") === "DINE_IN" ? "DINE IN" : "TAKE OUT";
  if (t.bold(!0), t.println(`SERVICE: ${p}`), r.order_type) {
    const f = {
      POS: "IN-STORE",
      WEB: "WEBSITE",
      APP: "APP",
      DOORDASH: "DOORDASH",
      UBER_EATS: "UBER EATS"
    }[r.order_type] || r.order_type;
    t.println(`SOURCE: ${f}`);
  }
  t.bold(!1), t.drawLine();
  const w = e.reduce((g, f) => {
    var s;
    const l = f.product ? ((s = f.product.category) == null ? void 0 : s.name) || "Miscellaneous" : "Custom Items";
    return g[l] || (g[l] = []), g[l].push(f), g;
  }, {});
  for (const g in w) {
    t.bold(!0), t.underline(!0), t.println(`${g.toUpperCase()}:`), t.underline(!1), t.bold(!1);
    const f = w[g];
    for (const l of f) {
      t.bold(!0), t.setTextSize(1, 1);
      const s = l.product ? l.product.name : l.custom_name || "Custom Item";
      if (t.println(`${l.quantity}x ${s}`), t.setTextNormal(), t.bold(!1), l.selected_modifiers_snapshot && l.selected_modifiers_snapshot.length > 0) {
        const c = l.selected_modifiers_snapshot.reduce((d, $) => {
          const m = $.modifier_set_name || "Other";
          return d[m] || (d[m] = []), d[m].push($), d;
        }, {});
        for (const [d, $] of Object.entries(c)) {
          const m = $.map((v) => {
            let S = v.option_name;
            return v.quantity > 1 && (S += ` (${v.quantity}x)`), S;
          }).join(", ");
          t.println(`   ${d} - ${m}`);
        }
      }
      l.notes && l.notes.trim() && t.println(`   NOTES: ${l.notes.trim()}`);
    }
    t.println("");
  }
  return t.cut(), t.getBuffer();
}
function ie(r) {
  return r && r.__esModule && Object.prototype.hasOwnProperty.call(r, "default") ? r.default : r;
}
var M, H;
function se() {
  return H || (H = 1, M = function(r) {
    var o = {};
    function n(e) {
      if (o[e]) return o[e].exports;
      var t = o[e] = { i: e, l: !1, exports: {} };
      return r[e].call(t.exports, t, t.exports, n), t.l = !0, t.exports;
    }
    return n.m = r, n.c = o, n.d = function(e, t, i) {
      n.o(e, t) || Object.defineProperty(e, t, { enumerable: !0, get: i });
    }, n.r = function(e) {
      typeof Symbol < "u" && Symbol.toStringTag && Object.defineProperty(e, Symbol.toStringTag, { value: "Module" }), Object.defineProperty(e, "__esModule", { value: !0 });
    }, n.t = function(e, t) {
      if (1 & t && (e = n(e)), 8 & t || 4 & t && typeof e == "object" && e && e.__esModule) return e;
      var i = /* @__PURE__ */ Object.create(null);
      if (n.r(i), Object.defineProperty(i, "default", { enumerable: !0, value: e }), 2 & t && typeof e != "string") for (var a in e) n.d(i, a, (function(P) {
        return e[P];
      }).bind(null, a));
      return i;
    }, n.n = function(e) {
      var t = e && e.__esModule ? function() {
        return e.default;
      } : function() {
        return e;
      };
      return n.d(t, "a", t), t;
    }, n.o = function(e, t) {
      return Object.prototype.hasOwnProperty.call(e, t);
    }, n.p = "", n(n.s = 0);
  }([function(r, o, n) {
    const { exec: e } = n(1), t = n(2).promisify(e);
    r.exports = { play: async (i, a = 0.5) => {
      const P = process.platform === "darwin" ? Math.min(2, 2 * a) : a, p = process.platform === "darwin" ? ((w, u) => `afplay "${w}" -v ${u}`)(i, P) : ((w, u) => `powershell -c Add-Type -AssemblyName presentationCore; $player = New-Object system.windows.media.mediaplayer; ${((D) => `$player.open('${D}');`)(w)} $player.Volume = ${u}; $player.Play(); Start-Sleep 1; Start-Sleep -s $player.NaturalDuration.TimeSpan.TotalSeconds;Exit;`)(i, P);
      try {
        await t(p);
      } catch (w) {
        throw w;
      }
    } };
  }, function(r, o) {
    r.exports = Z;
  }, function(r, o) {
    r.exports = J;
  }])), M;
}
var ae = se();
const ce = /* @__PURE__ */ ie(ae), { machineIdSync: le } = z;
class de {
  constructor() {
    this._cachedFingerprint = null;
  }
  /**
   * Get hardware-based device fingerprint
   *
   * This fingerprint is stable across:
   * - App reinstalls ✅
   * - App updates ✅
   * - OS updates ✅
   *
   * Changes only when:
   * - Different physical machine (correct behavior)
   * - Major hardware replacement (motherboard, etc.)
   *
   * @returns {string} UUID-format fingerprint (e.g., "f47ac10b-58cc-4372-a567-0e02b2c3d479")
   */
  getDeviceFingerprint() {
    if (this._cachedFingerprint)
      return this._cachedFingerprint;
    try {
      const o = le(), n = C.hostname(), e = `${o}-${n}`, t = Q.createHash("sha256").update(e).digest("hex"), i = [
        t.substr(0, 8),
        t.substr(8, 4),
        t.substr(12, 4),
        t.substr(16, 4),
        t.substr(20, 12)
      ].join("-");
      return this._cachedFingerprint = i, console.log("🔐 Hardware fingerprint generated:", i), console.log("📌 Machine ID:", o.substring(0, 8) + "..."), console.log("🖥️  Hostname:", n), i;
    } catch (o) {
      throw console.error("❌ Failed to generate hardware fingerprint:", o), new Error("Unable to generate device fingerprint");
    }
  }
  /**
   * Get hardware info for debugging/support
   *
   * @returns {Object} Hardware and system information
   */
  getHardwareInfo() {
    return {
      platform: C.platform(),
      arch: C.arch(),
      hostname: C.hostname(),
      release: C.release(),
      cpus: C.cpus().length,
      totalMemory: Math.round(C.totalmem() / 1024 / 1024 / 1024) + " GB"
    };
  }
}
const pe = new de(), { machineIdSync: ue } = z, j = V(import.meta.url), fe = K(import.meta.url), B = T.dirname(fe), me = E.env.NODE_ENV === "development";
console.log("[Main Process] Configuring hardware acceleration and display settings...");
b.commandLine.appendSwitch("--enable-gpu-rasterization");
b.commandLine.appendSwitch("--enable-zero-copy");
b.commandLine.appendSwitch("--disable-software-rasterizer");
me ? (b.commandLine.appendSwitch("--ignore-certificate-errors"), b.commandLine.appendSwitch("--allow-running-insecure-content"), console.log("[Main Process] Development mode - debugging switches enabled")) : (b.commandLine.appendSwitch("--enable-features", "VizDisplayCompositor"), b.commandLine.appendSwitch("--force-color-profile", "srgb"), console.log("[Main Process] Production mode - stable display features enabled"));
E.env.DIST = T.join(B, "../dist");
E.env.PUBLIC = b.isPackaged ? E.env.DIST : T.join(E.env.DIST, "../public");
let _, I, x = null;
const N = E.env.VITE_DEV_SERVER_URL;
function he() {
  const r = F.getPrimaryDisplay(), o = G.defaultSession;
  _ = new q({
    icon: T.join(E.env.PUBLIC, "logo.png"),
    x: r.bounds.x,
    y: r.bounds.y,
    fullscreen: !0,
    webPreferences: {
      session: o,
      preload: T.join(B, "../dist-electron/preload.js"),
      nodeIntegration: !1,
      contextIsolation: !0,
      enableRemoteModule: !1,
      // Production security settings
      allowRunningInsecureContent: !1,
      webSecurity: !0,
      experimentalFeatures: !1
    }
  }), _.webContents.on("did-finish-load", () => {
    _ == null || _.webContents.send(
      "main-process-message",
      (/* @__PURE__ */ new Date()).toLocaleString()
    );
  }), N ? _.loadURL(N) : _.loadFile(T.join(E.env.DIST, "index.html")), _.on("closed", () => {
    _ = null, I && I.close();
  });
}
function ge() {
  const o = F.getAllDisplays().find(
    (n) => n.id !== F.getPrimaryDisplay().id
  );
  if (!o) {
    console.log("No secondary display found, not creating customer window.");
    return;
  }
  I = new q({
    icon: T.join(E.env.PUBLIC, "logo.png"),
    x: o.bounds.x,
    y: o.bounds.y,
    fullscreen: !0,
    webPreferences: {
      preload: T.join(B, "../dist-electron/preload.js"),
      nodeIntegration: !1,
      contextIsolation: !0,
      enableRemoteModule: !1
      // Remove hardwareAcceleration override - let app-level settings handle it
    }
  }), N ? I.loadURL(`${N}customer.html`) : I.loadFile(T.join(E.env.DIST, "customer.html")), I.on("closed", () => {
    I = null;
  });
}
h.on("to-customer-display", (r, { channel: o, data: n }) => {
  o === "POS_TO_CUSTOMER_STATE" && (x = n), I && I.webContents.send(o, n);
});
h.on("from-customer-display", (r, { channel: o, data: n }) => {
  _ && _.webContents.send(o, n);
});
h.on("CUSTOMER_REQUESTS_STATE", (r) => {
  x && r.sender.send("POS_TO_CUSTOMER_STATE", x);
});
h.handle("play-notification-sound", async (r, o) => {
  try {
    const n = o || "notification.wav", e = T.join(E.env.PUBLIC, "sounds", n);
    return console.log(`[IPC] Attempting to play sound: ${e}`), await ce.play(e), { success: !0 };
  } catch (n) {
    return console.error("[IPC] Error playing sound:", n), { success: !1, error: n.message };
  }
});
h.on("CUSTOMER_TO_POS_TIP", (r, o) => {
  _ && _.webContents.send("CUSTOMER_TO_POS_TIP", o);
});
h.handle("discover-printers", async () => {
  console.log(
    "[Main Process] Discovering printers using node-usb (robust method)..."
  );
  try {
    const o = A.getDeviceList().map((n) => {
      try {
        return n.configDescriptor && n.configDescriptor.interfaces && n.configDescriptor.interfaces.some(
          (t) => t.some(
            (i) => i.bInterfaceClass === 7
            // 7 is the printer class
          )
        ) ? {
          name: n.product || `USB Device ${n.deviceDescriptor.idVendor}:${n.deviceDescriptor.idProduct}`,
          vendorId: n.deviceDescriptor.idVendor,
          productId: n.deviceDescriptor.idProduct
        } : null;
      } catch (e) {
        return console.warn(`Could not inspect device: ${e.message}`), null;
      }
    }).filter((n) => n !== null);
    return console.log(
      "[Main Process] Found printers:",
      JSON.stringify(o, null, 2)
    ), o;
  } catch (r) {
    return console.error("[Main Process] Failed to discover printers:", r), [];
  }
});
async function W(r, o) {
  let n = null;
  try {
    const e = parseInt(r.vendorId || r.vendor_id, 10), t = parseInt(r.productId || r.product_id, 10);
    if (!e || !t)
      throw new Error(
        `Invalid printer object provided. Missing or invalid vendor/product ID. Got: ${JSON.stringify(
          r
        )}`
      );
    if (n = A.getDeviceList().find(
      (p) => p.deviceDescriptor.idVendor === e && p.deviceDescriptor.idProduct === t
    ), !n)
      throw new Error("USB Printer not found. It may be disconnected.");
    n.open();
    const a = n.interfaces[0];
    a.claim();
    const P = a.endpoints.find((p) => p.direction === "out");
    if (!P)
      throw new Error("Could not find an OUT endpoint on the printer.");
    await new Promise((p, w) => {
      P.transfer(o, (u) => {
        if (u) return w(u);
        p();
      });
    });
  } finally {
    if (n)
      try {
        n.interfaces[0] && n.interfaces[0].isClaimed && await new Promise((e) => {
          n.interfaces[0].release(!0, () => e());
        }), n.close();
      } catch (e) {
        console.error("Error cleaning up USB device:", e);
      }
  }
}
h.handle(
  "print-receipt",
  async (r, { printer: o, data: n, storeSettings: e, isTransaction: t = !1 }) => {
    console.log(`
--- [Main Process] Using HYBRID print method ---`), console.log(
      "[Main Process] Store settings:",
      e ? "provided" : "not provided",
      "isTransaction:",
      t
    );
    try {
      const i = await ne(n, e, t);
      return console.log(
        `[Main Process] Receipt buffer created (size: ${i.length}). Sending...`
      ), await W(o, i), console.log("[Main Process] Hybrid print command sent successfully."), { success: !0 };
    } catch (i) {
      return console.error("[Main Process] ERROR IN HYBRID PRINT HANDLER:", i), { success: !1, error: i.message };
    }
  }
);
h.handle(
  "print-kitchen-ticket",
  async (r, { printer: o, order: n, zoneName: e, filterConfig: t }) => {
    console.log(
      `
--- [Main Process] KITCHEN TICKET HANDLER for zone: "${e}" ---`
    ), console.log("Filter config:", t);
    try {
      if ((o == null ? void 0 : o.connection_type) !== "network" || !o.ip_address)
        throw new Error("Invalid network printer configuration provided.");
      const i = j("node-thermal-printer"), { printer: a, types: P } = i;
      let p = new a({
        type: P.EPSON,
        interface: `tcp://${o.ip_address}`,
        timeout: 5e3
      });
      if (!await p.isPrinterConnected())
        throw new Error(
          `Could not connect to kitchen printer at ${o.ip_address}`
        );
      console.log(
        `Successfully connected to kitchen printer at ${o.ip_address}`
      );
      const u = oe(n, e, t);
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
h.handle("test-network-printer", async (r, { ip_address: o }) => {
  console.log(
    `
--- [Main Process] TESTING NETWORK PRINTER at: ${o} ---`
  );
  try {
    if (!o)
      throw new Error("No IP address provided for testing.");
    const n = j("node-thermal-printer"), { printer: e, types: t } = n;
    let i = new e({
      type: t.EPSON,
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
  } catch (n) {
    console.error(`ERROR: Could not connect to printer at ${o}.`), console.error(n);
    let e = n.message;
    return n.message.includes("timed out") ? e = "Connection timed out. Check the IP address and ensure the printer is on the same network." : n.message.includes("ECONNREFUSED") && (e = "Connection refused. The printer is reachable but is not accepting connections on this port."), { success: !1, error: e };
  }
});
h.handle("open-cash-drawer", async (r, { printerName: o }) => {
  console.log(`
--- [Main Process] Using HYBRID open-drawer method ---`);
  try {
    const e = A.getDeviceList().find(
      (a) => (a.product || `USB Device ${a.deviceDescriptor.idVendor}:${a.deviceDescriptor.idProduct}`) === o
    );
    if (!e)
      throw new Error(`Printer with name "${o}" not found.`);
    const t = {
      vendorId: e.deviceDescriptor.idVendor,
      productId: e.deviceDescriptor.idProduct
    }, i = re();
    return console.log(
      `[Main Process] Open-drawer buffer created (size: ${i.length}). Sending...`
    ), await W(t, i), console.log("[Main Process] Hybrid open-drawer command sent successfully."), { success: !0 };
  } catch (n) {
    return console.error("[Main Process] ERROR IN HYBRID CASH DRAWER HANDLER:", n), { success: !1, error: n.message };
  }
});
h.handle("get-session-cookies", async (r, o) => {
  try {
    const { session: n } = j("electron"), e = await n.defaultSession.cookies.get({ url: o });
    console.log(`[Main Process] Found ${e.length} cookies for ${o}`), e.forEach((i, a) => {
      console.log(
        `[Main Process] Cookie ${a + 1}: ${i.name} (${i.httpOnly ? "HttpOnly" : "Regular"})`
      );
    });
    const t = e.map((i) => `${i.name}=${i.value}`).join("; ");
    return console.log(
      t ? `[Main Process] Cookie string created (length: ${t.length})` : "[Main Process] No cookies found - returning empty string"
    ), t;
  } catch (n) {
    throw console.error("[Main Process] Error getting session cookies:", n), n;
  }
});
h.handle("get-machine-id", () => ue({ original: !0 }));
h.handle("get-device-fingerprint", () => pe.getDeviceFingerprint());
h.on("shutdown-app", () => {
  b.quit();
});
b.whenReady().then(async () => {
  console.log("[Main Process] Starting Electron app - online-only mode"), console.log("[Main Process] Hardware acceleration and display settings applied at startup"), he(), ge();
});
b.on("window-all-closed", () => {
  E.platform !== "darwin" && b.quit();
});
