import { create } from "zustand";
import StripeTerminalService from "../lib/stripeTerminalService";
import { usePosStore } from "./posStore";
import { terminalPaymentModel } from "./slices/paymentModels/terminalPaymentModel";

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

		// Set up the listener to handle events from the Stripe Terminal Service.
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
				// --- THIS IS THE FIX ---
				// When readers are found, the discovery process is complete.
				// We must update the connection status to stop showing the spinner
				// and allow the UI to display the list of readers.
				set({
					discoveredReaders: update.readers,
					terminalConnectionStatus: "idle", // Set status back to idle (or another non-discovering state).
					terminalStatus: `Discovery complete. Found ${update.readers.length} reader(s).`,
				});

				// The original auto-connect logic can remain.
				if (
					!get().connectedReader &&
					get().terminalConnectionStatus !== "connecting" &&
					update.readers.length > 0
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
		});

		try {
			await StripeTerminalService.initialize();
			set({
				isTerminalInitialized: true,
				terminalStatus: "Terminal initialized. Discovering readers...",
			});
			// Automatically discover readers on initialization.
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
		// Only set the status if we aren't already discovering.
		if (get().terminalConnectionStatus !== "discovering") {
			set({
				terminalConnectionStatus: "discovering",
				discoveredReaders: [], // Clear previous results before starting a new discovery.
			});
		}
		try {
			// This call is asynchronous. The results will be handled by the listener.
			await StripeTerminalService.discoverReaders(discoveryMethod);
			// No need to set "Discovery successful" here, as the listener handles all status updates now.
		} catch (error) {
			console.error(`Discovery failed:`, error.message);
			set({
				terminalConnectionStatus: "error",
				error: `Failed to discover readers.`,
				terminalStatus: `Discovery failed.`,
			});
		}
	},

	connectToReader: async (reader) => {
		set({ terminalConnectionStatus: "connecting" });
		await StripeTerminalService.connectToReader(reader);
	},

	disconnectReader: async () => {
		set({
			terminalConnectionStatus: "disconnecting",
			terminalStatus: "Disconnecting reader...",
		});
		try {
			await StripeTerminalService.disconnectReader();
			set({
				terminalConnectionStatus: "idle",
				terminalStatus: "Reader disconnected.",
				connectedReader: null,
				error: null,
			});
		} catch (error) {
			set({
				terminalConnectionStatus: "error",
				terminalStatus: `Failed to disconnect: ${error.message}`,
				error: error.message,
			});
		}
	},

	retryPayment: async () => {
		const { getState, setState } = useTerminalStore; // Or however you access set/get
		const paymentIntentId = usePosStore.getState().paymentSlice.paymentIntentId;

		setState({ status: "cancelling", error: null });

		try {
			// 1. Tell the MODEL to cancel the intent
			await terminalPaymentModel.cancel(paymentIntentId);

			// 2. Re-run the initialization logic (CONDUCTOR's job)
			setState({ status: "initializing" });
			await getState().initializeTerminal(); // Re-fetches connection token

			// 3. Reset the payment flow (CONDUCTOR's job)
			usePosStore.getState().paymentSlice.resetPaymentState(); // Resetting state in another store
			setState({ status: "waiting_for_tip" });
		} catch (error) {
			console.error("Failed to execute retry logic:", error);
			setState({
				status: "error",
				error: "The payment could not be retried. Please start over.",
			});
		}
	},
}));

export default useTerminalStore;
