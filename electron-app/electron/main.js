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
import { databaseService } from "./services/database-service.js";
import {
	productRepository,
	categoryRepository,
	userRepository,
	discountRepository,
	offlineOrderRepository,
} from "./services/repositories.js";
import SyncService from "./services/sync-service.js";
const syncService = new SyncService();

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
		// --- FIX: Check for vendor_id and product_id (snake_case) ---
		if (!printer || !printer.vendor_id || !printer.product_id) {
			throw new Error("Invalid printer object provided.");
		}

		const devices = usb.getDeviceList();
		// --- FIX: Use the correct snake_case properties to find the device ---
		device = devices.find(
			(d) =>
				d.deviceDescriptor.idVendor == printer.vendor_id &&
				d.deviceDescriptor.idProduct == printer.product_id
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
				if (device.interfaces[0] && device.interfaces[0].isClaimed()) {
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
			const buffer = formatReceipt(data, storeSettings);
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
	async (event, { printer, order, zoneName }) => {
		console.log(
			`\n--- [Main Process] KITCHEN TICKET HANDLER for zone: "${zoneName}" ---`
		);
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

			// --- FIX: Pass the zoneName to the formatter function ---
			const buffer = formatKitchenTicket(order, zoneName);
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
			vendor_id: foundDevice.deviceDescriptor.idVendor,
			product_id: foundDevice.deviceDescriptor.idProduct,
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

// Database IPC handlers
ipcMain.handle("db:get-products", async () => {
	try {
		return productRepository.getAll();
	} catch (error) {
		console.error("[Main Process] Error getting products:", error);
		throw error;
	}
});

ipcMain.handle("db:get-product-by-id", async (event, id) => {
	try {
		return productRepository.getById(id);
	} catch (error) {
		console.error("[Main Process] Error getting product by id:", error);
		throw error;
	}
});

ipcMain.handle("db:get-products-by-category", async (event, categoryId) => {
	try {
		return productRepository.getByCategory(categoryId);
	} catch (error) {
		console.error("[Main Process] Error getting products by category:", error);
		throw error;
	}
});

ipcMain.handle("db:search-products", async (event, searchTerm) => {
	try {
		return productRepository.searchByName(searchTerm);
	} catch (error) {
		console.error("[Main Process] Error searching products:", error);
		throw error;
	}
});

ipcMain.handle("db:get-categories", async () => {
	try {
		return categoryRepository.getCategoriesWithProductCount();
	} catch (error) {
		console.error("[Main Process] Error getting categories:", error);
		throw error;
	}
});

ipcMain.handle("db:get-users", async () => {
	try {
		return userRepository.getAll();
	} catch (error) {
		console.error("[Main Process] Error getting users:", error);
		throw error;
	}
});

ipcMain.handle("db:get-user-by-username", async (event, username) => {
	try {
		return userRepository.getByUsername(username);
	} catch (error) {
		console.error("[Main Process] Error getting user by username:", error);
		throw error;
	}
});

ipcMain.handle("db:get-discounts", async () => {
	try {
		return discountRepository.getActiveDiscounts();
	} catch (error) {
		console.error("[Main Process] Error getting discounts:", error);
		throw error;
	}
});

ipcMain.handle("db:add-offline-order", async (event, orderData) => {
	try {
		return offlineOrderRepository.addToQueue(orderData);
	} catch (error) {
		console.error("[Main Process] Error adding offline order:", error);
		throw error;
	}
});

ipcMain.handle("db:get-pending-orders", async () => {
	try {
		return offlineOrderRepository.getPendingOrders();
	} catch (error) {
		console.error("[Main Process] Error getting pending orders:", error);
		throw error;
	}
});

ipcMain.handle("db:get-queue-status", async () => {
	try {
		return offlineOrderRepository.getQueueStatus();
	} catch (error) {
		console.error("[Main Process] Error getting queue status:", error);
		throw error;
	}
});

ipcMain.handle("db:reset", async () => {
	try {
		await databaseService.resetDatabase();
		return { success: true };
	} catch (error) {
		console.error("[Main Process] Error resetting database:", error);
		throw error;
	}
});

ipcMain.handle("db:get-settings", async () => {
	try {
		const db = databaseService.getDatabase();
		const stmt = db.prepare("SELECT value FROM sync_metadata WHERE key = ?");
		const result = stmt.get("user_settings");
		return result?.value ? JSON.parse(result.value) : null;
	} catch (error) {
		console.error("[Main Process] Error getting settings:", error);
		throw error;
	}
});

ipcMain.handle("db:save-settings", async (event, settings) => {
	try {
		const db = databaseService.getDatabase();
		const stmt = db.prepare(`
			INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) 
			VALUES (?, ?, CURRENT_TIMESTAMP)
		`);
		stmt.run("user_settings", JSON.stringify(settings));

		// Update services with new settings
		if (
			settings.backupIntervalMinutes ||
			settings.autoBackupEnabled !== undefined ||
			settings.maxBackupsToKeep
		) {
			await databaseService.updateBackupConfig({
				backupIntervalMinutes: settings.backupIntervalMinutes,
				autoBackupEnabled: settings.autoBackupEnabled,
				maxBackupsToKeep: settings.maxBackupsToKeep,
			});
		}

		return { success: true };
	} catch (error) {
		console.error("[Main Process] Error saving settings:", error);
		throw error;
	}
});

ipcMain.handle("db:restore-from-backup", async () => {
	try {
		const restored = await databaseService.restoreFromBackup();
		return { success: restored };
	} catch (error) {
		console.error("[Main Process] Error restoring from backup:", error);
		throw error;
	}
});

// Sync service IPC handlers
ipcMain.handle("sync:get-status", async () => {
	try {
		return syncService.getSyncStatus();
	} catch (error) {
		console.error("[Main Process] Error getting sync status:", error);
		throw error;
	}
});

ipcMain.handle("sync:insert-sample-data", async () => {
	try {
		return await syncService.insertSampleData();
	} catch (error) {
		console.error("[Main Process] Error inserting sample data:", error);
		throw error;
	}
});

ipcMain.handle("sync:perform-initial-sync", async () => {
	try {
		return await syncService.performInitialSync();
	} catch (error) {
		console.error("[Main Process] Error performing initial sync:", error);
		throw error;
	}
});

ipcMain.handle("sync:perform-delta-sync", async () => {
	try {
		return await syncService.performDeltaSync();
	} catch (error) {
		console.error("[Main Process] Error performing delta sync:", error);
		throw error;
	}
});

ipcMain.handle("sync:check-online-status", async () => {
	try {
		return await syncService.checkOnlineStatus();
	} catch (error) {
		console.error("[Main Process] Error checking online status:", error);
		throw error;
	}
});

ipcMain.handle("sync:set-api-key", async (event, apiKey) => {
	try {
		syncService.setAPIKey(apiKey);
		return { success: true };
	} catch (error) {
		console.error("[Main Process] Error setting API key:", error);
		throw error;
	}
});

ipcMain.handle("sync:clear-api-key", async () => {
	try {
		await syncService.clearAPIKey();
		return { success: true };
	} catch (error) {
		console.error("[Main Process] Error clearing API key:", error);
		throw error;
	}
});

ipcMain.handle("sync:set-interval", async (event, minutes) => {
	try {
		await syncService.setSyncInterval(minutes);
		return { success: true };
	} catch (error) {
		console.error("[Main Process] Error setting sync interval:", error);
		throw error;
	}
});

ipcMain.handle("sync:set-auto-sync", async (event, enabled) => {
	try {
		await syncService.setAutoSyncEnabled(enabled);
		return { success: true };
	} catch (error) {
		console.error("[Main Process] Error setting auto-sync:", error);
		throw error;
	}
});

ipcMain.handle("sync:start-periodic", async () => {
	try {
		syncService.startPeriodicSync();
		return { success: true };
	} catch (error) {
		console.error("[Main Process] Error starting periodic sync:", error);
		throw error;
	}
});

ipcMain.handle("sync:stop-periodic", async () => {
	try {
		syncService.stopPeriodicSync();
		return { success: true };
	} catch (error) {
		console.error("[Main Process] Error stopping periodic sync:", error);
		throw error;
	}
});

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
	// Initialize database first
	try {
		await databaseService.initialize();
		console.log("[Main Process] Database initialized successfully");
	} catch (error) {
		console.error("[Main Process] Failed to initialize database:", error);
		// Don't fail the app startup, just log the error
		console.error("Stack trace:", error.stack);
	}

	// Initialize sync service
	try {
		await syncService.initialize();
		console.log("[Main Process] Sync service initialized successfully");

		// Check if we have data, if not, insert sample data for demo
		const status = await syncService.getSyncStatus();
		if (!status.hasData) {
			console.log(
				"[Main Process] No local data found, inserting sample data..."
			);
			await syncService.insertSampleData();
		}
	} catch (error) {
		console.error("[Main Process] Failed to initialize sync service:", error);
		console.error("Stack trace:", error.stack);
	}

	createMainWindow();
	createCustomerWindow();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
