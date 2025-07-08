// desktop-combined/electron-app/src/lib/cartSocket.js

let socket = null;
let store = null;
let _shouldAttemptReconnect = false; // Flag to control reconnection attempts
let _retryCount = 0;
let _reconnectTimeoutId = null;
let _messageQueue = []; // Queue for messages when WebSocket is not ready

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

const processMessageQueue = () => {
	if (
		_messageQueue.length > 0 &&
		socket &&
		socket.readyState === WebSocket.OPEN
	) {
		console.log(
			`WebSocket: Processing ${_messageQueue.length} queued messages`
		);
		const queuedMessages = [..._messageQueue];
		_messageQueue = []; // Clear the queue

		queuedMessages.forEach((message) => {
			socket.send(JSON.stringify(message));
		});
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

			// Process any queued messages
			processMessageQueue();

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
			} else if (data.type === "error") {
				// Handle error messages from backend
				console.error("WebSocket error from backend:", data);
				if (store) {
					// Check if this is a stock validation error for menu items
					const isStockError = data.error_type === "stock_validation";
					const isMenuItemError =
						data.message && data.message.toLowerCase().includes("menu");

					if (isStockError && !isMenuItemError) {
						// Only show error for non-menu items (strict stock validation)
						store.getState().showToast({
							title: "Insufficient Stock",
							description: data.message || "Not enough inventory available",
							variant: "destructive",
						});
					} else if (isStockError && isMenuItemError) {
						// For menu items, show a warning instead of error
						store.getState().showToast({
							title: "Low Ingredients",
							description:
								"Some ingredients are low, but item can be prepared fresh",
							variant: "default",
						});
					} else {
						// General errors
						store.getState().showToast({
							title: "Error",
							description:
								data.message || "An error occurred while adding the item",
							variant: "destructive",
						});
					}
				}
			} else if (data.type === "stock_error") {
				// Handle stock errors with override option
				console.error("WebSocket stock error from backend:", data);
				if (store && data.can_override) {
					// Get the current stock override dialog state to preserve lastPayload
					const currentDialog = store.getState().stockOverrideDialog;

					// Set the pending stock override data in the store
					store.getState().setStockOverrideDialog({
						show: true,
						productId: data.product_id || data.item_id, // Handle both add and update actions
						message: data.message,
						lastPayload: currentDialog.lastPayload, // Preserve the existing payload
						actionType: data.action_type || "add_item", // Track what action triggered this
						itemId: data.item_id, // For quantity updates
						currentQuantity: data.current_quantity,
						requestedQuantity: data.requested_quantity,
					});
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

	// Clear the message queue when disconnecting
	_messageQueue = [];

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
		console.log("WebSocket not ready. Queuing message:", message);
		_messageQueue.push(message);

		// If the socket is connecting, messages will be processed when it opens
		// If the socket is closed/error, we should probably handle reconnection
		if (!socket || socket.readyState === WebSocket.CLOSED) {
			console.warn(
				"WebSocket is closed. Message queued but connection may need to be re-established."
			);
		}
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
