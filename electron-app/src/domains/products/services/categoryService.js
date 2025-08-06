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
