import apiClient from "./client";

/**
 * Terminal Service
 * Handles terminal pairing and registration API interactions
 */

// === Terminal Pairing ===

export const verifyPairingCode = async (userCode: string) => {
	const response = await apiClient.get("terminals/pairing/verify/", {
		params: { user_code: userCode },
	});
	return response.data;
};

export const approvePairing = async (
	userCode: string,
	locationId: number,
	nickname?: string
) => {
	const response = await apiClient.post("terminals/pairing/approve/", {
		user_code: userCode,
		location_id: locationId,
		nickname: nickname || "",
	});
	return response.data;
};

export const denyPairing = async (userCode: string) => {
	const response = await apiClient.post("terminals/pairing/deny/", {
		user_code: userCode,
	});
	return response.data;
};

export const getPendingPairings = async () => {
	const response = await apiClient.get("terminals/pairing/pending-pairings/");
	return response.data.results;
};

// === Terminal Registrations ===

export const getTerminalRegistrations = async () => {
	const response = await apiClient.get("terminals/registrations/");
	return response.data.results || response.data;
};

export const getTerminalDetails = async (deviceId: string) => {
	const response = await apiClient.get(`terminals/registrations/${deviceId}/`);
	return response.data;
};
