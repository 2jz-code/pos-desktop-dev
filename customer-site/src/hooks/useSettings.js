import { useQuery } from "@tanstack/react-query";
import settingsAPI from "../api/settings";

// Query keys for settings
export const settingsKeys = {
	all: ["settings"],
	financial: () => [...settingsKeys.all, "financial"],
	storeInfo: () => [...settingsKeys.all, "store-info"],
	summary: () => [...settingsKeys.all, "summary"],
	businessHours: () => [...settingsKeys.all, "business-hours"],
	businessHoursStatus: () => [...settingsKeys.all, "business-hours", "status"],
	weeklySchedule: () => [...settingsKeys.all, "business-hours", "schedule"],
	todayHours: () => [...settingsKeys.all, "business-hours", "today"],
};

// Hook to fetch financial settings (tax rate, surcharge percentage)
export const useFinancialSettings = () => {
	return useQuery({
		queryKey: settingsKeys.financial(),
		queryFn: settingsAPI.getFinancialSettings,
		staleTime: 5 * 60 * 1000, // 5 minutes - settings don't change often
		cacheTime: 10 * 60 * 1000, // 10 minutes
		refetchOnWindowFocus: false, // Don't refetch on window focus for settings
	});
};

// Hook to fetch store information
export const useStoreInfo = () => {
	return useQuery({
		queryKey: settingsKeys.storeInfo(),
		queryFn: settingsAPI.getStoreInfo,
		staleTime: 5 * 60 * 1000,
		cacheTime: 10 * 60 * 1000,
		refetchOnWindowFocus: false,
	});
};

// Hook to fetch settings summary
export const useSettingsSummary = () => {
	return useQuery({
		queryKey: settingsKeys.summary(),
		queryFn: settingsAPI.getSummary,
		staleTime: 5 * 60 * 1000,
		cacheTime: 10 * 60 * 1000,
		refetchOnWindowFocus: false,
	});
};

// Hook to fetch current business hours status (open/closed)
export const useBusinessHoursStatus = () => {
	return useQuery({
		queryKey: settingsKeys.businessHoursStatus(),
		queryFn: settingsAPI.getBusinessHoursStatus,
		staleTime: 1 * 60 * 1000, // 1 minute - status changes frequently
		cacheTime: 2 * 60 * 1000, // 2 minutes
		refetchOnWindowFocus: true, // Refetch when user returns to tab
		refetchInterval: 60 * 1000, // Refetch every minute
	});
};

// Hook to fetch weekly schedule
export const useWeeklySchedule = () => {
	return useQuery({
		queryKey: settingsKeys.weeklySchedule(),
		queryFn: settingsAPI.getWeeklySchedule,
		staleTime: 5 * 60 * 1000, // 5 minutes - schedule doesn't change often
		cacheTime: 10 * 60 * 1000, // 10 minutes
		refetchOnWindowFocus: false,
	});
};

// Hook to fetch today's hours
export const useTodayHours = () => {
	return useQuery({
		queryKey: settingsKeys.todayHours(),
		queryFn: settingsAPI.getTodayHours,
		staleTime: 5 * 60 * 1000, // 5 minutes
		cacheTime: 10 * 60 * 1000, // 10 minutes
		refetchOnWindowFocus: false,
	});
};

// Hook to fetch legacy business hours configuration
export const useBusinessHours = () => {
	return useQuery({
		queryKey: settingsKeys.businessHours(),
		queryFn: settingsAPI.getBusinessHours,
		staleTime: 5 * 60 * 1000,
		cacheTime: 10 * 60 * 1000,
		refetchOnWindowFocus: false,
	});
};

// Helper function to remove trailing zeros from formatted numbers
const removeTrailingZeros = (numStr) => {
	return numStr.replace(/\.?0+$/, "");
};

// Helper function to format tax rate for display
export const formatTaxRate = (taxRate) => {
	if (!taxRate) return "0%";
	const percentage = parseFloat(taxRate) * 100;
	return `${removeTrailingZeros(percentage.toFixed(3))}%`;
};

// Helper function to format surcharge rate for display
export const formatSurchargeRate = (surchargeRate) => {
	if (!surchargeRate) return "0%";
	const percentage = parseFloat(surchargeRate) * 100;
	return `${removeTrailingZeros(percentage.toFixed(3))}%`;
};

// Helper function to format time for display (e.g., "14:30" -> "2:30 PM")
export const formatTime = (timeString) => {
	if (!timeString) return "";
	
	const [hours, minutes] = timeString.split(":");
	const hour = parseInt(hours, 10);
	const ampm = hour >= 12 ? "PM" : "AM";
	const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
	
	return `${displayHour}:${minutes} ${ampm}`;
};

// Helper function to format business hours for display
export const formatBusinessHoursRange = (openTime, closeTime) => {
	if (!openTime || !closeTime) return "Closed";
	return `${formatTime(openTime)} - ${formatTime(closeTime)}`;
};

// Helper function to get day name from day number
export const getDayName = (dayNumber) => {
	const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
	return days[dayNumber] || "";
};

// Helper function to get short day name from day number
export const getShortDayName = (dayNumber) => {
	const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	return days[dayNumber] || "";
};
