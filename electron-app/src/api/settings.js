import apiClient from "../lib/apiClient";

export const getGlobalSettings = async () => {
	// The ViewSet list action on our singleton will return the single object.
	const response = await apiClient.get("/settings/global-settings/");
	return response.data;
};

export const updateGlobalSettings = async (settingsData) => {
	// The ViewSet handles the update via a PUT to the list endpoint for our singleton setup.
	const response = await apiClient.put(
		`/settings/global-settings/`,
		settingsData
	);
	return response.data;
};

/**
 * Gets the paired reader configuration for a specific POS device.
 * @param {string} deviceId - The unique ID of the POS station.
 * @returns {Promise<object>} The device configuration object.
 */
export const getDeviceReader = async (deviceId) => {
	const response = await apiClient.get(`/settings/pos-devices/${deviceId}/`);
	return response.data;
};

/**
 * Creates or updates the pairing between a POS device and a reader.
 * @param {object} pairingData - { device_id, reader_id, nickname? }
 * @returns {Promise<object>} The created or updated pairing object.
 */
export const setDeviceReader = async (pairingData) => {
	const response = await apiClient.post("/settings/pos-devices/", pairingData);
	return response.data;
};

/**
 * Deletes the pairing for a specific POS device.
 * @param {string} deviceId - The unique ID of the POS station to unpair.
 * @returns {Promise<void>}
 */
export const deleteDeviceReader = async (deviceId) => {
	await apiClient.delete(`/settings/pos-devices/${deviceId}/`);
};

// --- Terminal Location Management ---

/**
 * Fetches all synced terminal locations from the backend.
 * @returns {Promise<Array<object>>} A list of terminal locations.
 */
export const getTerminalLocations = async () => {
	const response = await apiClient.get("/settings/terminal-locations/");
	return response.data;
};

/**
 * Sets a specific terminal location as the default.
 * @param {number} locationId - The ID of the location to set as default.
 * @returns {Promise<object>} The server response.
 */
export const setDefaultTerminalLocation = async (locationId) => {
	const response = await apiClient.post(
		`/settings/terminal-locations/${locationId}/set-default/`
	);
	return response.data;
};

/**
 * Triggers the backend to sync its locations with the Stripe API.
 * @returns {Promise<object>} The result of the sync operation.
 */
export const syncStripeLocations = async () => {
	const response = await apiClient.post("/settings/sync-stripe-locations/");
	return response.data;
};
