import apiClient from "./client";

const discountService = {
	getDiscounts(filters = {}) {
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
		return apiClient.get("/discounts/", { params });
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
};

export default discountService;
