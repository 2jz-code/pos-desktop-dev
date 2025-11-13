import apiClient from "./client";

const discountService = {
	async getDiscounts(filters = {}) {
		const params = new URLSearchParams();
		if (filters.type) {
			params.append("type", filters.type);
		}
		if (filters.scope) {
			params.append("scope", filters.scope);
		}
		if (filters.is_active) {
			params.append("is_active", filters.is_active);
		}
		if (filters.search) {
			params.append("search", filters.search);
		}
		// Only add include_archived if it's explicitly set (not undefined)
		if (filters.include_archived !== undefined) {
			params.append("include_archived", filters.include_archived);
		}
		const response = await apiClient.get("/discounts/", { params });
		return response.data;
	},

	createDiscount(data) {
		return apiClient.post("/discounts/", data);
	},

	updateDiscount(id, data) {
		return apiClient.put(`/discounts/${id}/`, data);
	},

	deleteDiscount(id) {
		return apiClient.delete(`/discounts/${id}/`);
	},

	// Archive operations
	async archiveDiscount(id) {
		const response = await apiClient.post(`/discounts/${id}/archive/`);
		return response.data;
	},

	async unarchiveDiscount(id) {
		const response = await apiClient.post(`/discounts/${id}/unarchive/`);
		return response.data;
	},

	// Bulk archive operations
	async bulkArchiveDiscounts(ids) {
		const response = await apiClient.post("/discounts/bulk_archive/", {
			ids: ids
		});
		return response.data;
	},

	async bulkUnarchiveDiscounts(ids) {
		const response = await apiClient.post("/discounts/bulk_unarchive/", {
			ids: ids
		});
		return response.data;
	},
};

export default discountService;
