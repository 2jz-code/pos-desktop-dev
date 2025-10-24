import apiClient from "@/shared/lib/apiClient";
import terminalRegistrationService from "@/services/TerminalRegistrationService";

/**
 * Get the terminal's location ID for filtering API calls
 */
const getLocationId = () => {
	const locationId = terminalRegistrationService.getLocationId();
	if (!locationId) {
		throw new Error("Terminal not registered to a location");
	}
	return locationId;
};

// === Printers API ===

/**
 * Get all printers for the terminal's location
 */
export const getPrinters = async () => {
	const locationId = getLocationId();
	const response = await apiClient.get(
		`settings/printers/?location=${locationId}`
	);
	// Handle paginated response
	return Array.isArray(response.data)
		? response.data
		: response.data.results || [];
};

/**
 * Get a single printer by ID
 */
export const getPrinter = async (printerId) => {
	const response = await apiClient.get(`settings/printers/${printerId}/`);
	return response.data;
};

/**
 * Create a new printer
 */
export const createPrinter = async (printerData) => {
	const locationId = getLocationId();
	const response = await apiClient.post("settings/printers/", {
		...printerData,
		location: locationId,
	});
	return response.data;
};

/**
 * Update an existing printer
 */
export const updatePrinter = async (printerId, printerData) => {
	const locationId = getLocationId();
	const response = await apiClient.patch(`settings/printers/${printerId}/`, {
		...printerData,
		location: locationId,
	});
	return response.data;
};

/**
 * Delete a printer
 */
export const deletePrinter = async (printerId) => {
	await apiClient.delete(`settings/printers/${printerId}/`);
};

// === Kitchen Zones API ===

/**
 * Get all kitchen zones for the terminal's location
 */
export const getKitchenZones = async () => {
	const locationId = getLocationId();
	const response = await apiClient.get(
		`settings/kitchen-zones/?location=${locationId}`
	);
	// Handle paginated response
	return Array.isArray(response.data)
		? response.data
		: response.data.results || [];
};

/**
 * Get a single kitchen zone by ID
 */
export const getKitchenZone = async (zoneId) => {
	const response = await apiClient.get(`settings/kitchen-zones/${zoneId}/`);
	return response.data;
};

/**
 * Create a new kitchen zone
 */
export const createKitchenZone = async (zoneData) => {
	const locationId = getLocationId();
	const response = await apiClient.post("settings/kitchen-zones/", {
		...zoneData,
		location: locationId,
	});
	return response.data;
};

/**
 * Update an existing kitchen zone
 */
export const updateKitchenZone = async (zoneId, zoneData) => {
	const locationId = getLocationId();
	const response = await apiClient.patch(
		`settings/kitchen-zones/${zoneId}/`,
		{
			...zoneData,
			location: locationId,
		}
	);
	return response.data;
};

/**
 * Delete a kitchen zone
 */
export const deleteKitchenZone = async (zoneId) => {
	await apiClient.delete(`settings/kitchen-zones/${zoneId}/`);
};
