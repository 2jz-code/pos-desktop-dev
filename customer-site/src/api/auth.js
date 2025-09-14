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

	// Request password reset
	requestPasswordReset: async (email) => {
		const response = await apiClient.post("/customers/password-reset/request/", {
			email: email,
		});
		return response.data;
	},

	// Confirm password reset with token
	confirmPasswordReset: async (token, newPassword) => {
		const response = await apiClient.post("/customers/password-reset/confirm/", {
			token: token,
			new_password: newPassword,
		});
		return response.data;
	},

	// Request email verification
	requestEmailVerification: async () => {
		const response = await apiClient.post("/customers/email-verification/request/");
		return response.data;
	},

	// Confirm email verification with token
	confirmEmailVerification: async (token) => {
		const response = await apiClient.post("/customers/email-verification/confirm/", {
			token: token,
		});
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

	// Google OAuth login
	googleLogin: async (idToken) => {
		const response = await apiClient.post("/customers/oauth/google/login/", {
			id_token: idToken,
		});
		return response.data;
	},

	// Link Google account to existing customer account
	linkGoogleAccount: async (idToken) => {
		const response = await apiClient.post("/customers/oauth/google/link/", {
			id_token: idToken,
		});
		return response.data;
	},
};

export default authAPI;