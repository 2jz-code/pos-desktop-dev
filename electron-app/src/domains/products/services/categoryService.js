// desktop-combined/electron-app/src/api/services/categoryService.js

import apiClient from "@/shared/lib/apiClient";

// FIX: Accept params to allow filtering categories
export const getCategories = (params) => {
	return apiClient.get("/products/categories/", { params });
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
