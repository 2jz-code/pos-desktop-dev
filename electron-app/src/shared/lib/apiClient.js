import axios from "axios";

// Cache location ID to avoid circular dependency and repeated lookups
let cachedLocationId = null;

// Export setter for TerminalRegistrationService to update location
export function setLocationId(locationId) {
	cachedLocationId = locationId;
	console.log('📍 Location ID set for API client:', locationId);
}

const apiClient = axios.create({
	baseURL: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8001/api",
	timeout: parseInt(import.meta.env.VITE_API_TIMEOUT_MS) || 10000,
	withCredentials: true, // This is crucial for sending cookies
	headers: {
		'X-Client-Type': 'electron-pos',
		'X-Client-Version': '1.0.0',
	},
});

// Bare client without interceptors for CSRF token fetch
const baseClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8001/api",
  timeout: parseInt(import.meta.env.VITE_API_TIMEOUT_MS) || 10000,
  withCredentials: true,
});

let csrfToken = null;
let csrfPromise = null;

async function ensureCsrfToken() {
  if (csrfToken) return csrfToken;
  if (!csrfPromise) {
    csrfPromise = baseClient.get("/security/csrf/").then((res) => {
      csrfToken = res?.data?.csrfToken || null;
      return csrfToken;
    }).finally(() => {
      csrfPromise = null;
    });
  }
  return csrfPromise;
}

// Request Interceptor - Add any additional headers or processing
apiClient.interceptors.request.use(
	async (config) => {
		// Note: User-Agent and Origin headers are managed by the browser/Electron
		// and should not be manually set as they are considered unsafe headers

		config.headers = config.headers || {};

		// Add X-Store-Location header for location-scoped filtering
		// Skip for terminal registration/pairing endpoints (they don't need location context)
		const skipLocationHeader =
			config.url?.includes('/terminals/pairing/') ||
			config.url?.includes('/terminals/registrations/by-fingerprint/');

		if (!skipLocationHeader && cachedLocationId) {
			config.headers['X-Store-Location'] = cachedLocationId;
			console.log(`📍 [API] Adding X-Store-Location: ${cachedLocationId} to ${config.url}`);
		} else if (!skipLocationHeader && !cachedLocationId) {
			console.warn(`⚠️ [API] No location ID for request to ${config.url}`);
		}

		// Add X-Tenant header from terminal config
		// This allows tenant resolution even when JWT is expired (for token refresh)
		try {
			const terminalConfig = localStorage.getItem('terminal_config');
			if (terminalConfig) {
				const config_parsed = JSON.parse(terminalConfig);
				const tenantSlug = config_parsed.tenant_slug;
				if (tenantSlug) {
					config.headers['X-Tenant'] = tenantSlug;
					console.log(`🏢 [API] Adding X-Tenant: ${tenantSlug} to ${config.url}`);
				}
			}
		} catch (_) {
			// If localStorage or parsing fails, proceed without the header
		}

		// Add CSRF stopgap header on unsafe methods so the backend permits cookie-auth writes
		const method = (config.method || 'get').toLowerCase();
		if (!['get', 'head', 'options'].includes(method)) {
			config.headers['X-Requested-With'] = 'XMLHttpRequest';
			try {
				const token = await ensureCsrfToken();
				if (token) {
					config.headers['X-CSRF-Token'] = token;
				}
			} catch (_) {
				// If CSRF token fetch fails, proceed; server may reject with 403 which UI can handle
			}
		}

		return config;
	},
	(error) => {
		return Promise.reject(error);
	}
);

// Response Interceptor
apiClient.interceptors.response.use(
	(response) => {
		// If the request was successful, just return the response
		return response;
	},
	async (error) => {
		const originalRequest = error.config;

		// CSRF 403 auto-refresh + one-time retry for unsafe methods
		const method = (originalRequest?.method || 'get').toLowerCase();
		if (
			error.response?.status === 403 &&
			!originalRequest?._csrfRetry &&
			!['get', 'head', 'options'].includes(method)
		) {
			originalRequest._csrfRetry = true;
			try {
				const res = await baseClient.get('/security/csrf/');
				const fresh = res?.data?.csrfToken || null;
				if (fresh) {
					csrfToken = fresh; // update in-memory token immediately to avoid stale header
				}
				if (fresh) {
					originalRequest.headers = originalRequest.headers || {};
					originalRequest.headers['X-CSRF-Token'] = fresh;
				}
				return apiClient(originalRequest);
			} catch (_) {
				// fall through to normal error handling
			}
		}

		// Check if the error is 401 Unauthorized and if we haven't already retried
		if (error.response?.status === 401 && !originalRequest._retry) {
			// Don't try to refresh on login or refresh endpoints - these are auth failures, not expired tokens
			if (
				originalRequest.url === "/users/token/refresh/" ||
				originalRequest.url === "/users/login/pos/"
			) {
				// If the login or refresh request itself fails, just reject.
				return Promise.reject(error);
			}

			originalRequest._retry = true; // Mark the request to prevent infinite loops

			try {
				await apiClient.post("/users/token/refresh/");
				return apiClient(originalRequest);
			} catch (refreshError) {
				// If refresh fails, just reject.
				// The UI layer (AuthContext) will handle this.
				return Promise.reject(refreshError);
			}
		}

		// For all other errors, just pass them on
		return Promise.reject(error);
	}
);

export default apiClient;
