import { useQuery } from "@tanstack/react-query";
import settingsAPI from "../api/settings";

// Query keys for settings
export const settingsKeys = {
	all: ["settings"],
	financial: () => [...settingsKeys.all, "financial"],
	storeInfo: () => [...settingsKeys.all, "store-info"],
	summary: () => [...settingsKeys.all, "summary"],
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
