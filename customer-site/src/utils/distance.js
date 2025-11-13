/**
 * Calculate distance between two coordinates using Haversine formula
 *
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @param {string} unit - Unit of measurement ('miles' or 'km')
 * @returns {number} Distance in specified unit
 */
export const calculateDistance = (lat1, lon1, lat2, lon2, unit = 'miles') => {
	// Validate inputs
	if (!lat1 || !lon1 || !lat2 || !lon2) {
		return Infinity;
	}

	const toRadians = (degrees) => degrees * (Math.PI / 180);

	const R = unit === 'km' ? 6371 : 3959; // Earth radius in km or miles
	const dLat = toRadians(lat2 - lat1);
	const dLon = toRadians(lon2 - lon1);

	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRadians(lat1)) *
			Math.cos(toRadians(lat2)) *
			Math.sin(dLon / 2) *
			Math.sin(dLon / 2);

	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	const distance = R * c;

	return distance;
};

/**
 * Find the nearest location from a list of locations
 *
 * @param {Object} userLocation - User's coordinates {latitude, longitude}
 * @param {Array} locations - Array of location objects with latitude/longitude
 * @param {string} unit - Unit of measurement ('miles' or 'km')
 * @returns {Object} Nearest location with added 'distance' property
 */
export const findNearestLocation = (userLocation, locations, unit = 'miles') => {
	if (!userLocation || !locations || locations.length === 0) {
		return null;
	}

	const locationsWithDistance = locations.map((location) => {
		const distance = calculateDistance(
			userLocation.latitude,
			userLocation.longitude,
			location.latitude,
			location.longitude,
			unit
		);

		return {
			...location,
			distance,
		};
	});

	// Sort by distance and return nearest
	const sorted = locationsWithDistance.sort((a, b) => a.distance - b.distance);
	return sorted[0];
};

/**
 * Sort locations by distance from user location
 *
 * @param {Object} userLocation - User's coordinates {latitude, longitude}
 * @param {Array} locations - Array of location objects with latitude/longitude
 * @param {string} unit - Unit of measurement ('miles' or 'km')
 * @returns {Array} Sorted array of locations with 'distance' property added
 */
export const sortLocationsByDistance = (userLocation, locations, unit = 'miles') => {
	if (!userLocation || !locations || locations.length === 0) {
		return locations || [];
	}

	const locationsWithDistance = locations.map((location) => {
		const distance = calculateDistance(
			userLocation.latitude,
			userLocation.longitude,
			location.latitude,
			location.longitude,
			unit
		);

		return {
			...location,
			distance,
		};
	});

	return locationsWithDistance.sort((a, b) => a.distance - b.distance);
};

/**
 * Format distance for display
 *
 * @param {number} distance - Distance in miles or km
 * @param {string} unit - Unit of measurement ('miles' or 'km')
 * @returns {string} Formatted distance string (e.g., "2.5 miles", "15.2 km")
 */
export const formatDistance = (distance, unit = 'miles') => {
	if (distance === null || distance === undefined || distance === Infinity) {
		return '';
	}

	const rounded = distance < 10 ? distance.toFixed(1) : Math.round(distance);
	const unitLabel = unit === 'km' ? 'km' : (distance === 1 ? 'mile' : 'miles');

	return `${rounded} ${unitLabel}`;
};
