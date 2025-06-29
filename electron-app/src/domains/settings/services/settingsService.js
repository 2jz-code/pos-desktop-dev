import apiClient from "@/shared/lib/apiClient";

/**
 * Settings Service
 * Handles all business settings API interactions
 */

// Global Settings - All sections
export const getGlobalSettings = async () => {
	const response = await apiClient.get("/settings/global-settings/");
	return response.data;
};

export const updateGlobalSettings = async (settingsData) => {
	const response = await apiClient.patch(
		"/settings/global-settings/1/",
		settingsData
	);
	return response.data;
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

// Settings Summary
export const getSettingsSummary = async () => {
	const response = await apiClient.get("/settings/global-settings/summary/");
	return response.data;
};

// Receipt Format Data - for dynamic receipt generation
export const getReceiptFormatData = async () => {
	const response = await apiClient.get(
		"/settings/global-settings/receipt-format-data/"
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

// POS Device Management
export const getPosDevices = async () => {
	const response = await apiClient.get("/settings/pos-devices/");
	return response.data;
};

export const createOrUpdatePosDevice = async (deviceData) => {
	const response = await apiClient.post("/settings/pos-devices/", deviceData);
	return response.data;
};

export const getPosDeviceById = async (deviceId) => {
	const response = await apiClient.get(`/settings/pos-devices/${deviceId}/`);
	return response.data;
};

// Terminal Locations
export const getTerminalLocations = async () => {
	const response = await apiClient.get("/settings/terminal-locations/");
	return response.data;
};

// Terminal Configuration (Provider-Specific)
export const getTerminalConfiguration = async () => {
	const response = await apiClient.get("/payments/terminal/configuration/");
	return response.data;
};

export const createTerminalLocation = async (locationData) => {
	const response = await apiClient.post(
		"/settings/terminal-locations/",
		locationData
	);
	return response.data;
};

export const updateTerminalLocation = async (locationId, locationData) => {
	const response = await apiClient.patch(
		`/settings/terminal-locations/${locationId}/`,
		locationData
	);
	return response.data;
};

export const setDefaultLocation = async (locationId) => {
	const response = await apiClient.post(
		`/settings/terminal-locations/${locationId}/set-default/`
	);
	return response.data;
};

export const deleteTerminalLocation = async (locationId) => {
	const response = await apiClient.delete(
		`/settings/terminal-locations/${locationId}/`
	);
	return response.data;
};

// Stripe Integration
export const syncStripeLocations = async () => {
	const response = await apiClient.post("/settings/sync-stripe-locations/");
	return response.data;
};

// Convenience functions for backward compatibility
export const getDeviceReader = async (deviceId) => {
	try {
		return await getPosDeviceById(deviceId);
	} catch (error) {
		if (error.response?.status === 404) {
			return null; // Device not found
		}
		throw error;
	}
};

export const setDeviceReader = async (deviceData) => {
	return await createOrUpdatePosDevice(deviceData);
};

export const deleteDeviceReader = async (deviceId) => {
	// To "delete" a device reader pairing, we update it with empty reader_id
	return await createOrUpdatePosDevice({
		device_id: deviceId,
		reader_id: null,
		nickname: "",
	});
};

export const setDefaultTerminalLocation = async (locationId) => {
	return await setDefaultLocation(locationId);
};
