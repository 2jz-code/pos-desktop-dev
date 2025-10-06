import apiClient from "@/shared/lib/apiClient";
import terminalRegistrationService from "@/services/TerminalRegistrationService";

export const loginWithPin = (username, pin) => {
	// Get terminal configuration
	const terminalConfig = terminalRegistrationService.getTerminalConfig();

	if (!terminalConfig || !terminalConfig.device_id) {
		throw new Error("Terminal not registered. Please complete terminal pairing first.");
	}

	// Include device_id in login request for tenant validation
	return apiClient.post("/users/login/pos/", {
		username,
		pin,
		device_id: terminalConfig.device_id,
	});
};

export const logout = () => {
	return apiClient.post("/users/logout/");
};

export const checkAuthStatus = () => {
	return apiClient.get("/users/me/");
};
