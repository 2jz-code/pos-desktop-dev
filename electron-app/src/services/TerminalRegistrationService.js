import apiClient, { setLocationId } from "@/shared/lib/apiClient";

const STORAGE_KEY = "terminal_config";

/**
 * TerminalRegistrationService
 * Handles RFC 8628 device authorization grant flow for terminal pairing
 * Uses hardware-based fingerprint for persistent device identity
 */
class TerminalRegistrationService {
	constructor() {
		this._terminalConfig = null;
	}

	/**
	 * Get hardware-based device fingerprint from Electron main process
	 * This persists across app reinstalls (tied to machine hardware)
	 * @returns {Promise<string>} Hardware fingerprint UUID
	 */
	async getDeviceFingerprint() {
		// Get from Electron main process (hardware-based)
		if (window.electronAPI?.getDeviceFingerprint) {
			return await window.electronAPI.getDeviceFingerprint();
		}

		// Fallback for development/testing
		console.warn('⚠️ Electron bridge not available, using fallback fingerprint');
		return 'dev-fallback-fingerprint';
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
		const fingerprint = await this.getDeviceFingerprint();

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

		// Get fingerprint first
		const fingerprint = await this.getDeviceFingerprint();

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
		this._terminalConfig = tokens;

		// Set location ID for axios interceptor
		if (tokens.location_id) {
			setLocationId(tokens.location_id);
		}

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
	 * Initialize terminal on app startup
	 * 3-step fallback: Server lookup → localStorage cache → Pairing screen
	 *
	 * @returns {Promise<Object|null>} Terminal config or null if not registered
	 */
	async initialize() {
		console.log('🚀 Initializing terminal registration...');

		// Step 1: Get hardware fingerprint
		const fingerprint = await this.getDeviceFingerprint();
		console.log('🔐 Device fingerprint:', fingerprint);

		// Step 2: Try to fetch config from server (source of truth)
		try {
			const config = await this.fetchConfigByFingerprint(fingerprint);
			if (config) {
				console.log('✅ Terminal config restored from server');
				console.log('📍 Location:', config.location_name);
				this._terminalConfig = config;
				this.saveTerminalConfig(config); // Update cache

				// Set location ID for axios interceptor
				if (config.location_id) {
					setLocationId(config.location_id);
				}

				return config;
			}
		} catch (error) {
			if (error.response?.status === 404) {
				console.log('ℹ️  Terminal not registered on server');
			} else {
				console.error('⚠️  Server lookup failed:', error.message);
			}
		}

		// Step 3: Try localStorage cache (performance optimization)
		const cachedConfig = this.getTerminalConfig();
		if (cachedConfig) {
			console.log('⚠️  Using cached config (server unavailable)');
			this._terminalConfig = cachedConfig;

			// Set location ID for axios interceptor
			if (cachedConfig.location_id) {
				setLocationId(cachedConfig.location_id);
			}

			return cachedConfig;
		}

		// Step 4: Not registered - show pairing screen
		console.log('❌ Terminal not registered - pairing required');
		return null;
	}

	/**
	 * Fetch terminal config from server by fingerprint
	 *
	 * @param {string} fingerprint - Hardware fingerprint
	 * @returns {Promise<Object>} Terminal configuration
	 * @private
	 */
	async fetchConfigByFingerprint(fingerprint) {
		const response = await apiClient.get(
			`/terminals/registrations/by-fingerprint/${fingerprint}/`
		);

		return {
			device_id: response.data.device_id,
			tenant_id: response.data.tenant_id,
			tenant_slug: response.data.tenant_slug,
			location_id: response.data.store_location?.id,
			location_name: response.data.store_location?.name,
			nickname: response.data.nickname,
			reader_id: response.data.reader_id
		};
	}

	/**
	 * Get terminal identity for API calls
	 * Returns headers to be added to API requests
	 */
	getTerminalHeaders() {
		const config = this._terminalConfig || this.getTerminalConfig();
		if (!config) {
			return {};
		}

		return {
			"X-Device-ID": config.device_id,
			// Location header will be added by axios interceptor
		};
	}

	/**
	 * Get current terminal's store location ID
	 * Used by axios interceptor for X-Store-Location header
	 *
	 * @returns {number|null} Location ID
	 */
	getLocationId() {
		const config = this._terminalConfig || this.getTerminalConfig();
		return config?.location_id || null;
	}
}

// Export singleton instance
const terminalRegistrationService = new TerminalRegistrationService();
export default terminalRegistrationService;
