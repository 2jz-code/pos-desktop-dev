import axios from "axios";

const apiClient = axios.create({
	baseURL: "http://127.0.0.1:8001/api",
	withCredentials: true, // This is crucial for sending cookies
});

// Response Interceptor
apiClient.interceptors.response.use(
	(response) => {
		// If the request was successful, just return the response
		return response;
	},
	async (error) => {
		const originalRequest = error.config;

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
