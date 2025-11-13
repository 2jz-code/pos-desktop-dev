import { createContext, useContext, useState, useEffect } from "react";
import {
	loginWithPin,
	checkAuthStatus,
	logout as apiLogout, // Aliased import to avoid name collision
} from "@/domains/auth/services/authService";
import apiClient from "@/shared/lib/apiClient";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
	const [user, setUser] = useState(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const verifyAuth = async () => {
			try {
				const response = await checkAuthStatus();
				// Extract user object from response (backend returns { user, tenant })
				const userData = response.data.user || response.data;
				setUser(userData);
				// eslint-disable-next-line no-unused-vars
			} catch (error) {
				// This is expected if the user is not logged in
				// console.error("Auth check failed:", error); // Optional: log for debugging
				await apiLogout();
				setUser(null);
			} finally {
				setLoading(false);
			}
		};
		verifyAuth();
	}, []);

	// Proactive token refresh - refreshes tokens before they expire
	// This prevents WebSocket disconnections during long POS shifts
	useEffect(() => {
		if (!user) return; // Only run if user is logged in

		const REFRESH_INTERVAL_MS = 45 * 60 * 1000; // 45 minutes (before 1-hour expiry)

		const refreshTokenProactively = async () => {
			try {
				console.log("[Auth] Proactively refreshing token...");
				await apiClient.post("/users/token/refresh/");
				console.log("[Auth] Token refreshed successfully");
			} catch (error) {
				console.warn(
					"[Auth] Token refresh failed, user may need to re-login",
					error
				);
				// Don't logout automatically - let the user continue until next 401
			}
		};

		// Refresh immediately on login (to reset timer)
		refreshTokenProactively();

		// Set up interval for periodic refresh
		const intervalId = setInterval(
			refreshTokenProactively,
			REFRESH_INTERVAL_MS
		);

		// Cleanup interval on logout or unmount
		return () => clearInterval(intervalId);
	}, [user]); // Re-run when user changes (login/logout)

	const login = async (username, pin) => {
		// Don't set loading here - it causes the whole page to unmount
		// Let the LoginPage handle its own loading state
		try {
			const response = await loginWithPin(username, pin);
			// Backend now returns { user, tenant } for POS login
			const userData = response.data.user || response.data;
			setUser(userData);
			return userData;
		} catch (error) {
			// Extract error message from backend response for ALL errors
			if (error.response?.data?.error) {
				error.message = error.response.data.error;
			} else if (!error.message) {
				error.message = "Failed to log in. Please check your credentials.";
			}
			throw error;
		}
	};

	const logout = async () => {
		try {
			await apiLogout(); // Call the backend logout endpoint
		} catch (error) {
			console.error("Logout failed on the backend:", error);
			// Still proceed to log out the user on the client side
		} finally {
			// For cookie-based auth, we just need to clear the state.
			// The actual cookie clearing is done by the backend on the /logout endpoint.
			setUser(null);
		}
	};

	const value = {
		user,
		loading,
		login,
		logout,
		isAuthenticated: !!user,
		isOwner: user?.role === "OWNER",
		isManager: user?.role === "MANAGER",
		isCashier: user?.role === "CASHIER",
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
	return useContext(AuthContext);
};
