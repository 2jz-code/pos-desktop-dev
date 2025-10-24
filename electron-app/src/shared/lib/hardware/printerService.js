import apiClient from "@/shared/lib/apiClient";
import { useSettingsStore } from "@/domains/settings/store/settingsStore";
import terminalRegistrationService from "@/services/TerminalRegistrationService";

const { hardwareApi } = window;

export const discoverPrinters = () => {
	return hardwareApi.invoke("discover-printers");
};

export const printReceipt = (printer, data, storeSettings = null, isTransaction = false) => {
	console.log(
		"[printerService] Invoking 'print-receipt' in main process with printer:",
		printer,
		"and store settings:",
		storeSettings ? "provided" : "not provided",
		"isTransaction:",
		isTransaction
	);
	return hardwareApi.invoke("print-receipt", { printer, data, storeSettings, isTransaction });
};

// --- UPDATE THIS FUNCTION ---
export const printKitchenTicket = (
	printer,
	order,
	zoneName,
	filterConfig = null
) => {
	console.log(
		`[printerService] Invoking 'print-kitchen-ticket' for zone: ${zoneName}`,
		order,
		`Filter config:`,
		filterConfig
	);
	// Pass the zoneName and filterConfig along with the printer and order data
	return hardwareApi.invoke("print-kitchen-ticket", {
		printer,
		order,
		zoneName,
		filterConfig,
	});
};

// === NEW: Cloud-based printer configuration management ===

/**
 * Fetch printer configuration for the terminal's location.
 * Uses new relational endpoints: /settings/printers/ and /settings/kitchen-zones/
 *
 * @returns {Promise<object>} Printer configuration matching old structure for backward compatibility
 */
export const getCloudPrinterConfig = async () => {
	try {
		// Get terminal's location ID
		const locationId = terminalRegistrationService.getLocationId();

		if (!locationId) {
			console.warn("[printerService] No location ID found for terminal");
			return {
				receipt_printers: [],
				kitchen_printers: [],
				kitchen_zones: [],
			};
		}

		console.log(`[printerService] Fetching printer config for location ${locationId}`);

		// Fetch printers and kitchen zones in parallel
		const [printersResponse, zonesResponse] = await Promise.all([
			apiClient.get(`settings/printers/?location=${locationId}`),
			apiClient.get(`settings/kitchen-zones/?location=${locationId}`),
		]);

		// Handle both paginated and non-paginated responses
		const printers = Array.isArray(printersResponse.data)
			? printersResponse.data
			: printersResponse.data.results || [];
		const zones = Array.isArray(zonesResponse.data)
			? zonesResponse.data
			: zonesResponse.data.results || [];

		// Separate receipt and kitchen printers
		const receipt_printers = printers
			.filter((p) => p.printer_type === "receipt" && p.is_active)
			.map((p) => ({
				id: p.id,
				name: p.name,
				ip_address: p.ip_address, // Keep consistent with zone printer structure
				port: p.port,
				connection_type: "network",
			}));

		const kitchen_printers = printers
			.filter((p) => p.printer_type === "kitchen" && p.is_active)
			.map((p) => ({
				id: p.id,
				name: p.name,
				ip_address: p.ip_address, // Keep consistent with zone printer structure
				port: p.port,
				connection_type: "network",
			}));

		// Transform kitchen zones to old format
		const kitchen_zones = zones
			.filter((z) => z.is_active)
			.map((z) => ({
				id: z.id,
				name: z.name,
				printer_name: z.printer_details.name,
				printer_id: z.printer,
				categories: z.category_ids,
				productTypes: [], // No longer used, kept for compatibility
				// Include full printer details for direct access
				printer: {
					id: z.printer_details.id,
					name: z.printer_details.name,
					ip_address: z.printer_details.ip_address, // Must be ip_address, not ip
					port: z.printer_details.port,
					connection_type: "network",
				},
			}));

		const config = {
			receipt_printers,
			kitchen_printers,
			kitchen_zones,
		};

		console.log("[printerService] Printer config loaded successfully");
		console.log("[printerService] Config:", {
			receipt_printers: receipt_printers.length,
			kitchen_printers: kitchen_printers.length,
			kitchen_zones: kitchen_zones.length,
		});

		return config;
	} catch (error) {
		console.error("[printerService] Error fetching printer config:", error);
		console.error("[printerService] Full error details:", {
			message: error.message,
			response: error.response?.data,
			status: error.response?.status,
		});
		throw error;
	}
};

/**
 * Get kitchen zones with their associated printers.
 * Uses the new config structure where printer is already embedded.
 *
 * @returns {Promise<Array>} Array of kitchen zones with printer info
 */
export const getKitchenZonesWithPrinters = async () => {
	try {
		const config = await getCloudPrinterConfig();
		const { kitchen_zones = [] } = config;

		// With new API, printer is already embedded in each zone
		const zonesWithPrinters = kitchen_zones.filter((zone) => zone.printer);

		console.log(
			`[printerService] Loaded ${zonesWithPrinters.length} kitchen zones with valid printers`
		);
		return zonesWithPrinters;
	} catch (error) {
		console.error(
			"[printerService] Error getting kitchen zones with printers:",
			error
		);
		return [];
	}
};

/**
 * Gets network receipt printers from cloud config
 * @returns {Promise<Array>} Array of network receipt printers
 */
export const getNetworkReceiptPrinters = async () => {
	try {
		const config = await getCloudPrinterConfig();
		const receiptPrinters = (config.receipt_printers || []).map((printer) => ({
			...printer,
			connection_type: "network",
		}));

		console.log("[printerService] Network receipt printers:", receiptPrinters);
		return receiptPrinters;
	} catch (error) {
		console.error(
			"[printerService] Error getting network receipt printers:",
			error
		);
		return [];
	}
};

/**
 * Gets the locally configured (USB) receipt printer from the settings store.
 * Note: This is not async, it pulls from the hydrated Zustand store.
 * @returns {object|null} The selected local printer object or null.
 */
export const getLocalReceiptPrinter = () => {
	try {
		// Zustand's `getState` provides synchronous access to the store's current state.
		const localPrinter = useSettingsStore.getState().getLocalReceiptPrinter();
		console.log(
			"[printerService] Local receipt printer from store:",
			localPrinter
		);
		return localPrinter;
	} catch (error) {
		console.error(
			"[printerService] Error getting local receipt printer:",
			error
		);
		return null;
	}
};
