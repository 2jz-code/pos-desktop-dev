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
