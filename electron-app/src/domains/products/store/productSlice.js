// desktop-combined/electron-app/src/store/slices/productSlice.js
import { getProducts, getAllProducts } from "@/domains/products/services/productService";
import { getCategories } from "@/domains/products/services/categoryService";

// Helper function to sort products by category and name
const sortProductsByCategory = (products) => {
	return products.sort((a, b) => {
		const aCategoryName = a.category?.name || "";
		const bCategoryName = b.category?.name || "";

		// Custom ordering: Fresh Drinks should come before Canned Drinks
		const categoryOrder = {
			"Fresh Drinks": 0,
			"Canned Drinks": 1,
			"Hot Drinks": 2,
			"Cold Drinks": 3,
		};

		const aOrder =
			categoryOrder[aCategoryName] !== undefined
				? categoryOrder[aCategoryName]
				: 999;
		const bOrder =
			categoryOrder[bCategoryName] !== undefined
				? categoryOrder[bCategoryName]
				: 999;

		// First sort by category order
		if (aOrder !== bOrder) {
			return aOrder - bOrder;
		}

		// If same category order, sort by category name
		if (aCategoryName !== bCategoryName) {
			return aCategoryName.localeCompare(bCategoryName);
		}

		// If same category, sort by product name
		return a.name.localeCompare(b.name);
	});
};

// Helper function to filter out grocery items
const filterOutGroceryItems = (products) => {
	// Define grocery category names that should be hidden when showing "all"
	// Only filter the specific "grocery" category that contains retail items
	const groceryCategoryNames = [
		"grocery", // This is the specific category from your data that should be hidden
	];

	return products.filter((p) => {
		const categoryName = p.category?.name || "";
		const parentCategoryName = p.category?.parent?.name || "";

		// Only exclude exact matches to avoid filtering legitimate food categories
		return !groceryCategoryNames.some(
			(groceryName) =>
				categoryName.toLowerCase() === groceryName.toLowerCase() ||
				parentCategoryName.toLowerCase() === groceryName.toLowerCase()
		);
	});
};

export const createProductSlice = (set, get) => ({
	products: [],
	filteredProducts: [],
	searchTerm: "",
	parentCategories: [],
	childCategories: [],
	selectedParentCategory: "all",
	selectedChildCategory: "all",
	isLoadingProducts: false,
	isLoadingCategories: false,

	fetchProducts: async () => {
		console.log("🔄 [ProductSlice] fetchProducts function called! UPDATED VERSION");
		console.log("🔄 [ProductSlice] Starting to fetch products...");
		set({ isLoadingProducts: true });
		try {
			console.log("📡 [ProductSlice] Making API call to fetch ALL products (with pagination)");
			const response = await getAllProducts({ include_all_modifiers: 'true' });
			console.log("📦 [ProductSlice] Raw API response:", response);
			console.log("📦 [ProductSlice] Response keys:", Object.keys(response));
			console.log("📦 [ProductSlice] Response.data type:", typeof response.data);
			console.log("📦 [ProductSlice] Response.data is array:", Array.isArray(response.data));
			
			// Extract products from response - getAllProducts returns all products directly in data
			const products = response.data;
			console.log("📦 [ProductSlice] Products data sample:", products?.slice(0, 3));
			console.log("📦 [ProductSlice] Is products an array?", Array.isArray(products));
			console.log("📦 [ProductSlice] Products length:", products?.length);
			
			// Check if we have drinks and desserts
			if (Array.isArray(products)) {
				const desserts = products.filter(p => p.category?.name === 'Desserts');
				const drinks = products.filter(p => p.category?.name === 'Drinks');
				console.log("🍰 [ProductSlice] Found desserts:", desserts.length);
				console.log("🥤 [ProductSlice] Found drinks:", drinks.length);
				console.log("🍰 [ProductSlice] Dessert samples:", desserts.slice(0, 2).map(p => p.name));
				console.log("🥤 [ProductSlice] Drink samples:", drinks.slice(0, 2).map(p => p.name));
			}

			if (!Array.isArray(products)) {
				console.error("❌ [ProductSlice] Products is not an array:", typeof products, products);
				set({ products: [], filteredProducts: [], isLoadingProducts: false });
				return;
			}

			// Filter out archived products to ensure only active products are shown
			const activeProducts = products.filter(product => product.is_active !== false);
			console.log("🔍 [ProductSlice] Active products sample:", activeProducts.slice(0, 5).map(p => ({
				name: p.name,
				category: p.category?.name,
				is_active: p.is_active
			})));
			
			// Sort products using the helper function
			const sortedProducts = sortProductsByCategory(activeProducts);

			// Filter out grocery items by default (since we start with "all" products)
			const filteredProducts = filterOutGroceryItems(sortedProducts);
			
			// Debug: Show category breakdown
			const categoryBreakdown = {};
			filteredProducts.forEach(p => {
				const cat = p.category?.name || 'No Category';
				categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;
			});
			console.log("📊 [ProductSlice] Category breakdown:", categoryBreakdown);

			console.log(
				`🎯 [ProductSlice] Loaded ${products.length} total products, ${activeProducts.length} active products, showing ${filteredProducts.length} non-grocery products by default`
			);

			console.log("📦 [ProductSlice] Setting products in store:", {
				productsCount: sortedProducts.length,
				filteredProductsCount: filteredProducts.length,
				isArray: Array.isArray(sortedProducts)
			});
			
			set({
				products: sortedProducts,
				filteredProducts: filteredProducts,
				isLoadingProducts: false,
			});
		} catch (error) {
			console.error(
				"❌ [ProductSlice] Failed to fetch products from API:",
				error
			);
			console.error(
				"❌ [ProductSlice] Error details:",
				error.response?.status,
				error.response?.data
			);
			// Set empty state on failure
			set({ products: [], filteredProducts: [], isLoadingProducts: false });
		}
	},

	fetchParentCategories: async () => {
		set({ isLoadingCategories: true });
		try {
			const response = await getCategories({ parent: "null", is_active: "true" });
			// Handle paginated response - extract categories from results array
			const categories = response.data.results || response.data;
			set({ parentCategories: categories, isLoadingCategories: false });
		} catch (error) {
			console.error(
				"❌ [ProductSlice] Failed to fetch parent categories from API:",
				error.response?.data?.detail || error.message
			);
			set({ parentCategories: [], isLoadingCategories: false });
		}
	},

	fetchChildCategories: async (parentId) => {
		if (!parentId || parentId === "all") {
			set({ childCategories: [], selectedChildCategory: "all" });
			get().applyFilter({});
			return;
		}
		try {
			console.log(
				`🔄 [ProductSlice] Fetching child categories for parent ${parentId} from API...`
			);
			const response = await getCategories({ parent: parentId, is_active: "true" });
			// Handle paginated response - extract categories from results array
			const categories = response.data.results || response.data;
			set({ childCategories: categories, selectedChildCategory: "all" });
			get().applyFilter({
				categoryId: parentId,
				subcategoryId: "all",
			});
		} catch (error) {
			console.error(
				`❌ [ProductSlice] Failed to fetch child categories for parent ${parentId} from API:`,
				error.response?.data?.detail || error.message
			);
			set({ childCategories: [], selectedChildCategory: "all" });
		}
	},

	setSelectedParentCategory: (categoryId) => {
		set({
			selectedParentCategory: categoryId,
			childCategories: [],
			selectedChildCategory: "all",
		});
		get().fetchChildCategories(categoryId);
	},

	setSelectedChildCategory: (subcategoryId) => {
		set({ selectedChildCategory: subcategoryId });
		get().applyFilter({
			categoryId: get().selectedParentCategory,
			subcategoryId: subcategoryId,
		});
	},

	applyFilter: ({ categoryId, subcategoryId, searchTerm }) => {
		const state = get();
		const finalCategoryId =
			categoryId !== undefined ? categoryId : state.selectedParentCategory;
		const finalSubcategoryId =
			subcategoryId !== undefined ? subcategoryId : state.selectedChildCategory;
		const finalSearchTerm =
			searchTerm !== undefined ? searchTerm : state.searchTerm;
		let filtered = state.products;

		console.log(`🔍 [ProductSlice] Applying filter:`, {
			finalCategoryId,
			finalSubcategoryId,
			finalSearchTerm,
			totalProducts: state.products.length,
			childCategories: state.childCategories.length,
		});

		// Apply search filter
		if (finalSearchTerm) {
			filtered = filtered.filter((product) =>
				product.name.toLowerCase().includes(finalSearchTerm.toLowerCase())
			);
		}

		// Apply category filter - FIXED to work with nested structure
		if (finalCategoryId && finalCategoryId !== "all") {
			const parentId = parseInt(finalCategoryId);

			if (finalSubcategoryId && finalSubcategoryId !== "all") {
				// Filter by specific subcategory
				const subId = parseInt(finalSubcategoryId);
				console.log(`🎯 [ProductSlice] Filtering by subcategory ID: ${subId}`);
				filtered = filtered.filter((p) => p.category?.id === subId);
				console.log(
					`🎯 [ProductSlice] Found ${filtered.length} products in subcategory ${subId}`
				);
			} else {
				// Filter by parent category (show products directly under parent OR under its children)
				const childIds = state.childCategories.map((c) => c.id);
				console.log(
					`🎯 [ProductSlice] Filtering by parent ID: ${parentId}, child IDs: [${childIds.join(
						", "
					)}]`
				);
				filtered = filtered.filter((p) => {
					// Product is directly under the parent category OR under one of its child categories
					return (
						p.category?.id === parentId || childIds.includes(p.category?.id)
					);
				});
				console.log(
					`🎯 [ProductSlice] Found ${filtered.length} products in parent category ${parentId}`
				);
			}
		} else {
			// When showing "all" products, exclude only the specific "grocery" category
			console.log(
				`🎯 [ProductSlice] Showing all products, excluding retail grocery items`
			);
			filtered = filterOutGroceryItems(filtered);

			console.log(
				`🎯 [ProductSlice] Found ${filtered.length} products after filtering`
			);
		}

		// Sort products using the helper function
		filtered = sortProductsByCategory(filtered);

		console.log(
			`✅ [ProductSlice] Filter applied. ${filtered.length} products match criteria`
		);

		set({
			filteredProducts: filtered,
			selectedParentCategory: finalCategoryId,
			selectedChildCategory: finalSubcategoryId,
			searchTerm: finalSearchTerm,
		});
	},

	resetFilters: () => {
		const state = get();
		
		// Defensive check: ensure products is an array before sorting
		if (!Array.isArray(state.products)) {
			console.warn("⚠️ [ProductSlice] resetFilters called but products is not an array:", state.products);
			console.warn("⚠️ [ProductSlice] Skipping resetFilters until products are loaded");
			return;
		}
		
		const sortedProducts = sortProductsByCategory(state.products);

		// Filter out grocery items when resetting (since we go back to "all" products)
		const filteredProducts = filterOutGroceryItems(sortedProducts);

		console.log(
			`🎯 [ProductSlice] Reset filters - showing ${filteredProducts.length} non-grocery products`
		);

		set({
			selectedParentCategory: "all",
			selectedChildCategory: "all",
			searchTerm: "",
			childCategories: [],
			filteredProducts: filteredProducts,
		});
	},
});

// export const createProductSlice = productSlice;
