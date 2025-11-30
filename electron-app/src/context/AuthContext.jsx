import { createContext, useContext, useState, useEffect } from "react";
import {
	loginWithPin,
	checkAuthStatus,
	logout as apiLogout, // Aliased import to avoid name collision
} from "@/domains/auth/services/authService";
import { refreshAuthToken } from "@/shared/lib/apiClient";
import { clearRelationCache } from "@/shared/lib/offlineInitialization";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
	// Load cached user from localStorage immediately (cache-first)
	const [user, setUser] = useState(() => {
		try {
			const cachedUser = localStorage.getItem('auth_user');
			if (cachedUser) {
				console.log('✅ [Auth] Loading user from cache');
				return JSON.parse(cachedUser);
			}
		} catch (error) {
			console.warn('⚠️ [Auth] Failed to load cached user:', error);
		}
		return null;
	});
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const verifyAuth = async () => {
			try {
				// Verify auth in background (don't block rendering)
				console.log('🔄 [Auth] Verifying auth status in background...');
				const response = await checkAuthStatus();
				// Extract user object from response (backend returns { user, tenant })
				const userData = response.data.user || response.data;

				// Update user and cache
				setUser(userData);
				localStorage.setItem('auth_user', JSON.stringify(userData));
				console.log('✅ [Auth] Auth verified and cached');
			} catch (error) {
				// Check if this is a network error (offline) vs actual auth failure
				const isNetworkError = !navigator.onLine ||
					error.message === 'Network Error' ||
					error.code === 'ERR_NETWORK' ||
					error.code === 'ECONNABORTED';

				if (isNetworkError) {
					// Offline - keep cached user, don't clear auth
					console.log('📴 [Auth] Offline - keeping cached user session');
					// User state already loaded from cache in useState initializer
				} else {
					// Real auth failure (401, expired token, etc.) - clear cache
					console.warn('⚠️ [Auth] Auth verification failed, clearing cache');
					await apiLogout();
					setUser(null);
					localStorage.removeItem('auth_user');
				}
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
				await refreshAuthToken(); // Use shared refresh function with cooldown
			} catch (error) {
				console.warn(
					"[Auth] Token refresh failed, user may need to re-login",
					error
				);
				// Don't logout automatically - let the user continue until next 401
			}
		};

		// Don't refresh immediately on login - it conflicts with 401 interceptor
		// The 401 interceptor will handle the first refresh if needed
		// Just set up the interval for periodic refresh

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
			// Cache user in localStorage for instant load on next app start
			localStorage.setItem('auth_user', JSON.stringify(userData));
			console.log('✅ [Auth] User logged in and cached');
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
			// Clear cached user from localStorage
			localStorage.removeItem('auth_user');
			// Clear relation caches (categories, product types, taxes)
			clearRelationCache();
			console.log('✅ [Auth] User logged out and cache cleared');
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
