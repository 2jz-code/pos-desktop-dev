import axios, { type AxiosInstance } from "axios";

const apiClient: AxiosInstance = axios.create({
	baseURL: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8001/api",
	timeout: parseInt(import.meta.env.VITE_API_TIMEOUT_MS) || 10000,
	withCredentials: true, // This is crucial for sending cookies
});

// Bare client without interceptors for CSRF token fetch
const baseClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8001/api",
  timeout: parseInt(import.meta.env.VITE_API_TIMEOUT_MS) || 10000,
  withCredentials: true,
});

let csrfToken: string | null = null;
let csrfPromise: Promise<string | null> | null = null;

async function ensureCsrfToken(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  if (!csrfPromise) {
    csrfPromise = baseClient
      .get("/security/csrf/")
      .then((res) => {
        csrfToken = (res?.data as any)?.csrfToken || null;
        return csrfToken;
      })
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

// Token refresh state management
let isRefreshing = false;
let refreshPromise: Promise<void> | null = null;

async function refreshToken(): Promise<void> {
  // If refresh is already in progress, wait for it
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  // Start a new refresh
  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      // Get CSRF token first
      const token = await ensureCsrfToken();

      // Use baseClient to avoid interceptor recursion
      await baseClient.post("/users/token/refresh/", {}, {
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          ...(token ? { 'X-CSRF-Token': token } : {})
        }
      });

      // Success - new token is set in cookies automatically
    } catch (error) {
      // Refresh failed - clear state and throw
      throw error;
    } finally {
      // Clear refresh state
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// Request interceptor: add CSRF headers for unsafe methods and store location header
apiClient.interceptors.request.use(
  async (config) => {
    const method = (config.method || "get").toLowerCase();

    // Add CSRF headers for unsafe methods
    if (!["get", "head", "options"].includes(method)) {
      config.headers = config.headers || {};
      (config.headers as any)["X-Requested-With"] = "XMLHttpRequest";
      try {
        const token = await ensureCsrfToken();
        if (token) {
          (config.headers as any)["X-CSRF-Token"] = token;
        }
      } catch (_) {
        // proceed; server may 403 and we will retry once in response interceptor
      }
    }

    // Add store location header from localStorage if available
    // This is set by the LocationContext when user selects a location
    try {
      const selectedLocationId = localStorage.getItem('selected-location-id');
      if (selectedLocationId && selectedLocationId !== 'null') {
        config.headers = config.headers || {};
        (config.headers as any)["X-Store-Location"] = selectedLocationId;
      }
    } catch (_) {
      // If localStorage is not available or fails, proceed without the header
    }

    // Add tenant header from URL path
    // Admin URLs are formatted as: admin.bakeajeen.com/{tenant-slug}/...
    // This allows tenant resolution even when JWT is expired (for token refresh)
    try {
      const pathSegments = window.location.pathname.split('/').filter(Boolean);
      const tenantSlug = pathSegments[0]; // First segment is tenant slug
      if (tenantSlug && tenantSlug !== 'login') {
        config.headers = config.headers || {};
        (config.headers as any)["X-Tenant"] = tenantSlug;
      }
    } catch (_) {
      // If URL parsing fails, proceed without the header
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor
apiClient.interceptors.response.use(
	(response) => {
		// If the request was successful, just return the response
		return response;
	},
	async (error) => {
		const originalRequest = error.config;
		originalRequest._retry = originalRequest._retry || false;

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
				const fresh = (res?.data as any)?.csrfToken || null;
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

		// Check if the error is 401 Unauthorized and if we haven't already retried
		if (error.response?.status === 401 && !originalRequest._retry) {
			if (originalRequest.url === "/users/token/refresh/") {
				// If the refresh token request itself fails, just reject.
				// No more hard redirects.
				return Promise.reject(error);
			}

			originalRequest._retry = true; // Mark the request to prevent infinite loops

			try {
				// Use centralized refresh function to prevent concurrent refresh attempts
				await refreshToken();
				// Token refreshed successfully, retry the original request
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
