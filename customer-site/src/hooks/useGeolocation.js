import { useState, useEffect } from "react";

/**
 * useGeolocation Hook
 *
 * Gets user's location using browser's native Geolocation API
 * Requires user permission (shows browser popup)
 *
 * @returns {Object} Geolocation state
 * @property {Object|null} location - User's coordinates {latitude, longitude}
 * @property {boolean} isLoading - Whether geolocation is being fetched
 * @property {Error|null} error - Error object if geolocation failed
 * @property {boolean} permissionDenied - Whether user denied permission
 * @property {Function} requestLocation - Manually trigger location request
 */
export const useGeolocation = (options = {}) => {
	const {
		enableHighAccuracy = true,
		timeout = 10000,
		maximumAge = 0,
		autoRequest = true, // Auto-request on mount
	} = options;

	const [location, setLocation] = useState(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);
	const [permissionDenied, setPermissionDenied] = useState(false);

	const requestLocation = () => {
		// Check if geolocation is supported
		if (!navigator.geolocation) {
			setError(new Error("Geolocation is not supported by your browser"));
			setIsLoading(false);
			return;
		}

		setIsLoading(true);
		setError(null);
		setPermissionDenied(false);

		navigator.geolocation.getCurrentPosition(
			// Success callback
			(position) => {
				setLocation({
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
					accuracy: position.coords.accuracy,
					timestamp: position.timestamp,
				});
				setIsLoading(false);
				setError(null);
			},
			// Error callback
			(err) => {
				setIsLoading(false);
				setError(err);

				// Check if user denied permission
				if (err.code === 1) {
					// PERMISSION_DENIED
					setPermissionDenied(true);
				}

				console.warn("Geolocation error:", err.message);
			},
			// Options
			{
				enableHighAccuracy,
				timeout,
				maximumAge,
			}
		);
	};

	// Auto-request on mount if enabled
	useEffect(() => {
		if (autoRequest) {
			requestLocation();
		}
	}, [autoRequest]);

	return {
		location,
		isLoading,
		error,
		permissionDenied,
		requestLocation,
		isSupported: !!navigator.geolocation,
	};
};

export default useGeolocation;
