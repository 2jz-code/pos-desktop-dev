import apiClient from "./client";

// Authentication API service
export const authAPI = {
	// User registration
	register: async (userData) => {
		const response = await apiClient.post("/users/register/", userData);
		return response.data;
	},

	// User login
	login: async (credentials) => {
		const response = await apiClient.post("/users/login/", credentials);
		return response.data;
	},

	// User logout
	logout: async () => {
		const response = await apiClient.post("/users/logout/");
		return response.data;
	},

	// Get current user info
	getCurrentUser: async () => {
		const response = await apiClient.get("/users/me/");
		return response.data;
	},

	// Update user profile
	updateProfile: async (userData) => {
		const response = await apiClient.patch("/users/me/", userData);
		return response.data;
	},

	// Password reset request
	requestPasswordReset: async (email) => {
		const response = await apiClient.post("/users/password-reset/", { email });
		return response.data;
	},

	// Confirm password reset
	confirmPasswordReset: async (resetData) => {
		const response = await apiClient.post(
			"/users/password-reset-confirm/",
			resetData
		);
		return response.data;
	},

	// Change password
	changePassword: async (passwordData) => {
		const response = await apiClient.post(
			"/users/change-password/",
			passwordData
		);
		return response.data;
	},

	// Check authentication status
	checkAuth: async () => {
		try {
			const response = await apiClient.get("/users/me/");
			return { isAuthenticated: true, user: response.data };
		} catch (error) {
			console.error("Error checking authentication status:", error);
			return { isAuthenticated: false, user: null };
		}
	},
};

export default authAPI;
