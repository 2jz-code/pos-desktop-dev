import apiClient from "./client";

// Authentication API service for customer website
export const authAPI = {
	// Register a new customer account
	register: async (userData) => {
		const response = await apiClient.post("/auth/customer/register/", userData);
		return response.data;
	},

	// Login with email/username and password
	login: async (credentials) => {
		const response = await apiClient.post("/auth/customer/login/", {
			email_or_username: credentials.username || credentials.email,
			password: credentials.password,
			remember_me: credentials.remember_me || false,
		});
		return response.data;
	},

	// Logout (clears authentication cookies)
	logout: async () => {
		const response = await apiClient.post("/auth/customer/logout/");
		return response.data;
	},

	// Refresh authentication token
	refreshToken: async () => {
		const response = await apiClient.post("/auth/customer/token/refresh/");
		return response.data;
	},

	// Get current authenticated user
	getCurrentUser: async () => {
		const response = await apiClient.get("/auth/customer/current-user/");
		return response.data;
	},

	// Update user profile
	updateProfile: async (profileData) => {
		const response = await apiClient.patch(
			"/auth/customer/profile/",
			profileData
		);
		return response.data;
	},

	// Change password
	changePassword: async (passwordData) => {
		const response = await apiClient.post(
			"/auth/customer/change-password/",
			passwordData
		);
		return response.data;
	},

	// Check authentication status
	checkAuth: async () => {
		try {
			const user = await authAPI.getCurrentUser();
			return { isAuthenticated: true, user };
		} catch {
			// Try to refresh token
			try {
				await authAPI.refreshToken();
				const user = await authAPI.getCurrentUser();
				return { isAuthenticated: true, user };
			} catch {
				return { isAuthenticated: false, user: null };
			}
		}
	},
};

export default authAPI;
