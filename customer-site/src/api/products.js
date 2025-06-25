import apiClient from "./client";

// Products API service
export const productsAPI = {
	// Get all products with optional filtering
	getProducts: async (filters = {}) => {
		const params = new URLSearchParams();

		// Add filters to params
		if (filters.category) params.append("category", filters.category);
		if (filters.search) params.append("search", filters.search);
		if (filters.is_active !== undefined)
			params.append("is_active", filters.is_active);

		const response = await apiClient.get(`/products/?${params.toString()}`);
		return response.data;
	},

	// Get single product by ID
	getProduct: async (productId) => {
		const response = await apiClient.get(`/products/${productId}/`);
		return response.data;
	},

	// Get product by name (search for product with exact name match)
	getByName: async (productName) => {
		const response = await apiClient.get(
			`/products/?search=${encodeURIComponent(productName)}`
		);
		// Filter for exact name match since search might return partial matches
		// Handle both paginated (results array) and non-paginated response formats
		const products = response.data.results || response.data;
		const exactMatch = products.find((product) => product.name === productName);
		if (!exactMatch) {
			throw new Error("Product not found");
		}
		return exactMatch;
	},

	// Get all products (for filtering related products)
	getAll: async () => {
		const response = await apiClient.get("/products/");
		// Handle both paginated (results array) and non-paginated response formats
		return response.data.results || response.data;
	},

	// Get product by barcode
	getProductByBarcode: async (barcode) => {
		const response = await apiClient.get(`/products/barcode/${barcode}/`);
		return response.data;
	},

	// Get product categories
	getCategories: async () => {
		const response = await apiClient.get("/products/categories/");
		return response.data;
	},

	// Get product types
	getProductTypes: async () => {
		const response = await apiClient.get("/products/product-types/");
		return response.data;
	},
};

export default productsAPI;
