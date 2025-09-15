import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Hook for managing KDS WebSocket connections and real-time order updates
 */
export function useKDSWebSocket(zoneId) {
	const [orders, setOrders] = useState([]);
	const [connectionStatus, setConnectionStatus] = useState("disconnected"); // disconnected, connecting, connected, error
	const [isQCStation, setIsQCStation] = useState(false);
	const [alerts, setAlerts] = useState([]);
	const socketRef = useRef(null);
	const reconnectTimeoutRef = useRef(null);
	const reconnectAttempts = useRef(0);
	const maxReconnectAttempts = 5;

	// Get WebSocket URL from environment or default
	const getWebSocketUrl = useCallback(() => {
		const baseUrl = import.meta.env.VITE_WS_BASE_URL || "ws://localhost:8000";
		return `${baseUrl}ws/kds/${zoneId}/`;
	}, [zoneId]);

	// Connect to WebSocket
	const connect = useCallback(() => {
		if (!zoneId || socketRef.current?.readyState === WebSocket.OPEN) {
			return;
		}

		setConnectionStatus("connecting");
		const wsUrl = getWebSocketUrl();

		try {
			const socket = new WebSocket(wsUrl);
			socketRef.current = socket;

			socket.onopen = () => {
				console.log(`KDS WebSocket connected to zone: ${zoneId}`);
				setConnectionStatus("connected");
				reconnectAttempts.current = 0;

				// Send ping to maintain connection
				const pingInterval = setInterval(() => {
					if (socket.readyState === WebSocket.OPEN) {
						socket.send(JSON.stringify({ action: "ping" }));
					} else {
						clearInterval(pingInterval);
					}
				}, 30000); // Ping every 30 seconds
			};

			socket.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);
					handleWebSocketMessage(data);
				} catch (error) {
					console.error("Error parsing WebSocket message:", error);
				}
			};

			socket.onclose = (event) => {
				console.log("KDS WebSocket closed:", event.code, event.reason);
				setConnectionStatus("disconnected");

				// Attempt reconnection if not intentionally closed
				if (
					event.code !== 1000 &&
					reconnectAttempts.current < maxReconnectAttempts
				) {
					const delay = Math.min(
						1000 * Math.pow(2, reconnectAttempts.current),
						10000
					);
					reconnectAttempts.current++;

					console.log(
						`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.current})`
					);
					reconnectTimeoutRef.current = setTimeout(() => {
						connect();
					}, delay);
				}
			};

			socket.onerror = (error) => {
				console.error("KDS WebSocket error:", error);
				setConnectionStatus("error");
			};
		} catch (error) {
			console.error("Error creating WebSocket connection:", error);
			setConnectionStatus("error");
		}
	}, [zoneId, getWebSocketUrl]);

	// Handle incoming WebSocket messages
	const handleWebSocketMessage = useCallback((data) => {
		switch (data.type) {
			case "initial_data":
				console.log("Received initial KDS data:", data.data);
				setOrders(data.data.items || []);
				setAlerts(data.data.alerts || []);
				setIsQCStation(data.data.is_qc_station || false);
				break;

			case "item_updated":
				console.log("Order item updated:", data.data);
				setOrders((prevOrders) =>
					prevOrders.map((order) =>
						order.id === data.data.id ? data.data : order
					)
				);
				break;

			case "new_order":
				console.log("New order received:", data.data);
				setOrders((prevOrders) => [...prevOrders, data.data]);
				break;

			case "alert":
				console.log("New alert received:", data.data);
				setAlerts((prevAlerts) => [...prevAlerts, data.data]);
				break;

			case "pong":
				// Connection is alive
				break;

			case "error":
				console.error("KDS WebSocket error message:", data.message);
				break;

			default:
				console.log("Unknown WebSocket message type:", data.type);
		}
	}, []);

	// Send WebSocket message
	const sendMessage = useCallback((message) => {
		if (socketRef.current?.readyState === WebSocket.OPEN) {
			socketRef.current.send(JSON.stringify(message));
			return true;
		} else {
			console.warn("WebSocket is not connected. Message not sent:", message);
			return false;
		}
	}, []);

	// Update order item status
	const updateItemStatus = useCallback(
		(itemId, newStatus) => {
			return sendMessage({
				action: "update_item_status",
				kds_item_id: itemId,
				status: newStatus,
			});
		},
		[sendMessage]
	);

	// Mark item as priority
	const markItemPriority = useCallback(
		(itemId, isPriority = true) => {
			return sendMessage({
				action: "mark_priority",
				kds_item_id: itemId,
				is_priority: isPriority,
			});
		},
		[sendMessage]
	);

	// Add kitchen note to item
	const addKitchenNote = useCallback(
		(itemId, note) => {
			return sendMessage({
				action: "add_kitchen_note",
				kds_item_id: itemId,
				note: note,
			});
		},
		[sendMessage]
	);

	// Disconnect WebSocket
	const disconnect = useCallback(() => {
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current);
			reconnectTimeoutRef.current = null;
		}

		if (socketRef.current) {
			socketRef.current.close(1000, "Intentional disconnect");
			socketRef.current = null;
		}

		setConnectionStatus("disconnected");
		reconnectAttempts.current = 0;
	}, []);

	// Connect when zoneId changes
	useEffect(() => {
		if (zoneId) {
			connect();
		} else {
			disconnect();
		}

		return () => {
			disconnect();
		};
	}, [zoneId, connect, disconnect]);

	// Categorize orders by status for easy display
	const categorizedOrders = {
		new: orders.filter((order) => order.status === "received"),
		preparing: orders.filter((order) => order.status === "preparing"),
		ready: orders.filter((order) => order.status === "ready"),
		completed: orders.filter((order) => order.status === "completed"),
		held: orders.filter((order) => order.status === "held"),
	};

	return {
		// Data
		orders,
		categorizedOrders,
		alerts,
		isQCStation,

		// Connection state
		connectionStatus,
		isConnected: connectionStatus === "connected",

		// Actions
		updateItemStatus,
		markItemPriority,
		addKitchenNote,

		// Connection control
		connect,
		disconnect,
		reconnect: () => {
			disconnect();
			setTimeout(connect, 100);
		},
	};
}
