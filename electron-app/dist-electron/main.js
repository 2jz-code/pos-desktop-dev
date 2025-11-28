import { app, ipcMain, BrowserWindow, screen, session } from "electron";
import path from "node:path";
import process$1 from "node:process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import nodeMachineId from "node-machine-id";
import usb from "usb";
import require$$0 from "child_process";
import require$$1 from "util";
import Database from "better-sqlite3";
import path$1 from "path";
import fs from "fs";
import { randomFillSync, randomUUID } from "crypto";
import { EventEmitter } from "events";
import axios from "axios";
import https from "https";
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
function initializeSchema(db2) {
  db2.pragma("journal_mode = WAL");
  db2.pragma("foreign_keys = ON");
  db2.pragma("cache_size = -10000");
  db2.pragma("secure_delete = ON");
  db2.exec(`
    CREATE TABLE IF NOT EXISTS datasets (
      key TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      record_count INTEGER DEFAULT 0,
      deleted_count INTEGER DEFAULT 0
    );
  `);
  db2.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      tenant_id TEXT,
      product_type_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      category_id INTEGER,
      image TEXT,
      track_inventory INTEGER NOT NULL DEFAULT 0,
      barcode TEXT,
      has_modifiers INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_public INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      tax_ids TEXT, -- JSON array of tax IDs
      modifier_sets TEXT -- JSON array of modifier set configurations
    );
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active, is_public);
  `);
  db2.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY,
      tenant_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      parent_id INTEGER,
      lft INTEGER,
      rght INTEGER,
      tree_id INTEGER,
      level INTEGER,
      display_order INTEGER DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_public INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
    CREATE INDEX IF NOT EXISTS idx_categories_tree ON categories(tree_id, lft, rght);
  `);
  db2.exec(`
    CREATE TABLE IF NOT EXISTS modifier_sets (
      id INTEGER PRIMARY KEY,
      tenant_id TEXT,
      name TEXT NOT NULL,
      internal_name TEXT NOT NULL,
      selection_type TEXT NOT NULL,
      min_selections INTEGER DEFAULT 0,
      max_selections INTEGER,
      triggered_by_option_id INTEGER,
      updated_at TEXT NOT NULL,
      options TEXT NOT NULL -- JSON array of modifier options
    );
  `);
  db2.exec(`
    CREATE TABLE IF NOT EXISTS discounts (
      id INTEGER PRIMARY KEY,
      tenant_id TEXT,
      name TEXT NOT NULL,
      code TEXT,
      type TEXT NOT NULL,
      scope TEXT NOT NULL,
      value REAL NOT NULL,
      min_purchase_amount REAL,
      buy_quantity INTEGER,
      get_quantity INTEGER,
      start_date TEXT,
      end_date TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      applicable_products TEXT, -- JSON array
      applicable_categories TEXT, -- JSON array
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_discounts_code ON discounts(code);
    CREATE INDEX IF NOT EXISTS idx_discounts_active ON discounts(is_active);
  `);
  db2.exec(`
    CREATE TABLE IF NOT EXISTS taxes (
      id INTEGER PRIMARY KEY,
      tenant_id TEXT,
      name TEXT NOT NULL,
      rate REAL NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db2.exec(`
    CREATE TABLE IF NOT EXISTS product_types (
      id INTEGER PRIMARY KEY,
      tenant_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      inventory_behavior TEXT NOT NULL,
      stock_enforcement TEXT NOT NULL,
      allow_negative_stock INTEGER NOT NULL DEFAULT 0,
      tax_inclusive INTEGER NOT NULL DEFAULT 0,
      pricing_method TEXT NOT NULL,
      exclude_from_discounts INTEGER NOT NULL DEFAULT 0,
      max_quantity_per_item INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
  `);
  db2.exec(`
    CREATE TABLE IF NOT EXISTS inventory_locations (
      id INTEGER PRIMARY KEY,
      tenant_id TEXT,
      store_location_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      low_stock_threshold REAL,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
  `);
  db2.exec(`
    CREATE TABLE IF NOT EXISTS inventory_stocks (
      id INTEGER PRIMARY KEY,
      tenant_id TEXT,
      store_location_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      expiration_date TEXT,
      low_stock_threshold REAL,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_stocks(product_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory_stocks(location_id);
  `);
  db2.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db2.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      tenant_id TEXT,
      email TEXT NOT NULL,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      role TEXT NOT NULL,
      is_pos_staff INTEGER NOT NULL DEFAULT 0,
      pin TEXT, -- Hashed PIN
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role, is_pos_staff);
  `);
  db2.exec(`
    CREATE TABLE IF NOT EXISTS pending_operations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL, -- 'ORDER', 'INVENTORY', 'APPROVAL'
      payload TEXT NOT NULL, -- JSON payload
      order_id TEXT, -- Local order ID reference
      status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'SENDING', 'SENT', 'FAILED'
      retries INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      device_signature TEXT,
      error_message TEXT,
      server_response TEXT -- JSON response from server
    );
    CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_operations(status);
    CREATE INDEX IF NOT EXISTS idx_pending_created ON pending_operations(created_at);
  `);
  db2.exec(`
    CREATE TABLE IF NOT EXISTS offline_orders (
      local_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL, -- Full order payload JSON
      status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'SYNCED', 'CONFLICT'
      synced_at TEXT,
      server_order_id TEXT, -- Backend order ID after sync
      server_order_number TEXT, -- Backend order number after sync
      conflict_reason TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_offline_orders_status ON offline_orders(status);
  `);
  db2.exec(`
    CREATE TABLE IF NOT EXISTS offline_payments (
      id TEXT PRIMARY KEY,
      local_order_id TEXT NOT NULL,
      method TEXT NOT NULL, -- 'CASH', 'CARD_TERMINAL', 'GIFT_CARD'
      amount REAL NOT NULL,
      tip REAL DEFAULT 0,
      surcharge REAL DEFAULT 0,
      status TEXT NOT NULL, -- 'COMPLETED', 'PENDING'
      transaction_id TEXT, -- Stripe intent ID
      provider_response TEXT, -- JSON
      cash_tendered REAL,
      change_given REAL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(local_order_id) REFERENCES offline_orders(local_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_offline_payments_order ON offline_payments(local_order_id);
  `);
  db2.exec(`
    CREATE TABLE IF NOT EXISTS offline_approvals (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      pin TEXT NOT NULL, -- Hashed PIN
      action TEXT NOT NULL, -- 'DISCOUNT', 'VOID', 'REFUND', 'PRICE_OVERRIDE'
      reference TEXT,
      local_order_id TEXT,
      value REAL,
      notes TEXT,
      timestamp TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_approvals_synced ON offline_approvals(synced);
  `);
  db2.exec(`
    CREATE TABLE IF NOT EXISTS device_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const initMeta = db2.prepare(`
    INSERT OR IGNORE INTO device_meta (key, value, updated_at) VALUES (?, ?, datetime('now'))
  `);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  initMeta.run("offline_transaction_count", "0");
  initMeta.run("offline_cash_total", "0");
  initMeta.run("offline_card_total", "0");
  initMeta.run("last_sync_attempt", now);
  initMeta.run("last_sync_success", now);
  initMeta.run("network_status", "online");
  initMeta.run("offline_since", "");
}
function dropAllTables(db2) {
  const tables = [
    "datasets",
    "products",
    "categories",
    "modifier_sets",
    "discounts",
    "taxes",
    "product_types",
    "inventory_locations",
    "inventory_stocks",
    "settings",
    "users",
    "pending_operations",
    "offline_orders",
    "offline_payments",
    "offline_approvals",
    "device_meta"
  ];
  for (const table of tables) {
    db2.exec(`DROP TABLE IF EXISTS ${table}`);
  }
}
function updateDatasetVersion$1(db2, key, version, recordCount = 0, deletedCount = 0) {
  const stmt = db2.prepare(`
    INSERT INTO datasets (key, version, synced_at, record_count, deleted_count)
    VALUES (?, ?, datetime('now'), ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      version = excluded.version,
      synced_at = excluded.synced_at,
      record_count = excluded.record_count,
      deleted_count = excluded.deleted_count
  `);
  stmt.run(key, version, recordCount, deletedCount);
}
function getDatasetVersion$1(db2, key) {
  const stmt = db2.prepare("SELECT version, synced_at FROM datasets WHERE key = ?");
  return stmt.get(key);
}
function upsertProducts$1(db2, products) {
  const stmt = db2.prepare(`
    INSERT INTO products (
      id, tenant_id, product_type_id, name, description, price, category_id,
      image, track_inventory, barcode, has_modifiers, is_active, is_public,
      created_at, updated_at, tax_ids, modifier_sets
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      product_type_id = excluded.product_type_id,
      name = excluded.name,
      description = excluded.description,
      price = excluded.price,
      category_id = excluded.category_id,
      image = excluded.image,
      track_inventory = excluded.track_inventory,
      barcode = excluded.barcode,
      has_modifiers = excluded.has_modifiers,
      is_active = excluded.is_active,
      is_public = excluded.is_public,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      tax_ids = excluded.tax_ids,
      modifier_sets = excluded.modifier_sets
  `);
  const insertMany = db2.transaction((products2) => {
    for (const product of products2) {
      stmt.run(
        product.id,
        product.tenant_id,
        product.product_type_id,
        product.name,
        product.description || "",
        product.price,
        product.category_id,
        product.image,
        product.track_inventory ? 1 : 0,
        product.barcode,
        product.has_modifiers ? 1 : 0,
        product.is_active ? 1 : 0,
        product.is_public ? 1 : 0,
        product.created_at,
        product.updated_at,
        JSON.stringify(product.tax_ids || []),
        JSON.stringify(product.modifier_sets || [])
      );
    }
  });
  insertMany(products);
}
function upsertCategories$1(db2, categories) {
  const stmt = db2.prepare(`
    INSERT INTO categories (
      id, tenant_id, name, description, parent_id, lft, rght, tree_id, level,
      display_order, is_active, is_public, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      name = excluded.name,
      description = excluded.description,
      parent_id = excluded.parent_id,
      lft = excluded.lft,
      rght = excluded.rght,
      tree_id = excluded.tree_id,
      level = excluded.level,
      display_order = excluded.display_order,
      is_active = excluded.is_active,
      is_public = excluded.is_public,
      updated_at = excluded.updated_at
  `);
  const insertMany = db2.transaction((categories2) => {
    for (const cat of categories2) {
      const displayOrder = cat.display_order != null ? cat.display_order : cat.order != null ? cat.order : 0;
      stmt.run(
        cat.id,
        cat.tenant_id,
        cat.name,
        cat.description || "",
        cat.parent_id,
        cat.lft,
        cat.rght,
        cat.tree_id,
        cat.level,
        displayOrder,
        cat.is_active ? 1 : 0,
        cat.is_public ? 1 : 0,
        cat.updated_at
      );
    }
  });
  insertMany(categories);
}
function upsertModifierSets$1(db2, modifierSets) {
  const stmt = db2.prepare(`
    INSERT INTO modifier_sets (
      id, tenant_id, name, internal_name, selection_type, min_selections,
      max_selections, triggered_by_option_id, updated_at, options
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      name = excluded.name,
      internal_name = excluded.internal_name,
      selection_type = excluded.selection_type,
      min_selections = excluded.min_selections,
      max_selections = excluded.max_selections,
      triggered_by_option_id = excluded.triggered_by_option_id,
      updated_at = excluded.updated_at,
      options = excluded.options
  `);
  const insertMany = db2.transaction((sets) => {
    for (const set of sets) {
      stmt.run(
        set.id,
        set.tenant_id,
        set.name,
        set.internal_name,
        set.selection_type,
        set.min_selections,
        set.max_selections,
        set.triggered_by_option_id,
        set.updated_at,
        JSON.stringify(set.options || [])
      );
    }
  });
  insertMany(modifierSets);
}
function upsertDiscounts$1(db2, discounts) {
  const stmt = db2.prepare(`
    INSERT INTO discounts (
      id, tenant_id, name, code, type, scope, value, min_purchase_amount,
      buy_quantity, get_quantity, start_date, end_date, is_active,
      applicable_products, applicable_categories, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      name = excluded.name,
      code = excluded.code,
      type = excluded.type,
      scope = excluded.scope,
      value = excluded.value,
      min_purchase_amount = excluded.min_purchase_amount,
      buy_quantity = excluded.buy_quantity,
      get_quantity = excluded.get_quantity,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      is_active = excluded.is_active,
      applicable_products = excluded.applicable_products,
      applicable_categories = excluded.applicable_categories,
      updated_at = excluded.updated_at
  `);
  const insertMany = db2.transaction((discounts2) => {
    for (const disc of discounts2) {
      stmt.run(
        disc.id,
        disc.tenant_id,
        disc.name,
        disc.code,
        disc.type,
        disc.scope,
        disc.value,
        disc.min_purchase_amount,
        disc.buy_quantity,
        disc.get_quantity,
        disc.start_date,
        disc.end_date,
        disc.is_active ? 1 : 0,
        JSON.stringify(disc.applicable_product_ids || []),
        JSON.stringify(disc.applicable_category_ids || []),
        disc.updated_at
      );
    }
  });
  insertMany(discounts);
}
function upsertTaxes$1(db2, taxes) {
  const stmt = db2.prepare(`
    INSERT INTO taxes (id, tenant_id, name, rate, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      name = excluded.name,
      rate = excluded.rate,
      updated_at = excluded.updated_at
  `);
  const insertMany = db2.transaction((taxes2) => {
    for (const tax of taxes2) {
      stmt.run(tax.id, tax.tenant_id, tax.name, tax.rate, tax.updated_at);
    }
  });
  insertMany(taxes);
}
function upsertProductTypes$1(db2, productTypes) {
  const stmt = db2.prepare(`
    INSERT INTO product_types (
      id, tenant_id, name, description, inventory_behavior, stock_enforcement,
      allow_negative_stock, tax_inclusive, pricing_method, exclude_from_discounts,
      max_quantity_per_item, is_active, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      name = excluded.name,
      description = excluded.description,
      inventory_behavior = excluded.inventory_behavior,
      stock_enforcement = excluded.stock_enforcement,
      allow_negative_stock = excluded.allow_negative_stock,
      tax_inclusive = excluded.tax_inclusive,
      pricing_method = excluded.pricing_method,
      exclude_from_discounts = excluded.exclude_from_discounts,
      max_quantity_per_item = excluded.max_quantity_per_item,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `);
  const insertMany = db2.transaction((types) => {
    for (const type of types) {
      stmt.run(
        type.id,
        type.tenant_id,
        type.name,
        type.description || "",
        type.inventory_behavior,
        type.stock_enforcement,
        type.allow_negative_stock ? 1 : 0,
        type.tax_inclusive ? 1 : 0,
        type.pricing_method,
        type.exclude_from_discounts ? 1 : 0,
        type.max_quantity_per_item,
        type.is_active ? 1 : 0,
        type.updated_at
      );
    }
  });
  insertMany(productTypes);
}
function upsertInventoryStocks$1(db2, stocks) {
  const stmt = db2.prepare(`
    INSERT INTO inventory_stocks (
      id, tenant_id, store_location_id, product_id, location_id, quantity,
      expiration_date, low_stock_threshold, is_active, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      store_location_id = excluded.store_location_id,
      product_id = excluded.product_id,
      location_id = excluded.location_id,
      quantity = excluded.quantity,
      expiration_date = excluded.expiration_date,
      low_stock_threshold = excluded.low_stock_threshold,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `);
  const insertMany = db2.transaction((stocks2) => {
    for (const stock of stocks2) {
      stmt.run(
        stock.id,
        stock.tenant_id,
        stock.store_location_id,
        stock.product_id,
        stock.location_id,
        stock.quantity,
        stock.expiration_date,
        stock.low_stock_threshold,
        stock.is_active ? 1 : 0,
        stock.updated_at
      );
    }
  });
  insertMany(stocks);
}
function upsertInventoryLocations$1(db2, locations) {
  const stmt = db2.prepare(`
    INSERT INTO inventory_locations (
      id, tenant_id, store_location_id, name, description, low_stock_threshold,
      is_active, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      store_location_id = excluded.store_location_id,
      name = excluded.name,
      description = excluded.description,
      low_stock_threshold = excluded.low_stock_threshold,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `);
  const insertMany = db2.transaction((locations2) => {
    for (const loc of locations2) {
      stmt.run(
        loc.id,
        loc.tenant_id,
        loc.store_location_id,
        loc.name,
        loc.description || "",
        loc.low_stock_threshold,
        loc.is_active ? 1 : 0,
        loc.updated_at
      );
    }
  });
  insertMany(locations);
}
function upsertSettings$1(db2, settingsData) {
  const stmt = db2.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);
  if (settingsData.global_settings) {
    stmt.run("global_settings", JSON.stringify(settingsData.global_settings));
  }
  if (settingsData.store_location) {
    stmt.run("store_location", JSON.stringify(settingsData.store_location));
  }
}
function upsertUsers$1(db2, users) {
  const stmt = db2.prepare(`
    INSERT INTO users (
      id, tenant_id, email, username, first_name, last_name, role,
      is_pos_staff, pin, is_active, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      email = excluded.email,
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      role = excluded.role,
      is_pos_staff = excluded.is_pos_staff,
      pin = excluded.pin,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `);
  const insertMany = db2.transaction((users2) => {
    for (const user of users2) {
      stmt.run(
        user.id,
        user.tenant_id,
        user.email,
        user.username,
        user.first_name,
        user.last_name,
        user.role,
        user.is_pos_staff ? 1 : 0,
        user.pin,
        user.is_active ? 1 : 0,
        user.updated_at
      );
    }
  });
  insertMany(users);
}
function deleteRecords$1(db2, tableName, deletedIds) {
  if (!deletedIds || deletedIds.length === 0) return;
  const placeholders = deletedIds.map(() => "?").join(",");
  const stmt = db2.prepare(`DELETE FROM ${tableName} WHERE id IN (${placeholders})`);
  stmt.run(...deletedIds);
}
function getProducts$1(db2, filters = {}) {
  let query = "SELECT * FROM products WHERE 1=1";
  const params = [];
  if (!filters.includeArchived) {
    query += " AND is_active = 1";
  } else if (filters.includeArchived === "only") {
    query += " AND is_active = 0";
  }
  if (filters.search) {
    query += " AND (name LIKE ? OR barcode LIKE ?)";
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.category) {
    query += " AND category_id = ?";
    params.push(filters.category);
  }
  const stmt = db2.prepare(query);
  const products = stmt.all(...params);
  return products.map((p) => ({
    ...p,
    track_inventory: p.track_inventory === 1,
    has_modifiers: p.has_modifiers === 1,
    is_active: p.is_active === 1,
    is_public: p.is_public === 1,
    tax_ids: JSON.parse(p.tax_ids || "[]"),
    modifier_sets: JSON.parse(p.modifier_sets || "[]")
  }));
}
function getProductById$1(db2, id) {
  const stmt = db2.prepare("SELECT * FROM products WHERE id = ?");
  const product = stmt.get(id);
  if (!product) return null;
  return {
    ...product,
    track_inventory: product.track_inventory === 1,
    has_modifiers: product.has_modifiers === 1,
    is_active: product.is_active === 1,
    is_public: product.is_public === 1,
    tax_ids: JSON.parse(product.tax_ids || "[]"),
    modifier_sets: JSON.parse(product.modifier_sets || "[]")
  };
}
function getProductByBarcode$1(db2, barcode) {
  const stmt = db2.prepare("SELECT * FROM products WHERE barcode = ? AND is_active = 1");
  const product = stmt.get(barcode);
  if (!product) return null;
  return {
    ...product,
    track_inventory: product.track_inventory === 1,
    has_modifiers: product.has_modifiers === 1,
    is_active: product.is_active === 1,
    is_public: product.is_public === 1,
    tax_ids: JSON.parse(product.tax_ids || "[]"),
    modifier_sets: JSON.parse(product.modifier_sets || "[]")
  };
}
function getCategories$1(db2) {
  const stmt = db2.prepare("SELECT * FROM categories WHERE is_active = 1 ORDER BY display_order, name");
  const categories = stmt.all();
  const categoryMap = /* @__PURE__ */ new Map();
  const normalized = categories.map((c) => ({
    ...c,
    order: c.display_order,
    // Normalize: SQLite uses display_order, API uses order
    is_active: c.is_active === 1,
    is_public: c.is_public === 1
  }));
  normalized.forEach((cat) => categoryMap.set(cat.id, cat));
  return normalized.map((cat) => {
    if (cat.parent_id) {
      const parent = categoryMap.get(cat.parent_id);
      if (parent) {
        return {
          ...cat,
          parent: {
            id: parent.id,
            name: parent.name
          }
        };
      }
    }
    return cat;
  });
}
function getDiscounts$1(db2, options = {}) {
  const { includeArchived = false } = options;
  let query = "SELECT * FROM discounts";
  if (includeArchived === "only") {
    query += " WHERE is_active = 0";
  } else if (!includeArchived) {
    query += " WHERE is_active = 1";
  }
  const stmt = db2.prepare(query);
  const discounts = stmt.all();
  return discounts.map((d) => ({
    ...d,
    is_active: d.is_active === 1,
    applicable_products: JSON.parse(d.applicable_products || "[]"),
    applicable_categories: JSON.parse(d.applicable_categories || "[]")
  }));
}
function getModifierSets$1(db2) {
  const stmt = db2.prepare("SELECT * FROM modifier_sets");
  const sets = stmt.all();
  return sets.map((s) => ({
    ...s,
    options: JSON.parse(s.options || "[]")
  }));
}
function getTaxes$1(db2) {
  const stmt = db2.prepare("SELECT * FROM taxes");
  return stmt.all();
}
function getProductTypes$1(db2) {
  const stmt = db2.prepare("SELECT * FROM product_types WHERE is_active = 1");
  const types = stmt.all();
  return types.map((t) => ({
    ...t,
    allow_negative_stock: t.allow_negative_stock === 1,
    tax_inclusive: t.tax_inclusive === 1,
    exclude_from_discounts: t.exclude_from_discounts === 1,
    is_active: t.is_active === 1
  }));
}
function getInventoryStocks$1(db2) {
  const stmt = db2.prepare("SELECT * FROM inventory_stocks WHERE is_active = 1");
  const stocks = stmt.all();
  const products = getProducts$1(db2);
  const productMap = new Map(products.map((p) => [p.id, p]));
  const locations = getInventoryLocations$1(db2);
  const locationMap = new Map(locations.map((l) => [l.id, l]));
  return stocks.map((s) => {
    const product = productMap.get(s.product_id);
    const location = locationMap.get(s.location_id);
    return {
      ...s,
      is_active: s.is_active === 1,
      // Hydrate with nested product object (matching API structure)
      product: product ? {
        id: product.id,
        name: product.name,
        barcode: product.barcode,
        price: product.price
      } : { id: s.product_id, name: "Unknown Product" },
      // Hydrate with nested location object
      location: location ? {
        id: location.id,
        name: location.name
      } : { id: s.location_id, name: "Unknown Location" }
    };
  });
}
function getInventoryByProductId$1(db2, productId) {
  const stmt = db2.prepare("SELECT * FROM inventory_stocks WHERE product_id = ? AND is_active = 1");
  const stock = stmt.get(productId);
  if (!stock) return null;
  return {
    ...stock,
    is_active: stock.is_active === 1
  };
}
function getInventoryLocations$1(db2) {
  const stmt = db2.prepare("SELECT * FROM inventory_locations WHERE is_active = 1 ORDER BY name");
  const locations = stmt.all();
  return locations.map((loc) => ({
    ...loc,
    is_active: loc.is_active === 1
  }));
}
function getSettings$1(db2) {
  const stmt = db2.prepare("SELECT * FROM settings");
  const rows = stmt.all();
  const settings = {};
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }
  return settings;
}
function getUsers$1(db2, options = {}) {
  const { includeArchived = false } = options;
  let query = "SELECT * FROM users WHERE is_pos_staff = 1";
  if (includeArchived === "only") {
    query += " AND is_active = 0";
  } else if (!includeArchived) {
    query += " AND is_active = 1";
  }
  const stmt = db2.prepare(query);
  const users = stmt.all();
  return users.map((u) => ({
    ...u,
    is_pos_staff: u.is_pos_staff === 1,
    is_active: u.is_active === 1
  }));
}
function getUserById$1(db2, id) {
  const stmt = db2.prepare("SELECT * FROM users WHERE id = ?");
  const user = stmt.get(id);
  if (!user) return null;
  return {
    ...user,
    is_pos_staff: user.is_pos_staff === 1,
    is_active: user.is_active === 1
  };
}
const datasets = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  deleteRecords: deleteRecords$1,
  getCategories: getCategories$1,
  getDatasetVersion: getDatasetVersion$1,
  getDiscounts: getDiscounts$1,
  getInventoryByProductId: getInventoryByProductId$1,
  getInventoryLocations: getInventoryLocations$1,
  getInventoryStocks: getInventoryStocks$1,
  getModifierSets: getModifierSets$1,
  getProductByBarcode: getProductByBarcode$1,
  getProductById: getProductById$1,
  getProductTypes: getProductTypes$1,
  getProducts: getProducts$1,
  getSettings: getSettings$1,
  getTaxes: getTaxes$1,
  getUserById: getUserById$1,
  getUsers: getUsers$1,
  updateDatasetVersion: updateDatasetVersion$1,
  upsertCategories: upsertCategories$1,
  upsertDiscounts: upsertDiscounts$1,
  upsertInventoryLocations: upsertInventoryLocations$1,
  upsertInventoryStocks: upsertInventoryStocks$1,
  upsertModifierSets: upsertModifierSets$1,
  upsertProductTypes: upsertProductTypes$1,
  upsertProducts: upsertProducts$1,
  upsertSettings: upsertSettings$1,
  upsertTaxes: upsertTaxes$1,
  upsertUsers: upsertUsers$1
}, Symbol.toStringTag, { value: "Module" }));
const byteToHex = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
}
const rnds8Pool = new Uint8Array(256);
let poolPtr = rnds8Pool.length;
function rng() {
  if (poolPtr > rnds8Pool.length - 16) {
    randomFillSync(rnds8Pool);
    poolPtr = 0;
  }
  return rnds8Pool.slice(poolPtr, poolPtr += 16);
}
const native = { randomUUID };
function v4(options, buf, offset) {
  var _a;
  if (native.randomUUID && true && !options) {
    return native.randomUUID();
  }
  options = options || {};
  const rnds = options.random ?? ((_a = options.rng) == null ? void 0 : _a.call(options)) ?? rng();
  if (rnds.length < 16) {
    throw new Error("Random bytes length must be >= 16");
  }
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  return unsafeStringify(rnds);
}
function queueOperation$1(db2, { type, payload, orderId, deviceSignature }) {
  const operationId = v4();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const stmt = db2.prepare(`
    INSERT INTO pending_operations (
      id, type, payload, order_id, status, retries, created_at, updated_at, device_signature
    ) VALUES (?, ?, ?, ?, 'PENDING', 0, ?, ?, ?)
  `);
  stmt.run(
    operationId,
    type,
    JSON.stringify(payload),
    orderId,
    now,
    now,
    deviceSignature
  );
  return operationId;
}
function listPendingOperations$1(db2, filters = {}) {
  let query = "SELECT * FROM pending_operations WHERE 1=1";
  const params = [];
  if (filters.status) {
    query += " AND status = ?";
    params.push(filters.status);
  }
  if (filters.type) {
    query += " AND type = ?";
    params.push(filters.type);
  }
  query += " ORDER BY created_at ASC";
  const stmt = db2.prepare(query);
  const operations = stmt.all(...params);
  return operations.map((op) => ({
    ...op,
    payload: JSON.parse(op.payload),
    server_response: op.server_response ? JSON.parse(op.server_response) : null
  }));
}
function getOperationById(db2, operationId) {
  const stmt = db2.prepare("SELECT * FROM pending_operations WHERE id = ?");
  const op = stmt.get(operationId);
  if (!op) return null;
  return {
    ...op,
    payload: JSON.parse(op.payload),
    server_response: op.server_response ? JSON.parse(op.server_response) : null
  };
}
function markOperationSynced$1(db2, operationId, serverResponse) {
  const stmt = db2.prepare(`
    UPDATE pending_operations
    SET status = 'SENT',
        server_response = ?,
        updated_at = datetime('now'),
        error_message = NULL
    WHERE id = ?
  `);
  stmt.run(JSON.stringify(serverResponse), operationId);
}
function markOperationFailed$1(db2, operationId, errorMessage) {
  const stmt = db2.prepare(`
    UPDATE pending_operations
    SET status = 'FAILED',
        error_message = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(errorMessage, operationId);
}
function markOperationSending(db2, operationId) {
  const stmt = db2.prepare(`
    UPDATE pending_operations
    SET status = 'SENDING',
        updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(operationId);
}
function incrementRetryCounter(db2, operationId) {
  const stmt = db2.prepare(`
    UPDATE pending_operations
    SET retries = retries + 1,
        status = 'PENDING',
        updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(operationId);
}
function deleteOperation(db2, operationId) {
  const stmt = db2.prepare("DELETE FROM pending_operations WHERE id = ?");
  stmt.run(operationId);
}
function purgeSuccessfulOperations(db2, daysOld = 7) {
  const stmt = db2.prepare(`
    DELETE FROM pending_operations
    WHERE status = 'SENT'
      AND datetime(created_at) < datetime('now', '-' || ? || ' days')
  `);
  const result = stmt.run(daysOld);
  return result.changes;
}
function recordOfflineOrder$1(db2, orderPayload) {
  const localId = v4();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const stmt = db2.prepare(`
    INSERT INTO offline_orders (local_id, payload, status, created_at)
    VALUES (?, ?, 'PENDING', ?)
  `);
  stmt.run(localId, JSON.stringify(orderPayload), now);
  return localId;
}
function getOfflineOrder$1(db2, localId) {
  const stmt = db2.prepare("SELECT * FROM offline_orders WHERE local_id = ?");
  const order = stmt.get(localId);
  if (!order) return null;
  return {
    ...order,
    payload: JSON.parse(order.payload)
  };
}
function updateOfflineOrderStatus$1(db2, localId, status, serverOrderId = null, serverOrderNumber = null, conflictReason = null) {
  const stmt = db2.prepare(`
    UPDATE offline_orders
    SET status = ?,
        server_order_id = ?,
        server_order_number = ?,
        conflict_reason = ?,
        synced_at = CASE WHEN ? = 'SYNCED' THEN datetime('now') ELSE synced_at END
    WHERE local_id = ?
  `);
  stmt.run(status, serverOrderId, serverOrderNumber, conflictReason, status, localId);
}
function listOfflineOrders$1(db2, status = null) {
  let query = "SELECT * FROM offline_orders";
  const params = [];
  if (status) {
    query += " WHERE status = ?";
    params.push(status);
  }
  query += " ORDER BY created_at DESC";
  const stmt = db2.prepare(query);
  const orders = stmt.all(...params);
  return orders.map((order) => ({
    ...order,
    payload: JSON.parse(order.payload)
  }));
}
function recordOfflinePayment$1(db2, paymentData) {
  const paymentId = v4();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const stmt = db2.prepare(`
    INSERT INTO offline_payments (
      id, local_order_id, method, amount, tip, surcharge, status,
      transaction_id, provider_response, cash_tendered, change_given, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    paymentId,
    paymentData.local_order_id,
    paymentData.method,
    paymentData.amount,
    paymentData.tip || 0,
    paymentData.surcharge || 0,
    paymentData.status,
    paymentData.transaction_id,
    paymentData.provider_response ? JSON.stringify(paymentData.provider_response) : null,
    paymentData.cash_tendered,
    paymentData.change_given,
    now
  );
  return paymentId;
}
function getOfflinePayments$1(db2, localOrderId) {
  const stmt = db2.prepare("SELECT * FROM offline_payments WHERE local_order_id = ?");
  const payments = stmt.all(localOrderId);
  return payments.map((p) => ({
    ...p,
    provider_response: p.provider_response ? JSON.parse(p.provider_response) : null
  }));
}
function recordOfflineApproval$1(db2, approvalData) {
  const approvalId = v4();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const stmt = db2.prepare(`
    INSERT INTO offline_approvals (
      id, user_id, pin, action, reference, local_order_id, value, notes, timestamp, synced
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);
  stmt.run(
    approvalId,
    approvalData.user_id,
    approvalData.pin,
    approvalData.action,
    approvalData.reference || "",
    approvalData.local_order_id,
    approvalData.value,
    approvalData.notes || "",
    now
  );
  return approvalId;
}
function getUnsyncedApprovals$1(db2) {
  const stmt = db2.prepare("SELECT * FROM offline_approvals WHERE synced = 0 ORDER BY timestamp ASC");
  return stmt.all();
}
function markApprovalsSynced(db2, approvalIds) {
  if (!approvalIds || approvalIds.length === 0) return;
  const placeholders = approvalIds.map(() => "?").join(",");
  const stmt = db2.prepare(`
    UPDATE offline_approvals
    SET synced = 1
    WHERE id IN (${placeholders})
  `);
  stmt.run(...approvalIds);
}
function getQueueStats$1(db2) {
  const pending = db2.prepare("SELECT COUNT(*) as count FROM pending_operations WHERE status = ?").get("PENDING");
  const sending = db2.prepare("SELECT COUNT(*) as count FROM pending_operations WHERE status = ?").get("SENDING");
  const failed = db2.prepare("SELECT COUNT(*) as count FROM pending_operations WHERE status = ?").get("FAILED");
  const sent = db2.prepare("SELECT COUNT(*) as count FROM pending_operations WHERE status = ?").get("SENT");
  const offlineOrders = db2.prepare("SELECT COUNT(*) as count FROM offline_orders WHERE status = ?").get("PENDING");
  const conflictOrders = db2.prepare("SELECT COUNT(*) as count FROM offline_orders WHERE status = ?").get("CONFLICT");
  return {
    pending_operations: pending.count,
    sending_operations: sending.count,
    failed_operations: failed.count,
    sent_operations: sent.count,
    pending_orders: offlineOrders.count,
    conflict_orders: conflictOrders.count
  };
}
const queue = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  deleteOperation,
  getOfflineOrder: getOfflineOrder$1,
  getOfflinePayments: getOfflinePayments$1,
  getOperationById,
  getQueueStats: getQueueStats$1,
  getUnsyncedApprovals: getUnsyncedApprovals$1,
  incrementRetryCounter,
  listOfflineOrders: listOfflineOrders$1,
  listPendingOperations: listPendingOperations$1,
  markApprovalsSynced,
  markOperationFailed: markOperationFailed$1,
  markOperationSending,
  markOperationSynced: markOperationSynced$1,
  purgeSuccessfulOperations,
  queueOperation: queueOperation$1,
  recordOfflineApproval: recordOfflineApproval$1,
  recordOfflineOrder: recordOfflineOrder$1,
  recordOfflinePayment: recordOfflinePayment$1,
  updateOfflineOrderStatus: updateOfflineOrderStatus$1
}, Symbol.toStringTag, { value: "Module" }));
function getMetadata(db2, key) {
  const stmt = db2.prepare("SELECT value FROM device_meta WHERE key = ?");
  const result = stmt.get(key);
  return result ? result.value : null;
}
function setMetadata(db2, key, value) {
  const stmt = db2.prepare(`
    INSERT INTO device_meta (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);
  stmt.run(key, String(value));
}
function getAllMetadata(db2) {
  const stmt = db2.prepare("SELECT key, value FROM device_meta");
  const rows = stmt.all();
  const meta2 = {};
  for (const row of rows) {
    meta2[row.key] = row.value;
  }
  return meta2;
}
function incrementOfflineCounter(db2, type, amount) {
  const countKey = `offline_${type}_total`;
  const currentValue = parseFloat(getMetadata(db2, countKey) || "0");
  const newValue = currentValue + amount;
  setMetadata(db2, countKey, newValue.toFixed(2));
  const countValue = parseInt(getMetadata(db2, "offline_transaction_count") || "0", 10);
  setMetadata(db2, "offline_transaction_count", String(countValue + 1));
}
function resetOfflineCounters(db2) {
  setMetadata(db2, "offline_transaction_count", "0");
  setMetadata(db2, "offline_cash_total", "0");
  setMetadata(db2, "offline_card_total", "0");
}
function getOfflineExposure$1(db2) {
  return {
    transaction_count: parseInt(getMetadata(db2, "offline_transaction_count") || "0", 10),
    cash_total: parseFloat(getMetadata(db2, "offline_cash_total") || "0"),
    card_total: parseFloat(getMetadata(db2, "offline_card_total") || "0"),
    total_exposure: parseFloat(getMetadata(db2, "offline_cash_total") || "0") + parseFloat(getMetadata(db2, "offline_card_total") || "0")
  };
}
function updateNetworkStatus$1(db2, isOnline) {
  const currentStatus = getMetadata(db2, "network_status");
  const newStatus = isOnline ? "online" : "offline";
  setMetadata(db2, "network_status", newStatus);
  if (!isOnline && currentStatus === "online") {
    setMetadata(db2, "offline_since", (/* @__PURE__ */ new Date()).toISOString());
  }
  if (isOnline && currentStatus === "offline") {
    setMetadata(db2, "offline_since", "");
  }
}
function getNetworkStatus$1(db2) {
  const status = getMetadata(db2, "network_status");
  const offlineSince = getMetadata(db2, "offline_since");
  return {
    is_online: status === "online",
    offline_since: offlineSince || null,
    offline_duration_minutes: offlineSince ? Math.floor((Date.now() - new Date(offlineSince).getTime()) / 1e3 / 60) : 0
  };
}
function updateSyncTimestamp$1(db2, success = true) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  setMetadata(db2, "last_sync_attempt", now);
  if (success) {
    setMetadata(db2, "last_sync_success", now);
  }
}
function getSyncStatus$1(db2) {
  const lastAttempt = getMetadata(db2, "last_sync_attempt");
  const lastSuccess = getMetadata(db2, "last_sync_success");
  return {
    last_sync_attempt: lastAttempt,
    last_sync_success: lastSuccess,
    minutes_since_last_sync: lastSuccess ? Math.floor((Date.now() - new Date(lastSuccess).getTime()) / 1e3 / 60) : null
  };
}
function checkLimitExceeded$1(db2, limits, type, amount) {
  if (!limits) {
    return { exceeded: false };
  }
  const exposure = getOfflineExposure$1(db2);
  if (limits.offline_transaction_count_limit && exposure.transaction_count >= limits.offline_transaction_count_limit) {
    return {
      exceeded: true,
      reason: `Transaction limit reached (${limits.offline_transaction_count_limit} transactions)`
    };
  }
  if (type === "card" && limits.offline_transaction_limit && amount > limits.offline_transaction_limit) {
    return {
      exceeded: true,
      reason: `Single transaction limit exceeded ($${limits.offline_transaction_limit})`
    };
  }
  if (limits.offline_daily_limit) {
    const newTotal = exposure.total_exposure + amount;
    if (newTotal > limits.offline_daily_limit) {
      return {
        exceeded: true,
        reason: `Daily offline limit would be exceeded ($${limits.offline_daily_limit})`
      };
    }
  }
  return { exceeded: false };
}
function getOfflineLimitsStatus(db2, limits) {
  const exposure = getOfflineExposure$1(db2);
  if (!limits) {
    return {
      transaction_count: { current: exposure.transaction_count, limit: null, percentage: 0 },
      cash_total: { current: exposure.cash_total, limit: null, percentage: 0 },
      card_total: { current: exposure.card_total, limit: null, percentage: 0 },
      daily_total: { current: exposure.total_exposure, limit: null, percentage: 0 }
    };
  }
  return {
    transaction_count: {
      current: exposure.transaction_count,
      limit: limits.offline_transaction_count_limit || null,
      percentage: limits.offline_transaction_count_limit ? exposure.transaction_count / limits.offline_transaction_count_limit * 100 : 0
    },
    cash_total: {
      current: exposure.cash_total,
      limit: null,
      // No specific cash limit
      percentage: 0
    },
    card_total: {
      current: exposure.card_total,
      limit: null,
      // Tracked but no separate limit
      percentage: 0
    },
    daily_total: {
      current: exposure.total_exposure,
      limit: limits.offline_daily_limit || null,
      percentage: limits.offline_daily_limit ? exposure.total_exposure / limits.offline_daily_limit * 100 : 0
    }
  };
}
function getCompleteStats$1(db2, limits = null) {
  const queueStats = db2.prepare(`
    SELECT
      COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending,
      COUNT(CASE WHEN status = 'SENDING' THEN 1 END) as sending,
      COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed,
      COUNT(CASE WHEN status = 'SENT' THEN 1 END) as sent
    FROM pending_operations
  `).get();
  const offlineOrderStats = db2.prepare(`
    SELECT
      COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending,
      COUNT(CASE WHEN status = 'CONFLICT' THEN 1 END) as conflicts
    FROM offline_orders
  `).get();
  const exposure = getOfflineExposure$1(db2);
  const networkStatus = getNetworkStatus$1(db2);
  const syncStatus = getSyncStatus$1(db2);
  const limitsStatus = getOfflineLimitsStatus(db2, limits);
  return {
    queue: {
      pending_operations: queueStats.pending,
      sending_operations: queueStats.sending,
      failed_operations: queueStats.failed,
      sent_operations: queueStats.sent,
      pending_orders: offlineOrderStats.pending,
      conflict_orders: offlineOrderStats.conflicts
    },
    exposure,
    network: networkStatus,
    sync: syncStatus,
    limits: limitsStatus
  };
}
function storePairingInfo$1(db2, { terminal_id, tenant_id, tenant_slug, location_id, signing_secret }) {
  const transaction = db2.transaction(() => {
    setMetadata(db2, "terminal_id", terminal_id);
    setMetadata(db2, "tenant_id", tenant_id);
    setMetadata(db2, "tenant_slug", tenant_slug);
    setMetadata(db2, "location_id", location_id);
    setMetadata(db2, "signing_secret", signing_secret);
    setMetadata(db2, "paired_at", (/* @__PURE__ */ new Date()).toISOString());
  });
  transaction();
}
function getPairingInfo$1(db2) {
  const terminal_id = getMetadata(db2, "terminal_id");
  const tenant_id = getMetadata(db2, "tenant_id");
  const tenant_slug = getMetadata(db2, "tenant_slug");
  const location_id = getMetadata(db2, "location_id");
  const signing_secret = getMetadata(db2, "signing_secret");
  const paired_at = getMetadata(db2, "paired_at");
  if (!terminal_id || !tenant_id || !location_id) {
    return null;
  }
  return {
    terminal_id,
    tenant_id,
    tenant_slug,
    location_id,
    signing_secret,
    paired_at
  };
}
function clearPairingInfo$1(db2) {
  const transaction = db2.transaction(() => {
    db2.prepare("DELETE FROM device_meta WHERE key IN (?, ?, ?, ?, ?, ?)").run(
      "terminal_id",
      "tenant_id",
      "tenant_slug",
      "location_id",
      "signing_secret",
      "paired_at"
    );
  });
  transaction();
}
function isPaired$1(db2) {
  return getPairingInfo$1(db2) !== null;
}
const meta = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  checkLimitExceeded: checkLimitExceeded$1,
  clearPairingInfo: clearPairingInfo$1,
  getAllMetadata,
  getCompleteStats: getCompleteStats$1,
  getMetadata,
  getNetworkStatus: getNetworkStatus$1,
  getOfflineExposure: getOfflineExposure$1,
  getOfflineLimitsStatus,
  getPairingInfo: getPairingInfo$1,
  getSyncStatus: getSyncStatus$1,
  incrementOfflineCounter,
  isPaired: isPaired$1,
  resetOfflineCounters,
  setMetadata,
  storePairingInfo: storePairingInfo$1,
  updateNetworkStatus: updateNetworkStatus$1,
  updateSyncTimestamp: updateSyncTimestamp$1
}, Symbol.toStringTag, { value: "Module" }));
let db = null;
function getDatabasePath() {
  const userDataPath = app.getPath("userData");
  return path$1.join(userDataPath, "offline-pos.db");
}
function ensureBackupsDir() {
  const userDataPath = app.getPath("userData");
  const backupsDir = path$1.join(userDataPath, "backups");
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  return backupsDir;
}
function createBackup() {
  if (!db) return null;
  const backupsDir = ensureBackupsDir();
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const backupPath = path$1.join(backupsDir, `offline-pos-${timestamp}.db.bak`);
  try {
    db.backup(backupPath);
    cleanupOldBackups(backupsDir, 7);
    return backupPath;
  } catch (error) {
    console.error("Failed to create database backup:", error);
    return null;
  }
}
function cleanupOldBackups(backupsDir, daysToKeep) {
  try {
    const files = fs.readdirSync(backupsDir);
    const now = Date.now();
    const maxAge = daysToKeep * 24 * 60 * 60 * 1e3;
    for (const file of files) {
      if (!file.endsWith(".db.bak")) continue;
      const filePath = path$1.join(backupsDir, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtimeMs;
      if (age > maxAge) {
        fs.unlinkSync(filePath);
        console.log(`Deleted old backup: ${file}`);
      }
    }
  } catch (error) {
    console.error("Failed to cleanup old backups:", error);
  }
}
function initializeDatabase(options = {}) {
  if (db) {
    console.log("Database already initialized");
    return db;
  }
  const dbPath = getDatabasePath();
  console.log(`Initializing offline database at: ${dbPath}`);
  db = new Database(dbPath, {
    verbose: options.verbose ? console.log : null
  });
  if (options.reset) {
    console.log("Resetting database (dropping all tables)...");
    dropAllTables(db);
  }
  console.log("Initializing database schema...");
  initializeSchema(db);
  console.log("Creating initial backup...");
  createBackup();
  console.log("Offline database initialized successfully");
  return db;
}
function getDatabase() {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return db;
}
function closeDatabase() {
  if (db) {
    console.log("Closing offline database...");
    createBackup();
    db.close();
    db = null;
    console.log("Offline database closed");
  }
}
function vacuumDatabase() {
  if (!db) return;
  console.log("Vacuuming database...");
  db.exec("VACUUM");
  console.log("Database vacuumed successfully");
}
function getDatabaseStats() {
  var _a, _b;
  if (!db) return null;
  const stats = {
    path: getDatabasePath(),
    size_bytes: null,
    page_count: null,
    page_size: null,
    table_counts: {}
  };
  try {
    const dbPath = getDatabasePath();
    if (fs.existsSync(dbPath)) {
      stats.size_bytes = fs.statSync(dbPath).size;
    }
    const pageInfo = db.pragma("page_count; page_size");
    stats.page_count = (_a = pageInfo[0]) == null ? void 0 : _a.page_count;
    stats.page_size = (_b = pageInfo[1]) == null ? void 0 : _b.page_size;
    const tables = [
      "datasets",
      "products",
      "categories",
      "modifier_sets",
      "discounts",
      "taxes",
      "product_types",
      "inventory_locations",
      "inventory_stocks",
      "settings",
      "users",
      "pending_operations",
      "offline_orders",
      "offline_payments",
      "offline_approvals",
      "device_meta"
    ];
    for (const table of tables) {
      const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
      stats.table_counts[table] = result.count;
    }
  } catch (error) {
    console.error("Failed to get database stats:", error);
  }
  return stats;
}
const {
  // Dataset operations
  updateDatasetVersion,
  getDatasetVersion,
  upsertProducts,
  upsertCategories,
  upsertModifierSets,
  upsertDiscounts,
  upsertTaxes,
  upsertProductTypes,
  upsertInventoryStocks,
  upsertInventoryLocations,
  upsertSettings,
  upsertUsers,
  deleteRecords,
  getProducts,
  getProductById,
  getProductByBarcode,
  getCategories,
  getDiscounts,
  getModifierSets,
  getTaxes,
  getProductTypes,
  getInventoryStocks,
  getInventoryByProductId,
  getInventoryLocations,
  getSettings,
  getUsers,
  getUserById
} = datasets;
const {
  // Queue operations
  queueOperation,
  listPendingOperations,
  markOperationSynced,
  markOperationFailed,
  recordOfflineOrder,
  getOfflineOrder,
  updateOfflineOrderStatus,
  listOfflineOrders,
  recordOfflinePayment,
  getOfflinePayments,
  recordOfflineApproval,
  getUnsyncedApprovals,
  getQueueStats
} = queue;
const {
  getOfflineExposure,
  updateNetworkStatus,
  getNetworkStatus,
  updateSyncTimestamp,
  getSyncStatus,
  checkLimitExceeded,
  getCompleteStats,
  // Terminal pairing operations
  storePairingInfo,
  getPairingInfo,
  clearPairingInfo,
  isPaired
} = meta;
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});
class NetworkMonitor extends EventEmitter {
  constructor() {
    super();
    this.isOnline = true;
    this.checkInterval = null;
    this.checkIntervalMs = 3e4;
    this.backendUrl = null;
    this.lastCheckTime = null;
    this.consecutiveFailures = 0;
    this.maxConsecutiveFailures = 3;
  }
  /**
   * Start monitoring network status
   * @param {string} backendUrl - Backend API URL (e.g., https://api.example.com)
   * @param {number} intervalMs - Check interval in milliseconds
   */
  start(backendUrl, intervalMs = 3e4) {
    this.backendUrl = backendUrl;
    this.checkIntervalMs = intervalMs;
    console.log(`Starting network monitor (checking ${backendUrl} every ${intervalMs}ms)`);
    this.checkConnection();
    this.checkInterval = setInterval(() => {
      this.checkConnection();
    }, this.checkIntervalMs);
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.handleBrowserEvent(true));
      window.addEventListener("offline", () => this.handleBrowserEvent(false));
    }
  }
  /**
   * Stop monitoring
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log("Network monitor stopped");
  }
  /**
   * Check backend connectivity
   */
  async checkConnection() {
    if (!this.backendUrl) {
      console.warn("No backend URL configured for network monitor");
      return;
    }
    this.lastCheckTime = (/* @__PURE__ */ new Date()).toISOString();
    try {
      const response = await axios.get(`${this.backendUrl}/health/`, {
        timeout: 5e3,
        // 5 second timeout
        headers: {
          "Cache-Control": "no-cache"
        },
        httpsAgent
        // Allow self-signed certificates in development
      });
      if (response.status === 200) {
        this.handleSuccess();
      } else {
        this.handleFailure();
      }
    } catch (error) {
      this.handleFailure(error);
    }
  }
  /**
   * Handle successful connection check
   */
  handleSuccess() {
    this.consecutiveFailures = 0;
    if (!this.isOnline) {
      console.log("Network connection restored");
      this.isOnline = true;
      try {
        const db2 = getDatabase();
        updateNetworkStatus(db2, true);
        updateSyncTimestamp(db2, true);
      } catch (error) {
        console.error("Failed to update network status in DB:", error);
      }
      this.emit("status-changed", {
        is_online: true,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      this.emit("online", {
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  }
  /**
   * Handle failed connection check
   */
  handleFailure(error = null) {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.maxConsecutiveFailures && this.isOnline) {
      console.warn(`Network connection lost (${this.consecutiveFailures} consecutive failures)`);
      if (error) {
        console.error("Connection error:", error.message);
      }
      this.isOnline = false;
      try {
        const db2 = getDatabase();
        updateNetworkStatus(db2, false);
      } catch (error2) {
        console.error("Failed to update network status in DB:", error2);
      }
      this.emit("status-changed", {
        is_online: false,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        error: error == null ? void 0 : error.message
      });
      this.emit("offline", {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        error: error == null ? void 0 : error.message
      });
    }
  }
  /**
   * Handle browser online/offline events
   */
  handleBrowserEvent(isOnline) {
    console.log(`Browser reported network ${isOnline ? "online" : "offline"}`);
    if (!isOnline && this.isOnline) {
      this.handleFailure(new Error("Browser reported offline"));
    }
    if (isOnline && !this.isOnline) {
      this.checkConnection();
    }
  }
  /**
   * Force a connection check
   */
  async forceCheck() {
    await this.checkConnection();
  }
  /**
   * Get current status
   */
  getStatus() {
    return {
      is_online: this.isOnline,
      last_check: this.lastCheckTime,
      consecutive_failures: this.consecutiveFailures,
      backend_url: this.backendUrl
    };
  }
  /**
   * Manually set online status (for testing)
   */
  setOnline(isOnline) {
    if (isOnline) {
      this.handleSuccess();
    } else {
      this.consecutiveFailures = this.maxConsecutiveFailures;
      this.handleFailure(new Error("Manually set offline"));
    }
  }
}
let monitorInstance = null;
function getNetworkMonitor() {
  if (!monitorInstance) {
    monitorInstance = new NetworkMonitor();
  }
  return monitorInstance;
}
const { machineIdSync } = nodeMachineId;
const require2 = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = process$1.env.NODE_ENV === "development";
console.log(
  "[Main Process] Configuring hardware acceleration and display settings..."
);
app.commandLine.appendSwitch("--enable-gpu-rasterization");
app.commandLine.appendSwitch("--enable-zero-copy");
app.commandLine.appendSwitch("--disable-software-rasterizer");
if (!isDev) {
  app.commandLine.appendSwitch("--enable-features", "VizDisplayCompositor");
  app.commandLine.appendSwitch("--force-color-profile", "srgb");
  console.log(
    "[Main Process] Production mode - stable display features enabled"
  );
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
const HEALTH_CHECK_INTERVAL_MS = 1e4;
const HEALTH_CHECK_TIMEOUT_MS = 5e3;
let healthCheckInterval = null;
let lastPongTimestamp = Date.now();
let waitingForPong = false;
let consecutiveFailures = 0;
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
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    customerWindow = new BrowserWindow({
      icon: path.join(process$1.env.PUBLIC, "logo.png"),
      x: Math.floor(width * 0.25),
      // Centered-ish
      y: Math.floor(height * 0.1),
      width: Math.floor(width * 0.5),
      // Half the screen width
      height: Math.floor(height * 0.8),
      // 80% of screen height
      fullscreen: false,
      title: "Customer Display (Testing)",
      webPreferences: {
        preload: path.join(__dirname, "../dist-electron/preload.js"),
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false
      }
    });
  } else {
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
  }
  if (VITE_DEV_SERVER_URL) {
    customerWindow.loadURL(`${VITE_DEV_SERVER_URL}customer.html`);
  } else {
    customerWindow.loadFile(path.join(process$1.env.DIST, "customer.html"));
  }
  customerWindow.webContents.on("did-finish-load", () => {
    setTimeout(() => {
      startHealthCheck();
    }, 2e3);
  });
  customerWindow.on("closed", () => {
    stopHealthCheck();
    customerWindow = null;
  });
  customerWindow.on("unresponsive", () => {
    console.error(
      "[Main Process] Customer display renderer is unresponsive. Attempting to reload..."
    );
    if (customerWindow && !customerWindow.isDestroyed()) {
      try {
        customerWindow.webContents.reload();
      } catch (error) {
        console.error(
          "[Main Process] Failed to reload unresponsive customer display:",
          error
        );
        recreateCustomerWindow();
      }
    }
  });
  customerWindow.webContents.on("render-process-gone", (event, details) => {
    console.error(
      "[Main Process] Customer display renderer crashed:",
      details.reason,
      "Exit code:",
      details.exitCode
    );
    stopHealthCheck();
    setTimeout(() => {
      recreateCustomerWindow();
    }, 1e3);
  });
}
function recreateCustomerWindow() {
  stopHealthCheck();
  if (customerWindow && !customerWindow.isDestroyed()) {
    try {
      customerWindow.close();
    } catch (error) {
      console.error(
        "[Main Process] Error closing existing customer window:",
        error
      );
    }
  }
  customerWindow = null;
  setTimeout(() => {
    createCustomerWindow();
  }, 500);
}
function startHealthCheck() {
  stopHealthCheck();
  lastPongTimestamp = Date.now();
  waitingForPong = false;
  consecutiveFailures = 0;
  healthCheckInterval = setInterval(() => {
    if (!customerWindow || customerWindow.isDestroyed()) {
      stopHealthCheck();
      return;
    }
    const now = Date.now();
    const timeSinceLastPong = now - lastPongTimestamp;
    if (waitingForPong && timeSinceLastPong > HEALTH_CHECK_TIMEOUT_MS) {
      consecutiveFailures++;
      console.error(
        `[Main Process] Customer display health check FAILED - no pong for ${Math.round(timeSinceLastPong / 1e3)}s (failure ${consecutiveFailures})`
      );
      if (consecutiveFailures === 1) {
        try {
          customerWindow.webContents.reload();
          waitingForPong = false;
          lastPongTimestamp = now;
        } catch (error) {
          console.error(
            "[Main Process] Graceful reload failed:",
            error
          );
          consecutiveFailures = 2;
        }
      }
      if (consecutiveFailures >= 2) {
        console.error(
          "[Main Process] Graceful reload failed. Forcing crash & recreate..."
        );
        stopHealthCheck();
        try {
          customerWindow.webContents.forcefullyCrashRenderer();
        } catch (error) {
          console.error(
            "[Main Process] Failed to crash renderer:",
            error
          );
          recreateCustomerWindow();
        }
        consecutiveFailures = 0;
      }
      return;
    }
    customerWindow.webContents.send("CUSTOMER_HEALTH_CHECK_PING");
    waitingForPong = true;
  }, HEALTH_CHECK_INTERVAL_MS);
}
function stopHealthCheck() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}
ipcMain.on("CUSTOMER_HEALTH_CHECK_PONG", () => {
  lastPongTimestamp = Date.now();
  waitingForPong = false;
  consecutiveFailures = 0;
});
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
function checkDatabaseAvailable() {
  try {
    getDatabase();
    return { available: true };
  } catch (error) {
    return {
      available: false,
      error: "Offline database is not available. The terminal may need to restart."
    };
  }
}
ipcMain.handle("offline:cache-dataset", async (event, datasetName, rows, version) => {
  try {
    if (!version) {
      console.error(`[Offline] Cannot cache dataset '${datasetName}' - version is missing`);
      return { success: false, error: "Dataset version is required" };
    }
    const dbCheck = checkDatabaseAvailable();
    if (!dbCheck.available) {
      return { success: false, error: dbCheck.error };
    }
    const db2 = getDatabase();
    const pairingInfo = getPairingInfo(db2);
    if (datasetName === "settings") {
      upsertSettings(db2, rows);
      updateDatasetVersion(db2, datasetName, version, 1, 0);
      return { success: true };
    }
    if (!Array.isArray(rows)) {
      throw new Error(`Dataset ${datasetName} must be an array, got ${typeof rows}`);
    }
    let processedRows = rows;
    if (pairingInfo) {
      processedRows = rows.map((row) => ({
        ...row,
        tenant_id: row.tenant_id || pairingInfo.tenant_id,
        store_location_id: row.store_location_id || pairingInfo.location_id
      }));
    }
    const recordCount = processedRows.length;
    switch (datasetName) {
      case "products":
        upsertProducts(db2, processedRows);
        break;
      case "categories":
        upsertCategories(db2, processedRows);
        break;
      case "modifier_sets":
        upsertModifierSets(db2, processedRows);
        break;
      case "discounts":
        upsertDiscounts(db2, processedRows);
        break;
      case "taxes":
        upsertTaxes(db2, processedRows);
        break;
      case "product_types":
        upsertProductTypes(db2, processedRows);
        break;
      case "inventory_stocks":
        upsertInventoryStocks(db2, processedRows);
        break;
      case "inventory_locations":
        upsertInventoryLocations(db2, processedRows);
        break;
      case "users":
        upsertUsers(db2, processedRows);
        break;
      default:
        throw new Error(`Unknown dataset: ${datasetName}`);
    }
    updateDatasetVersion(db2, datasetName, version, recordCount, 0);
    return { success: true };
  } catch (error) {
    console.error(`[Offline DB] Error caching dataset ${datasetName}:`, error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("offline:delete-records", async (event, tableName, deletedIds) => {
  try {
    if (!deletedIds || deletedIds.length === 0) {
      return { success: true };
    }
    const dbCheck = checkDatabaseAvailable();
    if (!dbCheck.available) {
      return { success: false, error: dbCheck.error };
    }
    const db2 = getDatabase();
    deleteRecords(db2, tableName, deletedIds);
    console.log(`[Offline DB] Deleted ${deletedIds.length} records from ${tableName}`);
    return { success: true };
  } catch (error) {
    console.error(`[Offline DB] Error deleting records from ${tableName}:`, error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("offline:get-cached-products", async (event, filters = {}) => {
  try {
    const db2 = getDatabase();
    return getProducts(db2, filters);
  } catch (error) {
    console.error("[Offline DB] Error getting cached products:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-cached-categories", async () => {
  try {
    const db2 = getDatabase();
    return getCategories(db2);
  } catch (error) {
    console.error("[Offline DB] Error getting cached categories:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-cached-discounts", async (event, options = {}) => {
  try {
    const db2 = getDatabase();
    return getDiscounts(db2, options);
  } catch (error) {
    console.error("[Offline DB] Error getting cached discounts:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-cached-modifier-sets", async () => {
  try {
    const db2 = getDatabase();
    return getModifierSets(db2);
  } catch (error) {
    console.error("[Offline DB] Error getting cached modifier sets:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-cached-taxes", async () => {
  try {
    const db2 = getDatabase();
    return getTaxes(db2);
  } catch (error) {
    console.error("[Offline DB] Error getting cached taxes:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-cached-product-types", async () => {
  try {
    const db2 = getDatabase();
    return getProductTypes(db2);
  } catch (error) {
    console.error("[Offline DB] Error getting cached product types:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-cached-inventory", async () => {
  try {
    const db2 = getDatabase();
    return getInventoryStocks(db2);
  } catch (error) {
    console.error("[Offline DB] Error getting cached inventory:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-cached-inventory-locations", async () => {
  try {
    const db2 = getDatabase();
    return getInventoryLocations(db2);
  } catch (error) {
    console.error("[Offline DB] Error getting cached inventory locations:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-cached-settings", async () => {
  try {
    const db2 = getDatabase();
    return getSettings(db2);
  } catch (error) {
    console.error("[Offline DB] Error getting cached settings:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-cached-users", async (event, options = {}) => {
  try {
    const db2 = getDatabase();
    return getUsers(db2, options);
  } catch (error) {
    console.error("[Offline DB] Error getting cached users:", error);
    throw error;
  }
});
ipcMain.handle("offline:clear-cache", async () => {
  try {
    const db2 = getDatabase();
    console.log("[Offline DB] Clearing all cache tables...");
    db2.exec(`
			DELETE FROM products;
			DELETE FROM categories;
			DELETE FROM modifier_sets;
			DELETE FROM discounts;
			DELETE FROM taxes;
			DELETE FROM product_types;
			DELETE FROM inventory_stocks;
			DELETE FROM inventory_locations;
			DELETE FROM settings;
			DELETE FROM users;
			DELETE FROM datasets;
		`);
    console.log("[Offline DB] ✅ Cache cleared successfully");
    return { success: true, message: "Cache cleared successfully" };
  } catch (error) {
    console.error("[Offline DB] ❌ Error clearing cache:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-product-by-id", async (event, productId) => {
  try {
    const db2 = getDatabase();
    return getProductById(db2, productId);
  } catch (error) {
    console.error("[Offline DB] Error getting product by ID:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-product-by-barcode", async (event, barcode) => {
  try {
    const db2 = getDatabase();
    return getProductByBarcode(db2, barcode);
  } catch (error) {
    console.error("[Offline DB] Error getting product by barcode:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-user-by-id", async (event, userId) => {
  try {
    const db2 = getDatabase();
    return getUserById(db2, userId);
  } catch (error) {
    console.error("[Offline DB] Error getting user by ID:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-inventory-by-product", async (event, productId) => {
  try {
    const db2 = getDatabase();
    return getInventoryByProductId(db2, productId);
  } catch (error) {
    console.error("[Offline DB] Error getting inventory by product:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-dataset-version", async (event, datasetName) => {
  try {
    const db2 = getDatabase();
    return getDatasetVersion(db2, datasetName);
  } catch (error) {
    console.error("[Offline DB] Error getting dataset version:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-all-dataset-versions", async () => {
  try {
    const db2 = getDatabase();
    const stmt = db2.prepare("SELECT key, version, synced_at FROM datasets");
    return stmt.all();
  } catch (error) {
    console.error("[Offline DB] Error getting all dataset versions:", error);
    return [];
  }
});
ipcMain.handle("offline:queue-operation", async (event, operation) => {
  try {
    const db2 = getDatabase();
    return queueOperation(db2, operation);
  } catch (error) {
    console.error("[Offline DB] Error queueing operation:", error);
    throw error;
  }
});
ipcMain.handle("offline:list-pending", async (event, filters) => {
  try {
    const db2 = getDatabase();
    return listPendingOperations(db2, filters);
  } catch (error) {
    console.error("[Offline DB] Error listing pending operations:", error);
    throw error;
  }
});
ipcMain.handle("offline:mark-synced", async (event, operationId, serverResponse) => {
  try {
    const db2 = getDatabase();
    return markOperationSynced(db2, operationId, serverResponse);
  } catch (error) {
    console.error("[Offline DB] Error marking operation as synced:", error);
    throw error;
  }
});
ipcMain.handle("offline:mark-failed", async (event, operationId, errorMessage) => {
  try {
    const db2 = getDatabase();
    return markOperationFailed(db2, operationId, errorMessage);
  } catch (error) {
    console.error("[Offline DB] Error marking operation as failed:", error);
    throw error;
  }
});
ipcMain.handle("offline:record-order", async (event, orderPayload) => {
  try {
    const db2 = getDatabase();
    return recordOfflineOrder(db2, orderPayload);
  } catch (error) {
    console.error("[Offline DB] Error recording offline order:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-order", async (event, localOrderId) => {
  try {
    const db2 = getDatabase();
    return getOfflineOrder(db2, localOrderId);
  } catch (error) {
    console.error("[Offline DB] Error getting offline order:", error);
    throw error;
  }
});
ipcMain.handle("offline:list-orders", async (event, status) => {
  try {
    const db2 = getDatabase();
    return listOfflineOrders(db2, status);
  } catch (error) {
    console.error("[Offline DB] Error listing offline orders:", error);
    throw error;
  }
});
ipcMain.handle("offline:update-order-status", async (event, localOrderId, status, serverData) => {
  try {
    const db2 = getDatabase();
    return updateOfflineOrderStatus(db2, localOrderId, status, serverData);
  } catch (error) {
    console.error("[Offline DB] Error updating order status:", error);
    throw error;
  }
});
ipcMain.handle("offline:record-payment", async (event, paymentData) => {
  try {
    const db2 = getDatabase();
    return recordOfflinePayment(db2, paymentData);
  } catch (error) {
    console.error("[Offline DB] Error recording offline payment:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-payments", async (event, localOrderId) => {
  try {
    const db2 = getDatabase();
    return getOfflinePayments(db2, localOrderId);
  } catch (error) {
    console.error("[Offline DB] Error getting offline payments:", error);
    throw error;
  }
});
ipcMain.handle("offline:record-approval", async (event, approvalData) => {
  try {
    const db2 = getDatabase();
    return recordOfflineApproval(db2, approvalData);
  } catch (error) {
    console.error("[Offline DB] Error recording offline approval:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-unsynced-approvals", async () => {
  try {
    const db2 = getDatabase();
    return getUnsyncedApprovals(db2);
  } catch (error) {
    console.error("[Offline DB] Error getting unsynced approvals:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-queue-stats", async () => {
  try {
    const db2 = getDatabase();
    return getQueueStats(db2);
  } catch (error) {
    console.error("[Offline DB] Error getting queue stats:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-exposure", async () => {
  try {
    const db2 = getDatabase();
    return getOfflineExposure(db2);
  } catch (error) {
    console.error("[Offline DB] Error getting offline exposure:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-network-status", async () => {
  try {
    const db2 = getDatabase();
    return getNetworkStatus(db2);
  } catch (error) {
    console.error("[Offline DB] Error getting network status:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-sync-status", async () => {
  try {
    const db2 = getDatabase();
    return getSyncStatus(db2);
  } catch (error) {
    console.error("[Offline DB] Error getting sync status:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-complete-stats", async () => {
  try {
    const db2 = getDatabase();
    return getCompleteStats(db2);
  } catch (error) {
    console.error("[Offline DB] Error getting complete stats:", error);
    throw error;
  }
});
ipcMain.handle("offline:check-limit", async (event, type, amount) => {
  try {
    const db2 = getDatabase();
    const settings = getSettings(db2);
    const limits = settings.length > 0 ? settings[0] : null;
    return checkLimitExceeded(db2, limits, type, amount);
  } catch (error) {
    console.error("[Offline DB] Error checking limit:", error);
    throw error;
  }
});
ipcMain.handle("offline:get-db-stats", async () => {
  try {
    return getDatabaseStats();
  } catch (error) {
    console.error("[Offline DB] Error getting database stats:", error);
    throw error;
  }
});
ipcMain.handle("offline:create-backup", async () => {
  try {
    return createBackup();
  } catch (error) {
    console.error("[Offline DB] Error creating backup:", error);
    throw error;
  }
});
ipcMain.handle("offline:vacuum-db", async () => {
  try {
    vacuumDatabase();
    return { success: true };
  } catch (error) {
    console.error("[Offline DB] Error vacuuming database:", error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("offline:store-pairing", async (event, pairingInfo) => {
  try {
    const db2 = getDatabase();
    storePairingInfo(db2, pairingInfo);
    console.log("[Offline DB] Terminal pairing info stored:", {
      terminal_id: pairingInfo.terminal_id,
      tenant_id: pairingInfo.tenant_id,
      location_id: pairingInfo.location_id
    });
    return { success: true };
  } catch (error) {
    console.error("[Offline DB] Error storing pairing info:", error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("offline:get-pairing", async () => {
  try {
    const db2 = getDatabase();
    return getPairingInfo(db2);
  } catch (error) {
    console.error("[Offline DB] Error getting pairing info:", error);
    throw error;
  }
});
ipcMain.handle("offline:is-paired", async () => {
  try {
    const db2 = getDatabase();
    return isPaired(db2);
  } catch (error) {
    console.error("[Offline DB] Error checking pairing status:", error);
    return false;
  }
});
ipcMain.handle("offline:clear-pairing", async () => {
  try {
    const db2 = getDatabase();
    clearPairingInfo(db2);
    console.log("[Offline DB] Terminal pairing info cleared");
    return { success: true };
  } catch (error) {
    console.error("[Offline DB] Error clearing pairing info:", error);
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
ipcMain.handle("get-device-fingerprint", () => {
  return machineIdSync({ original: true });
});
ipcMain.on("shutdown-app", () => {
  app.quit();
});
app.whenReady().then(async () => {
  console.log("[Main Process] Starting Electron app with Phase 2 offline support");
  console.log(
    "[Main Process] Hardware acceleration and display settings applied at startup"
  );
  try {
    initializeDatabase({ verbose: false });
    console.log("[Main Process] Offline database initialized successfully");
    const db2 = getDatabase();
    if (isPaired(db2)) {
      const pairingInfo = getPairingInfo(db2);
      console.log("[Main Process] Terminal is paired:", {
        terminal_id: pairingInfo.terminal_id,
        tenant_id: pairingInfo.tenant_id,
        location_id: pairingInfo.location_id
      });
    } else {
      console.log("[Main Process] Terminal is not paired - awaiting registration");
    }
  } catch (error) {
    console.error("[Main Process] CRITICAL: Failed to initialize offline database");
    console.error("[Main Process] Error details:", error.message);
    console.error("[Main Process] Stack trace:", error.stack);
    console.error("[Main Process] Offline features will be unavailable");
  }
  try {
    const backendUrl = process$1.env.VITE_API_BASE_URL || "https://localhost:8001/api";
    const networkMonitor = getNetworkMonitor();
    networkMonitor.start(backendUrl);
    console.log(`[Main Process] Network monitor started (checking ${backendUrl})`);
    networkMonitor.on("status-changed", (status) => {
      console.log(
        `[Main Process] Network status changed: ${status.is_online ? "ONLINE" : "OFFLINE"}`
      );
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("offline:network-status-changed", status);
      });
    });
  } catch (error) {
    console.error("[Main Process] Failed to start network monitor:", error);
  }
  createMainWindow();
  createCustomerWindow();
});
app.on("window-all-closed", () => {
  if (process$1.platform !== "darwin") {
    app.quit();
  }
});
app.on("before-quit", () => {
  console.log("[Main Process] Application shutting down...");
  try {
    const networkMonitor = getNetworkMonitor();
    networkMonitor.stop();
    console.log("[Main Process] Network monitor stopped");
  } catch (error) {
    console.error("[Main Process] Error stopping network monitor:", error);
  }
  try {
    closeDatabase();
    console.log("[Main Process] Offline database closed");
  } catch (error) {
    console.error("[Main Process] Error closing database:", error);
  }
});
