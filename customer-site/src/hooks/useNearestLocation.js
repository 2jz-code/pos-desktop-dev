import { useMemo } from "react";
import { useGeolocation } from "./useGeolocation";
import { useLocationSelector } from "./useLocationSelector";
import { findNearestLocation, sortLocationsByDistance } from "@/utils/distance";

/**
 * useNearestLocation Hook
 *
 * Combines geolocation with location selection to find nearest store location
 * Automatically requests user's location and calculates nearest store
 *
 * @param {Object} options - Configuration options
 * @param {boolean} options.autoRequest - Auto-request geolocation on mount (default: true)
 * @param {string} options.unit - Distance unit ('miles' or 'km', default: 'miles')
 * @returns {Object} Nearest location state
 */
export const useNearestLocation = (options = {}) => {
	const { autoRequest = true, unit = 'miles' } = options;

	// Get user's geolocation
	const {
		location: userLocation,
		isLoading: isLoadingGeolocation,
		error: geolocationError,
		permissionDenied,
		requestLocation,
	} = useGeolocation({ autoRequest });

	// Get all available locations
	const {
		locations,
		selectedLocationId,
		selectedLocation,
		isLoading: isLoadingLocations,
		selectLocation,
		selectionRequired,
		isLocked,
	} = useLocationSelector();

	// Calculate nearest location based on user's position
	const nearestLocation = useMemo(() => {
		// If only one location, return it
		if (locations.length === 1) {
			return { ...locations[0], distance: null };
		}

		// If no user location yet, return first location as fallback
		if (!userLocation || !userLocation.latitude) {
			return locations[0] || null;
		}

		// Find and return nearest location
		return findNearestLocation(userLocation, locations, unit);
	}, [userLocation, locations, unit]);

	// All locations sorted by distance
	const sortedLocations = useMemo(() => {
		if (!userLocation || !userLocation.latitude || locations.length <= 1) {
			return locations;
		}

		return sortLocationsByDistance(userLocation, locations, unit);
	}, [userLocation, locations, unit]);

	// Determine which location to display
	// Priority: selected location > nearest location > first location
	const displayLocation = useMemo(() => {
		if (selectedLocation) {
			return selectedLocation;
		}
		return nearestLocation;
	}, [selectedLocation, nearestLocation]);

	// Check if we're still loading
	const isLoading = isLoadingGeolocation || isLoadingLocations;

	// Check if geolocation is available
	const hasGeolocation = !!userLocation && !geolocationError && !permissionDenied;

	return {
		// Primary location to display
		displayLocation,
		nearestLocation,
		sortedLocations,

		// Geolocation state
		userLocation,
		hasGeolocation,
		permissionDenied,
		geolocationError,
		requestLocation,

		// Location selection state (from useLocationSelector)
		locations,
		selectedLocationId,
		selectedLocation,
		selectLocation,
		selectionRequired,
		isLocked,

		// Loading state
		isLoading,
		isLoadingGeolocation,
		isLoadingLocations,

		// Config
		unit,
	};
};

export default useNearestLocation;
