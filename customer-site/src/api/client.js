import axios from "axios";

// Base API URL - make sure this matches your Django backend
const API_BASE_URL =
	import.meta.env.VITE_API_URL || "http://localhost:8001/api";

// Create axios instance with default configuration
const apiClient = axios.create({
	baseURL: API_BASE_URL,
	headers: {
		"Content-Type": "application/json",
	},
	withCredentials: true, // Important for Django session authentication
	timeout: 10000, // 10 second timeout
});

// Request interceptor to add authentication if needed
apiClient.interceptors.request.use(
	(config) => {
		// Add any auth tokens here if you're using token-based auth
		// const token = localStorage.getItem('token');
		// if (token) {
		//   config.headers.Authorization = `Bearer ${token}`;
		// }

		console.log(
			`🔄 API Request: ${config.method?.toUpperCase()} ${config.url}`
		);
		return config;
	},
	(error) => {
		console.error("❌ Request Error:", error);
		return Promise.reject(error);
	}
);

// Response interceptor for global error handling
apiClient.interceptors.response.use(
	(response) => {
		console.log(`✅ API Response: ${response.status} ${response.config.url}`);
		return response;
	},
	(error) => {
		console.error("❌ API Error:", error);

		// Handle common error scenarios
		if (error.response) {
			// Server responded with error status
			const { status, data } = error.response;

			switch (status) {
				case 401:
					console.warn("🔒 Unauthorized - redirecting to login");
					// Handle authentication errors
					// window.location.href = '/login';
					break;
				case 403:
					console.warn("🚫 Forbidden - insufficient permissions");
					break;
				case 404:
					console.warn("🔍 Not Found");
					break;
				case 500:
					console.error("🔥 Server Error");
					break;
				default:
					console.error(`🔴 HTTP ${status}:`, data);
			}
		} else if (error.request) {
			// Request was made but no response received
			console.error("📡 Network Error - no response received");
		} else {
			// Something else happened
			console.error("⚠️ Unexpected Error:", error.message);
		}

		return Promise.reject(error);
	}
);

export default apiClient;
