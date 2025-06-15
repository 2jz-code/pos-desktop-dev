import { createContext, useContext, useState, useEffect } from "react";
import {
	loginWithPin,
	checkAuthStatus,
	logout as apiLogout, // Aliased import to avoid name collision
} from "@/api/services/authService";

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

	const login = async (username, pin) => {
		setLoading(true);
		try {
			const response = await loginWithPin(username, pin);
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
