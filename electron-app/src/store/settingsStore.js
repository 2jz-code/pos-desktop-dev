import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import {
	getGlobalSettings,
	updateGlobalSettings,
} from "@/api/services/settingsService";

export const useSettingsStore = create(
	persist(
		(set, get) => ({
			posDeviceId: null,
			settings: null,
			isLoading: true,
			printers: [],
			receiptPrinterId: null,
			kitchenZones: [], // REPLACES kitchenPrinterId

			fetchSettings: async () => {
				if (!get().isLoading) set({ isLoading: true });
				try {
					const settingsData = await getGlobalSettings();
					set({ settings: settingsData, isLoading: false });
				} catch (error) {
					console.error("Failed to fetch global settings:", error);
					set({ isLoading: false, settings: null });
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
					await get().fetchSettings();
					throw error;
				}
			},

			addPrinter: (printerConfig) => {
				const newPrinter = { id: uuidv4(), ...printerConfig };
				set((state) => ({ printers: [...state.printers, newPrinter] }));
			},
			updatePrinter: (printerId, updatedConfig) => {
				set((state) => ({
					printers: state.printers.map((p) =>
						p.id === printerId ? { ...p, ...updatedConfig } : p
					),
				}));
			},
			removePrinter: (printerId) => {
				set((state) => ({
					printers: state.printers.filter((p) => p.id !== printerId),
				}));
			},
			setReceiptPrinterId: (id) => set({ receiptPrinterId: id }),

			// --- NEW KITCHEN ZONE ACTIONS ---
			addKitchenZone: (zone) => {
				const newZone = { id: uuidv4(), ...zone };
				set((state) => ({ kitchenZones: [...state.kitchenZones, newZone] }));
			},
			updateKitchenZone: (zoneId, updatedZone) => {
				set((state) => ({
					kitchenZones: state.kitchenZones.map((z) =>
						z.id === zoneId ? { ...z, ...updatedZone } : z
					),
				}));
			},
			removeKitchenZone: (zoneId) => {
				set((state) => ({
					kitchenZones: state.kitchenZones.filter((z) => z.id !== zoneId),
				}));
			},

			ensurePosDeviceId: () => {
				if (!get().posDeviceId) set({ posDeviceId: `pos-${uuidv4()}` });
			},
		}),
		{
			name: "pos-device-settings",
			storage: createJSONStorage(() => localStorage),
			partialize: (state) => ({
				posDeviceId: state.posDeviceId,
				printers: state.printers,
				receiptPrinterId: state.receiptPrinterId,
				kitchenZones: state.kitchenZones, // Persist the new zones
			}),
		}
	)
);
