import apiClient from "@/shared/lib/apiClient";
import { v4 as uuidv4 } from "uuid";

const STORAGE_KEY = "terminal_config";
const FINGERPRINT_KEY = "device_fingerprint";

/**
 * TerminalRegistrationService
 * Handles RFC 8628 device authorization grant flow for terminal pairing
 */
class TerminalRegistrationService {
	/**
	 * Get or generate hardware UUID (device fingerprint)
	 * Stored in localStorage for persistence across app restarts
	 */
	getDeviceFingerprint() {
		let fingerprint = localStorage.getItem(FINGERPRINT_KEY);

		if (!fingerprint) {
			// Generate new UUID
			fingerprint = uuidv4();
			localStorage.setItem(FINGERPRINT_KEY, fingerprint);
			console.log("Generated new device fingerprint:", fingerprint);
		}

		return fingerprint;
	}

	/**
	 * Get stored terminal configuration
	 * Returns null if terminal hasn't been paired yet
	 */
	getTerminalConfig() {
		const config = localStorage.getItem(STORAGE_KEY);
		return config ? JSON.parse(config) : null;
	}

	/**
	 * Save terminal configuration after successful pairing
	 * Config contains: device_id, tenant_id, tenant_slug, location_id, location_name
	 * NOTE: Does NOT contain JWT tokens - those are only for user login
	 */
	saveTerminalConfig(config) {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
		console.log("Terminal configuration saved:", {
			device_id: config.device_id,
			tenant_slug: config.tenant_slug,
			location: config.location_name,
		});
	}

	/**
	 * Clear terminal configuration (factory reset)
	 */
	clearTerminalConfig() {
		localStorage.removeItem(STORAGE_KEY);
		console.log("Terminal configuration cleared");
	}

	/**
	 * Check if terminal is registered
	 */
	isTerminalRegistered() {
		const config = this.getTerminalConfig();
		return !!config && !!config.device_id && !!config.tenant_id;
	}

	/**
	 * Request pairing codes from backend
	 * Step 1 of RFC 8628 flow
	 */
	async requestPairingCodes() {
		const fingerprint = this.getDeviceFingerprint();

		const response = await apiClient.post("/terminals/pairing/device-authorization/", {
			client_id: "terminal-client",
			device_fingerprint: fingerprint,
		});

		return response.data;
	}

	/**
	 * Poll backend for approval status
	 * Step 2 of RFC 8628 flow
	 */
	async pollForToken(deviceCode) {
		const response = await apiClient.post("/terminals/pairing/token/", {
			grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			device_code: deviceCode,
			client_id: "terminal-client",
		});

		return response.data;
	}

	/**
	 * Start the full pairing flow
	 * Returns a promise that resolves when pairing is complete
	 */
	async startPairing(onStatusUpdate) {
		console.log("Starting terminal pairing flow...");

		// Step 1: Request pairing codes
		const pairingData = await this.requestPairingCodes();
		console.log("Pairing codes received:", {
			user_code: pairingData.user_code,
			expires_in: pairingData.expires_in,
		});

		// Notify caller of the user code
		if (onStatusUpdate) {
			onStatusUpdate({
				status: "waiting_approval",
				userCode: pairingData.user_code,
				expiresIn: pairingData.expires_in,
				verificationUri: pairingData.verification_uri,
			});
		}

		// Step 2: Poll for approval
		const tokens = await this.pollUntilApproved(
			pairingData.device_code,
			pairingData.interval,
			pairingData.expires_in,
			onStatusUpdate
		);

		// Step 3: Save configuration
		this.saveTerminalConfig(tokens);

		if (onStatusUpdate) {
			onStatusUpdate({
				status: "approved",
				terminalId: tokens.device_id,
			});
		}

		return tokens;
	}

	/**
	 * Poll for token until approved, denied, or expired
	 */
	async pollUntilApproved(deviceCode, interval, expiresIn, onStatusUpdate) {
		const startTime = Date.now();
		const expirationTime = startTime + expiresIn * 1000;

		while (true) {
			// Check if expired
			if (Date.now() >= expirationTime) {
				throw new Error("Pairing code expired. Please try again.");
			}

			// Wait before polling (respect interval from RFC 8628)
			await this.sleep(interval * 1000);

			try {
				const result = await this.pollForToken(deviceCode);

				// Success! Token received
				console.log("Terminal approved! Received tokens.");
				return result;
			} catch (error) {
				const errorCode = error.response?.data?.error;

				if (errorCode === "authorization_pending") {
					// Still waiting for approval - continue polling
					if (onStatusUpdate) {
						const remainingSeconds = Math.floor((expirationTime - Date.now()) / 1000);
						onStatusUpdate({
							status: "waiting_approval",
							remainingSeconds,
						});
					}
					continue;
				} else if (errorCode === "expired_token") {
					throw new Error("Pairing code expired. Please try again.");
				} else if (errorCode === "access_denied") {
					throw new Error("Pairing request was denied by administrator.");
				} else {
					// Unknown error
					console.error("Polling error:", error);
					throw new Error(
						error.response?.data?.error_description ||
							"Failed to complete pairing. Please try again."
					);
				}
			}
		}
	}

	/**
	 * Helper: sleep for specified milliseconds
	 */
	sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Get terminal identity for API calls
	 * Returns headers to be added to API requests
	 */
	getTerminalHeaders() {
		const config = this.getTerminalConfig();
		if (!config) {
			return {};
		}

		return {
			"X-Device-ID": config.device_id,
		};
	}
}

// Export singleton instance
const terminalRegistrationService = new TerminalRegistrationService();
export default terminalRegistrationService;
