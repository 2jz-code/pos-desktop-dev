import { app as S, ipcMain as y, screen as L, session as V, BrowserWindow as B } from "electron";
import P from "node:path";
import T from "node:process";
import { fileURLToPath as H } from "node:url";
import { createRequire as q } from "node:module";
import W from "node-machine-id";
import x from "usb";
import z from "child_process";
import Y from "util";
const Z = q(import.meta.url), G = Z("node-thermal-printer"), { printer: U, types: A } = G, J = H(import.meta.url);
P.dirname(J);
function E(r, o, t) {
  r.leftRight(o, t);
}
async function Q(r, o = null, t = !1) {
  var _, l, b, w;
  let e = new U({
    type: A.EPSON,
    characterSet: "PC437_USA",
    interface: "tcp://dummy"
  });
  e.alignCenter();
  try {
    const s = P.join(process.env.PUBLIC, "logo-receipt.png");
    await e.printImage(s), e.println("");
  } catch (s) {
    console.error("Could not print logo. Using text fallback."), console.error("Full logo printing error:", s), o != null && o.receipt_header && (e.println(o.receipt_header), e.println(""));
  }
  const n = (o == null ? void 0 : o.store_address) || `2105 Cliff Rd #300
Eagan, MN 55122`, i = (o == null ? void 0 : o.store_phone) || "(651) 412-5336";
  if (n.includes("\\n"))
    n.split("\\n").forEach((c) => {
      c.trim() && e.println(c.trim());
    });
  else {
    const s = n.split(",");
    if (s.length > 1) {
      const c = s.shift().trim(), p = s.join(",").trim();
      c && e.println(c), p && e.println(p);
    } else
      e.println(n);
  }
  e.println(`Tel: ${i}`), e.println(""), e.alignLeft();
  const a = r.order_number || r.id || "N/A", h = new Date(r.created_at).toLocaleString("en-US", {
    timeZone: "America/Chicago"
  }), d = r.customer_display_name || r.guest_first_name || ((_ = r.payment_details) == null ? void 0 : _.customer_name) || ((l = r.customer) == null ? void 0 : l.full_name);
  d && e.println(`Customer: ${d}`), e.println(`Order #: ${a}`), e.println(`Date: ${h}`);
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
  t && (e.alignCenter(), e.bold(!0), e.println("--- TRANSACTION RECEIPT ---"), e.bold(!1), e.alignLeft(), r.status && e.println(`Order Status: ${r.status}`), e.println("** Payment Not Yet Processed **")), e.println(""), e.alignCenter(), e.bold(!0), e.println("ITEMS"), e.bold(!1), e.drawLine(), e.alignLeft();
  for (const s of r.items) {
    const c = parseFloat(s.price_at_sale) * s.quantity, p = `${s.quantity}x ${s.product.name}`;
    if (E(e, p, `$${c.toFixed(2)}`), s.selected_modifiers_snapshot && s.selected_modifiers_snapshot.length > 0)
      for (const f of s.selected_modifiers_snapshot) {
        const R = parseFloat(f.price_at_sale) * f.quantity * s.quantity;
        let I = `   - ${f.option_name}`;
        f.quantity > 1 && (I += ` (${f.quantity}x)`), parseFloat(f.price_at_sale) !== 0 ? E(e, I, `$${R.toFixed(2)}`) : e.println(I);
      }
  }
  e.drawLine(), E(e, "Subtotal:", `$${parseFloat(r.subtotal).toFixed(2)}`), parseFloat(r.total_discounts_amount) > 0 && E(
    e,
    "Discount:",
    `-$${parseFloat(r.total_discounts_amount).toFixed(2)}`
  ), parseFloat(r.surcharges_total) > 0 && E(
    e,
    "Service Fee:",
    `$${parseFloat(r.surcharges_total).toFixed(2)}`
  ), E(e, "Tax:", `$${parseFloat(r.tax_total).toFixed(2)}`);
  const D = (b = r.payment_details) != null && b.tip ? parseFloat(r.payment_details.tip) : 0;
  if (D > 0 && E(e, "Tip:", `$${D.toFixed(2)}`), e.bold(!0), E(
    e,
    "TOTAL:",
    `$${parseFloat(r.total_with_tip).toFixed(2)}`
  ), e.bold(!1), e.println(""), t)
    e.bold(!0), e.println("Payment Information:"), e.bold(!1), e.println("This is a transaction receipt."), e.println("Payment will be processed separately.");
  else {
    const s = ((w = r.payment_details) == null ? void 0 : w.transactions) || [];
    if (s.length > 0) {
      e.bold(!0), e.println("Payment Details:"), e.bold(!1);
      for (const [c, p] of s.entries()) {
        const f = (p.method || "N/A").toUpperCase(), R = parseFloat(p.amount).toFixed(2);
        if (E(e, ` ${f} (${c + 1})`, `$${R}`), f === "CASH") {
          const I = parseFloat(p.cashTendered || 0).toFixed(2), C = parseFloat(p.change || 0).toFixed(2);
          parseFloat(I) > 0 && (E(e, "   Tendered:", `$${I}`), E(e, "   Change:", `$${C}`));
        } else if (f === "CREDIT" && p.metadata) {
          const I = p.metadata.card_brand || "", C = p.metadata.card_last4 || "";
          I && C && e.println(`    ${I} ****${C}`);
        }
      }
    }
  }
  return e.println(""), e.alignCenter(), ((o == null ? void 0 : o.receipt_footer) || "Thank you for your business!").split(`
`).forEach((c) => {
    c.trim() && e.println(c.trim());
  }), o != null && o.receipt_footer || e.println("Visit us at bakeajeen.com"), e.println(""), e.println(""), e.cut(), e.getBuffer();
}
function X() {
  let r = new U({
    type: A.EPSON,
    interface: "tcp://dummy"
  });
  return r.openCashDrawer(), r.getBuffer();
}
function ee(r, o = "KITCHEN", t = null) {
  var u, D;
  let e = r.items || [];
  if (t && (e = e.filter(($) => {
    var l, b;
    const _ = $.product;
    return !(t.productTypes && t.productTypes.length > 0 && !t.productTypes.includes("ALL") && !t.productTypes.includes(
      (l = _.product_type) == null ? void 0 : l.id
    ) || t.categories && t.categories.length > 0 && !t.categories.includes("ALL") && !t.categories.includes(
      (b = _.category) == null ? void 0 : b.id
    ));
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
  const i = r.customer_display_name || r.guest_first_name || ((u = r.payment_details) == null ? void 0 : u.customer_name) || ((D = r.customer) == null ? void 0 : D.full_name);
  i && n.println(`Customer: ${i}`);
  const a = new Date(r.created_at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: !0,
    timeZone: "America/Chicago"
  });
  n.println(`Time: ${a}`);
  const d = (r.dining_preference || "TAKE_OUT") === "DINE_IN" ? "DINE IN" : "TAKE OUT";
  if (n.bold(!0), n.println(`SERVICE: ${d}`), r.order_type) {
    const _ = {
      POS: "IN-STORE",
      WEB: "WEBSITE",
      APP: "APP",
      DOORDASH: "DOORDASH",
      UBER_EATS: "UBER EATS"
    }[r.order_type] || r.order_type;
    n.println(`SOURCE: ${_}`);
  }
  n.bold(!1), n.drawLine();
  const g = e.reduce(($, _) => {
    var b;
    const l = ((b = _.product.category) == null ? void 0 : b.name) || "Miscellaneous";
    return $[l] || ($[l] = []), $[l].push(_), $;
  }, {});
  for (const $ in g) {
    n.bold(!0), n.underline(!0), n.println(`${$.toUpperCase()}:`), n.underline(!1), n.bold(!1);
    const _ = g[$];
    for (const l of _) {
      if (n.bold(!0), n.setTextSize(1, 1), n.println(`${l.quantity}x ${l.product.name}`), n.setTextNormal(), n.bold(!1), l.selected_modifiers_snapshot && l.selected_modifiers_snapshot.length > 0) {
        const b = l.selected_modifiers_snapshot.reduce((w, s) => {
          const c = s.modifier_set_name || "Other";
          return w[c] || (w[c] = []), w[c].push(s), w;
        }, {});
        for (const [w, s] of Object.entries(b)) {
          const c = s.map((p) => {
            let f = p.option_name;
            return p.quantity > 1 && (f += ` (${p.quantity}x)`), f;
          }).join(", ");
          n.println(`   ${w} - ${c}`);
        }
      }
      l.notes && l.notes.trim() && n.println(`   NOTES: ${l.notes.trim()}`);
    }
    n.println("");
  }
  return n.cut(), n.getBuffer();
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
      if (t.r(i), Object.defineProperty(i, "default", { enumerable: !0, value: e }), 2 & n && typeof e != "string") for (var a in e) t.d(i, a, (function(h) {
        return e[h];
      }).bind(null, a));
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
    r.exports = { play: async (i, a = 0.5) => {
      const h = process.platform === "darwin" ? Math.min(2, 2 * a) : a, d = process.platform === "darwin" ? ((g, u) => `afplay "${g}" -v ${u}`)(i, h) : ((g, u) => `powershell -c Add-Type -AssemblyName presentationCore; $player = New-Object system.windows.media.mediaplayer; ${((D) => `$player.open('${D}');`)(g)} $player.Volume = ${u}; $player.Play(); Start-Sleep 1; Start-Sleep -s $player.NaturalDuration.TimeSpan.TotalSeconds;Exit;`)(i, h);
      try {
        await n(d);
      } catch (g) {
        throw g;
      }
    } };
  }, function(r, o) {
    r.exports = z;
  }, function(r, o) {
    r.exports = Y;
  }])), N;
}
var re = ne();
const oe = /* @__PURE__ */ te(re), { machineIdSync: ie } = W, F = q(import.meta.url), se = H(import.meta.url), k = P.dirname(se), ae = T.env.NODE_ENV === "development";
T.env.DIST = P.join(k, "../dist");
T.env.PUBLIC = S.isPackaged ? T.env.DIST : P.join(T.env.DIST, "../public");
let m, v, M = null;
const O = T.env.VITE_DEV_SERVER_URL;
function ce() {
  const r = L.getPrimaryDisplay(), o = V.defaultSession;
  m = new B({
    icon: P.join(T.env.PUBLIC, "logo.png"),
    x: r.bounds.x,
    y: r.bounds.y,
    fullscreen: !0,
    webPreferences: {
      session: o,
      preload: P.join(k, "../dist-electron/preload.js"),
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
  }), O ? m.loadURL(O) : m.loadFile(P.join(T.env.DIST, "index.html")), m.on("closed", () => {
    m = null, v && v.close();
  });
}
function le() {
  const o = L.getAllDisplays().find(
    (t) => t.id !== L.getPrimaryDisplay().id
  );
  if (!o) {
    console.log("No secondary display found, not creating customer window.");
    return;
  }
  v = new B({
    icon: P.join(T.env.PUBLIC, "logo.png"),
    x: o.bounds.x,
    y: o.bounds.y,
    fullscreen: !0,
    webPreferences: {
      preload: P.join(k, "../dist-electron/preload.js")
    }
  }), O ? v.loadURL(`${O}customer.html`) : v.loadFile(P.join(T.env.DIST, "customer.html")), v.on("closed", () => {
    v = null;
  });
}
y.on("to-customer-display", (r, { channel: o, data: t }) => {
  o === "POS_TO_CUSTOMER_STATE" && (M = t), v && v.webContents.send(o, t);
});
y.on("from-customer-display", (r, { channel: o, data: t }) => {
  m && m.webContents.send(o, t);
});
y.on("CUSTOMER_REQUESTS_STATE", (r) => {
  M && r.sender.send("POS_TO_CUSTOMER_STATE", M);
});
y.handle("play-notification-sound", async (r, o) => {
  try {
    const t = o || "notification.wav", e = P.join(T.env.PUBLIC, "sounds", t);
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
    const o = x.getDeviceList().map((t) => {
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
    if (t = x.getDeviceList().find(
      (d) => d.deviceDescriptor.idVendor === e && d.deviceDescriptor.idProduct === n
    ), !t)
      throw new Error("USB Printer not found. It may be disconnected.");
    t.open();
    const a = t.interfaces[0];
    a.claim();
    const h = a.endpoints.find((d) => d.direction === "out");
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
      const i = F("node-thermal-printer"), { printer: a, types: h } = i;
      let d = new a({
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
    const t = F("node-thermal-printer"), { printer: e, types: n } = t;
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
    const e = x.getDeviceList().find(
      (a) => (a.product || `USB Device ${a.deviceDescriptor.idVendor}:${a.deviceDescriptor.idProduct}`) === o
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
    const { session: t } = F("electron"), e = await t.defaultSession.cookies.get({ url: o });
    console.log(`[Main Process] Found ${e.length} cookies for ${o}`), e.forEach((i, a) => {
      console.log(
        `[Main Process] Cookie ${a + 1}: ${i.name} (${i.httpOnly ? "HttpOnly" : "Regular"})`
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
  S.quit();
});
S.whenReady().then(async () => {
  console.log("[Main Process] Starting Electron app - online-only mode"), ae ? (S.commandLine.appendSwitch("--ignore-certificate-errors"), S.commandLine.appendSwitch("--allow-running-insecure-content"), console.log("[Main Process] Development mode - security switches enabled")) : (S.commandLine.appendSwitch("--enable-features", "VizDisplayCompositor"), S.commandLine.appendSwitch("--force-color-profile", "srgb"), console.log("[Main Process] Production mode - security features enabled")), ce(), le();
});
S.on("window-all-closed", () => {
  T.platform !== "darwin" && S.quit();
});
