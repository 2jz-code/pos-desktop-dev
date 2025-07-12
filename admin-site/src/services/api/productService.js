import apiClient from "./client";

// Product API service
export const getProducts = (params = {}) => {
	return apiClient.get("/products/", { params });
};

export const getProductById = (id) => {
	return apiClient.get(`/products/${id}/`);
};

export const createProduct = (productData) => {
	return apiClient.post("/products/", productData);
};

export const updateProduct = (id, productData) => {
	return apiClient.put(`/products/${id}/`, productData);
};

export const deleteProduct = (id) => {
	return apiClient.delete(`/products/${id}/`);
};

export const archiveProduct = (id) => {
	return apiClient.patch(`/products/${id}/`, { is_active: false });
};

export const unarchiveProduct = (id) => {
	return apiClient.patch(`/products/${id}/`, { is_active: true });
};

export const getProductPerformance = (params = {}) => {
	return apiClient.get("/products/performance/", { params });
};

export const bulkUpdateProducts = (productIds, updateData) => {
	return apiClient.patch("/products/bulk-update/", {
		product_ids: productIds,
		update_data: updateData,
	});
};

export const duplicateProduct = (id) => {
	return apiClient.post(`/products/${id}/duplicate/`);
};

export default {
	getProducts,
	getProductById,
	createProduct,
	updateProduct,
	deleteProduct,
	archiveProduct,
	unarchiveProduct,
	getProductPerformance,
	bulkUpdateProducts,
	duplicateProduct,
};
