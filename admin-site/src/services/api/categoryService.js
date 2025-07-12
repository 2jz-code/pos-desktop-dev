import apiClient from "./client";

// Category API service
export const getCategories = (params = {}) => {
	return apiClient.get("/products/categories/", { params });
};

export const getCategoryById = (id) => {
	return apiClient.get(`/products/categories/${id}/`);
};

export const createCategory = (categoryData) => {
	return apiClient.post("/products/categories/", categoryData);
};

export const updateCategory = (id, categoryData) => {
	return apiClient.put(`/products/categories/${id}/`, categoryData);
};

export const deleteCategory = (id) => {
	return apiClient.delete(`/products/categories/${id}/`);
};

export const getParentCategories = () => {
	return apiClient.get("/products/categories/", { params: { parent: "null" } });
};

export const getChildCategories = (parentId) => {
	return apiClient.get("/products/categories/", {
		params: { parent: parentId },
	});
};

export const bulkUpdateCategories = (categoryIds, updateData) => {
	return apiClient.patch("/products/categories/bulk-update/", {
		category_ids: categoryIds,
		update_data: updateData,
	});
};

export const reorderCategories = (categoryIds) => {
	return apiClient.patch("/products/categories/reorder/", {
		category_ids: categoryIds,
	});
};

export default {
	getCategories,
	getCategoryById,
	createCategory,
	updateCategory,
	deleteCategory,
	getParentCategories,
	getChildCategories,
	bulkUpdateCategories,
	reorderCategories,
};
