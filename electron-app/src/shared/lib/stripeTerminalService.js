import { loadStripeTerminal } from "@stripe/terminal-js";
import apiClient from "./apiClient";
import {
	getTerminalLocations,
	getTerminalRegistration,
} from "@/domains/settings/services/settingsService";

/**
 * A singleton service to manage the Stripe Terminal instance and interactions.
 * This version includes extensive logging for debugging purposes.
 */
const StripeTerminalService = {
	terminal: null,
	locationId: null,
	_listeners: {
		onUpdate: null,
	},

	/**
	 * Checks for a default location and sets it, ensuring a location context exists.
	 * If no default is set, it designates the first available location as the default.
	 */
	async _checkAndSetLocationContext() {
		console.log(
			"[_checkAndSetLocationContext] 1. Starting location context check."
		);
		try {
			const locations = await getTerminalLocations();
			console.log(
				"[_checkAndSetLocationContext] 2. Fetched locations:",
				locations
			);

			if (locations.length === 0) {
				const errorMessage =
					"No Stripe locations found. Please sync locations from the Settings page.";
				console.error(`[_checkAndSetLocationContext] ERROR: ${errorMessage}`);
				this._listeners.onUpdate?.({ error: errorMessage });
				throw new Error(errorMessage);
			}

			let defaultLocation = locations.find((loc) => loc.is_default);

			if (!defaultLocation) {
				console.warn(
					"[_checkAndSetLocationContext] 3. No default location found. Using the first available one."
				);
				defaultLocation = locations[0];
				this._listeners.onUpdate?.({
					message: `No default location set. Using '${
						defaultLocation.store_location_details?.name || "N/A"
					}' as the active location.`,
				});
				// DO NOT attempt to set the default here. This is now a user action in settings.
			}

			this.locationId = defaultLocation.stripe_id;
			console.log(
				`[_checkAndSetLocationContext] 5. Location context successfully set to: ${this.locationId}`
			);
		} catch (error) {
			const errorMessage =
				error.message ||
				"Failed to retrieve or set a default terminal location.";
			console.error(
				`[_checkAndSetLocationContext] FATAL ERROR: ${errorMessage}`
			);
			this._listeners.onUpdate?.({ error: errorMessage });
			throw new Error(errorMessage);
		}
	},

	/**
	 * Initializes the Stripe Terminal SDK. This must be called before any other terminal action.
	 */
	async initialize() {
		console.log(
			"[initialize] 1. Attempting to initialize Stripe Terminal Service."
		);
		if (this.terminal) {
			console.warn("[initialize] 2. Service already initialized.");
			return this;
		}

		this.fetchConnectionToken = this.fetchConnectionToken.bind(this);
		this.handleUnexpectedDisconnect =
			this.handleUnexpectedDisconnect.bind(this);
		console.log("[initialize] 3. Bound service methods.");

		await this._checkAndSetLocationContext();
		console.log("[initialize] 4. Location context check complete.");

		const StripeTerminal = await loadStripeTerminal();
		console.log("[initialize] 5. Stripe Terminal JS SDK loaded.");

		this.terminal = StripeTerminal.create({
			onFetchConnectionToken: this.fetchConnectionToken,
			onUnexpectedReaderDisconnect: this.handleUnexpectedDisconnect,
		});

		console.log(
			`[initialize] 6. Stripe Terminal Service Initialized! Location: ${this.locationId}`
		);
		return this;
	},

	/**
	 * Fetches a new connection token from our backend.
	 * @returns {Promise<string>} The connection token.
	 */
	async fetchConnectionToken() {
		console.log(
			"[fetchConnectionToken] 1. SDK requesting a new connection token."
		);
		if (!this.locationId) {
			const errorMsg =
				"locationId is not set. Cannot fetch a connection token.";
			console.error(`[fetchConnectionToken] ERROR: ${errorMsg}`);
			this._listeners.onUpdate?.({
				error: "Location not set. Cannot connect.",
			});
			throw new Error(errorMsg);
		}

		console.log(
			`[fetchConnectionToken] 2. Requesting token for location: ${this.locationId}`
		);

		try {
			const response = await apiClient.post(
				"/payments/terminal/connection-token/",
				{ location: this.locationId }
			);

			if (response.data && response.data.secret) {
				console.log(
					"[fetchConnectionToken] 3. Successfully received token secret from backend."
				);
				return response.data.secret;
			} else {
				throw new Error("Invalid response from token endpoint.");
			}
		} catch (error) {
			const errorMessage =
				error.response?.data?.error || error.message || "Unknown error";
			console.error(`[fetchConnectionToken] FATAL ERROR: ${errorMessage}`);
			this._listeners.onUpdate?.({
				error: `Connection failed: ${errorMessage}`,
			});
			throw new Error(`Failed to fetch connection token: ${errorMessage}`);
		}
	},

	/**
	 * Handles the reader disconnecting unexpectedly.
	 */
	handleUnexpectedDisconnect() {
		console.error(
			"[handleUnexpectedDisconnect] Reader disconnected unexpectedly."
		);
		this._listeners.onUpdate?.({
			disconnected: true,
			message: "Reader disconnected.",
		});
	},

	/**
	 * Registers a listener callback to receive updates from the service.
	 */
	setListener(callback) {
		console.log("[setListener] Registering UI update listener.");
		this._listeners.onUpdate = callback;
	},

	/**
	 * Discovers available card readers.
	 */
	async discoverReaders() {
		console.log("[discoverReaders] 1. Starting reader discovery.");
		if (!this.terminal)
			throw new Error("[discoverReaders] ERROR: Terminal not initialized.");

		this._listeners.onUpdate?.({ message: "Discovering readers..." });

		const discoveryConfig = {
			simulated: true, // MUST be true for dashboard simulated readers
			location: this.locationId,
		};

		console.log(
			"[discoverReaders] 2. Using discovery config:",
			discoveryConfig
		);
		const discoveryResult = await this.terminal.discoverReaders(
			discoveryConfig
		);

		if (discoveryResult.error) {
			console.error(
				"[discoverReaders] 3. Discovery failed:",
				discoveryResult.error
			);
			this._listeners.onUpdate?.({ error: discoveryResult.error.message });
			throw new Error(discoveryResult.error.message);
		} else {
			console.log(
				"[discoverReaders] 3. Discovery successful. Readers found:",
				discoveryResult.discoveredReaders
			);
			this._listeners.onUpdate?.({
				readers: discoveryResult.discoveredReaders,
			});
		}
	},

	/**
	 * Connects to a specific card reader.
	 */
	async connectToReader(reader) {
		console.log(
			`[connectToReader] 1. Attempting to connect to reader:`,
			reader
		);
		if (!this.terminal)
			throw new Error("[connectToReader] ERROR: Terminal not initialized.");

		this._listeners.onUpdate?.({
			message: `Connecting to reader ${reader.label}...`,
		});

		const connectResult = await this.terminal.connectReader(reader);
		if (connectResult.error) {
			console.error(
				"[connectToReader] 2. Failed to connect:",
				connectResult.error
			);
			this._listeners.onUpdate?.({ error: connectResult.error.message });
		} else {
			console.log(
				"[connectToReader] 2. Successfully connected to reader:",
				connectResult.reader
			);
			this._listeners.onUpdate?.({
				connectedReader: connectResult.reader,
				message: "Connected.",
			});
			return connectResult.reader;
		}
	},

	/**
	 * A smart-connect method that first tries to connect to a saved reader,
	 * and falls back to discovery if no reader is saved or available.
	 */
	async autoConnect() {
		console.log("[autoConnect] 1. Starting smart connection process.");
		try {
			const deviceId = window.electronAPI.getMachineId();
			const registration = await getTerminalRegistration(deviceId);
			const savedReaderId = registration?.reader_id;

			if (savedReaderId) {
				console.log(
					`[autoConnect] 2. Found saved reader ID: ${savedReaderId}. Attempting direct connection.`
				);
				this._listeners.onUpdate?.({
					message: `Found saved reader ${savedReaderId}. Connecting...`,
				});
				// We need to discover it first to get the full reader object
				await this.discoverReaders();
				const readers = this.getDiscoveredReaders();
				const readerToConnect = readers.find((r) => r.id === savedReaderId);

				if (readerToConnect) {
					console.log(
						"[autoConnect] 3. Reader is available. Connecting directly."
					);
					return await this.connectToReader(readerToConnect);
				} else {
					console.warn(
						"[autoConnect] 3. Saved reader not found in discovery. Falling back."
					);
					this._listeners.onUpdate?.({
						message:
							"Saved reader not found. Please select from available readers.",
						readers: readers, // Show the list of other available readers
					});
					return null;
				}
			} else {
				console.log(
					"[autoConnect] 2. No saved reader ID. Initiating discovery."
				);
				await this.discoverReaders();
				return null; // No reader to auto-connect to
			}
		} catch (error) {
			if (error.response?.status === 404) {
				// This is a new device, no registration exists. Fallback to discovery.
				console.log(
					"[autoConnect] New device detected (no registration). Falling back to discovery."
				);
				await this.discoverReaders();
				return null;
			}
			console.error("[autoConnect] Error during auto-connect:", error);
			this._listeners.onUpdate?.({
				error: "An error occurred during connection.",
			});
			return null;
		}
	},

	async disconnectReader() {
		console.log("[StripeTerminalService] Attempting to disconnect reader.");
		if (
			!this.terminal ||
			!this.terminal.getReaderConnectionStatus() === "not_connected"
		) {
			console.warn(
				"[StripeTerminalService] No active reader connection to disconnect."
			);
			return;
		}

		const result = await this.terminal.disconnectReader();
		if (result.error) {
			console.error(
				"[StripeTerminalService] Failed to disconnect:",
				result.error
			);
			this._listeners.onUpdate?.({ error: result.error.message });
			// We throw the error so the calling function knows the disconnect failed
			throw new Error(result.error.message);
		} else {
			console.log(
				"[StripeTerminalService] Successfully disconnected from reader."
			);
			this._listeners.onUpdate?.({
				connectedReader: null,
				message: "Disconnected.",
			});
		}
	},

	/**
	 * Returns the last list of discovered readers.
	 */
	getDiscoveredReaders() {
		const readers = this.terminal?.discoveredReaders || [];
		console.log("[getDiscoveredReaders] Returning readers:", readers);
		return readers;
	},

	/**
	 * Collects a payment method from the connected reader.
	 */
	async collectPayment(paymentIntentSecret) {
		console.log(
			`[collectPayment] 1. Starting payment collection for PI secret: ${paymentIntentSecret}`
		);
		if (!this.terminal) throw new Error("Terminal not initialized.");

		this._listeners.onUpdate?.({
			message: "Requesting payment from reader...",
		});

		const result = await this.terminal.collectPaymentMethod(
			paymentIntentSecret
		);

		if (result.error) {
			console.error(
				"[collectPayment] 2. Payment collection failed:",
				result.error
			);
			this._listeners.onUpdate?.({
				error: `Payment collection failed: ${result.error.message}`,
			});
			// Throw the error to stop the process
			throw new Error(result.error.message);
		}

		console.log(
			"[collectPayment] 3. Payment method collected. Now processing payment...",
			result.paymentIntent
		);
		this._listeners.onUpdate?.({ message: "Processing payment..." });
		const processResult = await this.terminal.processPayment(
			result.paymentIntent
		);

		// --- THIS IS THE FIX ---
		// If the processing step fails (e.g., card declined), we must throw an error
		// to prevent the application from proceeding to the capture step.
		if (processResult.error) {
			console.error(
				"[collectPayment] 4. Payment processing failed:",
				processResult.error
			);
			this._listeners.onUpdate?.({
				error: `Payment processing failed: ${processResult.error.message}`,
			});
			// Throw the error to stop the process
			throw new Error(processResult.error.message);
		}

		if (processResult.paymentIntent) {
			console.log(
				"[collectPayment] 4. Payment processed successfully by SDK. Ready to capture.",
				processResult.paymentIntent
			);
			this._listeners.onUpdate?.({
				paymentIntent: processResult.paymentIntent,
				message: "Payment processed. Ready to capture.",
			});
			return processResult.paymentIntent;
		}
	},
};

export default StripeTerminalService;
