import apiClient from "@/shared/lib/apiClient";

export const getProductTypes = (params) => {
	return apiClient.get("/products/product-types/", { params });
};

export const getProductTypeById = (id) => {
	return apiClient.get(`/products/product-types/${id}/`);
};

export const createProductType = (data) => {
	return apiClient.post("/products/product-types/", data);
};

export const updateProductType = (id, data) => {
	return apiClient.put(`/products/product-types/${id}/`, data);
};

export const deleteProductType = (id) => {
	return apiClient.delete(`/products/product-types/${id}/`);
};

// Archive product type using new REST endpoint
export const archiveProductType = (id) => {
	return apiClient.post(`/products/product-types/${id}/archive/`);
};

// Unarchive product type using new REST endpoint
export const unarchiveProductType = (id) => {
	return apiClient.post(`/products/product-types/${id}/unarchive/`);
};

// Get product types with archived records included
export const getProductTypesWithArchived = (params = {}) => {
	return apiClient.get("/products/product-types/", { 
		params: { ...params, include_archived: true } 
	});
};

// Get only archived product types
export const getArchivedProductTypes = (params = {}) => {
	return apiClient.get("/products/product-types/", { 
		params: { ...params, include_archived: 'only' } 
	});
};

// Bulk archive multiple product types
export const bulkArchiveProductTypes = (productTypeIds) => {
	return apiClient.post('/products/product-types/bulk_archive/', { ids: productTypeIds });
};

// Bulk unarchive multiple product types  
export const bulkUnarchiveProductTypes = (productTypeIds) => {
	return apiClient.post('/products/product-types/bulk_unarchive/', { ids: productTypeIds });
};

// Dependency validation and enhanced archiving
export const validateProductTypeArchiving = (id, force = false) => {
	return apiClient.get(`/products/product-types/${id}/validate-archive/`, {
		params: { force: force.toString() }
	});
};

export const archiveProductTypeWithDependencies = (id, options = {}) => {
	return apiClient.post(`/products/product-types/${id}/archive/`, {
		force: options.force || false,
		handle_products: options.handle_products || 'archive'
	});
};

export const getAlternativeProductTypes = (excludeId = null) => {
	const params = {};
	if (excludeId) {
		params.exclude_id = excludeId;
	}
	return apiClient.get("/products/product-types/alternatives/", { params });
};
