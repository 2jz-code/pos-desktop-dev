import React, {
	createContext,
	useState,
	useEffect,
	useContext,
	useCallback,
	useMemo,
} from "react";
import { useBusinessHoursStatus } from "@/hooks/useSettings";
import settingsAPI from "@/api/settings";

const StoreStatusContext = createContext(null);

export default function StoreStatusProvider({ children }) {
	const [storeStatus, setStoreStatus] = useState({
		isOpen: false,
		nextOpenTime: null,
		nextCloseTime: null,
		timeUntilClose: null,
		canPlaceOrder: false,
		lastUpdated: null,
	});

	// Use the React Query hook for data fetching with real-time updates
	const { data: businessHoursStatus, isLoading, error, refetch } = useBusinessHoursStatus();

	// Update local state when business hours data changes
	useEffect(() => {
		if (businessHoursStatus) {
			const now = new Date();
			const nextCloseTime = businessHoursStatus.next_closing_time;
			let timeUntilClose = null;

			// Calculate time until close if store is open and has a closing time
			if (businessHoursStatus.is_open && nextCloseTime) {
				const closeDateTime = new Date();
				const [hours, minutes] = nextCloseTime.split(':');
				closeDateTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
				
				// If closing time is tomorrow (for overnight hours)
				if (closeDateTime <= now) {
					closeDateTime.setDate(closeDateTime.getDate() + 1);
				}
				
				timeUntilClose = Math.max(0, Math.floor((closeDateTime - now) / (1000 * 60))); // in minutes
			}

			setStoreStatus({
				isOpen: businessHoursStatus.is_open || false,
				nextOpenTime: businessHoursStatus.next_opening_time || null,
				nextCloseTime: businessHoursStatus.next_closing_time || null,
				timeUntilClose,
				canPlaceOrder: businessHoursStatus.is_open || false,
				lastUpdated: now,
			});
		} else if (error) {
			// Fallback: allow orders if we can't verify business hours (fail open)
			console.warn("Could not fetch business hours status, defaulting to allow orders:", error);
			setStoreStatus(prev => ({
				...prev,
				canPlaceOrder: true,
				lastUpdated: new Date(),
			}));
		}
	}, [businessHoursStatus, error]);

	// Check if store is open at a specific time
	const checkIfOpenAt = useCallback(async (datetime) => {
		try {
			const response = await settingsAPI.checkIfOpen(datetime);
			return response.is_open || false;
		} catch (error) {
			console.error("Error checking store hours:", error);
			// Fail open - allow orders if we can't verify
			return true;
		}
	}, []);

	// Get formatted time until close string
	const getTimeUntilCloseString = useCallback(() => {
		if (!storeStatus.isOpen || !storeStatus.timeUntilClose) return null;
		
		const minutes = storeStatus.timeUntilClose;
		if (minutes < 60) {
			return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
		}
		
		const hours = Math.floor(minutes / 60);
		const remainingMinutes = minutes % 60;
		
		if (remainingMinutes === 0) {
			return `${hours} hour${hours !== 1 ? 's' : ''}`;
		}
		
		return `${hours}h ${remainingMinutes}m`;
	}, [storeStatus.timeUntilClose, storeStatus.isOpen]);

	// Check if store is closing soon (within 30 minutes)
	const isClosingSoon = useCallback(() => {
		return storeStatus.isOpen && 
			   storeStatus.timeUntilClose !== null && 
			   storeStatus.timeUntilClose <= 30;
	}, [storeStatus.isOpen, storeStatus.timeUntilClose]);

	// Manual refresh function
	const refreshStoreStatus = useCallback(() => {
		refetch();
	}, [refetch]);

	// Format next opening time for display
	const getNextOpeningDisplay = useCallback(() => {
		if (!storeStatus.nextOpenTime) return null;
		
		const [hours, minutes] = storeStatus.nextOpenTime.split(':');
		const hour = parseInt(hours, 10);
		const ampm = hour >= 12 ? 'PM' : 'AM';
		const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
		
		return `${displayHour}:${minutes} ${ampm}`;
	}, [storeStatus.nextOpenTime]);

	const contextValue = useMemo(() => ({
		// Status information
		isOpen: storeStatus.isOpen,
		canPlaceOrder: storeStatus.canPlaceOrder,
		isClosingSoon: isClosingSoon(),
		timeUntilClose: storeStatus.timeUntilClose,
		nextOpenTime: storeStatus.nextOpenTime,
		nextCloseTime: storeStatus.nextCloseTime,
		lastUpdated: storeStatus.lastUpdated,
		
		// Loading states
		isLoading,
		error,
		
		// Helper functions
		checkIfOpenAt,
		getTimeUntilCloseString,
		getNextOpeningDisplay,
		refreshStoreStatus,
		
		// Raw status data
		storeStatus,
	}), [
		storeStatus.isOpen,
		storeStatus.canPlaceOrder,
		storeStatus.timeUntilClose,
		storeStatus.nextOpenTime,
		storeStatus.nextCloseTime,
		storeStatus.lastUpdated,
		isLoading,
		error,
		checkIfOpenAt,
		getTimeUntilCloseString,
		getNextOpeningDisplay,
		refreshStoreStatus,
		isClosingSoon,
		storeStatus
	]);

	return (
		<StoreStatusContext.Provider value={contextValue}>
			{children}
		</StoreStatusContext.Provider>
	);
}

// Custom hook to use store status
export const useStoreStatus = () => {
	const context = useContext(StoreStatusContext);
	if (context === null) {
		throw new Error("useStoreStatus must be used within a StoreStatusProvider");
	}
	return context;
};