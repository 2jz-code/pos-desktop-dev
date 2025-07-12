import { createContext, useContext, useState, useEffect } from "react";
import {
	loginWithEmail,
	checkAuthStatus,
	logout as apiLogout, // Aliased import to avoid name collision
} from "@/services/auth/authService";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
	const [user, setUser] = useState(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const verifyAuth = async () => {
			try {
				const response = await checkAuthStatus();
				setUser(response.data);
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

	const login = async (email, password) => {
		setLoading(true);
		try {
			const response = await loginWithEmail(email, password);

			// Check if user has owner role - this is an owner-only admin site
			if (response.data.user.role !== "OWNER") {
				await apiLogout(); // Clear any cookies that might have been set
				setLoading(false);
				throw new Error(
					"Access denied. This admin panel is restricted to owners only."
				);
			}

			setUser(response.data.user);
			setLoading(false);
			return response.data.user;
		} catch (error) {
			setLoading(false);
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
