import axios from "axios";

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
		// Add CSRF stopgap header on unsafe methods so the backend permits cookie-auth writes
		const method = (config.method || 'get').toLowerCase();
		if (!['get', 'head', 'options'].includes(method)) {
			config.headers = config.headers || {};
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
			if (originalRequest.url === "/users/token/refresh/") {
				// If the refresh token request itself fails, just reject.
				// No more hard redirects.
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
