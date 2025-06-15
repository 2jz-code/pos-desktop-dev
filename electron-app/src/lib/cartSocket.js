// desktop-combined/electron-app/src/lib/cartSocket.js

let socket = null;
let store = null;
let _shouldAttemptReconnect = false; // Flag to control reconnection attempts
let _retryCount = 0;
let _reconnectTimeoutId = null;

const MAX_RETRIES = 5; // Maximum number of reconnection attempts
const RECONNECT_BASE_DELAY_MS = 1000; // 1 second base delay

const getReconnectDelay = (attempt) => {
	// Exponential backoff: 1s, 2s, 4s, 8s, 16s... capped at a reasonable max
	const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), 30000); // Cap at 30 seconds
	return delay;
};

const scheduleReconnect = (orderId) => {
	if (!_shouldAttemptReconnect || _retryCount >= MAX_RETRIES) {
		console.log(
			"WebSocket: Not attempting reconnect (explicitly closed or max retries reached)."
		);
		return;
	}

	const delay = getReconnectDelay(_retryCount + 1);
	console.log(
		`WebSocket: Attempting reconnect in ${delay / 1000} seconds (attempt ${
			_retryCount + 1
		}/${MAX_RETRIES})...`
	);

	_reconnectTimeoutId = setTimeout(() => {
		_retryCount++;
		// Call the 'connect' method from the cartSocket object being exported
		cartSocket.connect(orderId);
	}, delay);
};

const clearReconnectTimeout = () => {
	if (_reconnectTimeoutId) {
		clearTimeout(_reconnectTimeoutId);
		_reconnectTimeoutId = null;
	}
};

/**
 * Initializes the WebSocket connection for the current order.
 * This is the 'connect' method of the exported cartSocket object.
 * @param {string} orderId - The ID of the order to connect to.
 */
const connect = (orderId) => {
	if (
		socket &&
		(socket.readyState === WebSocket.OPEN ||
			socket.readyState === WebSocket.CONNECTING)
	) {
		console.log(
			"WebSocket already open or connecting. Skipping initialization."
		);
		return Promise.resolve(); // Return a resolved promise if already connected
	}

	// Ensure the store is set before connecting
	if (!store) {
		console.error("Zustand store is not set for WebSocket service.");
		return Promise.reject(new Error("Store is not set."));
	}

	// Set this flag to true when we intend to keep the connection alive
	_shouldAttemptReconnect = true;
	clearReconnectTimeout(); // Clear any pending reconnects
	_retryCount = 0; // Reset retry count for a new explicit connection attempt

	const url = `ws://127.0.0.1:8002/ws/cart/${orderId}/`; // Use 127.0.0.1 as per previous troubleshooting

	// Return a promise that resolves on connection or rejects on error
	return new Promise((resolve, reject) => {
		socket = new WebSocket(url);

		socket.onopen = () => {
			console.log("WebSocket connected.");
			if (store) {
				// Assumes store.getState().cart exists and has setSocketConnected
				store.getState().setSocketConnected(true);
			}
			_retryCount = 0; // Reset on successful connection
			clearReconnectTimeout(); // Ensure no pending retries
			resolve(); // Resolve the promise on successful connection
		};

		socket.onmessage = (event) => {
			const data = JSON.parse(event.data);
			console.log("WebSocket message received in cartSocket.js:", data); // ADDED LOG
			if (data.type === "cart_update") {
				// Ensure it's a cart update message
				console.log(
					"Processing cart_update message in cartSocket.js:",
					data.payload
				); // ADDED LOG
				if (store) {
					store.getState().setCartFromSocket(data.payload);
				} else {
					console.error(
						"Store is not set in cartSocket.js, cannot dispatch cart update."
					);
				}
			} else {
				console.warn(
					"Received unknown WebSocket message type:",
					data.type,
					data
				); // ADDED LOG
			}
		};

		socket.onclose = (event) => {
			console.log("WebSocket disconnected.", event);
			if (store) {
				store.getState().setSocketConnected(false);
			}
			if (_shouldAttemptReconnect) {
				// Only attempt reconnect if not explicitly closed
				scheduleReconnect(orderId);
			}
			reject(new Error("WebSocket disconnected."));
		};

		socket.onerror = (error) => {
			console.error("WebSocket error:", error);
			if (store) {
				store.getState().setSocketConnected(false);
			}
			// onerror is often followed by onclose, so let onclose handle the reconnect logic
			reject(error);
		};
	});
};

/**
 * Disconnects the WebSocket connection.
 * This is the 'disconnect' method of the exported cartSocket object.
 */
const disconnect = () => {
	// Set this flag to false when we explicitly want to close the socket
	_shouldAttemptReconnect = false;
	clearReconnectTimeout(); // Ensure no pending reconnects

	if (socket) {
		if (
			socket.readyState === WebSocket.OPEN ||
			socket.readyState === WebSocket.CONNECTING
		) {
			socket.close();
			console.log("WebSocket closing initiated by client.");
		}
		socket = null;
	}
};

/**
 * Sends a message through the WebSocket.
 * This is the 'sendMessage' method of the exported cartSocket object.
 * @param {object} message - The message payload to send.
 */
const sendMessage = (message) => {
	if (socket && socket.readyState === WebSocket.OPEN) {
		socket.send(JSON.stringify(message));
	} else {
		console.warn("WebSocket not open. Message not sent:", message);
		// Optionally, you could queue messages to be sent on reconnect
	}
};

/**
 * Initializes the WebSocket service with the Zustand store.
 * This is the 'init' method of the exported cartSocket object.
 * This must be called once when the store is created.
 * @param {object} zustandStore - The Zustand store instance.
 */
const init = (zustandStore) => {
	store = zustandStore;
};

// Export the single 'cartSocket' object containing all the functions
export const cartSocket = {
	init,
	connect,
	disconnect,
	sendMessage,
};
