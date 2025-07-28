// desktop-combined/electron-app/src/store/slices/productSlice.js
import { getProducts } from "@/domains/products/services/productService";
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
	const groceryCategoryNames = [
		"Grocery",
		"Groceries",
		"Food Items",
		"Pantry Items",
		"Dry Goods",
		"Packaged Foods",
	];

	return products.filter((p) => {
		const categoryName = p.category?.name || "";
		const parentCategoryName = p.category?.parent?.name || "";

		// Exclude if product's category or parent category is in the grocery list
		return !groceryCategoryNames.some(
			(groceryName) =>
				categoryName.toLowerCase().includes(groceryName.toLowerCase()) ||
				parentCategoryName.toLowerCase().includes(groceryName.toLowerCase())
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
		console.log("🔄 [ProductSlice] fetchProducts function called!");
		console.log("🔄 [ProductSlice] Starting to fetch products...");
		set({ isLoadingProducts: true });
		try {
			console.log("📡 [ProductSlice] Making API call to /products/");
			const response = await getProducts({ include_all_modifiers: 'true' });
			console.log("📦 [ProductSlice] Raw API response:", response);
			
			const products = response.data;
			console.log("📦 [ProductSlice] Products data:", products);

			if (!Array.isArray(products)) {
				console.error("❌ [ProductSlice] Products is not an array:", typeof products, products);
				set({ products: [], filteredProducts: [], isLoadingProducts: false });
				return;
			}

			// Sort products using the helper function
			const sortedProducts = sortProductsByCategory(products);

			// Filter out grocery items by default (since we start with "all" products)
			const filteredProducts = filterOutGroceryItems(sortedProducts);

			console.log(
				`🎯 [ProductSlice] Loaded ${products.length} total products, showing ${filteredProducts.length} non-grocery products by default`
			);

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
			const response = await getCategories({ parent: "null" });
			const categories = response.data;
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
			const response = await getCategories({ parent: parentId });
			const categories = response.data;
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
			// When showing "all" products, exclude grocery items
			console.log(
				`🎯 [ProductSlice] Showing all products, excluding grocery items`
			);
			filtered = filterOutGroceryItems(filtered);

			console.log(
				`🎯 [ProductSlice] Found ${filtered.length} non-grocery products`
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
