import { useState, useEffect, useRef, useCallback, useMemo } from "react";

/**
 * Hook for managing KDS WebSocket connections and real-time order updates
 */
export function useKDSWebSocket(zoneId) {
	const [zoneData, setZoneData] = useState([]); // Kitchen items or QC orders
	const [connectionStatus, setConnectionStatus] = useState("disconnected"); // disconnected, connecting, connected, error
	const [zoneType, setZoneType] = useState("kitchen"); // kitchen or qc
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
				setZoneData(data.data.zone_data || []);
				setAlerts(data.data.alerts || []);
				setZoneType(data.data.zone_type || "kitchen");
				setIsQCStation(data.data.is_qc_station || false);
				break;

			case "item_updated":
				console.log("Kitchen item updated:", data.data);
				// For kitchen zones - update the item within its order
				if (zoneType === "kitchen") {
					setZoneData((prevOrders) =>
						prevOrders.map((order) => {
							// Find if this order contains the updated item
							const updatedItems = order.items.map((item) =>
								item.id === data.data.id ? { ...item, ...data.data } : item
							);

							// Check if any item was actually updated
							const itemWasUpdated = order.items.some(item => item.id === data.data.id);

							if (itemWasUpdated) {
								// Recalculate order overall status based on updated items
								let newOverallStatus = 'received';
								if (updatedItems.every(item => item.status === 'ready')) {
									newOverallStatus = 'ready';
								} else if (updatedItems.some(item => item.status === 'preparing')) {
									newOverallStatus = 'preparing';
								}

								return {
									...order,
									items: updatedItems,
									overall_status: newOverallStatus
								};
							}

							return order;
						})
					);
				}
				break;

			case "qc_data_updated":
				console.log("QC zone data updated:", data.data);
				// Only for QC zones - replace entire order list
				if (zoneType === "qc") {
					setZoneData(data.data.zone_data || []);
				}
				break;

			case "zone_data_updated":
				console.log("Zone data updated:", data.data);
				// For kitchen zones - replace entire zone data
				if (zoneType === "kitchen") {
					setZoneData(data.data.zone_data || []);
				}
				break;

			case "new_order":
				console.log("New order/item received:", data.data);
				// Add new item/order based on zone type
				setZoneData((prevData) => [...prevData, data.data]);
				break;

			case "order_completed_by_qc":
				console.log("Order completed by QC:", data.data);
				// For kitchen zones - remove completed items or mark them differently
				if (zoneType === "kitchen") {
					setZoneData((prevItems) =>
						prevItems.filter(item => item.order_id !== data.data.order_id)
					);
				}
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
	}, [zoneType]);

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

	// QC-specific functions
	const updateQCStatus = useCallback(
		(orderId, newStatus, notes = null) => {
			// For the simplified QC workflow, we only complete orders
			if (newStatus === 'completed') {
				return sendMessage({
					action: "complete_order_qc",
					order_id: orderId,
					notes: notes,
				});
			}
			// For other statuses, just return without action since we simplified the workflow
			return Promise.resolve();
		},
		[sendMessage]
	);

	const addQCNote = useCallback(
		(orderId, note) => {
			// QC notes removed in simplified workflow
			console.warn("QC notes not supported in simplified workflow");
			return Promise.resolve();
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

	// Categorize data by status for easy display (zone-type aware)
	const categorizedData = useMemo(() => {
		if (zoneType === "qc") {
			// For QC zones, show ALL orders (not just completed ones)
			// QC can see progress and complete when ready
			return {
				ready_for_qc: zoneData.filter((order) => order.status !== "completed"),
				completed: zoneData.filter((order) => order.status === "completed"),
			};
		} else {
			// For kitchen zones, categorize by order overall_status
			return {
				new: zoneData.filter((order) => order.overall_status === "received"),
				preparing: zoneData.filter((order) => order.overall_status === "preparing"),
				ready: zoneData.filter((order) => order.overall_status === "ready"),
				completed: zoneData.filter((order) => order.overall_status === "completed"),
				held: zoneData.filter((order) => order.overall_status === "held"),
			};
		}
	}, [zoneData, zoneType]);

	return {
		// Zone-specific data
		zoneData,
		categorizedData,
		zoneType,
		isQCStation,
		alerts,

		// Legacy support (backward compatibility)
		orders: zoneData, // For existing code that expects 'orders'
		categorizedOrders: categorizedData, // For existing code

		// Connection state
		connectionStatus,
		isConnected: connectionStatus === "connected",

		// Kitchen zone actions
		updateItemStatus,
		markItemPriority,
		addKitchenNote,

		// QC zone actions
		updateQCStatus,
		addQCNote,

		// Connection control
		connect,
		disconnect,
		reconnect: () => {
			disconnect();
			setTimeout(connect, 100);
		},
	};
}
