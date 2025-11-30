import apiClient from "@/shared/lib/apiClient";
import terminalRegistrationService from "@/services/TerminalRegistrationService";

/**
 * Check if error is a network/connectivity error
 */
const isNetworkError = (error) => {
	return (
		!navigator.onLine ||
		error.message === 'Network Error' ||
		error.code === 'ERR_NETWORK' ||
		error.code === 'ECONNABORTED'
	);
};

/**
 * Login with PIN - tries online first, falls back to offline
 */
export const loginWithPin = async (username, pin) => {
	// Get terminal configuration
	const terminalConfig = terminalRegistrationService.getTerminalConfig();

	if (!terminalConfig || !terminalConfig.device_id) {
		throw new Error("Terminal not registered. Please complete terminal pairing first.");
	}

	// Try online login first
	try {
		const response = await apiClient.post("/users/login/pos/", {
			username,
			pin,
			device_id: terminalConfig.device_id,
		});
		console.log('✅ [Auth] Online login successful');
		return response;
	} catch (error) {
		// If it's a network error, try offline authentication
		if (isNetworkError(error)) {
			console.log('📴 [Auth] Network error, attempting offline login...');
			return attemptOfflineLogin(username, pin);
		}
		// For other errors (401, 403, etc.), throw as-is
		throw error;
	}
};

/**
 * Attempt offline login using cached credentials
 */
const attemptOfflineLogin = async (username, pin) => {
	// Check if offline API is available (Electron environment)
	if (!window.offlineAPI?.authenticate) {
		throw new Error("Offline login not available in this environment");
	}

	const result = await window.offlineAPI.authenticate(username, pin);

	if (!result.success) {
		const error = new Error(result.error || "Offline authentication failed");
		error.response = { status: 401, data: { error: result.error } };
		throw error;
	}

	console.log('✅ [Auth] Offline login successful');

	// Return in same format as online login
	return {
		data: {
			user: result.user,
			offline: true // Flag to indicate this was an offline login
		}
	};
};

export const logout = () => {
	// Only call backend logout if online
	if (navigator.onLine) {
		return apiClient.post("/users/logout/");
	}
	// Offline - just return resolved promise
	console.log('📴 [Auth] Offline - skipping backend logout');
	return Promise.resolve();
};

export const checkAuthStatus = () => {
	return apiClient.get("/users/me/");
};
