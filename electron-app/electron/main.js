import { app, BrowserWindow, session, ipcMain } from "electron";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import usb from "usb";
import {
	formatReceipt,
	formatOpenCashDrawer,
	formatKitchenTicket,
} from "./receipt-formatter.js";
// Offline services removed - moving to online-only architecture

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.DIST = path.join(__dirname, "../dist");
process.env.PUBLIC = app.isPackaged
	? process.env.DIST
	: path.join(process.env.DIST, "../public");

let mainWindow;
let customerWindow;
let lastKnownState = null;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];

function createMainWindow() {
	const persistentSession = session.fromPartition("persist:electron-app");

	mainWindow = new BrowserWindow({
		icon: path.join(process.env.PUBLIC, "electron-vite.svg"),
		webPreferences: {
			session: persistentSession,
			preload: path.join(__dirname, "preload.js"),
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	mainWindow.webContents.on("did-finish-load", () => {
		mainWindow?.webContents.send(
			"main-process-message",
			new Date().toLocaleString()
		);
	});

	if (VITE_DEV_SERVER_URL) {
		mainWindow.loadURL(VITE_DEV_SERVER_URL);
	} else {
		mainWindow.loadFile(path.join(process.env.DIST, "index.html"));
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
			preload: path.join(__dirname, "preload.js"),
		},
	});

	if (VITE_DEV_SERVER_URL) {
		customerWindow.loadURL(`${VITE_DEV_SERVER_URL}customer.html`);
	} else {
		customerWindow.loadFile(path.join(process.env.DIST, "customer.html"));
	}

	customerWindow.on("closed", () => {
		customerWindow = null;
	});
}

ipcMain.on("POS_TO_CUSTOMER_STATE", (event, state) => {
	lastKnownState = state;
	if (customerWindow) {
		customerWindow.webContents.send("POS_TO_CUSTOMER_STATE", state);
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
	console.log("[Main Process] Discovering printers using node-usb...");
	try {
		const devices = usb.getDeviceList();
		const printers = devices
			.map((device) => {
				let deviceIsOpen = false;
				try {
					device.open();
					deviceIsOpen = true;
					if (device.interfaces && device.interfaces.length > 0) {
						const isPrinter = device.interfaces.some(
							(iface) => iface.descriptor.bInterfaceClass === 7
						);
						if (isPrinter) {
							return {
								name:
									device.product ||
									`USB Device ${device.deviceDescriptor.idVendor}:${device.deviceDescriptor.idProduct}`,
								vendorId: device.deviceDescriptor.idVendor,
								productId: device.deviceDescriptor.idProduct,
							};
						}
					}
					return null;
				} catch {
					return null;
				} finally {
					if (deviceIsOpen) {
						try {
							device.close();
						} catch {
							// Ignore close errors
						}
					}
				}
			})
			.filter((p) => p !== null);

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
		// --- FIX: Robustly get vendor and product IDs, handling both camelCase and snake_case ---
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
		// --- FIX: Use the parsed numeric IDs to find the device ---
		device = devices.find(
			(d) =>
				d.deviceDescriptor.idVendor === vendorId &&
				d.deviceDescriptor.idProduct === productId
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
			`\n--- [Main Process] KITCHEN TICKET HANDLER for zone: "${zoneName}" ---`
		);
		console.log(`Filter config:`, filterConfig);

		try {
			if (printer?.connection_type !== "network" || !printer.ip_address) {
				throw new Error("Invalid network printer configuration provided.");
			}

			const thermalPrinter = require("node-thermal-printer");
			const { printer: ThermalPrinter, types: PrinterTypes } = thermalPrinter;

			let printerInstance = new ThermalPrinter({
				type: PrinterTypes.EPSON,
				interface: `tcp://${printer.ip_address}`,
				timeout: 5000,
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

			// Pass the filtering configuration to the formatter
			const buffer = formatKitchenTicket(order, zoneName, filterConfig);

			// If buffer is null, it means no items matched the filter
			if (!buffer) {
				console.log(`No items to print for zone "${zoneName}" - skipping`);
				return {
					success: true,
					message: "No items matched filter - ticket skipped",
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

ipcMain.handle("open-cash-drawer", async (event, { printerName }) => {
	console.log("\n--- [Main Process] Using HYBRID open-drawer method ---");
	try {
		const devices = usb.getDeviceList();
		const foundDevice = devices.find(
			(d) =>
				(d.product ||
					`USB Device ${d.deviceDescriptor.idVendor}:${d.deviceDescriptor.idProduct}`) ===
				printerName
		);

		if (!foundDevice) {
			throw new Error(`Printer with name "${printerName}" not found.`);
		}

		const printer = {
			vendorId: foundDevice.deviceDescriptor.idVendor,
			productId: foundDevice.deviceDescriptor.idProduct,
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

// Database IPC handlers removed - moving to online-only architecture

// Sync service IPC handlers removed - moving to online-only architecture

ipcMain.handle("get-session-cookies", async (event, url) => {
	try {
		const { session } = require("electron");
		const cookies = await session.defaultSession.cookies.get({ url });

		console.log(`[Main Process] Found ${cookies.length} cookies for ${url}`);

		// Log individual cookies for debugging (without sensitive values)
		cookies.forEach((cookie, index) => {
			console.log(
				`[Main Process] Cookie ${index + 1}: ${cookie.name} (${
					cookie.httpOnly ? "HttpOnly" : "Regular"
				})`
			);
		});

		// Convert cookies to the format needed by axios
		const cookieString = cookies
			.map((cookie) => `${cookie.name}=${cookie.value}`)
			.join("; ");

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

app.whenReady().then(async () => {
	console.log("[Main Process] Starting Electron app - online-only mode");
	createMainWindow();
	createCustomerWindow();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
