import apiClient from "./client";

// Product Type API service
export const getProductTypes = (params = {}) => {
	return apiClient.get("/products/product-types/", { params });
};

export const getProductTypeById = (id) => {
	return apiClient.get(`/products/product-types/${id}/`);
};

export const createProductType = (productTypeData) => {
	return apiClient.post("/products/product-types/", productTypeData);
};

export const updateProductType = (id, productTypeData) => {
	return apiClient.put(`/products/product-types/${id}/`, productTypeData);
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

export const bulkUpdateProductTypes = (productTypeIds, updateData) => {
	return apiClient.patch("/products/product-types/bulk-update/", {
		product_type_ids: productTypeIds,
		update_data: updateData,
	});
};

export const reorderProductTypes = (productTypeIds) => {
	return apiClient.patch("/products/product-types/reorder/", {
		product_type_ids: productTypeIds,
	});
};

// Dependency validation and enhanced archiving
export const validateProductTypeArchiving = (id, force = false) => {
	return apiClient.get(`/products/product-types/${id}/validate-archive/`, {
		params: { force: force.toString() }
	});
};

export const archiveProductTypeWithDependencies = (id, options = {}) => {
	return apiClient.post(`/products/product-types/${id}/archive/`, {
		force: options.force || false
	});
};

export const getAlternativeProductTypes = (excludeId = null) => {
	const params = {};
	if (excludeId) {
		params.exclude_id = excludeId;
	}
	return apiClient.get("/products/product-types/alternatives/", { params });
};

export const bulkArchiveProductTypes = (productTypeIds, options = {}) => {
	return apiClient.post("/products/bulk-archive/", {
		product_type_ids: productTypeIds,
		force: options.force || false
	});
};

export default {
	getProductTypes,
	getProductTypeById,
	createProductType,
	updateProductType,
	deleteProductType,
	archiveProductType,
	unarchiveProductType,
	bulkUpdateProductTypes,
	reorderProductTypes,
	validateProductTypeArchiving,
	archiveProductTypeWithDependencies,
	getAlternativeProductTypes,
	bulkArchiveProductTypes,
};
