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
	return apiClient.post(`/products/${id}/archive/`);
};

export const unarchiveProduct = (id) => {
	return apiClient.post(`/products/${id}/unarchive/`);
};

export const getProductPerformance = (params = {}) => {
	return apiClient.get("/products/performance/", { params });
};

export const bulkUpdateProducts = (data) => {
	return apiClient.patch("/products/bulk-update/", data);
};

export const bulkArchiveProducts = (ids) => {
	return apiClient.post("/products/bulk_archive/", { ids });
};

export const bulkUnarchiveProducts = (ids) => {
	return apiClient.post("/products/bulk_unarchive/", { ids });
};

export const duplicateProduct = (id) => {
	return apiClient.post(`/products/${id}/duplicate/`);
};

// Get all active products without pagination (uses backend caching)
export const getAllActiveProducts = () => {
	return apiClient.get("/products/", { params: { is_active: "true" } });
};

// Get all products (handles pagination automatically)
export const getAllProducts = async (params = {}) => {
	let allProducts = [];
	let nextUrl = "/products/";
	let requestParams = { ...params, limit: 1000 }; // Request large batches to minimize requests
	
	while (nextUrl) {
		try {
			const response = await apiClient.get(nextUrl, { params: requestParams });
			const data = response.data;
			
			// Handle both paginated and non-paginated responses
			if (data.results) {
				allProducts = allProducts.concat(data.results);
				// Extract path relative to /api/ to avoid double /api/ prefix
				if (data.next) {
					const url = new URL(data.next);
					// Remove /api prefix from pathname since apiClient will add it back
					nextUrl = url.pathname.replace('/api', '') + url.search;
				} else {
					nextUrl = null;
				}
				requestParams = {}; // Clear params for subsequent requests as they're in the URL
			} else {
				// Non-paginated response
				allProducts = data;
				nextUrl = null;
			}
		} catch (error) {
			console.error("Error fetching products:", error);
			throw error;
		}
	}
	
	return { data: allProducts };
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
	bulkArchiveProducts,
	bulkUnarchiveProducts,
	duplicateProduct,
	getAllActiveProducts,
	getAllProducts,
};
