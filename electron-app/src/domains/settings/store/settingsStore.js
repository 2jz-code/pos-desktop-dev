import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import {
	getGlobalSettings,
	updateGlobalSettings,
} from "@/domains/settings/services/settingsService";
import {
	discoverPrinters,
	getNetworkReceiptPrinters,
} from "@/shared/lib/hardware/printerService";

export const useSettingsStore = create(
	persist(
		(set, get) => ({
			posDeviceId: null,
			settings: null,
			isLoading: true,
			printers: [], // Now holds a combined list of local and network printers
			receiptPrinterId: null, // Selected printer for receipts

			discoverAndSetPrinters: async () => {
				try {
					const localPrinters = await discoverPrinters();
					const networkPrinters = await getNetworkReceiptPrinters(); // Fetch network printers

					const formattedLocal = localPrinters.map((p) => ({
						id: p.name,
						...p,
						connectionType: "usb",
					}));

					const formattedNetwork = networkPrinters.map((p) => ({
						id: p.name,
						...p,
						connectionType: "network",
					}));

					const combinedPrinters = [...formattedLocal, ...formattedNetwork];
					set({ printers: combinedPrinters });
					return combinedPrinters;
				} catch (error) {
					console.error("Failed to discover and set printers:", error);
					set({ printers: [] });
					return [];
				}
			},

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

			getLocalReceiptPrinter: () => {
				const { printers, receiptPrinterId } = get();
				if (!receiptPrinterId) return null;
				return printers.find((p) => p.id === receiptPrinterId) || null;
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
				// Do not persist printers, they should be discovered on launch
				receiptPrinterId: state.receiptPrinterId,
			}),
		}
	)
);
