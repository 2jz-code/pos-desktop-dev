import { app as C, ipcMain as g, screen as N, session as ee, BrowserWindow as j } from "electron";
import h from "node:path";
import T from "node:process";
import { fileURLToPath as Y } from "node:url";
import { createRequire as Z } from "node:module";
import te from "node-machine-id";
import q from "usb";
import ne from "child_process";
import oe from "util";
const re = Z(import.meta.url), se = re("node-thermal-printer"), { printer: V, types: z } = se, ie = Y(import.meta.url);
h.dirname(ie);
function P(n, r, t) {
  n.leftRight(r, t);
}
async function ae(n, r = null, t = !1) {
  var _, m, d;
  let e = new V({
    type: z.EPSON,
    characterSet: "PC437_USA",
    interface: "tcp://dummy"
  });
  e.alignCenter();
  try {
    const i = h.join(process.env.PUBLIC, "logo-receipt.png");
    await e.printImage(i), e.println("");
  } catch (i) {
    console.error("Could not print logo. Using text fallback."), console.error("Full logo printing error:", i), r != null && r.receipt_header && (e.println(r.receipt_header), e.println(""));
  }
  const o = (r == null ? void 0 : r.store_address) || `2105 Cliff Rd #300
Eagan, MN 55122`, s = (r == null ? void 0 : r.store_phone) || "(651) 412-5336";
  if (o.includes("\\n"))
    o.split("\\n").forEach((l) => {
      l.trim() && e.println(l.trim());
    });
  else {
    const i = o.split(",");
    if (i.length > 1) {
      const l = i.shift().trim(), p = i.join(",").trim();
      l && e.println(l), p && e.println(p);
    } else
      e.println(o);
  }
  e.println(`Tel: ${s}`), e.println(""), e.alignLeft();
  const c = n.order_number || n.id || "N/A", E = new Date(n.created_at).toLocaleString("en-US", {
    timeZone: "America/Chicago"
  }), u = n.customer_display_name || n.guest_first_name || ((_ = n.payment_details) == null ? void 0 : _.customer_name) || ((m = n.customer) == null ? void 0 : m.full_name);
  u && e.println(`Customer: ${u}`), e.println(`Order #: ${c}`), e.println(`Date: ${E}`);
  const f = (n.dining_preference || "TAKE_OUT") === "DINE_IN" ? "Dine In" : "Take Out";
  if (e.println(`Service: ${f}`), n.order_type) {
    const l = {
      POS: "In-Store",
      WEB: "Website",
      APP: "App",
      DOORDASH: "DoorDash",
      UBER_EATS: "Uber Eats"
    }[n.order_type] || n.order_type;
    e.println(`Source: ${l}`);
  }
  t && (e.alignCenter(), e.bold(!0), e.println("--- TRANSACTION RECEIPT ---"), e.bold(!1), e.alignLeft(), n.status && e.println(`Order Status: ${n.status}`), e.println("** Payment Not Yet Processed **")), e.println(""), e.alignCenter(), e.bold(!0), e.println("ITEMS"), e.bold(!1), e.drawLine(), e.alignLeft();
  for (const i of n.items) {
    const l = parseFloat(i.price_at_sale) * i.quantity, p = i.product ? i.product.name : i.custom_name || "Custom Item", b = `${i.quantity}x ${p}`;
    if (P(e, b, `$${l.toFixed(2)}`), i.selected_modifiers_snapshot && i.selected_modifiers_snapshot.length > 0)
      for (const y of i.selected_modifiers_snapshot) {
        const v = parseFloat(y.price_at_sale) * y.quantity * i.quantity;
        let I = `   - ${y.option_name}`;
        y.quantity > 1 && (I += ` (${y.quantity}x)`), parseFloat(y.price_at_sale) !== 0 ? P(e, I, `$${v.toFixed(2)}`) : e.println(I);
      }
  }
  if (e.drawLine(), P(e, "Subtotal:", `$${parseFloat(n.subtotal).toFixed(2)}`), parseFloat(n.total_discounts_amount) > 0 && P(
    e,
    "Discount:",
    `-$${parseFloat(n.total_discounts_amount).toFixed(2)}`
  ), parseFloat(n.total_surcharges || 0) > 0 && P(
    e,
    "Service Fee:",
    `$${parseFloat(n.total_surcharges).toFixed(2)}`
  ), P(e, "Tax:", `$${parseFloat(n.tax_total).toFixed(2)}`), parseFloat(n.total_tips || 0) > 0 && P(e, "Tip:", `$${parseFloat(n.total_tips).toFixed(2)}`), e.bold(!0), P(
    e,
    "TOTAL:",
    `$${parseFloat(n.total_collected || n.grand_total || 0).toFixed(2)}`
  ), e.bold(!1), e.println(""), t)
    e.bold(!0), e.println("Payment Information:"), e.bold(!1), e.println("This is a transaction receipt."), e.println("Payment will be processed separately.");
  else {
    let i = ((d = n.payment_details) == null ? void 0 : d.transactions) || [];
    if (n.order_type === "WEB" && (i = i.filter((l) => l.status === "SUCCESSFUL")), i.length > 0) {
      e.bold(!0), e.println("Payment Details:"), e.bold(!1);
      for (const [l, p] of i.entries()) {
        const b = (p.method || "N/A").toUpperCase(), y = parseFloat(p.amount || 0), v = parseFloat(p.surcharge || 0), I = parseFloat(p.tip || 0), k = (y + v + I).toFixed(2);
        if (b === "CARD_ONLINE" || b === "CARD_TERMINAL") {
          const R = p.card_brand || "", L = p.card_last4 || "";
          if (R && L) {
            const X = `${R.toUpperCase()} ******${L}`;
            P(e, ` ${X}`, `$${k}`);
          } else
            P(e, ` ${b} (${l + 1})`, `$${k}`);
        } else
          P(e, ` ${b} (${l + 1})`, `$${k}`);
        if (b === "CASH") {
          const R = parseFloat(p.cashTendered || 0).toFixed(2), L = parseFloat(p.change || 0).toFixed(2);
          parseFloat(R) > 0 && (P(e, "   Tendered:", `$${R}`), P(e, "   Change:", `$${L}`));
        }
      }
    }
  }
  return e.println(""), e.alignCenter(), ((r == null ? void 0 : r.receipt_footer) || "Thank you for your business!").split(`
`).forEach((l) => {
    l.trim() && e.println(l.trim());
  }), r != null && r.receipt_footer || e.println("Visit us at bakeajeen.com"), e.println(""), e.println(""), e.cut(), e.getBuffer();
}
function ce() {
  let n = new V({
    type: z.EPSON,
    interface: "tcp://dummy"
  });
  return n.openCashDrawer(), n.getBuffer();
}
function le(n, r = "KITCHEN", t = null) {
  var f, M;
  let e = n.items || [];
  if (t && (e = e.filter((_) => {
    var d, i;
    const m = _.product;
    return m ? !(t.productTypes && t.productTypes.length > 0 && !t.productTypes.includes("ALL") && !t.productTypes.includes(
      (d = m.product_type) == null ? void 0 : d.id
    ) || t.categories && t.categories.length > 0 && !t.categories.includes("ALL") && !t.categories.includes(
      (i = m.category) == null ? void 0 : i.id
    )) : !0;
  })), e.length === 0)
    return console.log(
      `[formatKitchenTicket] No items match filter for zone "${r}" - skipping ticket`
    ), null;
  let o = new V({
    type: z.EPSON,
    characterSet: "PC437_USA",
    interface: "tcp://dummy"
  });
  o.println(""), o.println(""), o.println(""), o.println(""), o.alignCenter(), o.bold(!0), o.setTextSize(1, 1), o.println(`${r.toUpperCase()} TICKET`), o.setTextNormal(), o.bold(!1), o.alignLeft(), o.println(""), o.setTextSize(2, 2), o.bold(!0), o.println(`${n.order_number || n.id}`), o.bold(!1), o.setTextNormal();
  const s = n.customer_display_name || n.guest_first_name || ((f = n.payment_details) == null ? void 0 : f.customer_name) || ((M = n.customer) == null ? void 0 : M.full_name);
  s && o.println(`Customer: ${s}`);
  const c = new Date(n.created_at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: !0,
    timeZone: "America/Chicago"
  });
  o.println(`Time: ${c}`);
  const u = (n.dining_preference || "TAKE_OUT") === "DINE_IN" ? "DINE IN" : "TAKE OUT";
  if (o.bold(!0), o.println(`SERVICE: ${u}`), n.order_type) {
    const m = {
      POS: "IN-STORE",
      WEB: "WEBSITE",
      APP: "APP",
      DOORDASH: "DOORDASH",
      UBER_EATS: "UBER EATS"
    }[n.order_type] || n.order_type;
    o.println(`SOURCE: ${m}`);
  }
  o.bold(!1), o.drawLine();
  const $ = e.reduce((_, m) => {
    var i;
    const d = m.product ? ((i = m.product.category) == null ? void 0 : i.name) || "Miscellaneous" : "Custom Items";
    return _[d] || (_[d] = []), _[d].push(m), _;
  }, {});
  for (const _ in $) {
    o.bold(!0), o.underline(!0), o.println(`${_.toUpperCase()}:`), o.underline(!1), o.bold(!1);
    const m = $[_];
    for (const d of m) {
      o.bold(!0), o.setTextSize(1, 1);
      const i = d.product ? d.product.name : d.custom_name || "Custom Item";
      if (o.println(`${d.quantity}x ${i}`), o.setTextNormal(), o.bold(!1), d.selected_modifiers_snapshot && d.selected_modifiers_snapshot.length > 0) {
        const l = d.selected_modifiers_snapshot.reduce((p, b) => {
          const y = b.modifier_set_name || "Other";
          return p[y] || (p[y] = []), p[y].push(b), p;
        }, {});
        for (const [p, b] of Object.entries(l)) {
          const y = b.map((v) => {
            let I = v.option_name;
            return v.quantity > 1 && (I += ` (${v.quantity}x)`), I;
          }).join(", ");
          o.println(`   ${p} - ${y}`);
        }
      }
      d.notes && d.notes.trim() && o.println(`   NOTES: ${d.notes.trim()}`);
    }
    o.println("");
  }
  return o.cut(), o.getBuffer();
}
function de(n) {
  return n && n.__esModule && Object.prototype.hasOwnProperty.call(n, "default") ? n.default : n;
}
var H, G;
function pe() {
  return G || (G = 1, H = function(n) {
    var r = {};
    function t(e) {
      if (r[e]) return r[e].exports;
      var o = r[e] = { i: e, l: !1, exports: {} };
      return n[e].call(o.exports, o, o.exports, t), o.l = !0, o.exports;
    }
    return t.m = n, t.c = r, t.d = function(e, o, s) {
      t.o(e, o) || Object.defineProperty(e, o, { enumerable: !0, get: s });
    }, t.r = function(e) {
      typeof Symbol < "u" && Symbol.toStringTag && Object.defineProperty(e, Symbol.toStringTag, { value: "Module" }), Object.defineProperty(e, "__esModule", { value: !0 });
    }, t.t = function(e, o) {
      if (1 & o && (e = t(e)), 8 & o || 4 & o && typeof e == "object" && e && e.__esModule) return e;
      var s = /* @__PURE__ */ Object.create(null);
      if (t.r(s), Object.defineProperty(s, "default", { enumerable: !0, value: e }), 2 & o && typeof e != "string") for (var c in e) t.d(s, c, (function(E) {
        return e[E];
      }).bind(null, c));
      return s;
    }, t.n = function(e) {
      var o = e && e.__esModule ? function() {
        return e.default;
      } : function() {
        return e;
      };
      return t.d(o, "a", o), o;
    }, t.o = function(e, o) {
      return Object.prototype.hasOwnProperty.call(e, o);
    }, t.p = "", t(t.s = 0);
  }([function(n, r, t) {
    const { exec: e } = t(1), o = t(2).promisify(e);
    n.exports = { play: async (s, c = 0.5) => {
      const E = process.platform === "darwin" ? Math.min(2, 2 * c) : c, u = process.platform === "darwin" ? (($, f) => `afplay "${$}" -v ${f}`)(s, E) : (($, f) => `powershell -c Add-Type -AssemblyName presentationCore; $player = New-Object system.windows.media.mediaplayer; ${((M) => `$player.open('${M}');`)($)} $player.Volume = ${f}; $player.Play(); Start-Sleep 1; Start-Sleep -s $player.NaturalDuration.TimeSpan.TotalSeconds;Exit;`)(s, E);
      try {
        await o(u);
      } catch ($) {
        throw $;
      }
    } };
  }, function(n, r) {
    n.exports = ne;
  }, function(n, r) {
    n.exports = oe;
  }])), H;
}
var ue = pe();
const fe = /* @__PURE__ */ de(ue), { machineIdSync: me } = te, W = Z(import.meta.url), ye = Y(import.meta.url), F = h.dirname(ye), he = T.env.NODE_ENV === "development";
console.log(
  "[Main Process] Configuring hardware acceleration and display settings..."
);
C.commandLine.appendSwitch("--enable-gpu-rasterization");
C.commandLine.appendSwitch("--enable-zero-copy");
C.commandLine.appendSwitch("--disable-software-rasterizer");
he ? (C.commandLine.appendSwitch("--ignore-certificate-errors"), C.commandLine.appendSwitch("--allow-running-insecure-content"), console.log("[Main Process] Development mode - debugging switches enabled")) : (C.commandLine.appendSwitch("--enable-features", "VizDisplayCompositor"), C.commandLine.appendSwitch("--force-color-profile", "srgb"), console.log(
  "[Main Process] Production mode - stable display features enabled"
));
T.env.DIST = h.join(F, "../dist");
T.env.PUBLIC = C.isPackaged ? T.env.DIST : h.join(T.env.DIST, "../public");
let w, a, B = null;
const U = T.env.VITE_DEV_SERVER_URL, ge = 1e4, _e = 5e3;
let A = null, x = Date.now(), O = !1, S = 0;
function Pe() {
  const n = N.getPrimaryDisplay(), r = ee.defaultSession;
  w = new j({
    icon: h.join(T.env.PUBLIC, "logo.png"),
    x: n.bounds.x,
    y: n.bounds.y,
    fullscreen: !0,
    webPreferences: {
      session: r,
      preload: h.join(F, "../dist-electron/preload.js"),
      nodeIntegration: !1,
      contextIsolation: !0,
      enableRemoteModule: !1,
      // Production security settings
      allowRunningInsecureContent: !1,
      webSecurity: !0,
      experimentalFeatures: !1
    }
  }), w.webContents.on("did-finish-load", () => {
    w == null || w.webContents.send(
      "main-process-message",
      (/* @__PURE__ */ new Date()).toLocaleString()
    );
  }), U ? w.loadURL(U) : w.loadFile(h.join(T.env.DIST, "index.html")), w.on("closed", () => {
    w = null, a && a.close();
  });
}
function J() {
  const r = N.getAllDisplays().find(
    (t) => t.id !== N.getPrimaryDisplay().id
  );
  if (r)
    a = new j({
      icon: h.join(T.env.PUBLIC, "logo.png"),
      x: r.bounds.x,
      y: r.bounds.y,
      fullscreen: !0,
      webPreferences: {
        preload: h.join(F, "../dist-electron/preload.js"),
        nodeIntegration: !1,
        contextIsolation: !0,
        enableRemoteModule: !1
        // Remove hardwareAcceleration override - let app-level settings handle it
      }
    });
  else {
    const t = N.getPrimaryDisplay(), { width: e, height: o } = t.workAreaSize;
    a = new j({
      icon: h.join(T.env.PUBLIC, "logo.png"),
      x: Math.floor(e * 0.25),
      // Centered-ish
      y: Math.floor(o * 0.1),
      width: Math.floor(e * 0.5),
      // Half the screen width
      height: Math.floor(o * 0.8),
      // 80% of screen height
      fullscreen: !1,
      title: "Customer Display (Testing)",
      webPreferences: {
        preload: h.join(F, "../dist-electron/preload.js"),
        nodeIntegration: !1,
        contextIsolation: !0,
        enableRemoteModule: !1
      }
    });
  }
  U ? a.loadURL(`${U}customer.html`) : a.loadFile(h.join(T.env.DIST, "customer.html")), a.webContents.on("did-finish-load", () => {
    setTimeout(() => {
      we();
    }, 2e3);
  }), a.on("closed", () => {
    D(), a = null;
  }), a.on("unresponsive", () => {
    if (console.error(
      "[Main Process] Customer display renderer is unresponsive. Attempting to reload..."
    ), a && !a.isDestroyed())
      try {
        a.webContents.reload();
      } catch (t) {
        console.error(
          "[Main Process] Failed to reload unresponsive customer display:",
          t
        ), K();
      }
  }), a.webContents.on("render-process-gone", (t, e) => {
    console.error(
      "[Main Process] Customer display renderer crashed:",
      e.reason,
      "Exit code:",
      e.exitCode
    ), D(), setTimeout(() => {
      K();
    }, 1e3);
  });
}
function K() {
  if (D(), a && !a.isDestroyed())
    try {
      a.close();
    } catch (n) {
      console.error(
        "[Main Process] Error closing existing customer window:",
        n
      );
    }
  a = null, setTimeout(() => {
    J();
  }, 500);
}
function we() {
  D(), x = Date.now(), O = !1, S = 0, A = setInterval(() => {
    if (!a || a.isDestroyed()) {
      D();
      return;
    }
    const n = Date.now(), r = n - x;
    if (O && r > _e) {
      if (S++, console.error(
        `[Main Process] Customer display health check FAILED - no pong for ${Math.round(r / 1e3)}s (failure ${S})`
      ), S === 1)
        try {
          a.webContents.reload(), O = !1, x = n;
        } catch (t) {
          console.error(
            "[Main Process] Graceful reload failed:",
            t
          ), S = 2;
        }
      if (S >= 2) {
        console.error(
          "[Main Process] Graceful reload failed. Forcing crash & recreate..."
        ), D();
        try {
          a.webContents.forcefullyCrashRenderer();
        } catch (t) {
          console.error(
            "[Main Process] Failed to crash renderer:",
            t
          ), K();
        }
        S = 0;
      }
      return;
    }
    a.webContents.send("CUSTOMER_HEALTH_CHECK_PING"), O = !0;
  }, ge);
}
function D() {
  A && (clearInterval(A), A = null);
}
g.on("CUSTOMER_HEALTH_CHECK_PONG", () => {
  x = Date.now(), O = !1, S = 0;
});
g.on("to-customer-display", (n, { channel: r, data: t }) => {
  r === "POS_TO_CUSTOMER_STATE" && (B = t), a && a.webContents.send(r, t);
});
g.on("from-customer-display", (n, { channel: r, data: t }) => {
  w && w.webContents.send(r, t);
});
g.on("CUSTOMER_REQUESTS_STATE", (n) => {
  B && n.sender.send("POS_TO_CUSTOMER_STATE", B);
});
g.handle("play-notification-sound", async (n, r) => {
  try {
    const t = r || "notification.wav", e = h.join(T.env.PUBLIC, "sounds", t);
    return console.log(`[IPC] Attempting to play sound: ${e}`), await fe.play(e), { success: !0 };
  } catch (t) {
    return console.error("[IPC] Error playing sound:", t), { success: !1, error: t.message };
  }
});
g.on("CUSTOMER_TO_POS_TIP", (n, r) => {
  w && w.webContents.send("CUSTOMER_TO_POS_TIP", r);
});
g.handle("discover-printers", async () => {
  console.log(
    "[Main Process] Discovering printers using node-usb (robust method)..."
  );
  try {
    const r = q.getDeviceList().map((t) => {
      try {
        return t.configDescriptor && t.configDescriptor.interfaces && t.configDescriptor.interfaces.some(
          (o) => o.some(
            (s) => s.bInterfaceClass === 7
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
      JSON.stringify(r, null, 2)
    ), r;
  } catch (n) {
    return console.error("[Main Process] Failed to discover printers:", n), [];
  }
});
async function Q(n, r) {
  let t = null;
  try {
    const e = parseInt(n.vendorId || n.vendor_id, 10), o = parseInt(n.productId || n.product_id, 10);
    if (!e || !o)
      throw new Error(
        `Invalid printer object provided. Missing or invalid vendor/product ID. Got: ${JSON.stringify(
          n
        )}`
      );
    if (t = q.getDeviceList().find(
      (u) => u.deviceDescriptor.idVendor === e && u.deviceDescriptor.idProduct === o
    ), !t)
      throw new Error("USB Printer not found. It may be disconnected.");
    t.open();
    const c = t.interfaces[0];
    c.claim();
    const E = c.endpoints.find((u) => u.direction === "out");
    if (!E)
      throw new Error("Could not find an OUT endpoint on the printer.");
    await new Promise((u, $) => {
      E.transfer(r, (f) => {
        if (f) return $(f);
        u();
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
g.handle(
  "print-receipt",
  async (n, { printer: r, data: t, storeSettings: e, isTransaction: o = !1 }) => {
    console.log(`
--- [Main Process] Using HYBRID print method ---`), console.log(
      "[Main Process] Store settings:",
      e ? "provided" : "not provided",
      "isTransaction:",
      o
    );
    try {
      const s = await ae(t, e, o);
      return console.log(
        `[Main Process] Receipt buffer created (size: ${s.length}). Sending...`
      ), await Q(r, s), console.log("[Main Process] Hybrid print command sent successfully."), { success: !0 };
    } catch (s) {
      return console.error("[Main Process] ERROR IN HYBRID PRINT HANDLER:", s), { success: !1, error: s.message };
    }
  }
);
g.handle(
  "print-kitchen-ticket",
  async (n, { printer: r, order: t, zoneName: e, filterConfig: o }) => {
    console.log(
      `
--- [Main Process] KITCHEN TICKET HANDLER for zone: "${e}" ---`
    ), console.log("Filter config:", o);
    try {
      if ((r == null ? void 0 : r.connection_type) !== "network" || !r.ip_address)
        throw new Error("Invalid network printer configuration provided.");
      const s = W("node-thermal-printer"), { printer: c, types: E } = s;
      let u = new c({
        type: E.EPSON,
        interface: `tcp://${r.ip_address}`,
        timeout: 5e3
      });
      if (!await u.isPrinterConnected())
        throw new Error(
          `Could not connect to kitchen printer at ${r.ip_address}`
        );
      console.log(
        `Successfully connected to kitchen printer at ${r.ip_address}`
      );
      const f = le(t, e, o);
      return f ? (console.log(`Sending kitchen ticket buffer (size: ${f.length})`), await u.raw(f), console.log("Kitchen ticket sent successfully."), { success: !0 }) : (console.log(`No items to print for zone "${e}" - skipping`), {
        success: !0,
        message: "No items matched filter - ticket skipped"
      });
    } catch (s) {
      return console.error(`
--- [Main Process] ERROR IN KITCHEN TICKET HANDLER ---`), console.error(s), { success: !1, error: s.message };
    }
  }
);
g.handle("test-network-printer", async (n, { ip_address: r }) => {
  console.log(
    `
--- [Main Process] TESTING NETWORK PRINTER at: ${r} ---`
  );
  try {
    if (!r)
      throw new Error("No IP address provided for testing.");
    const t = W("node-thermal-printer"), { printer: e, types: o } = t;
    let s = new e({
      type: o.EPSON,
      interface: `tcp://${r}`,
      timeout: 3e3
      // Shorter timeout for a quick test
    });
    if (await s.isPrinterConnected())
      return console.log(`SUCCESS: Connection to ${r} is OK.`), s.println("Connection Test OK"), s.cut(), await s.execute(), {
        success: !0,
        message: `Successfully connected to ${r}. A test slip may have been printed.`
      };
    throw new Error("Connection failed. The printer did not respond.");
  } catch (t) {
    console.error(`ERROR: Could not connect to printer at ${r}.`), console.error(t);
    let e = t.message;
    return t.message.includes("timed out") ? e = "Connection timed out. Check the IP address and ensure the printer is on the same network." : t.message.includes("ECONNREFUSED") && (e = "Connection refused. The printer is reachable but is not accepting connections on this port."), { success: !1, error: e };
  }
});
g.handle("open-cash-drawer", async (n, { printerName: r }) => {
  console.log(`
--- [Main Process] Using HYBRID open-drawer method ---`);
  try {
    const e = q.getDeviceList().find(
      (c) => (c.product || `USB Device ${c.deviceDescriptor.idVendor}:${c.deviceDescriptor.idProduct}`) === r
    );
    if (!e)
      throw new Error(`Printer with name "${r}" not found.`);
    const o = {
      vendorId: e.deviceDescriptor.idVendor,
      productId: e.deviceDescriptor.idProduct
    }, s = ce();
    return console.log(
      `[Main Process] Open-drawer buffer created (size: ${s.length}). Sending...`
    ), await Q(o, s), console.log("[Main Process] Hybrid open-drawer command sent successfully."), { success: !0 };
  } catch (t) {
    return console.error("[Main Process] ERROR IN HYBRID CASH DRAWER HANDLER:", t), { success: !1, error: t.message };
  }
});
g.handle("get-session-cookies", async (n, r) => {
  try {
    const { session: t } = W("electron"), e = await t.defaultSession.cookies.get({ url: r });
    console.log(`[Main Process] Found ${e.length} cookies for ${r}`), e.forEach((s, c) => {
      console.log(
        `[Main Process] Cookie ${c + 1}: ${s.name} (${s.httpOnly ? "HttpOnly" : "Regular"})`
      );
    });
    const o = e.map((s) => `${s.name}=${s.value}`).join("; ");
    return console.log(
      o ? `[Main Process] Cookie string created (length: ${o.length})` : "[Main Process] No cookies found - returning empty string"
    ), o;
  } catch (t) {
    throw console.error("[Main Process] Error getting session cookies:", t), t;
  }
});
g.handle("get-machine-id", () => me({ original: !0 }));
g.on("shutdown-app", () => {
  C.quit();
});
C.whenReady().then(async () => {
  console.log("[Main Process] Starting Electron app - online-only mode"), console.log(
    "[Main Process] Hardware acceleration and display settings applied at startup"
  ), Pe(), J();
});
C.on("window-all-closed", () => {
  T.platform !== "darwin" && C.quit();
});
