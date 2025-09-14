import axios from "axios";
import { authAPI } from "./auth";

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

// Bare client without interceptors for CSRF token fetch
const baseClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 10000,
});

let csrfToken = null;
let csrfPromise = null;

async function ensureCsrfToken() {
  if (csrfToken) return csrfToken;
  if (!csrfPromise) {
    csrfPromise = baseClient
      .get("/security/csrf/")
      .then((res) => {
        csrfToken = res?.data?.csrfToken || null;
        return csrfToken;
      })
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

// Request interceptor to add authentication if needed
apiClient.interceptors.request.use(
	async (config) => {
		// Add any auth tokens here if you're using token-based auth
		// const token = localStorage.getItem('token');
		// if (token) {
		//   config.headers.Authorization = `Bearer ${token}`;
		// }

		// CSRF: Add required headers on unsafe methods
		const method = (config.method || 'get').toLowerCase();
		if (!['get','head','options'].includes(method)) {
			config.headers = config.headers || {};
			config.headers['X-Requested-With'] = 'XMLHttpRequest';
			try {
				const token = await ensureCsrfToken();
				if (token) {
					config.headers['X-CSRF-Token'] = token;
				}
			} catch (_) {}
		}

		// console log is noisy; keep minimal if needed
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
	async (error) => {
		console.error("❌ API Error:", error);

		// Handle common error scenarios
		if (error.response) {
			// Server responded with error status
			const { status, data } = error.response;
			const originalRequest = error.config;

			// CSRF 403 auto-refresh + one-time retry for unsafe methods
			const method = (originalRequest?.method || 'get').toLowerCase();
			if (
				status === 403 &&
				!originalRequest?._csrfRetry &&
				!['get','head','options'].includes(method)
			) {
				originalRequest._csrfRetry = true;
				try {
					const res = await baseClient.get('/security/csrf/');
					const fresh = res?.data?.csrfToken || null;
					if (fresh) {
						csrfToken = fresh;
						originalRequest.headers = originalRequest.headers || {};
						originalRequest.headers['X-CSRF-Token'] = fresh;
					}
					return apiClient(originalRequest);
				} catch (_) {
					// fall through
				}
			}

			// Add a check to prevent re-trying the refresh token endpoint
			if (originalRequest.url.includes("token/refresh")) {
				console.error("❌ Refresh token itself failed. Logging out.");
				window.dispatchEvent(new Event("logout"));
				return Promise.reject(error); // Reject to stop the cycle
			}

			switch (status) {
				case 401:
					console.warn("🔒 Unauthorized - attempting token refresh");
					// Try to refresh token and retry the request
					if (!originalRequest._retry) {
						originalRequest._retry = true;
						try {
							await authAPI.refreshToken();
							console.log("✅ Token refreshed, retrying request");
							return apiClient(originalRequest);
						} catch (refreshError) {
							console.error("❌ Token refresh failed:", refreshError);
							// Dispatch a global event to notify the app to log out
							window.dispatchEvent(new Event("logout"));
							// Token refresh failed, redirect to login might be needed
							// For now, just reject the original error
						}
					}
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
