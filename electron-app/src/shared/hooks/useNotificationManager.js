import { useState, useEffect, useCallback } from "react";
import globalNotificationService from "../lib/globalNotificationService";

export const useNotificationManager = () => {
	const [notifications, setNotifications] = useState(
		globalNotificationService.getNotifications()
	);
	const [connectionStatus, setConnectionStatus] = useState(
		globalNotificationService.getConnectionStatus()
	);

	// Subscribe to notifications changes
	useEffect(() => {
		const handleUpdate = (newNotifications) => {
			setNotifications([...newNotifications]); // Ensure re-render
		};
		globalNotificationService.on("notifications-updated", handleUpdate);
		return () => {
			globalNotificationService.off("notifications-updated", handleUpdate);
		};
	}, []);

	// Subscribe to status changes
	useEffect(() => {
		const handleStatusChange = (status) => {
			setConnectionStatus(status);
		};
		globalNotificationService.on("status-changed", handleStatusChange);
		return () => {
			globalNotificationService.off("status-changed", handleStatusChange);
		};
	}, []);

	// Actions are now just passthroughs to the service
	const dismissNotification = useCallback((notificationId) => {
		globalNotificationService.dismissNotification(notificationId);
	}, []);

	const clearAllNotifications = useCallback(() => {
		globalNotificationService.clearAllNotifications();
	}, []);

	const handleViewOrder = useCallback((order) => {
		globalNotificationService.handleViewOrder(order);
	}, []);

	return {
		notifications,
		connectionStatus,
		dismissNotification,
		clearAllNotifications,
		handleViewOrder,
		reconnect: () => globalNotificationService.connect(),
		disconnect: () => globalNotificationService.disconnect(), // Keep for manual control if needed
		isConnected: connectionStatus === "connected",
		isConnecting: connectionStatus === "connecting",
		isDisconnected: connectionStatus === "disconnected",
	};
};
