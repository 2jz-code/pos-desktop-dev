import axios from "axios";
import { createDeviceAuth } from "./deviceAuth";

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
let refreshPromise = null;
let lastRefreshTime = 0;
const REFRESH_COOLDOWN_MS = 5000; // 5 second cooldown between refreshes

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

/**
 * Shared token refresh function used by both interceptor and AuthContext
 * Ensures only one refresh happens at a time via serialized promise
 * @param {boolean} skipCooldown - Skip cooldown check (for forced refresh)
 * @returns {Promise<void>}
 */
export async function refreshAuthToken(skipCooldown = false) {
  // Check cooldown to prevent rapid successive refreshes
  const now = Date.now();
  if (!skipCooldown && (now - lastRefreshTime) < REFRESH_COOLDOWN_MS) {
    console.log(`⏭️ [Auth] Skipping refresh - last refresh was ${Math.round((now - lastRefreshTime) / 1000)}s ago`);
    return;
  }

  // Serialize refresh to avoid rotating the same token concurrently
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        console.log('🔄 [Auth] Refreshing token...');
        const headers = { "X-Requested-With": "XMLHttpRequest" };
        const token = await ensureCsrfToken().catch(() => null);
        if (token) headers["X-CSRF-Token"] = token;

        await baseClient.post("/users/token/refresh/", null, { headers });

        lastRefreshTime = Date.now();
        console.log('✅ [Auth] Token refreshed successfully');
      } catch (error) {
        console.error('❌ [Auth] Token refresh failed:', error.response?.data || error.message);
        throw error;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  return refreshPromise;
}

// Request Interceptor - Add any additional headers or processing
apiClient.interceptors.request.use(
	async (config) => {
		// Note: User-Agent and Origin headers are managed by the browser/Electron
		// and should not be manually set as they are considered unsafe headers

		config.headers = config.headers || {};

		// Read terminal config from localStorage for both location and tenant
		let terminalConfig = null;
		try {
			const terminalConfigStr = localStorage.getItem('terminal_config');
			if (terminalConfigStr) {
				terminalConfig = JSON.parse(terminalConfigStr);
			}
		} catch (_) {
			// If localStorage or parsing fails, proceed without the config
		}

		// Add X-Store-Location header for location-scoped filtering
		// Skip for terminal registration/pairing endpoints (they don't need location context)
		const skipLocationHeader =
			config.url?.includes('/terminals/pairing/') ||
			config.url?.includes('/terminals/registrations/by-fingerprint/');

		if (!skipLocationHeader) {
			// Use cachedLocationId if set, otherwise try to get from terminal_config
			const locationId = cachedLocationId || terminalConfig?.location_id;

			if (locationId) {
				config.headers['X-Store-Location'] = locationId;
				console.log(`📍 [API] Adding X-Store-Location: ${locationId} to ${config.url}`);
			} else {
				console.warn(`⚠️ [API] No location ID for request to ${config.url}`);
			}
		}

		// Add X-Tenant header from terminal config
		// This allows tenant resolution even when JWT is expired (for token refresh)
		if (terminalConfig?.tenant_slug) {
			config.headers['X-Tenant'] = terminalConfig.tenant_slug;
			console.log(`🏢 [API] Adding X-Tenant: ${terminalConfig.tenant_slug} to ${config.url}`);
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

		// Add device authentication for sync endpoints
		// These endpoints require HMAC signature to prove terminal identity
		// IMPORTANT: Do NOT apply to JWT refresh endpoint
		const requiresDeviceAuth =
			(config.url?.includes('/sync/') || config.url?.includes('/datasets/')) &&
			!config.url?.includes('/users/token/refresh/');

		if (requiresDeviceAuth) {
			console.log(`🔐 [API] Generating device auth for ${config.url}`);
			try {
				// Get current request body (if any)
				const requestBody = config.data || {};

				// Generate device authentication
				const deviceAuth = await createDeviceAuth(requestBody);

				if (deviceAuth) {
					// Add headers
					Object.assign(config.headers, deviceAuth.headers);

					// Inject auth fields into request body
					// This is required - backend reads device_id, nonce, created_at from request.data
					// Auth fields MUST override any user-supplied values (security)
					config.data = {
						...requestBody,
						...deviceAuth.authFields
					};

					console.log(`✅ [API] Added device auth to ${config.url}`);
				} else {
					console.warn(`⚠️ [API] No pairing info - skipping device auth for ${config.url}`);
				}
			} catch (error) {
				console.error('⚠️ [API] Failed to generate device auth:', error);
				// Proceed without device auth - backend will reject with 401
			}
		} else {
			console.log(`⏭️ [API] Skipping device auth for ${config.url}`);
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

		// Debug: Log device auth errors
		if (error.response?.status === 401 && error.response?.data?.detail?.includes('timestamp')) {
			console.error('❌ [API] Device auth timestamp error:', {
				url: originalRequest?.url,
				requestTimestamp: originalRequest?.data?.created_at,
				serverTime: error.response?.headers?.date,
				errorDetail: error.response?.data?.detail,
				clientTime: new Date().toISOString()
			});
		}

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

				// Clear device auth fields so fresh ones are generated on retry
				if (originalRequest.data) {
					delete originalRequest.data.device_id;
					delete originalRequest.data.nonce;
					delete originalRequest.data.created_at;
					delete originalRequest.headers['X-Device-ID'];
					delete originalRequest.headers['X-Device-Nonce'];
					delete originalRequest.headers['X-Device-Signature'];
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
				// Use shared refresh function to ensure only one refresh at a time
				await refreshAuthToken(true); // Skip cooldown for 401 errors

				// Clear device auth fields so fresh ones are generated on retry
				if (originalRequest.data) {
					delete originalRequest.data.device_id;
					delete originalRequest.data.nonce;
					delete originalRequest.data.created_at;
					delete originalRequest.headers['X-Device-ID'];
					delete originalRequest.headers['X-Device-Nonce'];
					delete originalRequest.headers['X-Device-Signature'];
				}

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
