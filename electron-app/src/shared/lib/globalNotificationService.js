import EventEmitter from "eventemitter3";
import apiClient from "@/shared/lib/apiClient";

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

		// Auto-remove after 15 seconds
		setTimeout(() => {
			this.dismissNotification(notification.id);
		}, 15000);
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

		// Handle auto-printing if enabled
		if (settings?.auto_print_receipt) {
			try {
				// 1. Get the configured receipt printer from localStorage
				const storedPrinter = localStorage.getItem("localReceiptPrinter");
				const receiptPrinter = storedPrinter ? JSON.parse(storedPrinter) : null;

				if (receiptPrinter) {
					// 2. Get the latest store info for the receipt
					const storeInfoRes = await apiClient.get(
						"settings/global-settings/store-info/"
					);
					const storeSettings = storeInfoRes.data;

					// 3. Invoke the print command
					await window.hardwareApi.invoke("print-receipt", {
						printer: receiptPrinter,
						data: order,
						storeSettings: storeSettings,
					});
					console.log(
						`Auto-printed receipt for order ${order.order_number} to printer ${receiptPrinter.name}`
					);
				} else {
					console.warn(
						"Auto-print enabled, but no receipt printer is configured in local storage."
					);
				}
			} catch (error) {
				console.error("Failed to auto-print receipt:", error);
			}
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
