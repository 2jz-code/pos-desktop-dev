import apiClient from "./client";

// Authentication API service for customer website
export const authAPI = {
	// Register a new customer account
	register: async (userData) => {
		const response = await apiClient.post("/customers/register/", userData);
		return response.data;
	},

	// Login with email and password
	login: async (credentials) => {
		const response = await apiClient.post("/customers/login/", {
			email: credentials.username || credentials.email, // Backend expects 'email' field
			password: credentials.password,
			remember_me: credentials.remember_me || false,
		});
		return response.data;
	},

	// Logout (clears authentication cookies)
	logout: async () => {
		const response = await apiClient.post("/customers/logout/");
		return response.data;
	},

	// Refresh authentication token
	refreshToken: async () => {
		const response = await apiClient.post("/customers/token/refresh/");
		return response.data;
	},

	// Get current authenticated customer
	getCurrentUser: async () => {
		const response = await apiClient.get("/customers/current-user/");
		return response.data;
	},

	// Update customer profile
	updateProfile: async (profileData) => {
		const response = await apiClient.patch(
			"/customers/profile/",
			profileData
		);
		return response.data;
	},

	// Change password
	changePassword: async (passwordData) => {
		const response = await apiClient.post(
			"/customers/change-password/",
			passwordData
		);
		return response.data;
	},

	// Check authentication status
	checkAuth: async () => {
		try {
			const response = await authAPI.getCurrentUser();
			// Backend now returns { customer: {...} } instead of just customer data
			const customer = response.customer || response;
			return { isAuthenticated: true, user: customer };
		} catch {
			// Try to refresh token
			try {
				await authAPI.refreshToken();
				const response = await authAPI.getCurrentUser();
				const customer = response.customer || response;
				return { isAuthenticated: true, user: customer };
			} catch {
				return { isAuthenticated: false, user: null };
			}
		}
	},
};

export default authAPI;