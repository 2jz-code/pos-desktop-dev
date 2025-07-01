import apiClient from "@/shared/lib/apiClient";
import { useSettingsStore } from "@/domains/settings/store/settingsStore";

const { hardwareApi } = window;

export const discoverPrinters = () => {
	return hardwareApi.invoke("discover-printers");
};

export const printReceipt = (printer, data, storeSettings = null) => {
	console.log(
		"[printerService] Invoking 'print-receipt' in main process with printer:",
		printer,
		"and store settings:",
		storeSettings ? "provided" : "not provided"
	);
	return hardwareApi.invoke("print-receipt", { printer, data, storeSettings });
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
 * Fetches printer configuration from the backend (network printers and kitchen zones)
 * @returns {Promise<object>} The cloud printer configuration
 */
export const getCloudPrinterConfig = async () => {
	try {
		console.log(
			"[printerService] Fetching printer config (temporary: no device ID)"
		);

		const response = await apiClient.get("settings/printer-config/");

		console.log("[printerService] Printer config loaded successfully");
		console.log("[printerService] Config data:", response.data);
		return response.data;
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
 * Gets kitchen zones with their associated network printers from cloud config
 * @returns {Promise<Array>} Array of kitchen zones with printer info
 */
export const getKitchenZonesWithPrinters = async () => {
	try {
		const config = await getCloudPrinterConfig();
		const { kitchen_printers = [], kitchen_zones = [] } = config;

		// Map kitchen zones to their printers
		const zonesWithPrinters = kitchen_zones
			.map((zone) => {
				const printer = kitchen_printers.find(
					(p) => p.name === zone.printer_name
				);

				return {
					...zone,
					printer: printer
						? {
								...printer,
								connection_type: "network", // Ensure network type for kitchen printers
						  }
						: null,
				};
			})
			.filter((zone) => zone.printer); // Only return zones with valid printers

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
