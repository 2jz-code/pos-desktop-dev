import { app, BrowserWindow, session, ipcMain, screen } from "electron";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import https from "node:https";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import nodeMachineId from "node-machine-id";
const { machineIdSync } = nodeMachineId;
const require = createRequire(import.meta.url);
import usb from "usb";
import {
	formatReceipt,
	formatOpenCashDrawer,
	formatKitchenTicket,
} from "./receipt-formatter.js";
import sound from "sound-play";
// Phase 2: Offline database and network monitoring
import {
	initializeDatabase,
	getDatabase,
	closeDatabase,
	createBackup,
	vacuumDatabase,
	getDatabaseStats,
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
	getUserById,
	// Queue operations
	queueOperation,
	listPendingOperations,
	getOperationById,
	markOperationSynced,
	markOperationFailed,
	recordOfflineOrder,
	getOfflineOrder,
	updateOfflineOrderStatus,
	deleteOfflineOrder,
	listOfflineOrders,
	recordOfflinePayment,
	getOfflinePayments,
	recordOfflineApproval,
	getUnsyncedApprovals,
	getQueueStats,
	// Metadata operations
	getOfflineExposure,
	getNetworkStatus as getDBNetworkStatus,
	getSyncStatus,
	getCompleteStats,
	// Terminal pairing operations
	storePairingInfo,
	getPairingInfo,
	clearPairingInfo,
	isPaired,
} from "./offline-db/index.js";
import { getNetworkMonitor } from "./network-monitor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment-based configuration
const isDev = process.env.NODE_ENV === "development";

// Hardware acceleration and display fixes - MUST be set before app.whenReady()
console.log(
	"[Main Process] Configuring hardware acceleration and display settings..."
);

// Basic hardware acceleration fixes for better performance and vsync
app.commandLine.appendSwitch("--enable-gpu-rasterization");
app.commandLine.appendSwitch("--enable-zero-copy");
app.commandLine.appendSwitch("--disable-software-rasterizer");

// Environment-specific switches
if (!isDev) {
	// Production mode - stable and secure settings
	app.commandLine.appendSwitch("--enable-features", "VizDisplayCompositor");
	app.commandLine.appendSwitch("--force-color-profile", "srgb");
	console.log(
		"[Main Process] Production mode - stable display features enabled"
	);
} else {
	// Development mode - additional debugging and permissive settings
	app.commandLine.appendSwitch("--ignore-certificate-errors");
	app.commandLine.appendSwitch("--allow-running-insecure-content");
	console.log("[Main Process] Development mode - debugging switches enabled");
}

process.env.DIST = path.join(__dirname, "../dist");
process.env.PUBLIC = app.isPackaged
	? process.env.DIST
	: path.join(process.env.DIST, "../public");

let mainWindow;
let customerWindow;
let lastKnownState = null;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];

// Health check configuration
const HEALTH_CHECK_INTERVAL_MS = 10000; // Check every 10 seconds
const HEALTH_CHECK_TIMEOUT_MS = 5000; // Expect response within 5 seconds
let healthCheckInterval = null;
let lastPongTimestamp = Date.now();
let waitingForPong = false;
let consecutiveFailures = 0; // Track failures for graduated recovery
let lastRecoveryAttemptTime = 0;

// ============================================================================
// Terminal Park Signal (Shutdown Notification)
// ============================================================================

/**
 * Recursively sort object keys for canonical JSON serialization.
 * Matches Python's json.dumps(sort_keys=True)
 */
function sortKeysDeep(obj) {
	if (obj === null || typeof obj !== "object") {
		return obj;
	}
	if (Array.isArray(obj)) {
		return obj.map(sortKeysDeep);
	}
	return Object.keys(obj)
		.sort()
		.reduce((result, key) => {
			result[key] = sortKeysDeep(obj[key]);
			return result;
		}, {});
}

/**
 * Generate HMAC-SHA256 signature for device authentication.
 * Matches backend SignatureService.compute_signature() exactly.
 */
function generateDeviceSignature(payload, nonce, signingSecret) {
	// Serialize payload to canonical JSON (matches Python's json.dumps(sort_keys=True, separators=(',', ':')))
	const sortedPayload = sortKeysDeep(payload);
	const payloadJson = JSON.stringify(sortedPayload);

	// Create message: payload + nonce
	const message = payloadJson + nonce;

	// Compute HMAC-SHA256
	const hmac = crypto.createHmac("sha256", Buffer.from(signingSecret, "hex"));
	hmac.update(message, "utf8");
	return hmac.digest("hex");
}

/**
 * Send park signal to backend to indicate intentional shutdown.
 * This suppresses offline alerts for the terminal.
 *
 * Best-effort with short timeout - should not block app shutdown.
 */
async function sendParkSignal() {
	const PARK_TIMEOUT_MS = 3000; // 3 second timeout

	try {
		const db = getDatabase();
		if (!db || !isPaired(db)) {
			console.log("[Park] Terminal not paired, skipping park signal");
			return;
		}

		const pairingInfo = getPairingInfo(db);
		if (!pairingInfo || !pairingInfo.signing_secret) {
			console.log("[Park] No signing secret, skipping park signal");
			return;
		}

		// Build payload
		const nonce = crypto.randomUUID();
		const created_at = new Date().toISOString();
		const payload = {
			device_id: pairingInfo.terminal_id,
			nonce,
			created_at,
		};

		// Generate signature
		const signature = generateDeviceSignature(
			payload,
			nonce,
			pairingInfo.signing_secret
		);

		// Determine API URL
		// Ensure base URL ends with / so relative path appends correctly
		const apiBaseUrl =
			process.env.VITE_API_BASE_URL || "https://localhost:8001/api";
		const baseWithSlash = apiBaseUrl.endsWith("/") ? apiBaseUrl : apiBaseUrl + "/";
		const parkUrl = new URL("sync/park/", baseWithSlash);

		// Choose http or https module
		const httpModule = parkUrl.protocol === "https:" ? https : http;

		// Make request with timeout
		const requestPromise = new Promise((resolve, reject) => {
			const requestBody = JSON.stringify(payload);

			const options = {
				hostname: parkUrl.hostname,
				port: parkUrl.port || (parkUrl.protocol === "https:" ? 443 : 80),
				path: parkUrl.pathname,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(requestBody),
					"X-Device-ID": pairingInfo.terminal_id,
					"X-Device-Nonce": nonce,
					"X-Device-Signature": signature,
					"X-Client-Type": "electron-pos",
					"X-Tenant": pairingInfo.tenant_slug, // Required for tenant-scoped queries
				},
				timeout: PARK_TIMEOUT_MS,
				// Allow self-signed certs in development
				rejectUnauthorized: !isDev,
			};

			const req = httpModule.request(options, (res) => {
				let data = "";
				res.on("data", (chunk) => (data += chunk));
				res.on("end", () => {
					if (res.statusCode >= 200 && res.statusCode < 300) {
						resolve({ status: res.statusCode, data });
					} else {
						reject(new Error(`Park request failed: ${res.statusCode} ${data}`));
					}
				});
			});

			req.on("error", reject);
			req.on("timeout", () => {
				req.destroy();
				reject(new Error("Park request timed out"));
			});

			req.write(requestBody);
			req.end();
		});

		// Race against timeout
		const timeoutPromise = new Promise((_, reject) =>
			setTimeout(() => reject(new Error("Park signal timeout")), PARK_TIMEOUT_MS)
		);

		await Promise.race([requestPromise, timeoutPromise]);
		console.log("[Park] Terminal parked successfully");
	} catch (error) {
		// Best-effort - log but don't throw
		console.warn("[Park] Failed to send park signal:", error.message);
	}
}

function createMainWindow() {
	const primaryDisplay = screen.getPrimaryDisplay();
	// Use default session for proper cookie sharing with backend
	const persistentSession = session.defaultSession;

	mainWindow = new BrowserWindow({
		icon: path.join(process.env.PUBLIC, "logo.png"),
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

			experimentalFeatures: false,
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
	const displays = screen.getAllDisplays();
	const secondaryDisplay = displays.find(
		(display) => display.id !== screen.getPrimaryDisplay().id
	);

	if (!secondaryDisplay) {
		// For single-screen testing: create a smaller window on primary display
		const primaryDisplay = screen.getPrimaryDisplay();
		const { width, height } = primaryDisplay.workAreaSize;

		customerWindow = new BrowserWindow({
			icon: path.join(process.env.PUBLIC, "logo.png"),
			x: Math.floor(width * 0.25), // Centered-ish
			y: Math.floor(height * 0.1),
			width: Math.floor(width * 0.5), // Half the screen width
			height: Math.floor(height * 0.8), // 80% of screen height
			fullscreen: false,
			title: "Customer Display (Testing)",
			webPreferences: {
				preload: path.join(__dirname, "../dist-electron/preload.js"),
				nodeIntegration: false,
				contextIsolation: true,
				enableRemoteModule: false,
			},
		});
	} else {
		// Dual-screen setup: fullscreen on secondary display
		customerWindow = new BrowserWindow({
			icon: path.join(process.env.PUBLIC, "logo.png"),
			x: secondaryDisplay.bounds.x,
			y: secondaryDisplay.bounds.y,
			fullscreen: true,
			webPreferences: {
				preload: path.join(__dirname, "../dist-electron/preload.js"),
				nodeIntegration: false,
				contextIsolation: true,
				enableRemoteModule: false,
				// Remove hardwareAcceleration override - let app-level settings handle it
			},
		});
	}

	if (VITE_DEV_SERVER_URL) {
		customerWindow.loadURL(`${VITE_DEV_SERVER_URL}customer.html`);
	} else {
		customerWindow.loadFile(path.join(process.env.DIST, "customer.html"));
	}

	// Start health checks once the page is loaded
	customerWindow.webContents.on("did-finish-load", () => {
		// Give it a moment to initialize before starting health checks
		setTimeout(() => {
			startHealthCheck();
		}, 2000);
	});

	customerWindow.on("closed", () => {
		stopHealthCheck();
		customerWindow = null;
	});

	// === Customer Display Auto-Recovery ===
	// Listen for unresponsive renderer (freeze/hang)
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

	// Listen for renderer crashes (both natural crashes and forced crashes)
	customerWindow.webContents.on("render-process-gone", (event, details) => {
		console.error(
			"[Main Process] Customer display renderer crashed:",
			details.reason,
			"Exit code:",
			details.exitCode
		);

		// Stop health checks for the crashed window
		stopHealthCheck();

		// Recreate the window after a crash
		setTimeout(() => {
			recreateCustomerWindow();
		}, 1000); // Short delay before recreating
	});
}

// Helper function to recreate the customer window
function recreateCustomerWindow() {
	// Stop health checks
	stopHealthCheck();

	// Close existing window if it exists
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

	// Wait a bit before recreating
	setTimeout(() => {
		createCustomerWindow();
	}, 500);
}

// Health check system - actively ping customer display to verify it's responsive
function startHealthCheck() {
	// Clear any existing interval
	stopHealthCheck();

	// Reset state
	lastPongTimestamp = Date.now();
	waitingForPong = false;
	consecutiveFailures = 0; // Reset failure counter on fresh start

	healthCheckInterval = setInterval(() => {
		if (!customerWindow || customerWindow.isDestroyed()) {
			stopHealthCheck();
			return;
		}

		const now = Date.now();
		const timeSinceLastPong = now - lastPongTimestamp;

		// If we sent a ping and haven't received a pong within timeout
		if (waitingForPong && timeSinceLastPong > HEALTH_CHECK_TIMEOUT_MS) {
			consecutiveFailures++;
			lastRecoveryAttemptTime = now;

			console.error(
				`[Main Process] Customer display health check FAILED - no pong for ${Math.round(timeSinceLastPong / 1000)}s (failure ${consecutiveFailures})`
			);

			// Graduated recovery strategy
			if (consecutiveFailures === 1) {
				// First failure: Try graceful reload
				try {
					customerWindow.webContents.reload();
					// Reset wait state to check if reload worked
					waitingForPong = false;
					lastPongTimestamp = now;
				} catch (error) {
					console.error(
						"[Main Process] Graceful reload failed:",
						error
					);
					// Escalate immediately if reload throws an error
					consecutiveFailures = 2;
				}
			}

			if (consecutiveFailures >= 2) {
				// Second failure or reload failed: Nuclear option
				console.error(
					"[Main Process] Graceful reload failed. Forcing crash & recreate..."
				);

				// Stop health checks - we're recreating the window
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

				// Reset failure counter since we're doing a full recreate
				consecutiveFailures = 0;
			}
			return;
		}

		// Send ping
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

// Handle pong response from customer display
ipcMain.on("CUSTOMER_HEALTH_CHECK_PONG", () => {
	lastPongTimestamp = Date.now();
	waitingForPong = false;
	consecutiveFailures = 0; // Reset failure counter on successful pong
});

// === IPC Handlers for Window Communication ===

// Listen for messages FROM the main window TO the customer display
ipcMain.on("to-customer-display", (event, { channel, data }) => {
	if (channel === "POS_TO_CUSTOMER_STATE") {
		lastKnownState = data; // Cache the last known state
	}
	if (customerWindow) {
		customerWindow.webContents.send(channel, data);
	}
});

// Listen for messages FROM the customer display TO the main window
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

// === Sound Notification Handler ===
ipcMain.handle("play-notification-sound", async (event, soundFile) => {
	try {
		const soundName = soundFile || "notification.wav"; // Default sound
		const soundPath = path.join(process.env.PUBLIC, "sounds", soundName);

		console.log(`[IPC] Attempting to play sound: ${soundPath}`);
		await sound.play(soundPath);
		return { success: true };
	} catch (error) {
		console.error("[IPC] Error playing sound:", error);
		return { success: false, error: error.message };
	}
});

// This is now legacy and should be removed, but we'll keep it for now
// to avoid breaking anything that might still be using it directly.
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
		const printers = devices
			.map((device) => {
				try {
					// Check device and configuration descriptors without opening the device
					if (device.configDescriptor && device.configDescriptor.interfaces) {
						const isPrinter = device.configDescriptor.interfaces.some(
							(iface) => {
								return iface.some(
									(alt) => alt.bInterfaceClass === 7 // 7 is the printer class
								);
							}
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
				} catch (e) {
					// This might happen if descriptors are not accessible, but it's less common.
					console.warn(`Could not inspect device: ${e.message}`);
					return null;
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

ipcMain.handle("test-network-printer", async (event, { ip_address }) => {
	console.log(
		`\n--- [Main Process] TESTING NETWORK PRINTER at: ${ip_address} ---`
	);
	try {
		if (!ip_address) {
			throw new Error("No IP address provided for testing.");
		}

		const thermalPrinter = require("node-thermal-printer");
		const { printer: ThermalPrinter, types: PrinterTypes } = thermalPrinter;

		let printerInstance = new ThermalPrinter({
			type: PrinterTypes.EPSON,
			interface: `tcp://${ip_address}`,
			timeout: 3000, // Shorter timeout for a quick test
		});

		const isConnected = await printerInstance.isPrinterConnected();

		if (isConnected) {
			console.log(`SUCCESS: Connection to ${ip_address} is OK.`);
			// Optional: print a tiny test message
			printerInstance.println("Connection Test OK");
			printerInstance.cut();
			await printerInstance.execute();
			return {
				success: true,
				message: `Successfully connected to ${ip_address}. A test slip may have been printed.`,
			};
		} else {
			// This else block might not be hit if isPrinterConnected throws on failure.
			// It's here for logical completeness.
			throw new Error("Connection failed. The printer did not respond.");
		}
	} catch (error) {
		console.error(`ERROR: Could not connect to printer at ${ip_address}.`);
		console.error(error);
		// Provide a more user-friendly error message
		let errorMessage = error.message;
		if (error.message.includes("timed out")) {
			errorMessage =
				"Connection timed out. Check the IP address and ensure the printer is on the same network.";
		} else if (error.message.includes("ECONNREFUSED")) {
			errorMessage =
				"Connection refused. The printer is reachable but is not accepting connections on this port.";
		}
		return { success: false, error: errorMessage };
	}
});

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

// === Phase 2: Offline Database IPC Handlers ===

// Helper to check if database is available
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

// Dataset caching handler
ipcMain.handle("offline:cache-dataset", async (event, datasetName, rows, version) => {
	try {
		// Guard: Ensure version is provided (NOT NULL constraint on datasets.version)
		if (!version) {
			console.error(`[Offline] Cannot cache dataset '${datasetName}' - version is missing`);
			return { success: false, error: 'Dataset version is required' };
		}

		// Check database availability
		const dbCheck = checkDatabaseAvailable();
		if (!dbCheck.available) {
			return { success: false, error: dbCheck.error };
		}

		const db = getDatabase();

		// Get terminal's pairing info to inject tenant_id and location_id
		const pairingInfo = getPairingInfo(db);

		// Handle settings dataset specially (it's an object, not an array)
		if (datasetName === "settings") {
			upsertSettings(db, rows);
			// For settings, we always count it as 1 record
			updateDatasetVersion(db, datasetName, version, 1, 0);
			return { success: true };
		}

		// Validate rows is an array
		if (!Array.isArray(rows)) {
			throw new Error(`Dataset ${datasetName} must be an array, got ${typeof rows}`);
		}

		// Inject tenant_id and location_id from pairing info into each row
		// This ensures all cached records have proper tenant/location context
		let processedRows = rows;
		if (pairingInfo) {
			processedRows = rows.map(row => ({
				...row,
				tenant_id: row.tenant_id || pairingInfo.tenant_id,
				store_location_id: row.store_location_id || pairingInfo.location_id
			}));
		}

		// Process the dataset
		const recordCount = processedRows.length;

		switch (datasetName) {
			case "products":
				upsertProducts(db, processedRows);
				break;
			case "categories":
				upsertCategories(db, processedRows);
				break;
			case "modifier_sets":
				upsertModifierSets(db, processedRows);
				break;
			case "discounts":
				upsertDiscounts(db, processedRows);
				break;
			case "taxes":
				upsertTaxes(db, processedRows);
				break;
			case "product_types":
				upsertProductTypes(db, processedRows);
				break;
			case "inventory_stocks":
				upsertInventoryStocks(db, processedRows);
				break;
			case "inventory_locations":
				upsertInventoryLocations(db, processedRows);
				break;
			case "users":
				upsertUsers(db, processedRows);
				break;
			default:
				throw new Error(`Unknown dataset: ${datasetName}`);
		}

		// Update dataset version
		updateDatasetVersion(db, datasetName, version, recordCount, 0);

		return { success: true };
	} catch (error) {
		console.error(`[Offline DB] Error caching dataset ${datasetName}:`, error);
		return { success: false, error: error.message };
	}
});

// Delete records handler (for soft-delete sync)
ipcMain.handle("offline:delete-records", async (event, tableName, deletedIds) => {
	try {
		if (!deletedIds || deletedIds.length === 0) {
			return { success: true };
		}

		const dbCheck = checkDatabaseAvailable();
		if (!dbCheck.available) {
			return { success: false, error: dbCheck.error };
		}

		const db = getDatabase();
		deleteRecords(db, tableName, deletedIds);

		console.log(`[Offline DB] Deleted ${deletedIds.length} records from ${tableName}`);
		return { success: true };
	} catch (error) {
		console.error(`[Offline DB] Error deleting records from ${tableName}:`, error);
		return { success: false, error: error.message };
	}
});

// Get cached data handlers
ipcMain.handle("offline:get-cached-products", async (event, filters = {}) => {
	try {
		const db = getDatabase();
		return getProducts(db, filters);
	} catch (error) {
		console.error("[Offline DB] Error getting cached products:", error);
		throw error;
	}
});

ipcMain.handle("offline:get-cached-categories", async () => {
	try {
		const db = getDatabase();
		return getCategories(db);
	} catch (error) {
		console.error("[Offline DB] Error getting cached categories:", error);
		throw error;
	}
});

ipcMain.handle("offline:get-cached-discounts", async (event, options = {}) => {
	try {
		const db = getDatabase();
		return getDiscounts(db, options);
	} catch (error) {
		console.error("[Offline DB] Error getting cached discounts:", error);
		throw error;
	}
});

ipcMain.handle("offline:get-cached-modifier-sets", async () => {
	try {
		const db = getDatabase();
		return getModifierSets(db);
	} catch (error) {
		console.error("[Offline DB] Error getting cached modifier sets:", error);
		throw error;
	}
});

ipcMain.handle("offline:get-cached-taxes", async () => {
	try {
		const db = getDatabase();
		return getTaxes(db);
	} catch (error) {
		console.error("[Offline DB] Error getting cached taxes:", error);
		throw error;
	}
});

ipcMain.handle("offline:get-cached-product-types", async () => {
	try {
		const db = getDatabase();
		return getProductTypes(db);
	} catch (error) {
		console.error("[Offline DB] Error getting cached product types:", error);
		throw error;
	}
});

ipcMain.handle("offline:get-cached-inventory", async () => {
	try {
		const db = getDatabase();
		return getInventoryStocks(db);
	} catch (error) {
		console.error("[Offline DB] Error getting cached inventory:", error);
		throw error;
	}
});

ipcMain.handle("offline:get-cached-inventory-locations", async () => {
	try {
		const db = getDatabase();
		return getInventoryLocations(db);
	} catch (error) {
		console.error("[Offline DB] Error getting cached inventory locations:", error);
		throw error;
	}
});

ipcMain.handle("offline:get-cached-settings", async () => {
	try {
		const db = getDatabase();
		return getSettings(db);
	} catch (error) {
		console.error("[Offline DB] Error getting cached settings:", error);
		throw error;
	}
});

ipcMain.handle("offline:get-cached-users", async (event, options = {}) => {
	try {
		const db = getDatabase();
		return getUsers(db, options);
	} catch (error) {
		console.error("[Offline DB] Error getting cached users:", error);
		throw error;
	}
});

// Offline authentication - verify PIN against cached user credentials
ipcMain.handle("offline:authenticate", async (event, { username, pin }) => {
	try {
		const db = getDatabase();
		const { authenticateOffline } = await import("./offline-db/auth.js");
		const { getUserByUsername } = await import("./offline-db/datasets.js");
		return authenticateOffline(db, username, pin, getUserByUsername);
	} catch (error) {
		console.error("[Offline Auth] Authentication error:", error);
		return {
			success: false,
			error: "Authentication system error"
		};
	}
});

// Developer tool: Clear offline cache tables
ipcMain.handle("offline:clear-cache", async () => {
	try {
		const db = getDatabase();

		console.log("[Offline DB] Clearing all cache tables...");

		// Clear all dataset tables
		db.exec(`
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

// Get specific records
ipcMain.handle("offline:get-product-by-id", async (event, productId) => {
	try {
		const db = getDatabase();
		return getProductById(db, productId);
	} catch (error) {
		console.error("[Offline DB] Error getting product by ID:", error);
		throw error;
	}
});

ipcMain.handle("offline:get-product-by-barcode", async (event, barcode) => {
	try {
		const db = getDatabase();
		return getProductByBarcode(db, barcode);
	} catch (error) {
		console.error("[Offline DB] Error getting product by barcode:", error);
		throw error;
	}
});

ipcMain.handle("offline:get-user-by-id", async (event, userId) => {
	try {
		const db = getDatabase();
		return getUserById(db, userId);
	} catch (error) {
		console.error("[Offline DB] Error getting user by ID:", error);
		throw error;
	}
});

ipcMain.handle("offline:get-inventory-by-product", async (event, productId) => {
	try {
		const db = getDatabase();
		return getInventoryByProductId(db, productId);
	} catch (error) {
		console.error("[Offline DB] Error getting inventory by product:", error);
		throw error;
	}
});

// Dataset version handler
ipcMain.handle("offline:get-dataset-version", async (event, datasetName) => {
	try {
		const db = getDatabase();
		return getDatasetVersion(db, datasetName);
	} catch (error) {
		console.error("[Offline DB] Error getting dataset version:", error);
		throw error;
	}
});

// Get all dataset versions (for loading on startup)
ipcMain.handle("offline:get-all-dataset-versions", async () => {
	try {
		const db = getDatabase();
		const stmt = db.prepare('SELECT key, version, synced_at FROM datasets');
		return stmt.all();
	} catch (error) {
		console.error("[Offline DB] Error getting all dataset versions:", error);
		return [];
	}
});

// Queue operations
ipcMain.handle("offline:queue-operation", async (event, operation) => {
	try {
		const db = getDatabase();
		return queueOperation(db, operation);
	} catch (error) {
		console.error("[Offline DB] Error queueing operation:", error);
		throw error;
	}
});

ipcMain.handle("offline:list-pending", async (event, filters) => {
	try {
		const db = getDatabase();
		return listPendingOperations(db, filters);
	} catch (error) {
		console.error("[Offline DB] Error listing pending operations:", error);
		throw error;
	}
});

ipcMain.handle("offline:mark-synced", async (event, operationId, serverResponse) => {
	try {
		const db = getDatabase();
		return markOperationSynced(db, operationId, serverResponse);
	} catch (error) {
		console.error("[Offline DB] Error marking operation as synced:", error);
		throw error;
	}
});

ipcMain.handle("offline:mark-failed", async (event, operationId, errorMessage) => {
	try {
		const db = getDatabase();
		return markOperationFailed(db, operationId, errorMessage);
	} catch (error) {
		console.error("[Offline DB] Error marking operation as failed:", error);
		throw error;
	}
});

// Offline orders
ipcMain.handle("offline:record-order", async (event, orderPayload) => {
	try {
		const db = getDatabase();
		return recordOfflineOrder(db, orderPayload);
	} catch (error) {
		console.error("[Offline DB] Error recording offline order:", error);
		throw error;
	}
});

ipcMain.handle("offline:get-order", async (event, localOrderId) => {
	try {
		const db = getDatabase();
		return getOfflineOrder(db, localOrderId);
	} catch (error) {
		console.error("[Offline DB] Error getting offline order:", error);
		throw error;
	}
});

ipcMain.handle("offline:list-orders", async (event, status) => {
	try {
		const db = getDatabase();
		return listOfflineOrders(db, status);
	} catch (error) {
		console.error("[Offline DB] Error listing offline orders:", error);
		throw error;
	}
});

ipcMain.handle("offline:update-order-status", async (event, localOrderId, status, serverData) => {
	try {
		const db = getDatabase();
		return updateOfflineOrderStatus(db, localOrderId, status, serverData);
	} catch (error) {
		console.error("[Offline DB] Error updating order status:", error);
		throw error;
	}
});

ipcMain.handle("offline:delete-order", async (event, localOrderId) => {
	try {
		const db = getDatabase();
		return deleteOfflineOrder(db, localOrderId);
	} catch (error) {
		console.error("[Offline DB] Error deleting offline order:", error);
		throw error;
	}
});

// Offline payments
ipcMain.handle("offline:record-payment", async (event, paymentData) => {
	try {
		const db = getDatabase();
		return recordOfflinePayment(db, paymentData);
	} catch (error) {
		console.error("[Offline DB] Error recording offline payment:", error);
		throw error;
	}
});

ipcMain.handle("offline:get-payments", async (event, localOrderId) => {
	try {
		const db = getDatabase();
		return getOfflinePayments(db, localOrderId);
	} catch (error) {
		console.error("[Offline DB] Error getting offline payments:", error);
		throw error;
	}
});

// Offline approvals
ipcMain.handle("offline:record-approval", async (event, approvalData) => {
	try {
		const db = getDatabase();
		return recordOfflineApproval(db, approvalData);
	} catch (error) {
		console.error("[Offline DB] Error recording offline approval:", error);
		throw error;
	}
});

ipcMain.handle("offline:get-unsynced-approvals", async () => {
	try {
		const db = getDatabase();
		return getUnsyncedApprovals(db);
	} catch (error) {
		console.error("[Offline DB] Error getting unsynced approvals:", error);
		throw error;
	}
});

// Metadata & stats
ipcMain.handle("offline:get-queue-stats", async () => {
	try {
		const db = getDatabase();
		return getQueueStats(db);
	} catch (error) {
		console.error("[Offline DB] Error getting queue stats:", error);
		throw error;
	}
});

ipcMain.handle("offline:clear-all-pending", async () => {
	try {
		const db = getDatabase();
		const { clearAllPendingData } = await import("./offline-db/index.js");
		const result = clearAllPendingData(db);
		console.log("[Offline DB] Cleared all pending data:", result);
		return result;
	} catch (error) {
		console.error("[Offline DB] Error clearing pending data:", error);
		throw error;
	}
});

ipcMain.handle("offline:get-exposure", async () => {
	try {
		const db = getDatabase();
		return getOfflineExposure(db);
	} catch (error) {
		console.error("[Offline DB] Error getting offline exposure:", error);
		throw error;
	}
});

ipcMain.handle("offline:get-network-status", async () => {
	try {
		const db = getDatabase();
		return getDBNetworkStatus(db);
	} catch (error) {
		console.error("[Offline DB] Error getting network status:", error);
		throw error;
	}
});

ipcMain.handle("offline:get-sync-status", async () => {
	try {
		const db = getDatabase();
		return getSyncStatus(db);
	} catch (error) {
		console.error("[Offline DB] Error getting sync status:", error);
		throw error;
	}
});

ipcMain.handle("offline:get-complete-stats", async () => {
	try {
		const db = getDatabase();
		return getCompleteStats(db);
	} catch (error) {
		console.error("[Offline DB] Error getting complete stats:", error);
		throw error;
	}
});

// Offline spending limits removed - no limits enforced per product decision

// Database operations
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

// === Terminal Pairing Handlers ===

// Store terminal pairing info (called after successful registration)
ipcMain.handle("offline:store-pairing", async (event, pairingInfo) => {
	try {
		const db = getDatabase();
		storePairingInfo(db, pairingInfo);
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

// Get terminal pairing info
ipcMain.handle("offline:get-pairing", async () => {
	try {
		const db = getDatabase();
		return getPairingInfo(db);
	} catch (error) {
		console.error("[Offline DB] Error getting pairing info:", error);
		throw error;
	}
});

// Check if terminal is paired
ipcMain.handle("offline:is-paired", async () => {
	try {
		const db = getDatabase();
		return isPaired(db);
	} catch (error) {
		console.error("[Offline DB] Error checking pairing status:", error);
		return false;
	}
});

// Clear terminal pairing (unpair/reset)
ipcMain.handle("offline:clear-pairing", async () => {
	try {
		const db = getDatabase();
		clearPairingInfo(db);
		console.log("[Offline DB] Terminal pairing info cleared");
		return { success: true };
	} catch (error) {
		console.error("[Offline DB] Error clearing pairing info:", error);
		return { success: false, error: error.message };
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

// IPC handler for getting the unique machine ID
ipcMain.handle("get-machine-id", () => {
	return machineIdSync({ original: true });
});

// IPC handler for getting device fingerprint (hardware-based terminal identity)
ipcMain.handle("get-device-fingerprint", () => {
	// Use machine ID as device fingerprint for terminal registration
	return machineIdSync({ original: true });
});

// Track if we've already sent the park signal to prevent double-sending
let parkSignalSent = false;

ipcMain.on("shutdown-app", async () => {
	// Send park signal before quitting
	if (!parkSignalSent) {
		parkSignalSent = true;
		console.log("[Main Process] Shutdown requested, sending park signal...");
		await sendParkSignal();
	}
	app.quit();
});

app.whenReady().then(async () => {
	console.log("[Main Process] Starting Electron app with Phase 2 offline support");
	console.log(
		"[Main Process] Hardware acceleration and display settings applied at startup"
	);

	// Initialize offline database
	try {
		initializeDatabase({ verbose: false });
		console.log("[Main Process] Offline database initialized successfully");

		// Check if terminal is paired
		const db = getDatabase();
		if (isPaired(db)) {
			const pairingInfo = getPairingInfo(db);
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

		// You might want to show a dialog to the user here
		// dialog.showErrorBox('Database Error', 'Failed to initialize offline database. Offline features will be unavailable.');
	}

	// Start network monitor
	try {
		// Note: VITE_API_BASE_URL is not available in main process, use hardcoded dev URL
		const backendUrl = process.env.VITE_API_BASE_URL || "https://localhost:8001/api";
		const networkMonitor = getNetworkMonitor();
		networkMonitor.start(backendUrl);
		console.log(`[Main Process] Network monitor started (checking ${backendUrl})`);

		// Listen for network status changes and broadcast to all windows
		networkMonitor.on("status-changed", (status) => {
			console.log(
				`[Main Process] Network status changed: ${
					status.is_online ? "ONLINE" : "OFFLINE"
				}`
			);

			// Emit to all renderer windows
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
	if (process.platform !== "darwin") {
		app.quit();
	}
});

// Cleanup on app quit
app.on("before-quit", async (event) => {
	console.log("[Main Process] Application shutting down...");

	// Send park signal if not already sent (handles Alt+F4, window X button, etc.)
	if (!parkSignalSent) {
		parkSignalSent = true;
		event.preventDefault(); // Delay quit until park signal is sent

		console.log("[Main Process] Sending park signal before quit...");
		await sendParkSignal();

		// Now actually quit
		app.quit();
		return;
	}

	// Stop network monitor
	try {
		const networkMonitor = getNetworkMonitor();
		networkMonitor.stop();
		console.log("[Main Process] Network monitor stopped");
	} catch (error) {
		console.error("[Main Process] Error stopping network monitor:", error);
	}

	// Close database
	try {
		closeDatabase();
		console.log("[Main Process] Offline database closed");
	} catch (error) {
		console.error("[Main Process] Error closing database:", error);
	}
});
