/**
 * Locations API Client
 *
 * Handles fetching store locations for web orders.
 */

import apiClient from "./client";

export const locationsAPI = {
	/**
	 * Get all locations that accept web orders
	 *
	 * @returns {Promise} Promise resolving to array of locations
	 */
	getWebOrderLocations: async () => {
		const response = await apiClient.get("/settings/store-locations/", {
			params: {
				accepts_web_orders: true
			}
		});
		// Response is paginated with 'results' field
		const locations = response.data.results || [];
		// Filter on client side as well to be extra safe
		return locations.filter(location => location.accepts_web_orders);
	},

	/**
	 * Get all locations (for admin/staff use)
	 *
	 * @returns {Promise} Promise resolving to array of locations
	 */
	getAllLocations: async () => {
		const response = await apiClient.get("/settings/store-locations/");
		// Response is paginated with 'results' field
		return response.data.results || [];
	},

	/**
	 * Get a single location by ID
	 *
	 * @param {number} locationId - Location ID
	 * @returns {Promise} Promise resolving to location object
	 */
	getLocation: async (locationId) => {
		const response = await apiClient.get(`/settings/store-locations/${locationId}/`);
		return response.data;
	},
};

export default locationsAPI;
