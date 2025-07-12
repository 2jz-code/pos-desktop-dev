import apiClient from "./client";

export const dashboardService = {
	// Get dashboard metrics
	async getDashboardStats() {
		const response = await apiClient.get("/dashboard/stats/");
		return response.data;
	},

	// Get recent orders
	async getRecentOrders(limit = 10) {
		const response = await apiClient.get(
			`/orders/?limit=${limit}&ordering=-created_at`
		);
		return response.data;
	},

	// Get low stock alerts
	async getLowStockAlerts() {
		const response = await apiClient.get("/inventory/low-stock/");
		return response.data;
	},

	// Get today's sales summary
	async getTodaysSales() {
		const today = new Date().toISOString().split("T")[0];
		const response = await apiClient.get(
			`/orders/sales-summary/?date=${today}`
		);
		return response.data;
	},

	// Get monthly sales comparison
	async getMonthlySales() {
		const response = await apiClient.get("/orders/monthly-sales/");
		return response.data;
	},

	// Get product performance
	async getProductPerformance(limit = 5) {
		const response = await apiClient.get(
			`/products/performance/?limit=${limit}`
		);
		return response.data;
	},

	// Get user activity
	async getUserActivity() {
		const response = await apiClient.get("/users/activity/");
		return response.data;
	},

	// Get system status
	async getSystemStatus() {
		const response = await apiClient.get("/system/status/");
		return response.data;
	},
};
