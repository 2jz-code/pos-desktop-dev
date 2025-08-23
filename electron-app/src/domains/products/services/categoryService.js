// desktop-combined/electron-app/src/api/services/categoryService.js

import apiClient from "@/shared/lib/apiClient";

// FIX: Accept params to allow filtering categories
export const getCategories = (params) => {
	return apiClient.get("/products/categories/", { params });
};

// Get all categories (handles pagination automatically)
export const getAllCategories = async (params = {}) => {
	let allCategories = [];
	let nextUrl = "/products/categories/";
	let requestParams = { ...params, limit: 1000 }; // Request large batches
	
	while (nextUrl) {
		try {
			const response = await apiClient.get(nextUrl, { params: requestParams });
			const data = response.data;
			
			// Handle both paginated and non-paginated responses
			if (data.results) {
				allCategories = allCategories.concat(data.results);
				nextUrl = data.next ? new URL(data.next).pathname + new URL(data.next).search : null;
				requestParams = {}; // Clear params for subsequent requests
			} else {
				// Non-paginated response
				allCategories = data;
				nextUrl = null;
			}
		} catch (error) {
			console.error("Error fetching categories:", error);
			throw error;
		}
	}
	
	return { data: allCategories };
};

export const createCategory = (data) => {
	return apiClient.post("/products/categories/", data);
};

export const updateCategory = (id, data) => {
	return apiClient.put(`/products/categories/${id}/`, data);
};

export const deleteCategory = (id) => {
	return apiClient.delete(`/products/categories/${id}/`);
};

// Archive category using new REST endpoint
export const archiveCategory = (id) => {
	return apiClient.post(`/products/categories/${id}/archive/`);
};

// Unarchive category using new REST endpoint
export const unarchiveCategory = (id) => {
	return apiClient.post(`/products/categories/${id}/unarchive/`);
};

// Get categories with archived records included
export const getCategoriesWithArchived = (params = {}) => {
	return apiClient.get("/products/categories/", { 
		params: { ...params, include_archived: true } 
	});
};

// Get only archived categories
export const getArchivedCategories = (params = {}) => {
	return apiClient.get("/products/categories/", { 
		params: { ...params, include_archived: 'only' } 
	});
};

// Bulk archive multiple categories
export const bulkArchiveCategories = (categoryIds) => {
	return apiClient.post('/products/categories/bulk_archive/', { ids: categoryIds });
};

// Bulk unarchive multiple categories  
export const bulkUnarchiveCategories = (categoryIds) => {
	return apiClient.post('/products/categories/bulk_unarchive/', { ids: categoryIds });
};

// Bulk update multiple categories
export const bulkUpdateCategories = (categoryUpdates) => {
	return apiClient.patch('/products/categories/bulk-update/', {
		updates: categoryUpdates
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
