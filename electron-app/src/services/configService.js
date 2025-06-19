/**
 * Configuration Service
 * Handles environment variables (system-level) and user preferences (UI-configurable)
 */

class ConfigService {
	constructor() {
		this.systemConfig = this.loadSystemConfig();
		this.userSettings = null;
		this.listeners = new Set();
	}

	/**
	 * Load system-level configuration from environment variables
	 * These are deployment/system settings, NOT user-configurable
	 */
	loadSystemConfig() {
		return {
			// API Configuration (deployment-specific)
			api: {
				baseUrl:
					import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8001/api",
				timeout: parseInt(import.meta.env.VITE_API_TIMEOUT_MS) || 10000,
			},

			// Development Configuration
			dev: {
				devMode: import.meta.env.VITE_DEV_MODE === "true",
				debugSync: import.meta.env.VITE_DEBUG_SYNC === "true",
				sampleDataOnEmpty:
					import.meta.env.VITE_SAMPLE_DATA_ON_EMPTY !== "false",
			},

			// Performance Configuration (system resources)
			performance: {
				imageCacheEnabled: import.meta.env.VITE_IMAGE_CACHE_ENABLED !== "false",
				maxConcurrentSyncs:
					parseInt(import.meta.env.VITE_MAX_CONCURRENT_SYNCS) || 3,
			},

			// Hardware Availability (what hardware is detected/available)
			hardware: {
				cashDrawerAvailable:
					import.meta.env.VITE_CASH_DRAWER_AVAILABLE !== "false",
				receiptPrinterAvailable:
					import.meta.env.VITE_RECEIPT_PRINTER_AVAILABLE !== "false",
			},
		};
	}

	/**
	 * Load user settings from local storage or database
	 */
	async loadUserSettings() {
		try {
			if (window.dbApi) {
				// Try to load from database first
				const settings = await window.dbApi.getSettings();
				if (settings) {
					this.userSettings = settings;
					return;
				}
			}

			// Fallback to localStorage
			const stored = localStorage.getItem("posSettings");
			if (stored) {
				this.userSettings = JSON.parse(stored);
			} else {
				this.userSettings = this.getDefaultUserSettings();
			}
		} catch (error) {
			console.warn("Failed to load user settings:", error);
			this.userSettings = this.getDefaultUserSettings();
		}
	}

	/**
	 * Get default user settings (user-configurable preferences)
	 */
	getDefaultUserSettings() {
		return {
			// Sync Settings (user preferences)
			syncIntervalMinutes: 5,
			autoSyncEnabled: true,

			// Backup Settings (user preferences)
			backupIntervalMinutes: 30,
			autoBackupEnabled: true,
			maxBackupsToKeep: 10,

			// Hardware Settings (user preferences - enable/disable available hardware)
			cashDrawerEnabled: this.systemConfig.hardware.cashDrawerAvailable,
			receiptPrinterEnabled: this.systemConfig.hardware.receiptPrinterAvailable,

			// Store Information
			storeName: "",
			storeAddress: "",
			storePhone: "",

			// Receipt Settings
			receiptHeader: "",
			receiptFooter: "Thank you for your business!",

			// Tax Settings
			defaultTaxRate: 0,

			// UI Preferences
			theme: "light",
			language: "en",
			currency: "USD",

			// Last updated timestamp
			updatedAt: new Date().toISOString(),
		};
	}

	/**
	 * Save user settings
	 */
	async saveUserSettings(settings) {
		try {
			this.userSettings = {
				...this.userSettings,
				...settings,
				updatedAt: new Date().toISOString(),
			};

			// Save to database if available
			if (window.dbApi) {
				await window.dbApi.saveSettings(this.userSettings);
			}

			// Also save to localStorage as backup
			localStorage.setItem("posSettings", JSON.stringify(this.userSettings));

			// Notify listeners
			this.notifyListeners();

			return { success: true };
		} catch (error) {
			console.error("Failed to save user settings:", error);
			return { success: false, error: error.message };
		}
	}

	/**
	 * Get a specific setting value
	 * For system settings, use dot notation like 'api.baseUrl'
	 * For user settings, use direct keys like 'syncIntervalMinutes'
	 */
	get(path, defaultValue = null) {
		// Check if it's a system config path (contains dots typically)
		if (path.includes(".")) {
			const systemValue = this.getNestedValue(this.systemConfig, path);
			if (systemValue !== undefined) return systemValue;
		}

		// Check user settings
		const userValue = this.userSettings?.[path];
		if (userValue !== undefined) return userValue;

		return defaultValue;
	}

	/**
	 * Get system configuration (read-only)
	 */
	getSystemConfig() {
		return { ...this.systemConfig };
	}

	/**
	 * Get user settings (modifiable)
	 */
	getUserSettings() {
		return { ...this.userSettings };
	}

	/**
	 * Get nested value from object using dot notation
	 */
	getNestedValue(obj, path) {
		if (!obj || !path) return undefined;

		return path.split(".").reduce((current, key) => {
			return current && current[key] !== undefined ? current[key] : undefined;
		}, obj);
	}

	/**
	 * Get all settings (system + user)
	 */
	getAll() {
		return {
			system: this.systemConfig,
			user: this.userSettings,
		};
	}

	/**
	 * Add a listener for settings changes
	 */
	addListener(callback) {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	/**
	 * Notify all listeners of settings changes
	 */
	notifyListeners() {
		this.listeners.forEach((callback) => {
			try {
				callback(this.userSettings);
			} catch (error) {
				console.error("Settings listener error:", error);
			}
		});
	}

	/**
	 * Reset user settings to defaults
	 */
	async resetToDefaults() {
		const defaults = this.getDefaultUserSettings();
		return await this.saveUserSettings(defaults);
	}

	/**
	 * Initialize the config service
	 */
	async initialize() {
		await this.loadUserSettings();
		console.log("📋 ConfigService initialized");
		console.log("🔧 System Config:", this.systemConfig);
		console.log("👤 User Settings:", this.userSettings);
		return this;
	}
}

// Export singleton instance
export const configService = new ConfigService();

// Auto-initialize
configService.initialize();

export default configService;
