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

// Archive product using new REST endpoint
export const archiveProduct = (id) => {
	return apiClient.post(`/products/${id}/archive/`);
};

// Unarchive product using new REST endpoint
export const unarchiveProduct = (id) => {
	return apiClient.post(`/products/${id}/unarchive/`);
};

// Get products with archived records included
export const getProductsWithArchived = (params = {}) => {
	return apiClient.get("/products/", { 
		params: { ...params, include_archived: true } 
	});
};

// Get only archived products
export const getArchivedProducts = (params = {}) => {
	return apiClient.get("/products/", { 
		params: { ...params, include_archived: 'only' } 
	});
};

// Bulk archive multiple products
export const bulkArchiveProducts = (productIds) => {
	return apiClient.post('/products/bulk_archive/', { ids: productIds });
};

// Bulk unarchive multiple products  
export const bulkUnarchiveProducts = (productIds) => {
	return apiClient.post('/products/bulk_unarchive/', { ids: productIds });
};
