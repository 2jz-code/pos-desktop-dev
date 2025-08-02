import apiClient from "./client";

export const userAPI = {
	getUserProfile: async () => {
		const response = await apiClient.get("/auth/customer/profile/");
		return response.data;
	},

	updateUserProfile: async (profileData) => {
		try {
			const { data } = await apiClient.patch(
				"/auth/customer/profile/",
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
			const { data } = await apiClient.get("/auth/customer/orders/");
			// Check if data is paginated (has results property) or is a direct array
			return data.results || data;
		} catch (error) {
			console.error("Error fetching order history:", error.response?.data);
			throw error.response?.data || { error: "An unknown error occurred" };
		}
	},
};

export default userAPI;
