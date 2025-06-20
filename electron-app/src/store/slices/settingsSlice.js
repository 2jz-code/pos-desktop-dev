import * as settingsService from "../../api/services/settingsService";

export const createSettingsSlice = (set, get) => ({
	// State
	globalSettings: null,
	storeInfo: null,
	financialSettings: null,
	receiptConfig: null,
	businessHours: null,
	settingsSummary: null,
	posDevices: [],
	terminalLocations: [],

	// Loading states
	isLoadingGlobal: false,
	isLoadingStore: false,
	isLoadingFinancial: false,
	isLoadingReceipt: false,
	isLoadingHours: false,
	isLoadingSummary: false,
	isLoadingDevices: false,
	isLoadingLocations: false,

	// Error states
	globalError: null,
	storeError: null,
	financialError: null,
	receiptError: null,
	hoursError: null,
	summaryError: null,
	devicesError: null,
	locationsError: null,

	// Actions for Global Settings
	fetchGlobalSettings: async () => {
		set({ isLoadingGlobal: true, globalError: null });
		try {
			const data = await settingsService.getGlobalSettings();
			set({ globalSettings: data, isLoadingGlobal: false });
			return data;
		} catch (error) {
			console.error(
				"❌ [SettingsSlice] Failed to fetch global settings:",
				error
			);
			set({
				globalError: error.message || "Failed to load global settings",
				isLoadingGlobal: false,
			});
			throw error;
		}
	},

	updateGlobalSettings: async (settingsData) => {
		try {
			const data = await settingsService.updateGlobalSettings(settingsData);
			set({ globalSettings: data });
			// Also refresh other cached sections since they might be affected
			get().fetchStoreInfo();
			get().fetchFinancialSettings();
			get().fetchReceiptConfig();
			return data;
		} catch (error) {
			console.error(
				"❌ [SettingsSlice] Failed to update global settings:",
				error
			);
			throw error;
		}
	},

	// Actions for Store Information
	fetchStoreInfo: async () => {
		set({ isLoadingStore: true, storeError: null });
		try {
			const data = await settingsService.getStoreInfo();
			set({ storeInfo: data, isLoadingStore: false });
			return data;
		} catch (error) {
			console.error("❌ [SettingsSlice] Failed to fetch store info:", error);
			set({
				storeError: error.message || "Failed to load store information",
				isLoadingStore: false,
			});
			throw error;
		}
	},

	updateStoreInfo: async (storeData) => {
		try {
			const data = await settingsService.updateStoreInfo(storeData);
			set({ storeInfo: data });
			return data;
		} catch (error) {
			console.error("❌ [SettingsSlice] Failed to update store info:", error);
			throw error;
		}
	},

	// Actions for Financial Settings
	fetchFinancialSettings: async () => {
		set({ isLoadingFinancial: true, financialError: null });
		try {
			const data = await settingsService.getFinancialSettings();
			set({ financialSettings: data, isLoadingFinancial: false });
			return data;
		} catch (error) {
			console.error(
				"❌ [SettingsSlice] Failed to fetch financial settings:",
				error
			);
			set({
				financialError: error.message || "Failed to load financial settings",
				isLoadingFinancial: false,
			});
			throw error;
		}
	},

	updateFinancialSettings: async (financialData) => {
		try {
			const data = await settingsService.updateFinancialSettings(financialData);
			set({ financialSettings: data });
			return data;
		} catch (error) {
			console.error(
				"❌ [SettingsSlice] Failed to update financial settings:",
				error
			);
			throw error;
		}
	},

	// Actions for Receipt Configuration
	fetchReceiptConfig: async () => {
		set({ isLoadingReceipt: true, receiptError: null });
		try {
			const data = await settingsService.getReceiptConfig();
			set({ receiptConfig: data, isLoadingReceipt: false });
			return data;
		} catch (error) {
			console.error(
				"❌ [SettingsSlice] Failed to fetch receipt config:",
				error
			);
			set({
				receiptError: error.message || "Failed to load receipt configuration",
				isLoadingReceipt: false,
			});
			throw error;
		}
	},

	updateReceiptConfig: async (receiptData) => {
		try {
			const data = await settingsService.updateReceiptConfig(receiptData);
			set({ receiptConfig: data });
			return data;
		} catch (error) {
			console.error(
				"❌ [SettingsSlice] Failed to update receipt config:",
				error
			);
			throw error;
		}
	},

	// Actions for Business Hours
	fetchBusinessHours: async () => {
		set({ isLoadingHours: true, hoursError: null });
		try {
			const data = await settingsService.getBusinessHours();
			set({ businessHours: data, isLoadingHours: false });
			return data;
		} catch (error) {
			console.error(
				"❌ [SettingsSlice] Failed to fetch business hours:",
				error
			);
			set({
				hoursError: error.message || "Failed to load business hours",
				isLoadingHours: false,
			});
			throw error;
		}
	},

	updateBusinessHours: async (hoursData) => {
		try {
			const data = await settingsService.updateBusinessHours(hoursData);
			set({ businessHours: data });
			return data;
		} catch (error) {
			console.error(
				"❌ [SettingsSlice] Failed to update business hours:",
				error
			);
			throw error;
		}
	},

	// Actions for Settings Summary
	fetchSettingsSummary: async () => {
		set({ isLoadingSummary: true, summaryError: null });
		try {
			const data = await settingsService.getSettingsSummary();
			set({ settingsSummary: data, isLoadingSummary: false });
			return data;
		} catch (error) {
			console.error(
				"❌ [SettingsSlice] Failed to fetch settings summary:",
				error
			);
			set({
				summaryError: error.message || "Failed to load settings summary",
				isLoadingSummary: false,
			});
			throw error;
		}
	},

	// Actions for POS Devices
	fetchPosDevices: async () => {
		set({ isLoadingDevices: true, devicesError: null });
		try {
			const data = await settingsService.getPosDevices();
			set({ posDevices: data, isLoadingDevices: false });
			return data;
		} catch (error) {
			console.error("❌ [SettingsSlice] Failed to fetch POS devices:", error);
			set({
				devicesError: error.message || "Failed to load POS devices",
				isLoadingDevices: false,
			});
			throw error;
		}
	},

	createOrUpdatePosDevice: async (deviceData) => {
		try {
			const data = await settingsService.createOrUpdatePosDevice(deviceData);
			// Refresh the devices list
			await get().fetchPosDevices();
			return data;
		} catch (error) {
			console.error(
				"❌ [SettingsSlice] Failed to create/update POS device:",
				error
			);
			throw error;
		}
	},

	// Actions for Terminal Locations
	fetchTerminalLocations: async () => {
		set({ isLoadingLocations: true, locationsError: null });
		try {
			const data = await settingsService.getTerminalLocations();
			set({ terminalLocations: data, isLoadingLocations: false });
			return data;
		} catch (error) {
			console.error(
				"❌ [SettingsSlice] Failed to fetch terminal locations:",
				error
			);
			set({
				locationsError: error.message || "Failed to load terminal locations",
				isLoadingLocations: false,
			});
			throw error;
		}
	},

	createTerminalLocation: async (locationData) => {
		try {
			const data = await settingsService.createTerminalLocation(locationData);
			// Refresh the locations list
			await get().fetchTerminalLocations();
			return data;
		} catch (error) {
			console.error(
				"❌ [SettingsSlice] Failed to create terminal location:",
				error
			);
			throw error;
		}
	},

	updateTerminalLocation: async (locationId, locationData) => {
		try {
			const data = await settingsService.updateTerminalLocation(
				locationId,
				locationData
			);
			// Refresh the locations list
			await get().fetchTerminalLocations();
			return data;
		} catch (error) {
			console.error(
				"❌ [SettingsSlice] Failed to update terminal location:",
				error
			);
			throw error;
		}
	},

	setDefaultLocation: async (locationId) => {
		try {
			const data = await settingsService.setDefaultLocation(locationId);
			// Refresh the locations list
			await get().fetchTerminalLocations();
			return data;
		} catch (error) {
			console.error(
				"❌ [SettingsSlice] Failed to set default location:",
				error
			);
			throw error;
		}
	},

	deleteTerminalLocation: async (locationId) => {
		try {
			const data = await settingsService.deleteTerminalLocation(locationId);
			// Refresh the locations list
			await get().fetchTerminalLocations();
			return data;
		} catch (error) {
			console.error(
				"❌ [SettingsSlice] Failed to delete terminal location:",
				error
			);
			throw error;
		}
	},

	// Stripe Integration
	syncStripeLocations: async () => {
		try {
			const data = await settingsService.syncStripeLocations();
			// Refresh the locations list after sync
			await get().fetchTerminalLocations();
			return data;
		} catch (error) {
			console.error(
				"❌ [SettingsSlice] Failed to sync Stripe locations:",
				error
			);
			throw error;
		}
	},

	// Utility Actions
	clearErrors: () => {
		set({
			globalError: null,
			storeError: null,
			financialError: null,
			receiptError: null,
			summaryError: null,
			devicesError: null,
			locationsError: null,
		});
	},

	refreshAllSettings: async () => {
		try {
			await Promise.all([
				get().fetchGlobalSettings(),
				get().fetchStoreInfo(),
				get().fetchFinancialSettings(),
				get().fetchReceiptConfig(),
				get().fetchSettingsSummary(),
			]);
		} catch (error) {
			console.error(
				"❌ [SettingsSlice] Failed to refresh all settings:",
				error
			);
			throw error;
		}
	},
});
