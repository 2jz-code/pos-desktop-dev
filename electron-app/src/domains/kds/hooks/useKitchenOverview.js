import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook for managing kitchen overview data and real-time updates
 */
export function useKitchenOverview() {
	const [overviewData, setOverviewData] = useState(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);
	const [connectionStatus, setConnectionStatus] = useState('disconnected');

	const socketRef = useRef(null);
	const reconnectTimeoutRef = useRef(null);
	const reconnectAttempts = useRef(0);
	const maxReconnectAttempts = 5;
	const isInitialized = useRef(false);

	// Get WebSocket URL for overview (using a special overview zone)
	const getWebSocketUrl = useCallback(() => {
		const baseUrl = import.meta.env.VITE_WS_BASE_URL || "ws://localhost:8000";
		return `${baseUrl}ws/kds/overview/`;
	}, []);

	/**
	 * Handle incoming WebSocket messages
	 */
	const handleWebSocketMessage = useCallback((event) => {
		try {
			const data = JSON.parse(event.data);

			if (data.type === 'kitchen_overview_response') {
				// Initial data response
				setOverviewData(data.data);
				setIsLoading(false);
				setError(null);
			} else if (data.type === 'kitchen_overview_update') {
				// Real-time update from backend
				setOverviewData(data.data);
				setError(null);
				console.log('📊 Received real-time kitchen overview update');
			} else if (data.type === 'kitchen_overview_error') {
				setError(data.error || 'Failed to load kitchen overview');
				setIsLoading(false);
			}
		} catch (err) {
			console.error('Error processing WebSocket message:', err);
			setError('Error processing update');
		}
	}, []);

	/**
	 * Send message through WebSocket
	 */
	const sendMessage = useCallback((message) => {
		if (socketRef.current?.readyState === WebSocket.OPEN) {
			socketRef.current.send(JSON.stringify(message));
		}
	}, []);

	/**
	 * Connect to WebSocket
	 */
	const connect = useCallback(() => {
		if (socketRef.current?.readyState === WebSocket.OPEN) {
			return;
		}

		setConnectionStatus('connecting');
		const wsUrl = getWebSocketUrl();

		try {
			const socket = new WebSocket(wsUrl);
			socketRef.current = socket;

			socket.onopen = () => {
				console.log('Kitchen Overview WebSocket connected');
				setConnectionStatus('connected');
				reconnectAttempts.current = 0;
				setError(null);

				// Send ping to maintain connection
				const pingInterval = setInterval(() => {
					if (socket.readyState === WebSocket.OPEN) {
						socket.send(JSON.stringify({ type: 'ping' }));
					} else {
						clearInterval(pingInterval);
					}
				}, 30000);
			};

			socket.onmessage = handleWebSocketMessage;

			socket.onclose = (event) => {
				console.log('Kitchen Overview WebSocket disconnected:', event.code, event.reason);
				setConnectionStatus('disconnected');

				// Auto-reconnect logic
				if (reconnectAttempts.current < maxReconnectAttempts) {
					const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
					reconnectTimeoutRef.current = setTimeout(() => {
						reconnectAttempts.current++;
						connect();
					}, delay);
				} else {
					setError('Connection lost. Please refresh to reconnect.');
				}
			};

			socket.onerror = (error) => {
				console.error('Kitchen Overview WebSocket error:', error);
				setConnectionStatus('error');
				setError('Connection error occurred');
			};

		} catch (err) {
			console.error('Error creating WebSocket connection:', err);
			setConnectionStatus('error');
			setError('Failed to connect to server');
		}
	}, [getWebSocketUrl, handleWebSocketMessage]);

	/**
	 * Disconnect WebSocket
	 */
	const disconnect = useCallback(() => {
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current);
			reconnectTimeoutRef.current = null;
		}

		if (socketRef.current) {
			socketRef.current.close(1000, 'Manual disconnect');
			socketRef.current = null;
		}

		setConnectionStatus('disconnected');
		reconnectAttempts.current = 0;
	}, []);

	/**
	 * Refresh kitchen overview data
	 */
	const refreshOverview = useCallback(() => {
		if (socketRef.current?.readyState !== WebSocket.OPEN) {
			setError('Not connected to server');
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			sendMessage({
				action: 'get_kitchen_overview'
			});
		} catch (err) {
			console.error('Error requesting kitchen overview:', err);
			setError('Failed to request overview data');
			setIsLoading(false);
		}
	}, [sendMessage]);

	/**
	 * Initialize connection and overview data
	 */
	useEffect(() => {
		connect();

		return () => {
			disconnect();
		};
	}, []); // Empty dependency array - only run once on mount

	/**
	 * Auto-fetch overview data when connected
	 */
	useEffect(() => {
		if (connectionStatus === 'connected' && !isInitialized.current) {
			isInitialized.current = true;
			// Call refreshOverview directly without dependency
			if (socketRef.current?.readyState === WebSocket.OPEN) {
				setIsLoading(true);
				setError(null);
				socketRef.current.send(JSON.stringify({
					action: 'get_kitchen_overview'
				}));
			}
		} else if (connectionStatus === 'disconnected') {
			isInitialized.current = false;
		}
	}, [connectionStatus]); // Remove refreshOverview dependency

	/**
	 * Clear error when connection is re-established
	 */
	useEffect(() => {
		if (connectionStatus === 'connected' && error) {
			setError(null);
		}
	}, [connectionStatus, error]);

	return {
		overviewData,
		connectionStatus,
		isLoading,
		error,
		refreshOverview,
		disconnect
	};
}