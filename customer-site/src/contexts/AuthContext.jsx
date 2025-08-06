import React, {
	createContext,
	useState,
	useEffect,
	useContext,
	useCallback,
} from "react";
import { authAPI } from "@/api/auth";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cartKeys } from "@/hooks/useCart";

const AuthContext = createContext(null);

export default function AuthContextProvider({ children }) {
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [user, setUser] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const queryClient = useQueryClient();

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
			setIsLoading(true);
			const response = await authAPI.login(credentials);

			if (response.user) {
				setUser(response.user);
				setIsAuthenticated(true);
				// Clear all cart cache and refetch - the backend will handle cart association
				queryClient.invalidateQueries({ queryKey: cartKeys.all });
				toast.success("Welcome back!");
				return { success: true };
			}

			return { success: false, error: "Login failed" };
		} catch (error) {
			const errorMessage =
				error.response?.data?.detail ||
				error.response?.data?.message ||
				"Login failed";

			toast.error(errorMessage);
			return { success: false, error: errorMessage };
		} finally {
			setIsLoading(false);
		}
	};

	const register = async (userData) => {
		try {
			setIsLoading(true);
			const response = await authAPI.register(userData);

			if (response.user) {
				setUser(response.user);
				setIsAuthenticated(true);
				// Clear all cart cache and refetch - the backend will handle cart association
				queryClient.invalidateQueries({ queryKey: cartKeys.all });
				toast.success("Account created successfully!");
				return { success: true };
			}

			return { success: false, error: "Registration failed" };
		} catch (error) {
			const errorMessage =
				error.response?.data?.detail ||
				error.response?.data?.message ||
				"Registration failed";

			// Handle field-specific errors
			const fieldErrors = error.response?.data;
			if (fieldErrors && typeof fieldErrors === "object") {
				// Return field errors for form handling
				return { success: false, fieldErrors };
			}

			toast.error(errorMessage);
			return { success: false, error: errorMessage };
		} finally {
			setIsLoading(false);
		}
	};

	const logout = async () => {
		try {
			await authAPI.logout();
			setUser(null);
			setIsAuthenticated(false);
			// Clear all cart cache - backend will provide fresh guest cart
			queryClient.invalidateQueries({ queryKey: cartKeys.all });
			toast.success("Logged out successfully");
		} catch (error) {
			console.error("Logout error:", error);
			// Still clear local state even if API call fails
			setUser(null);
			setIsAuthenticated(false);
			// Still clear cart cache on error
			queryClient.invalidateQueries({ queryKey: cartKeys.all });
		}
	};

	const updateProfile = async (profileData) => {
		try {
			const updatedUser = await authAPI.updateProfile(profileData);
			setUser(updatedUser);
			toast.success("Profile updated successfully");
			return { success: true };
		} catch (error) {
			const errorMessage =
				error.response?.data?.detail || "Failed to update profile";

			toast.error(errorMessage);
			return { success: false, error: errorMessage };
		}
	};

	const changePassword = async (passwordData) => {
		try {
			await authAPI.changePassword(passwordData);
			toast.success("Password changed successfully");
			return { success: true };
		} catch (error) {
			const errorMessage =
				error.response?.data?.detail || "Failed to change password";

			// Handle field-specific errors
			const fieldErrors = error.response?.data;
			if (fieldErrors && typeof fieldErrors === "object") {
				return { success: false, fieldErrors };
			}

			toast.error(errorMessage);
			return { success: false, error: errorMessage };
		}
	};

	const refreshToken = async () => {
		try {
			await authAPI.refreshToken();
			return true;
		} catch (error) {
			console.error("Token refresh failed:", error);
			setUser(null);
			setIsAuthenticated(false);
			return false;
		}
	};

	const contextValue = {
		isAuthenticated,
		user,
		isLoading,
		login,
		register,
		logout,
		updateProfile,
		changePassword,
		refreshToken,
		setUser, // For manual updates if needed
		setIsAuthenticated, // For manual updates if needed
	};

	return (
		<AuthContext.Provider value={contextValue}>
			{!isLoading && children}
		</AuthContext.Provider>
	);
}
// eslint-disable-next-line
export const useAuth = () => {
	const context = useContext(AuthContext);
	if (context === null) {
		throw new Error("useAuth must be used within an AuthContextProvider");
	}
	return context;
};
