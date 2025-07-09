import React, {
	createContext,
	useState,
	useContext,
	useEffect,
	useCallback,
} from "react";
import userAPI from "@/api/user";
import { ordersAPI } from "@/api/orders"; // Import ordersAPI
import { useAuth } from "@/contexts/AuthContext";

const DashboardContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useDashboard = () => useContext(DashboardContext);

export default function DashboardProvider({ children }) {
	const [activeTab, setActiveTab] = useState("profile");
	const [profile, setProfile] = useState(null);
	const [orders, setOrders] = useState([]);
	const [nextUrl, setNextUrl] = useState(null);
	const [prevUrl, setPrevUrl] = useState(null);
	const [count, setCount] = useState(0);
	const [currentPage, setCurrentPage] = useState(1);
	const [isLoadingProfile, setIsLoadingProfile] = useState(true);
	const [isLoadingOrders, setIsLoadingOrders] = useState(true);
	const [error, setError] = useState(null);
	const { user } = useAuth();

	const fetchOrders = useCallback(
		async (url) => {
			if (!user) return;
			try {
				setIsLoadingOrders(true);
				// Use the paginated API call
				const data = await ordersAPI.getCurrentUserOrders(url);
				setOrders(data.results);
				setNextUrl(data.next);
				setPrevUrl(data.previous);
				setCount(data.count || 0);

				// Extract current page from URL or use page 1 as default
				if (url) {
					const urlObj = new URL(url);
					const page = parseInt(urlObj.searchParams.get("page") || "1");
					setCurrentPage(page);
				} else {
					setCurrentPage(1);
				}
			} catch (err) {
				setError(err.detail || "Failed to fetch order history.");
			} finally {
				setIsLoadingOrders(false);
			}
		},
		[user]
	);

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

		fetchProfile();
		fetchOrders(); // Initial fetch
	}, [user, fetchOrders]);

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

	const handleOrderNavigation = (url) => {
		if (url) {
			fetchOrders(url);
		}
	};

	const value = {
		activeTab,
		setActiveTab,
		profile,
		updateProfile,
		isLoadingProfile,
		orders,
		nextUrl,
		prevUrl,
		count,
		currentPage,
		handleOrderNavigation,
		isLoadingOrders,
		error,
	};

	return (
		<DashboardContext.Provider value={value}>
			{children}
		</DashboardContext.Provider>
	);
}
