import EventEmitter from "eventemitter3";
import apiClient from "@/shared/lib/apiClient";
import {
	printReceipt,
	printKitchenTicket,
	getNetworkReceiptPrinters,
	getKitchenZonesWithPrinters,
	getLocalReceiptPrinter,
} from "@/shared/lib/hardware/printerService";

class GlobalNotificationService extends EventEmitter {
	constructor() {
		super();
		this.socket = null;
		this.connectionStatus = "disconnected"; // disconnected, connecting, connected
		this.notifications = [];
		this.deviceId = null;
		this.isInitialized = false;
	}

	async initialize() {
		if (this.isInitialized) return;
		console.log("GlobalNotificationService: Initializing...");
		try {
			this.deviceId = await window.electronAPI.getMachineId();
			this.isInitialized = true;
			this.connect();
		} catch (error) {
			console.error(
				"GlobalNotificationService: Failed to get device ID during initialization.",
				error
			);
		}
	}

	connect() {
		if (this.socket && this.socket.readyState === WebSocket.OPEN) {
			console.log("GlobalNotificationService: Already connected or connecting");
			return;
		}

		if (!this.deviceId) {
			console.error(
				"GlobalNotificationService: Cannot connect without device ID."
			);
			return;
		}

		const wsUrl = `ws://127.0.0.1:8002/ws/notifications/?device_id=${this.deviceId}`;
		console.log(`GlobalNotificationService: Connecting to ${wsUrl}`);
		this.setStatus("connecting");

		this.socket = new WebSocket(wsUrl);

		this.socket.onopen = () => {
			console.log("GlobalNotificationService: Connected successfully");
			this.setStatus("connected");
		};

		this.socket.onmessage = (event) => {
			const data = JSON.parse(event.data);
			console.log("GlobalNotificationService: Received message:", data);

			if (data.type === "web_order_notification") {
				this.handleWebOrderNotification(data.data);
			} else {
				console.log(
					`GlobalNotificationService: Unknown message type: ${data.type}`
				);
			}
		};

		this.socket.onerror = (error) => {
			console.error("GlobalNotificationService: WebSocket error:", error);
			this.setStatus("disconnected");
		};

		this.socket.onclose = (event) => {
			console.log(
				`GlobalNotificationService: Connection closed ${event.code}`,
				event.reason
			);
			this.setStatus("disconnected");
			// Optional: implement retry logic here
		};
	}

	disconnect() {
		if (this.socket) {
			this.socket.close(1000, "User requested disconnect");
			this.socket = null;
			this.setStatus("disconnected");
		}
	}

	// --- State Management and Emitters ---

	setStatus(status) {
		if (this.connectionStatus !== status) {
			this.connectionStatus = status;
			this.emit("status-changed", this.connectionStatus);
		}
	}

	addNotification(notification) {
		this.notifications = [notification, ...this.notifications];
		this.emit("notifications-updated", this.notifications);
	}

	dismissNotification(notificationId) {
		const initialLength = this.notifications.length;
		this.notifications = this.notifications.filter(
			(n) => n.id !== notificationId
		);
		if (this.notifications.length < initialLength) {
			this.emit("notifications-updated", this.notifications);
		}
	}

	clearAllNotifications() {
		this.notifications = [];
		this.emit("notifications-updated", this.notifications);
	}

	// --- Getters for Hooks ---
	getNotifications() {
		return this.notifications;
	}

	getConnectionStatus() {
		return this.connectionStatus;
	}

	// --- Event Handlers ---

	async handleWebOrderNotification(data) {
		const { order, settings, timestamp } = data;

		console.log(
			"GlobalNotificationService: Web order notification received:",
			order.order_number
		);

		// Play sound notification if enabled in settings
		if (settings?.play_notification_sound) {
			window.electronAPI.playNotificationSound(null);
		}

		// --- Auto-printing Logic ---
		try {
			// 1. Handle Receipt Printing
			if (settings?.auto_print_receipt) {
				// --- NEW: Prioritize local USB printer ---
				let receiptPrinter = getLocalReceiptPrinter();

				// If no local printer, check for a network printer
				if (!receiptPrinter) {
					console.log(
						"No local receipt printer found, checking for network printers..."
					);
					const networkPrinters = await getNetworkReceiptPrinters();
					if (networkPrinters.length > 0) {
						receiptPrinter = networkPrinters[0]; // Use the first available network printer
					}
				}

				if (receiptPrinter) {
					const storeInfoRes = await apiClient.get(
						"settings/global-settings/store-info/"
					);
					const storeSettings = storeInfoRes.data;

					await printReceipt(receiptPrinter, order, storeSettings);

					console.log(
						`Auto-printed receipt for order ${order.order_number} to printer ${receiptPrinter.name} (${receiptPrinter.connection_type})`
					);
				} else {
					console.warn(
						"Auto-print for web order enabled, but no receipt printer (local or network) is configured."
					);
				}
			}

			// 2. Handle Kitchen Ticket Printing
			// Assuming kitchen printing should always happen for web orders if configured,
			// independent of the `auto_print_receipt` setting for customer receipts.
			const kitchenZones = await getKitchenZonesWithPrinters();
			if (kitchenZones.length > 0) {
				console.log(
					`Printing kitchen tickets for order ${order.order_number} to ${kitchenZones.length} zones.`
				);
				for (const zone of kitchenZones) {
					// The filterConfig for a zone defines which categories/products go to which printer.
					// This logic is encapsulated in the main process 'print-kitchen-ticket' handler,
					// which will filter order items based on the zone's config.
					await printKitchenTicket(
						zone.printer,
						order,
						zone.name,
						zone.product_categories // Pass categories to filter by
					);
					console.log(
						`Sent kitchen ticket for zone '${zone.name}' to printer ${zone.printer.name}`
					);
				}
			} else {
				console.log("No kitchen zones configured for printing.");
			}
		} catch (error) {
			console.error(
				`Failed to handle auto-printing for web order ${order.order_number}:`,
				error
			);
		}

		// Create notification object for the UI
		const notification = {
			id: `web-order-${order.id}`,
			type: "web_order",
			data: { order, settings, timestamp },
			createdAt: Date.now(),
		};

		this.addNotification(notification);
	}
}

const serviceInstance = new GlobalNotificationService();
export default serviceInstance;
