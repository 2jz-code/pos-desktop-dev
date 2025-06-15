import apiClient from "../../lib/apiClient";

export const getProductTypes = () => {
	return apiClient.get("/products/product-types/");
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
