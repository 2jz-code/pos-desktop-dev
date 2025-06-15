import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import { getGlobalSettings, updateGlobalSettings } from "@/api/settings";

/**
 * A store for managing persistent local device settings.
 * This uses localStorage to persist settings across app sessions.
 */
export const useSettingsStore = create(
	persist(
		(set, get) => ({
			// State
			posDeviceId: null,
			settings: null,
			isLoading: true,

			// Actions
			fetchSettings: async () => {
				if (!get().isLoading) {
					set({ isLoading: true });
				}
				try {
					const settingsData = await getGlobalSettings();
					set({ settings: settingsData, isLoading: false });
				} catch (error) {
					console.error("Failed to fetch global settings:", error);
					set({ isLoading: false, settings: null }); // Set settings to null on error
				}
			},

			updateSettings: async (newSettings) => {
				set({ isLoading: true });
				try {
					const updatedSettings = await updateGlobalSettings(newSettings);
					set({ settings: updatedSettings, isLoading: false });
					return updatedSettings;
				} catch (error) {
					console.error("Failed to update settings:", error);
					// Re-fetch settings to revert optimistic UI updates if necessary
					await get().fetchSettings();
					throw error; // Re-throw to be caught by the component
				}
			},

			ensurePosDeviceId: () => {
				if (!get().posDeviceId) {
					set({ posDeviceId: `pos-${uuidv4()}` });
				}
			},
		}),
		{
			name: "pos-device-settings", // unique name
			storage: createJSONStorage(() => localStorage), // use localStorage
			partialize: (state) => ({
				posDeviceId: state.posDeviceId, // Only persist the device ID
			}),
		}
	)
);

// --- Initialization ---

// Ensure a device ID exists as soon as the app loads
useSettingsStore.getState().ensurePosDeviceId();
// Fetch global settings from the backend as soon as the app loads
useSettingsStore.getState().fetchSettings();

// Expose the actions for easier access in components
export const useSettingsActions = () =>
	useSettingsStore((state) => state.actions);
