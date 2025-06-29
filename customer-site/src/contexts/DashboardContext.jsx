import React, { createContext, useState, useContext, useEffect } from "react";
import userAPI from "@/api/user";
import { useAuth } from "@/contexts/AuthContext";

const DashboardContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useDashboard = () => useContext(DashboardContext);

export default function DashboardProvider({ children }) {
	const [activeTab, setActiveTab] = useState("profile");
	const [profile, setProfile] = useState(null);
	const [orders, setOrders] = useState([]);
	const [isLoadingProfile, setIsLoadingProfile] = useState(true);
	const [isLoadingOrders, setIsLoadingOrders] = useState(true);
	const [error, setError] = useState(null);
	const { user } = useAuth();

	useEffect(() => {
		const fetchProfile = async () => {
			if (!user) return;
			try {
				setIsLoadingProfile(true);
				const data = await userAPI.getUserProfile();
				setProfile(data);
			} catch (err) {
				setError(err.detail || "Failed to fetch profile.");
			} finally {
				setIsLoadingProfile(false);
			}
		};

		const fetchOrders = async () => {
			if (!user) return;
			try {
				setIsLoadingOrders(true);
				const data = await userAPI.getOrderHistory();
				setOrders(data);
			} catch (err) {
				setError(err.detail || "Failed to fetch order history.");
			} finally {
				setIsLoadingOrders(false);
			}
		};

		fetchProfile();
		fetchOrders();
	}, [user]);

	const updateProfile = async (profileData) => {
		try {
			const updatedProfile = await userAPI.updateUserProfile(profileData);
			setProfile(updatedProfile);
			return { success: true };
		} catch (error) {
			console.error("Failed to update profile:", error);
			return {
				success: false,
				error: error.detail || "An unknown error occurred",
			};
		}
	};

	const value = {
		activeTab,
		setActiveTab,
		profile,
		updateProfile,
		isLoadingProfile,
		orders,
		isLoadingOrders,
		error,
	};

	return (
		<DashboardContext.Provider value={value}>
			{children}
		</DashboardContext.Provider>
	);
}
