import apiClient from "@/shared/lib/apiClient";

export const getProducts = (params) => {
	return apiClient.get("/products/", { params });
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
