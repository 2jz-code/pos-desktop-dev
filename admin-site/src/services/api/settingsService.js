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

// === Printer Configuration ===

export const getPrinterConfig = async () => {
	const response = await apiClient.get("settings/printer-config/");
	return response.data;
};

export const updatePrinterConfig = async (printerData) => {
	const response = await apiClient.put("settings/printer-config/", printerData);
	return response.data;
};

// === Store Locations ===

export const getStoreLocations = async () => {
	const response = await apiClient.get("settings/store-locations/");
	return response.data.results;
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
