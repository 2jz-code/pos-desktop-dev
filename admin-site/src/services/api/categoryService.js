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

export const archiveCategory = (id) => {
	return apiClient.patch(`/products/categories/${id}/archive/`);
};

export const unarchiveCategory = (id) => {
	return apiClient.patch(`/products/categories/${id}/unarchive/`);
};

export const getParentCategories = () => {
	return apiClient.get("/products/categories/", { params: { parent: "null" } });
};

export const getChildCategories = (parentId) => {
	return apiClient.get("/products/categories/", {
		params: { parent: parentId },
	});
};

export const bulkUpdateCategories = (categoryUpdates) => {
	return apiClient.patch("/products/categories/bulk-update/", {
		updates: categoryUpdates,
	});
};

export const reorderCategories = (categoryIds) => {
	return apiClient.patch("/products/categories/reorder/", {
		category_ids: categoryIds,
	});
};

// Dependency validation and enhanced archiving
export const validateCategoryArchiving = (id, force = false) => {
	return apiClient.get(`/products/categories/${id}/validate-archive/`, {
		params: { force: force.toString() }
	});
};

export const archiveCategoryWithDependencies = (id, options = {}) => {
	return apiClient.post(`/products/categories/${id}/archive/`, {
		force: options.force || false,
		handle_products: options.handle_products || 'set_null'
	});
};

export const getAlternativeCategories = (excludeId = null) => {
	const params = {};
	if (excludeId) {
		params.exclude_id = excludeId;
	}
	return apiClient.get("/products/categories/alternatives/", { params });
};

export const bulkArchiveCategories = (categoryIds, options = {}) => {
	return apiClient.post("/products/bulk-archive/", {
		category_ids: categoryIds,
		force: options.force || false,
		handle_products: options.handle_products || 'set_null'
	});
};

export const reassignProducts = (productIds, options = {}) => {
	const payload = { product_ids: productIds };
	if (options.new_category_id) {
		payload.new_category_id = options.new_category_id;
	}
	if (options.new_product_type_id) {
		payload.new_product_type_id = options.new_product_type_id;
	}
	return apiClient.post("/products/reassign-products/", payload);
};

export default {
	getCategories,
	getCategoryById,
	createCategory,
	updateCategory,
	deleteCategory,
	archiveCategory,
	unarchiveCategory,
	getParentCategories,
	getChildCategories,
	bulkUpdateCategories,
	reorderCategories,
	validateCategoryArchiving,
	archiveCategoryWithDependencies,
	getAlternativeCategories,
	bulkArchiveCategories,
	reassignProducts,
};
