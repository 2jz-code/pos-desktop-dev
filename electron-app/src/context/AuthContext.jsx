import { createContext, useContext, useState, useEffect } from "react";
import {
	loginWithPin,
	checkAuthStatus,
	logout as apiLogout, // Aliased import to avoid name collision
} from "@/domains/auth/services/authService";

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
