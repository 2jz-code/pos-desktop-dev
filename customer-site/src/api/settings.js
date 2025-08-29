import apiClient from "./client";

// Settings API service
const settingsAPI = {
	// Get financial settings (tax rate, surcharge percentage, currency)
	getFinancialSettings: async () => {
		const response = await apiClient.get(
			"/settings/global-settings/financial/"
		);
		return response.data;
	},

	// Get store information
	getStoreInfo: async () => {
		const response = await apiClient.get(
			"/settings/global-settings/store-info/"
		);
		return response.data;
	},

	// Get receipt configuration
	getReceiptConfig: async () => {
		const response = await apiClient.get(
			"/settings/global-settings/receipt-config/"
		);
		return response.data;
	},

	// Get business hours (legacy endpoint)
	getBusinessHours: async () => {
		const response = await apiClient.get(
			"/settings/global-settings/business-hours/"
		);
		return response.data;
	},

	// Get current business hours status (open/closed)
	getBusinessHoursStatus: async () => {
		const response = await apiClient.get("/business-hours/status/");
		return response.data;
	},

	// Get weekly schedule
	getWeeklySchedule: async () => {
		const response = await apiClient.get("/business-hours/schedule/");
		return response.data;
	},

	// Get today's specific hours
	getTodayHours: async () => {
		const response = await apiClient.get("/business-hours/today/");
		return response.data;
	},

	// Check if store is open at specific time
	checkIfOpen: async (datetime) => {
		const response = await apiClient.post("/business-hours/check/", {
			datetime: datetime
		});
		return response.data;
	},

	// Get settings summary
	getSummary: async () => {
		const response = await apiClient.get("/settings/global-settings/summary/");
		return response.data;
	},

	// Get all settings
	getAllSettings: async () => {
		const response = await apiClient.get("/settings/global-settings/");
		return response.data;
	},
};

export default settingsAPI;
export { settingsAPI };
