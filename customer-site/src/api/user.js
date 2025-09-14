import apiClient from "./client";

export const userAPI = {
	getUserProfile: async () => {
		const response = await apiClient.get("/customers/profile/");
		return response.data;
	},

	updateUserProfile: async (profileData) => {
		try {
			const { data } = await apiClient.patch(
				"/customers/profile/",
				profileData
			);
			return data;
		} catch (error) {
			console.error("Error updating user profile:", error.response?.data);
			throw error.response?.data || { error: "An unknown error occurred" };
		}
	},

	getOrderHistory: async () => {
		try {
			const { data } = await apiClient.get("/customers/orders/");
			// Check if data is paginated (has results property) or is a direct array
			return data.results || data;
		} catch (error) {
			console.error("Error fetching order history:", error.response?.data);
			throw error.response?.data || { error: "An unknown error occurred" };
		}
	},

	// Get customer order statistics
	getOrderStats: async () => {
		try {
			const { data } = await apiClient.get("/customers/orders/stats/");
			return data;
		} catch (error) {
			console.error("Error fetching order stats:", error.response?.data);
			throw error.response?.data || { error: "An unknown error occurred" };
		}
	},

	// Get recent orders (last 10)
	getRecentOrders: async () => {
		try {
			const { data } = await apiClient.get("/customers/orders/recent/");
			return data;
		} catch (error) {
			console.error("Error fetching recent orders:", error.response?.data);
			throw error.response?.data || { error: "An unknown error occurred" };
		}
	},
};

export default userAPI;