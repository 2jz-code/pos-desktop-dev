import apiClient from "./client";

/**
 * Settings Service
 * Handles all business settings API interactions
 */

// === Global Settings ===

export const getGlobalSettings = async () => {
	const response = await apiClient.get("settings/global-settings/");
	return response.data;
};

export const updateGlobalSettings = async (settingsData) => {
	// The GlobalSettings model is a singleton, so we always target the object with pk=1.
	const response = await apiClient.patch(
		"settings/global-settings/1/",
		settingsData
	);
	return response.data;
};

// === Printer Configuration (DEPRECATED - use Printers & Kitchen Zones below) ===

export const getPrinterConfig = async () => {
	const response = await apiClient.get("settings/printer-config/");
	return response.data;
};

export const updatePrinterConfig = async (printerData) => {
	const response = await apiClient.put("settings/printer-config/", printerData);
	return response.data;
};

// === Printers (NEW RELATIONAL API) ===

export const getPrinters = async (locationId = null) => {
	const params = new URLSearchParams();
	if (locationId) {
		params.append("location", locationId);
	}
	const response = await apiClient.get(`settings/printers/?${params}`);
	return response.data.results;
};

export const getPrinter = async (printerId) => {
	const response = await apiClient.get(`settings/printers/${printerId}/`);
	return response.data;
};

export const createPrinter = async (printerData) => {
	const response = await apiClient.post("settings/printers/", printerData);
	return response.data;
};

export const updatePrinter = async (printerId, printerData) => {
	const response = await apiClient.patch(
		`settings/printers/${printerId}/`,
		printerData
	);
	return response.data;
};

export const deletePrinter = async (printerId) => {
	await apiClient.delete(`settings/printers/${printerId}/`);
};

// === Kitchen Zones (NEW RELATIONAL API) ===

export const getKitchenZones = async (locationId = null) => {
	const params = new URLSearchParams();
	if (locationId) {
		params.append("location", locationId);
	}
	const response = await apiClient.get(`settings/kitchen-zones/?${params}`);
	return response.data.results;
};

export const getKitchenZone = async (zoneId) => {
	const response = await apiClient.get(`settings/kitchen-zones/${zoneId}/`);
	return response.data;
};

export const createKitchenZone = async (zoneData) => {
	const response = await apiClient.post("settings/kitchen-zones/", zoneData);
	return response.data;
};

export const updateKitchenZone = async (zoneId, zoneData) => {
	const response = await apiClient.patch(
		`settings/kitchen-zones/${zoneId}/`,
		zoneData
	);
	return response.data;
};

export const deleteKitchenZone = async (zoneId) => {
	await apiClient.delete(`settings/kitchen-zones/${zoneId}/`);
};

// === Store Locations ===

export const getStoreLocations = async () => {
	const response = await apiClient.get("settings/store-locations/");
	return response.data.results;
};

export const getStoreLocation = async (locationId) => {
	const response = await apiClient.get(`settings/store-locations/${locationId}/`);
	return response.data;
};

export const createStoreLocation = async (locationData) => {
	const response = await apiClient.post(
		"settings/store-locations/",
		locationData
	);
	return response.data;
};

export const updateStoreLocation = async (locationId, locationData) => {
	const response = await apiClient.patch(
		`settings/store-locations/${locationId}/`,
		locationData
	);
	return response.data;
};

export const deleteStoreLocation = async (locationId) => {
	await apiClient.delete(`settings/store-locations/${locationId}/`);
};

// Store Information Section
export const getStoreInfo = async () => {
	const response = await apiClient.get("/settings/global-settings/store-info/");
	return response.data;
};

export const updateStoreInfo = async (storeData) => {
	const response = await apiClient.patch(
		"/settings/global-settings/store-info/",
		storeData
	);
	return response.data;
};

// Financial Settings Section
export const getFinancialSettings = async () => {
	const response = await apiClient.get("/settings/global-settings/financial/");
	return response.data;
};

export const updateFinancialSettings = async (financialData) => {
	const response = await apiClient.patch(
		"/settings/global-settings/financial/",
		financialData
	);
	return response.data;
};

// Receipt Configuration Section
export const getReceiptConfig = async () => {
	const response = await apiClient.get(
		"/settings/global-settings/receipt-config/"
	);
	return response.data;
};

export const updateReceiptConfig = async (receiptData) => {
	const response = await apiClient.patch(
		"/settings/global-settings/receipt-config/",
		receiptData
	);
	return response.data;
};

// Business Hours Section
export const getBusinessHours = async () => {
	const response = await apiClient.get(
		"/settings/global-settings/business-hours/"
	);
	return response.data;
};

export const updateBusinessHours = async (hoursData) => {
	const response = await apiClient.patch(
		"/settings/global-settings/business-hours/",
		hoursData
	);
	return response.data;
};

export const setDefaultStoreLocation = async (locationId) => {
	const response = await apiClient.post(
		`/settings/store-locations/${locationId}/set-default/`
	);
	return response.data;
};

// === Stock Action Reasons ===

export const getStockReasons = async () => {
	const response = await apiClient.get("settings/stock-action-reasons/");
	return response.data.results;
};

export const getActiveStockReasons = async (category = null) => {
	const params = new URLSearchParams();
	if (category) {
		params.append("category", category);
	}
	const response = await apiClient.get(
		`settings/stock-action-reasons/active_reasons/?${params}`
	);
	return response.data;
};

export const getStockReasonCategories = async () => {
	const response = await apiClient.get("settings/stock-action-reasons/categories/");
	return response.data;
};

export const createStockReason = async (reasonData) => {
	const response = await apiClient.post(
		"settings/stock-action-reasons/",
		reasonData
	);
	return response.data;
};

export const updateStockReason = async (reasonId, reasonData) => {
	const response = await apiClient.patch(
		`settings/stock-action-reasons/${reasonId}/`,
		reasonData
	);
	return response.data;
};

export const deleteStockReason = async (reasonId) => {
	await apiClient.delete(`settings/stock-action-reasons/${reasonId}/`);
};
