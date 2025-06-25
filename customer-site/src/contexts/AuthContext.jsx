import React, {
	createContext,
	useState,
	useEffect,
	useContext,
	useCallback,
} from "react";
import { authAPI } from "@/api/auth";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [user, setUser] = useState(null);
	const [isLoading, setIsLoading] = useState(true);

	const verifyAuth = useCallback(async () => {
		setIsLoading(true);
		try {
			const { isAuthenticated: authStatus, user: userData } =
				await authAPI.checkAuth();
			setIsAuthenticated(authStatus);
			setUser(userData);
		} catch (error) {
			console.error("Auth check failed:", error);
			setIsAuthenticated(false);
			setUser(null);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		verifyAuth();
		// Optional: Periodically re-check auth status
		const intervalId = setInterval(verifyAuth, 15 * 60 * 1000); // every 15 minutes
		return () => clearInterval(intervalId);
	}, [verifyAuth]);

	const login = async (credentials) => {
		try {
			const userData = await authAPI.login(credentials);
			setUser(userData);
			setIsAuthenticated(true);
			return { success: true };
		} catch (error) {
			console.error("Login failed:", error);
			return {
				success: false,
				error:
					error.response?.data?.detail ||
					"Login failed. Please check your credentials.",
			};
		}
	};

	const logout = async () => {
		try {
			await authAPI.logout();
		} catch (error) {
			console.error("Logout API call failed:", error);
		} finally {
			setIsAuthenticated(false);
			setUser(null);
			// Redirect to login or home page after logout
			window.location.href = "/auth";
		}
	};

	const contextValue = {
		isAuthenticated,
		user,
		isLoading,
		login,
		logout,
		setUser, // For manual updates if needed
		setIsAuthenticated, // For manual updates if needed
	};

	return (
		<AuthContext.Provider value={contextValue}>
			{!isLoading && children}
		</AuthContext.Provider>
	);
};
// eslint-disable-next-line
export const useAuth = () => {
	const context = useContext(AuthContext);
	if (context === null) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
};
