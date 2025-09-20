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

	// History-related state
	const [historyData, setHistoryData] = useState(null);
	const [searchResults, setSearchResults] = useState(null);
	const [timelineData, setTimelineData] = useState(null);
	const [historyLoading, setHistoryLoading] = useState(false);

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
	const handleWebSocketMessage = useCallback(
		(data) => {
			console.log(
				`🎯 Zone ${zoneId} received WebSocket message:`,
				data.type,
				data
			);

			switch (data.type) {
				case "initial_data":
					console.log(
						`✅ Zone ${zoneId}: Setting initial data with ${
							data.data.orders?.length || 0
						} orders`
					);
					setZoneData(data.data.orders || []);
					setAlerts(data.data.alerts || []);
					setZoneType(data.data.zone_type || "kitchen");
					setIsQCStation(data.data.is_qc_station || false);
					break;

				case "zone_data_updated":
					console.log(
						`🔄 Zone ${zoneId}: Updating zone data with ${
							data.data.orders?.length || 0
						} orders`
					);
					// Replace entire zone data with fresh data
					setZoneData(data.data.orders || []);
					setZoneType(data.data.zone_type || zoneType);
					setIsQCStation(data.data.is_qc_station || isQCStation);
					break;

				case "order_completed":
					console.log(
						`✅ Zone ${zoneId}: Order completed notification received`
					);
					// Refresh data will come via zone_data_updated
					break;

				case "success":
					console.log(`✅ Zone ${zoneId}: Action successful:`, data.message);
					break;

				case "error":
					console.error(`❌ Zone ${zoneId}: Action failed:`, data.message);
					break;

				case "alert":
					console.log(`🚨 Zone ${zoneId}: New alert received:`, data.data);
					setAlerts((prevAlerts) => [...prevAlerts, data.data]);
					break;

				case "pong":
					// Connection is alive
					break;

				case "history_data":
					console.log(
						`📚 Zone ${zoneId}: Received history data with ${
							data.data.orders?.length || 0
						} orders`
					);
					setHistoryData(data.data);
					setHistoryLoading(false);
					break;

				case "search_results":
					console.log(
						`🔍 Zone ${zoneId}: Received search results with ${
							data.data.orders?.length || 0
						} orders`
					);
					setSearchResults(data.data);
					setHistoryLoading(false);
					break;

				case "order_timeline":
					console.log(`📅 Zone ${zoneId}: Received order timeline`);
					setTimelineData(data.data);
					setHistoryLoading(false);
					break;

				case "item_status_changed":
				case "item_priority_changed":
				case "item_note_changed":
					console.log(
						`📝 Zone ${zoneId}: Received ${data.type} notification but not handling it directly`
					);
					break;

				default:
					console.log(
						`❓ Zone ${zoneId}: Unknown WebSocket message type:`,
						data.type
					);
			}
		},
		[zoneType, zoneId]
	);

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
				item_id: itemId,
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
				item_id: itemId,
				is_priority: isPriority,
			});
		},
		[sendMessage]
	);

	// Add kitchen note to item
	const addKitchenNote = useCallback(
		(itemId, note) => {
			return sendMessage({
				action: "add_note",
				item_id: itemId,
				note: note,
			});
		},
		[sendMessage]
	);

	// QC-specific functions
	const updateQCStatus = useCallback(
		(orderId, newStatus, notes = null) => {
			// For the simplified QC workflow, we only complete orders
			if (newStatus === "completed") {
				return sendMessage({
					action: "complete_order",
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
		//eslint-disable-next-line
		(orderId, note) => {
			// QC notes removed in simplified workflow
			console.warn("QC notes not supported in simplified workflow");
			return Promise.resolve();
		},
		[sendMessage]
	);

	// History methods
	const getHistory = useCallback(
		(filters = {}) => {
			setHistoryLoading(true);
			return sendMessage({
				action: "get_history",
				...filters,
			});
		},
		[sendMessage]
	);

	const searchHistory = useCallback(
		(filters = {}) => {
			setHistoryLoading(true);
			return sendMessage({
				action: "search_history",
				...filters,
			});
		},
		[sendMessage]
	);

	const getOrderTimeline = useCallback(
		(orderId) => {
			setHistoryLoading(true);
			return sendMessage({
				action: "get_order_timeline",
				order_id: orderId,
			});
		},
		[sendMessage]
	);

	// Clear history data
	const clearHistoryData = useCallback(() => {
		setHistoryData(null);
		setSearchResults(null);
		setTimelineData(null);
		setHistoryLoading(false);
	}, []);

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
			// For QC zones, show orders based on completion readiness
			return {
				ready_for_qc: zoneData.filter(
					(order) => order.can_complete || order.status === "ready"
				),
				waiting: zoneData.filter(
					(order) =>
						!order.can_complete &&
						order.status !== "ready" &&
						order.status !== "completed"
				),
				completed: zoneData.filter((order) => order.status === "completed"),
			};
		} else {
			// For kitchen zones, categorize by zone-specific order status
			return {
				new: zoneData.filter((order) => order.overall_status === "pending"),
				preparing: zoneData.filter(
					(order) => order.overall_status === "in_progress"
				),
				ready: zoneData.filter((order) => order.overall_status === "ready"),
				completed: zoneData.filter(
					(order) => order.overall_status === "completed"
				),
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

		// History functionality
		historyData,
		searchResults,
		timelineData,
		historyLoading,
		getHistory,
		searchHistory,
		getOrderTimeline,
		clearHistoryData,

		// Connection control
		connect,
		disconnect,
		reconnect: () => {
			disconnect();
			setTimeout(connect, 100);
		},
	};
}
