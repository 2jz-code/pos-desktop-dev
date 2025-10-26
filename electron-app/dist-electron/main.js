import { app, ipcMain, screen, session, BrowserWindow } from "electron";
import path from "node:path";
import process$1 from "node:process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import nodeMachineId from "node-machine-id";
import usb from "usb";
import require$$0 from "child_process";
import require$$1 from "util";
import crypto from "crypto";
import os from "os";
const require$1 = createRequire(import.meta.url);
const thermalPrinter = require$1("node-thermal-printer");
const { printer: ThermalPrinter, types: PrinterTypes } = thermalPrinter;
const __filename$1 = fileURLToPath(import.meta.url);
path.dirname(__filename$1);
function printLine(printer, left, right) {
	printer.leftRight(left, right);
}
async function ee(o, r = null, t = !1) {
	var y, f, l;
	let e = new U({
		type: F.EPSON,
		characterSet: "PC437_USA",
		interface: "tcp://dummy",
	});
	e.alignCenter();
	try {
		const s = b.join(process.env.PUBLIC, "logo-receipt.png");
		await e.printImage(s), e.println("");
	} catch (s) {
		console.error("Could not print logo. Using text fallback."),
			console.error("Full logo printing error:", s),
			r != null &&
				r.receipt_header &&
				(e.println(r.receipt_header), e.println(""));
	}
	const n =
			(r == null ? void 0 : r.store_address) ||
			`2105 Cliff Rd #300
Eagan, MN 55122`,
		i = (r == null ? void 0 : r.store_phone) || "(651) 412-5336";
	if (n.includes("\\n"))
		n.split("\\n").forEach((c) => {
			c.trim() && e.println(c.trim());
		});
	else {
		const s = n.split(",");
		if (s.length > 1) {
			const c = s.shift().trim(),
				d = s.join(",").trim();
			c && e.println(c), d && e.println(d);
		} else e.println(n);
	}
	e.println(`Tel: ${i}`), e.println(""), e.alignLeft();
	const a = o.order_number || o.id || "N/A",
		P = new Date(o.created_at).toLocaleString("en-US", {
			timeZone: "America/Chicago",
		}),
		p =
			o.customer_display_name ||
			o.guest_first_name ||
			((y = o.payment_details) == null ? void 0 : y.customer_name) ||
			((f = o.customer) == null ? void 0 : f.full_name);
	p && e.println(`Customer: ${p}`),
		e.println(`Order #: ${a}`),
		e.println(`Date: ${P}`);
	const u =
		(o.dining_preference || "TAKE_OUT") === "DINE_IN" ? "Dine In" : "Take Out";
	if ((e.println(`Service: ${u}`), o.order_type)) {
		const c =
			{
				POS: "In-Store",
				WEB: "Website",
				APP: "App",
				DOORDASH: "DoorDash",
				UBER_EATS: "Uber Eats",
			}[o.order_type] || o.order_type;
		e.println(`Source: ${c}`);
	}
	t &&
		(e.alignCenter(),
		e.bold(!0),
		e.println("--- TRANSACTION RECEIPT ---"),
		e.bold(!1),
		e.alignLeft(),
		o.status && e.println(`Order Status: ${o.status}`),
		e.println("** Payment Not Yet Processed **")),
		e.println(""),
		e.alignCenter(),
		e.bold(!0),
		e.println("ITEMS"),
		e.bold(!1),
		e.drawLine(),
		e.alignLeft();
	for (const s of o.items) {
		const c = parseFloat(s.price_at_sale) * s.quantity,
			d = s.product ? s.product.name : s.custom_name || "Custom Item",
			$ = `${s.quantity}x ${d}`;
		if (
			(g(e, $, `$${c.toFixed(2)}`),
			s.selected_modifiers_snapshot && s.selected_modifiers_snapshot.length > 0)
		)
			for (const m of s.selected_modifiers_snapshot) {
				const C = parseFloat(m.price_at_sale) * m.quantity * s.quantity;
				let S = `   - ${m.option_name}`;
				m.quantity > 1 && (S += ` (${m.quantity}x)`),
					parseFloat(m.price_at_sale) !== 0
						? g(e, S, `$${C.toFixed(2)}`)
						: e.println(S);
			}
	}
	if (
		(e.drawLine(),
		g(e, "Subtotal:", `$${parseFloat(o.subtotal).toFixed(2)}`),
		parseFloat(o.total_discounts_amount) > 0 &&
			g(e, "Discount:", `-$${parseFloat(o.total_discounts_amount).toFixed(2)}`),
		parseFloat(o.total_surcharges || 0) > 0 &&
			g(e, "Service Fee:", `$${parseFloat(o.total_surcharges).toFixed(2)}`),
		g(e, "Tax:", `$${parseFloat(o.tax_total).toFixed(2)}`),
		parseFloat(o.total_tips || 0) > 0 &&
			g(e, "Tip:", `$${parseFloat(o.total_tips).toFixed(2)}`),
		e.bold(!0),
		g(
			e,
			"TOTAL:",
			`$${parseFloat(o.total_collected || o.grand_total || 0).toFixed(2)}`
		),
		e.bold(!1),
		e.println(""),
		t)
	)
		e.bold(!0),
			e.println("Payment Information:"),
			e.bold(!1),
			e.println("This is a transaction receipt."),
			e.println("Payment will be processed separately.");
	else {
		let s = ((l = o.payment_details) == null ? void 0 : l.transactions) || [];
		if (
			(o.order_type === "WEB" &&
				(s = s.filter((c) => c.status === "SUCCESSFUL")),
			s.length > 0)
		) {
			e.bold(!0), e.println("Payment Details:"), e.bold(!1);
			for (const [c, d] of s.entries()) {
				const $ = (d.method || "N/A").toUpperCase(),
					m = parseFloat(d.amount || 0),
					C = parseFloat(d.surcharge || 0),
					S = parseFloat(d.tip || 0),
					N = (m + C + S).toFixed(2);
				if ($ === "CARD_ONLINE" || $ === "CARD_TERMINAL") {
					const D = d.card_brand || "",
						R = d.card_last4 || "";
					if (D && R) {
						const z = `${D.toUpperCase()} ******${R}`;
						g(e, ` ${z}`, `$${N}`);
					} else g(e, ` ${$} (${c + 1})`, `$${N}`);
				} else g(e, ` ${$} (${c + 1})`, `$${N}`);
				if ($ === "CASH") {
					const D = parseFloat(d.cashTendered || 0).toFixed(2),
						R = parseFloat(d.change || 0).toFixed(2);
					parseFloat(D) > 0 &&
						(g(e, "   Tendered:", `$${D}`), g(e, "   Change:", `$${R}`));
				}
			}
		}
	}
	return (
		e.println(""),
		e.alignCenter(),
		((r == null ? void 0 : r.receipt_footer) || "Thank you for your business!")
			.split(
				`
`
			)
			.forEach((c) => {
				c.trim() && e.println(c.trim());
			}),
		(r != null && r.receipt_footer) || e.println("Visit us at bakeajeen.com"),
		e.println(""),
		e.println(""),
		e.cut(),
		e.getBuffer()
	);
}
function te() {
	let o = new U({
		type: F.EPSON,
		interface: "tcp://dummy",
	});
	return o.openCashDrawer(), o.getBuffer();
}
function ne(o, r = "KITCHEN", t = null) {
	var u, v;
	let e = o.items || [];
	if (
		(t &&
			(e = e.filter((y) => {
				var l, s;
				const f = y.product;
				return f
					? !(
							(t.productTypes &&
								t.productTypes.length > 0 &&
								!t.productTypes.includes("ALL") &&
								!t.productTypes.includes(
									(l = f.product_type) == null ? void 0 : l.id
								)) ||
							(t.categories &&
								t.categories.length > 0 &&
								!t.categories.includes("ALL") &&
								!t.categories.includes(
									(s = f.category) == null ? void 0 : s.id
								))
					  )
					: !0;
			})),
		e.length === 0)
	)
		return (
			console.log(
				`[formatKitchenTicket] No items match filter for zone "${r}" - skipping ticket`
			),
			null
		);
	let n = new U({
		type: F.EPSON,
		characterSet: "PC437_USA",
		interface: "tcp://dummy",
	});
	n.println(""),
		n.println(""),
		n.println(""),
		n.println(""),
		n.alignCenter(),
		n.bold(!0),
		n.setTextSize(1, 1),
		n.println(`${r.toUpperCase()} TICKET`),
		n.setTextNormal(),
		n.bold(!1),
		n.alignLeft(),
		n.println(""),
		n.setTextSize(2, 2),
		n.bold(!0),
		n.println(`${o.order_number || o.id}`),
		n.bold(!1),
		n.setTextNormal();
	const i =
		o.customer_display_name ||
		o.guest_first_name ||
		((u = o.payment_details) == null ? void 0 : u.customer_name) ||
		((v = o.customer) == null ? void 0 : v.full_name);
	i && n.println(`Customer: ${i}`);
	const a = new Date(o.created_at).toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: !0,
		timeZone: "America/Chicago",
	});
	n.println(`Time: ${a}`);
	const p =
		(o.dining_preference || "TAKE_OUT") === "DINE_IN" ? "DINE IN" : "TAKE OUT";
	if ((n.bold(!0), n.println(`SERVICE: ${p}`), o.order_type)) {
		const f =
			{
				POS: "IN-STORE",
				WEB: "WEBSITE",
				APP: "APP",
				DOORDASH: "DOORDASH",
				UBER_EATS: "UBER EATS",
			}[o.order_type] || o.order_type;
		n.println(`SOURCE: ${f}`);
	}
	n.bold(!1), n.drawLine();
	const T = e.reduce((y, f) => {
		var s;
		const l = f.product
			? ((s = f.product.category) == null ? void 0 : s.name) || "Miscellaneous"
			: "Custom Items";
		return y[l] || (y[l] = []), y[l].push(f), y;
	}, {});
	for (const y in T) {
		n.bold(!0),
			n.underline(!0),
			n.println(`${y.toUpperCase()}:`),
			n.underline(!1),
			n.bold(!1);
		const f = T[y];
		for (const l of f) {
			n.bold(!0), n.setTextSize(1, 1);
			const s = l.product ? l.product.name : l.custom_name || "Custom Item";
			if (
				(n.println(`${l.quantity}x ${s}`),
				n.setTextNormal(),
				n.bold(!1),
				l.selected_modifiers_snapshot &&
					l.selected_modifiers_snapshot.length > 0)
			) {
				const c = l.selected_modifiers_snapshot.reduce((d, $) => {
					const m = $.modifier_set_name || "Other";
					return d[m] || (d[m] = []), d[m].push($), d;
				}, {});
				for (const [d, $] of Object.entries(c)) {
					const m = $.map((C) => {
						let S = C.option_name;
						return C.quantity > 1 && (S += ` (${C.quantity}x)`), S;
					}).join(", ");
					n.println(`   ${d} - ${m}`);
				}
			}
			l.notes && l.notes.trim() && n.println(`   NOTES: ${l.notes.trim()}`);
		}
		n.println("");
	}
	return n.cut(), n.getBuffer();
}
function oe(o) {
	return o && o.__esModule && Object.prototype.hasOwnProperty.call(o, "default")
		? o.default
		: o;
}
var L, B;
function re() {
	return (
		B ||
			((B = 1),
			(L = (function (o) {
				var r = {};
				function t(e) {
					if (r[e]) return r[e].exports;
					var n = (r[e] = { i: e, l: !1, exports: {} });
					return o[e].call(n.exports, n, n.exports, t), (n.l = !0), n.exports;
				}
				return (
					(t.m = o),
					(t.c = r),
					(t.d = function (e, n, i) {
						t.o(e, n) ||
							Object.defineProperty(e, n, { enumerable: !0, get: i });
					}),
					(t.r = function (e) {
						typeof Symbol < "u" &&
							Symbol.toStringTag &&
							Object.defineProperty(e, Symbol.toStringTag, { value: "Module" }),
							Object.defineProperty(e, "__esModule", { value: !0 });
					}),
					(t.t = function (e, n) {
						if (
							(1 & n && (e = t(e)),
							8 & n || (4 & n && typeof e == "object" && e && e.__esModule))
						)
							return e;
						var i = /* @__PURE__ */ Object.create(null);
						if (
							(t.r(i),
							Object.defineProperty(i, "default", { enumerable: !0, value: e }),
							2 & n && typeof e != "string")
						)
							for (var a in e)
								t.d(
									i,
									a,
									function (P) {
										return e[P];
									}.bind(null, a)
								);
						return i;
					}),
					(t.n = function (e) {
						var n =
							e && e.__esModule
								? function () {
										return e.default;
								  }
								: function () {
										return e;
								  };
						return t.d(n, "a", n), n;
					}),
					(t.o = function (e, n) {
						return Object.prototype.hasOwnProperty.call(e, n);
					}),
					(t.p = ""),
					t((t.s = 0))
				);
			})([
				function (o, r, t) {
					const { exec: e } = t(1),
						n = t(2).promisify(e);
					o.exports = {
						play: async (i, a = 0.5) => {
							const P = process.platform === "darwin" ? Math.min(2, 2 * a) : a,
								p =
									process.platform === "darwin"
										? ((T, u) => `afplay "${T}" -v ${u}`)(i, P)
										: ((T, u) =>
												`powershell -c Add-Type -AssemblyName presentationCore; $player = New-Object system.windows.media.mediaplayer; ${((
													v
												) => `$player.open('${v}');`)(
													T
												)} $player.Volume = ${u}; $player.Play(); Start-Sleep 1; Start-Sleep -s $player.NaturalDuration.TimeSpan.TotalSeconds;Exit;`)(
												i,
												P
										  );
							try {
								await n(p);
							} catch (T) {
								throw T;
							}
						},
					};
				},
				function (o, r) {
					o.exports = Z;
				},
				function (o, r) {
					o.exports = G;
				},
			]))),
		L
	);
}
var mainExports = requireMain();
const sound = /* @__PURE__ */ getDefaultExportFromCjs(mainExports);
const { machineIdSync: machineIdSync$1 } = nodeMachineId;
class DeviceFingerprintService {
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
		if (this._cachedFingerprint) {
			return this._cachedFingerprint;
		}
		try {
			const machineId = machineIdSync$1();
			const hostname = os.hostname();
			const combined = `${machineId}-${hostname}`;
			const hash = crypto.createHash("sha256").update(combined).digest("hex");
			const fingerprint = [
				hash.substr(0, 8),
				hash.substr(8, 4),
				hash.substr(12, 4),
				hash.substr(16, 4),
				hash.substr(20, 12),
			].join("-");
			this._cachedFingerprint = fingerprint;
			console.log("🔐 Hardware fingerprint generated:", fingerprint);
			console.log("📌 Machine ID:", machineId.substring(0, 8) + "...");
			console.log("🖥️  Hostname:", hostname);
			return fingerprint;
		} catch (error) {
			console.error("❌ Failed to generate hardware fingerprint:", error);
			throw new Error("Unable to generate device fingerprint");
		}
	}
	/**
	 * Get hardware info for debugging/support
	 *
	 * @returns {Object} Hardware and system information
	 */
	getHardwareInfo() {
		return {
			platform: os.platform(),
			arch: os.arch(),
			hostname: os.hostname(),
			release: os.release(),
			cpus: os.cpus().length,
			totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + " GB",
		};
	}
}
const deviceFingerprintService = new DeviceFingerprintService();
const { machineIdSync } = nodeMachineId;
const require2 = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = process$1.env.NODE_ENV === "development";
console.log(
	"[Main Process] Configuring hardware acceleration and display settings..."
);
w.commandLine.appendSwitch("--enable-gpu-rasterization");
w.commandLine.appendSwitch("--enable-zero-copy");
w.commandLine.appendSwitch("--disable-software-rasterizer");
le
	? (w.commandLine.appendSwitch("--ignore-certificate-errors"),
	  w.commandLine.appendSwitch("--allow-running-insecure-content"),
	  console.log("[Main Process] Development mode - debugging switches enabled"))
	: (w.commandLine.appendSwitch("--enable-features", "VizDisplayCompositor"),
	  w.commandLine.appendSwitch("--force-color-profile", "srgb"),
	  console.log(
			"[Main Process] Production mode - stable display features enabled"
	  ));
E.env.DIST = b.join(j, "../dist");
E.env.PUBLIC = w.isPackaged ? E.env.DIST : b.join(E.env.DIST, "../public");
let h,
	I,
	x = null;
const O = E.env.VITE_DEV_SERVER_URL;
function de() {
	const o = M.getPrimaryDisplay(),
		r = W.defaultSession;
	(h = new H({
		icon: b.join(E.env.PUBLIC, "logo.png"),
		x: o.bounds.x,
		y: o.bounds.y,
		fullscreen: !0,
		webPreferences: {
			session: r,
			preload: b.join(j, "../dist-electron/preload.js"),
			nodeIntegration: !1,
			contextIsolation: !0,
			enableRemoteModule: !1,
			// Production security settings
			allowRunningInsecureContent: !1,
			webSecurity: !0,
			experimentalFeatures: !1,
		},
	})),
		h.webContents.on("did-finish-load", () => {
			h == null ||
				h.webContents.send(
					"main-process-message",
					/* @__PURE__ */ new Date().toLocaleString()
				);
		}),
		O ? h.loadURL(O) : h.loadFile(b.join(E.env.DIST, "index.html")),
		h.on("closed", () => {
			(h = null), I && I.close();
		});
}
function pe() {
	const r = M.getAllDisplays().find((t) => t.id !== M.getPrimaryDisplay().id);
	if (!r) {
		console.log("No secondary display found, not creating customer window.");
		return;
	}
	(I = new H({
		icon: b.join(E.env.PUBLIC, "logo.png"),
		x: r.bounds.x,
		y: r.bounds.y,
		fullscreen: !0,
		webPreferences: {
			preload: b.join(j, "../dist-electron/preload.js"),
			nodeIntegration: !1,
			contextIsolation: !0,
			enableRemoteModule: !1,
			// Remove hardwareAcceleration override - let app-level settings handle it
		},
	})),
		O
			? I.loadURL(`${O}customer.html`)
			: I.loadFile(b.join(E.env.DIST, "customer.html")),
		I.on("closed", () => {
			I = null;
		});
}
_.on("to-customer-display", (o, { channel: r, data: t }) => {
	r === "POS_TO_CUSTOMER_STATE" && (x = t), I && I.webContents.send(r, t);
});
_.on("from-customer-display", (o, { channel: r, data: t }) => {
	h && h.webContents.send(r, t);
});
_.on("CUSTOMER_REQUESTS_STATE", (o) => {
	x && o.sender.send("POS_TO_CUSTOMER_STATE", x);
});
_.handle("play-notification-sound", async (o, r) => {
	try {
		const t = r || "notification.wav",
			e = b.join(E.env.PUBLIC, "sounds", t);
		return (
			console.log(`[IPC] Attempting to play sound: ${e}`),
			await se.play(e),
			{ success: !0 }
		);
	} catch (t) {
		return (
			console.error("[IPC] Error playing sound:", t),
			{ success: !1, error: t.message }
		);
	}
});
_.on("CUSTOMER_TO_POS_TIP", (o, r) => {
	h && h.webContents.send("CUSTOMER_TO_POS_TIP", r);
});
_.handle("discover-printers", async () => {
	console.log(
		"[Main Process] Discovering printers using node-usb (robust method)..."
	);
	try {
		const r = A.getDeviceList()
			.map((t) => {
				try {
					return t.configDescriptor &&
						t.configDescriptor.interfaces &&
						t.configDescriptor.interfaces.some((n) =>
							n.some(
								(i) => i.bInterfaceClass === 7
								// 7 is the printer class
							)
						)
						? {
								name:
									t.product ||
									`USB Device ${t.deviceDescriptor.idVendor}:${t.deviceDescriptor.idProduct}`,
								vendorId: t.deviceDescriptor.idVendor,
								productId: t.deviceDescriptor.idProduct,
						  }
						: null;
				} catch (e) {
					return console.warn(`Could not inspect device: ${e.message}`), null;
				}
			})
			.filter((t) => t !== null);
		return (
			console.log("[Main Process] Found printers:", JSON.stringify(r, null, 2)),
			r
		);
	} catch (o) {
		return console.error("[Main Process] Failed to discover printers:", o), [];
	}
});
async function V(o, r) {
	let t = null;
	try {
		const e = parseInt(o.vendorId || o.vendor_id, 10),
			n = parseInt(o.productId || o.product_id, 10);
		if (!e || !n)
			throw new Error(
				`Invalid printer object provided. Missing or invalid vendor/product ID. Got: ${JSON.stringify(
					o
				)}`
			);
		if (
			((t = A.getDeviceList().find(
				(p) =>
					p.deviceDescriptor.idVendor === e &&
					p.deviceDescriptor.idProduct === n
			)),
			!t)
		)
			throw new Error("USB Printer not found. It may be disconnected.");
		t.open();
		const a = t.interfaces[0];
		a.claim();
		const P = a.endpoints.find((p) => p.direction === "out");
		if (!P) throw new Error("Could not find an OUT endpoint on the printer.");
		await new Promise((p, T) => {
			P.transfer(r, (u) => {
				if (u) return T(u);
				p();
			});
		});
	} finally {
		if (t)
			try {
				t.interfaces[0] &&
					t.interfaces[0].isClaimed &&
					(await new Promise((e) => {
						t.interfaces[0].release(!0, () => e());
					})),
					t.close();
			} catch (e) {
				console.error("Error cleaning up USB device:", e);
			}
	}
}
_.handle(
	"print-receipt",
	async (
		o,
		{ printer: r, data: t, storeSettings: e, isTransaction: n = !1 }
	) => {
		console.log(`
--- [Main Process] Using HYBRID print method ---`),
			console.log(
				"[Main Process] Store settings:",
				e ? "provided" : "not provided",
				"isTransaction:",
				n
			);
		try {
			const i = await ee(t, e, n);
			return (
				console.log(
					`[Main Process] Receipt buffer created (size: ${i.length}). Sending...`
				),
				await V(r, i),
				console.log("[Main Process] Hybrid print command sent successfully."),
				{ success: !0 }
			);
		} catch (i) {
			return (
				console.error("[Main Process] ERROR IN HYBRID PRINT HANDLER:", i),
				{ success: !1, error: i.message }
			);
		}
	}
);
_.handle(
	"print-kitchen-ticket",
	async (o, { printer: r, order: t, zoneName: e, filterConfig: n }) => {
		console.log(
			`
--- [Main Process] KITCHEN TICKET HANDLER for zone: "${e}" ---`
		),
			console.log("Filter config:", n);
		try {
			if (
				(r == null ? void 0 : r.connection_type) !== "network" ||
				!r.ip_address
			)
				throw new Error("Invalid network printer configuration provided.");
			const i = k("node-thermal-printer"),
				{ printer: a, types: P } = i;
			let p = new a({
				type: P.EPSON,
				interface: `tcp://${r.ip_address}`,
				timeout: 5e3,
			});
			if (!(await p.isPrinterConnected()))
				throw new Error(
					`Could not connect to kitchen printer at ${r.ip_address}`
				);
			console.log(
				`Successfully connected to kitchen printer at ${r.ip_address}`
			);
			const u = ne(t, e, n);
			return u
				? (console.log(`Sending kitchen ticket buffer (size: ${u.length})`),
				  await p.raw(u),
				  console.log("Kitchen ticket sent successfully."),
				  { success: !0 })
				: (console.log(`No items to print for zone "${e}" - skipping`),
				  {
						success: !0,
						message: "No items matched filter - ticket skipped",
				  });
		} catch (i) {
			return (
				console.error(`
--- [Main Process] ERROR IN KITCHEN TICKET HANDLER ---`),
				console.error(i),
				{ success: !1, error: i.message }
			);
		}
	}
);
_.handle("test-network-printer", async (o, { ip_address: r }) => {
	console.log(
		`
--- [Main Process] TESTING NETWORK PRINTER at: ${r} ---`
	);
	try {
		if (!r) throw new Error("No IP address provided for testing.");
		const t = k("node-thermal-printer"),
			{ printer: e, types: n } = t;
		let i = new e({
			type: n.EPSON,
			interface: `tcp://${r}`,
			timeout: 3e3,
			// Shorter timeout for a quick test
		});
		if (await i.isPrinterConnected())
			return (
				console.log(`SUCCESS: Connection to ${r} is OK.`),
				i.println("Connection Test OK"),
				i.cut(),
				await i.execute(),
				{
					success: !0,
					message: `Successfully connected to ${r}. A test slip may have been printed.`,
				}
			);
		throw new Error("Connection failed. The printer did not respond.");
	} catch (t) {
		console.error(`ERROR: Could not connect to printer at ${r}.`),
			console.error(t);
		let e = t.message;
		return (
			t.message.includes("timed out")
				? (e =
						"Connection timed out. Check the IP address and ensure the printer is on the same network.")
				: t.message.includes("ECONNREFUSED") &&
				  (e =
						"Connection refused. The printer is reachable but is not accepting connections on this port."),
			{ success: !1, error: e }
		);
	}
});
_.handle("open-cash-drawer", async (o, { printerName: r }) => {
	console.log(`
--- [Main Process] Using HYBRID open-drawer method ---`);
	try {
		const e = A.getDeviceList().find(
			(a) =>
				(a.product ||
					`USB Device ${a.deviceDescriptor.idVendor}:${a.deviceDescriptor.idProduct}`) ===
				r
		);
		if (!e) throw new Error(`Printer with name "${r}" not found.`);
		const n = {
				vendorId: e.deviceDescriptor.idVendor,
				productId: e.deviceDescriptor.idProduct,
			},
			i = te();
		return (
			console.log(
				`[Main Process] Open-drawer buffer created (size: ${i.length}). Sending...`
			),
			await V(n, i),
			console.log(
				"[Main Process] Hybrid open-drawer command sent successfully."
			),
			{ success: !0 }
		);
	} catch (t) {
		return (
			console.error("[Main Process] ERROR IN HYBRID CASH DRAWER HANDLER:", t),
			{ success: !1, error: t.message }
		);
	}
});
_.handle("get-session-cookies", async (o, r) => {
	try {
		const { session: t } = k("electron"),
			e = await t.defaultSession.cookies.get({ url: r });
		console.log(`[Main Process] Found ${e.length} cookies for ${r}`),
			e.forEach((i, a) => {
				console.log(
					`[Main Process] Cookie ${a + 1}: ${i.name} (${
						i.httpOnly ? "HttpOnly" : "Regular"
					})`
				);
			});
		const n = e.map((i) => `${i.name}=${i.value}`).join("; ");
		return (
			console.log(
				n
					? `[Main Process] Cookie string created (length: ${n.length})`
					: "[Main Process] No cookies found - returning empty string"
			),
			n
		);
	} catch (t) {
		throw (
			(console.error("[Main Process] Error getting session cookies:", t), t)
		);
	}
});
ipcMain.handle("get-machine-id", () => {
	return machineIdSync({ original: true });
});
ipcMain.handle("get-device-fingerprint", () => {
	return deviceFingerprintService.getDeviceFingerprint();
});
ipcMain.on("shutdown-app", () => {
	app.quit();
});
w.whenReady().then(async () => {
	console.log("[Main Process] Starting Electron app - online-only mode"),
		console.log(
			"[Main Process] Hardware acceleration and display settings applied at startup"
		),
		de(),
		pe();
});
w.on("window-all-closed", () => {
	E.platform !== "darwin" && w.quit();
});
