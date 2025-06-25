import apiClient from "@/shared/lib/apiClient";

export const getProducts = (params) => {
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

// Archive product (soft delete by setting is_active to false)
export const archiveProduct = (id) => {
	return apiClient.patch(`/products/${id}/`, { is_active: false });
};

// Unarchive product (restore by setting is_active to true)
export const unarchiveProduct = (id) => {
	return apiClient.patch(`/products/${id}/`, { is_active: true });
};
