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

export default {
	getProductTypes,
	getProductTypeById,
	createProductType,
	updateProductType,
	deleteProductType,
	bulkUpdateProductTypes,
	reorderProductTypes,
};
