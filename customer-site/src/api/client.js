import axios from "axios";
import { authAPI } from "./auth";

/**
 * Extract tenant slug from current domain
 * Examples:
 *   jimmys-pizza.localhost → "jimmys-pizza"
 *   jimmys-pizza.mydomain.com → "jimmys-pizza"
 *   www.mydomain.com → null (no tenant)
 */
const getTenantSlug = () => {
	const hostname = window.location.hostname;
	const parts = hostname.split(".");

	// Handle .localhost (dev)
	if (parts.length === 2 && parts[1] === "localhost") {
		return parts[0];
	}

	// Handle production domains (tenant.mydomain.com)
	if (parts.length >= 3 && parts[0] !== "www") {
		return parts[0];
	}

	return null;
};

/**
 * Determine API base URL
 * Dev: Single shared API (localhost:8001) + X-Tenant header
 * Prod: Single shared API (api.mydomain.com) + X-Tenant header
 */
const getApiBaseUrl = () => {
	const isDev = window.location.hostname.includes("localhost");

	if (isDev) {
		// Dev: Single API endpoint (no subdomain matching)
		// Tenant resolution via X-Tenant header
		return "https://localhost:8001/api";
	}

	// Prod: Use env var or default shared API
	// Tenant resolution via X-Tenant header
	return import.meta.env.VITE_API_URL || "https://api.mydomain.com/api";
};

// Base API URL
const API_BASE_URL = getApiBaseUrl();

console.log("🌐 API Base URL:", API_BASE_URL);
console.log("🏢 Tenant Slug:", getTenantSlug());

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
		config.headers = config.headers || {};

		// Add X-Tenant header for tenant isolation
		// In dev: Subdomain extraction also works, but header doesn't hurt
		// In prod: Required when using shared API domain (api.mydomain.com)
		const tenantSlug = getTenantSlug();
		if (tenantSlug) {
			config.headers["X-Tenant"] = tenantSlug;
		}

		// Add any auth tokens here if you're using token-based auth
		// const token = localStorage.getItem('token');
		// if (token) {
		//   config.headers.Authorization = `Bearer ${token}`;
		// }

		// CSRF: Add required headers on unsafe methods
		const method = (config.method || "get").toLowerCase();
		if (!["get", "head", "options"].includes(method)) {
			config.headers["X-Requested-With"] = "XMLHttpRequest";
			try {
				const token = await ensureCsrfToken();
				if (token) {
					config.headers["X-CSRF-Token"] = token;
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
			const method = (originalRequest?.method || "get").toLowerCase();
			if (
				status === 403 &&
				!originalRequest?._csrfRetry &&
				!["get", "head", "options"].includes(method)
			) {
				originalRequest._csrfRetry = true;
				try {
					const res = await baseClient.get("/security/csrf/");
					const fresh = res?.data?.csrfToken || null;
					if (fresh) {
						csrfToken = fresh;
						originalRequest.headers = originalRequest.headers || {};
						originalRequest.headers["X-CSRF-Token"] = fresh;
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
