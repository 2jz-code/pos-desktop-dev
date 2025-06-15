import { create } from "zustand";
import StripeTerminalService from "../lib/stripeTerminalService";

const useTerminalStore = create((set, get) => ({
	// State related to terminal hardware
	terminalStatus: "",
	terminalConnectionStatus: "idle", // 'idle' | 'initializing' | 'discovering' | 'connecting' | 'connected' | 'error'
	isTerminalInitialized: false,
	discoveredReaders: [],
	connectedReader: null,
	error: null,

	// Actions for managing the terminal
	initializeTerminal: async () => {
		if (get().isTerminalInitialized) {
			console.warn("Terminal already initialized. Skipping.");
			return;
		}
		set({
			terminalConnectionStatus: "initializing",
			terminalStatus: "Initializing terminal...",
		});

		// --- THIS IS THE FIX ---
		// The listener no longer needs to know about payment logic.
		// It only updates the state of the hardware (this store).
		StripeTerminalService.setListener((update) => {
			if (update.error) {
				set({
					terminalConnectionStatus: "error",
					error: update.error,
					terminalStatus: update.error,
				});
			}
			if (update.message) {
				set({ terminalStatus: update.message });
			}
			if (update.readers) {
				// "readers" is the correct property name from the service
				set({ discoveredReaders: update.readers });
				// Auto-connect to the first discovered reader if not already connecting/connected
				if (
					!get().connectedReader &&
					get().terminalConnectionStatus !== "connecting"
				) {
					get().connectToReader(update.readers[0]);
				}
			}
			if (update.connectedReader) {
				set({
					connectedReader: update.connectedReader,
					terminalConnectionStatus: "connected",
					terminalStatus: `Connected to ${update.connectedReader.label}.`,
					error: null,
				});
			}
			if (update.disconnected) {
				set({
					connectedReader: null,
					terminalConnectionStatus: "idle",
					terminalStatus: "Reader disconnected.",
				});
			}
			// --- REMOVED THE OLD, PROBLEMATIC LOGIC ---
			// The lines that called posStore._captureTerminalPayment and
			// posStore.finalizeTerminalPayment have been removed.
		});

		try {
			await StripeTerminalService.initialize();
			set({
				isTerminalInitialized: true,
				terminalStatus: "Terminal initialized. Discovering readers...",
			});
			await get().discoverReaders();
		} catch (err) {
			set({
				terminalConnectionStatus: "error",
				error: err.message,
				terminalStatus: err.message,
			});
		}
	},

	discoverReaders: async (discoveryMethod = "internet") => {
		if (get().terminalConnectionStatus !== "discovering") {
			set({
				terminalConnectionStatus: "discovering",
				discoveredReaders: [],
			});
		}
		try {
			await StripeTerminalService.discoverReaders(discoveryMethod);
			set({
				terminalStatus: "Discovery successful.",
			});
		} catch (error) {
			console.error(`Discovery failed:`, error.message);
			set({
				terminalConnectionStatus: "error",
				error: `Failed to discover readers.`,
			});
		}
	},

	connectToReader: async (reader) => {
		set({ terminalConnectionStatus: "connecting" });
		await StripeTerminalService.connectToReader(reader);
	},
}));

export default useTerminalStore;
