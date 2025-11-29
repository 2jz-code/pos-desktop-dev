// desktop-combined/electron-app/src/store/slices/productSlice.js
import { getProducts, getAllProducts, getAllActiveProducts } from "@/domains/products/services/productService";
import { getCategories } from "@/domains/products/services/categoryService";
import { getCachedCategoryById, getCachedProductTypeById } from "@/shared/lib/offlineRelationHelpers";

/**
 * Check if device is online
 * Uses navigator.onLine as a simple check (hooks handle reactive updates)
 */
const isOnline = () => typeof navigator !== 'undefined' ? navigator.onLine : true;

/**
 * Hydrate product relations from cached data
 * Populates category and product_type objects from their IDs
 */
const hydrateProductRelations = async (products) => {
	if (!Array.isArray(products) || products.length === 0) return products;

	return Promise.all(
		products.map(async (product) => {
			const hydrated = { ...product };

			// Hydrate category
			if (product.category_id && !product.category) {
				const category = await getCachedCategoryById(product.category_id);
				if (category) {
					hydrated.category = category;
				}
			}

			// Hydrate product_type
			if (product.product_type_id && !product.product_type) {
				const productType = await getCachedProductTypeById(product.product_type_id);
				if (productType) {
					hydrated.product_type = productType;
				}
			}

			return hydrated;
		})
	);
};

// Helper function to sort products by category and name
// Note: Products should now come pre-sorted from backend with hierarchical category ordering
// This function provides fallback sorting if needed, respecting category.order field
const sortProductsByCategory = (products) => {
	return products.sort((a, b) => {
		const aCategory = a.category;
		const bCategory = b.category;

		// Handle products without categories
		if (!aCategory && !bCategory) return a.name.localeCompare(b.name);
		if (!aCategory) return 1;
		if (!bCategory) return -1;

		// Get parent category for hierarchical ordering
		const getParentOrder = (category) => {
			if (!category.parent) return category.order || 999;
			return category.parent.order || 999;
		};

		const getIsParent = (category) => !category.parent;

		const aParentOrder = getParentOrder(aCategory);
		const bParentOrder = getParentOrder(bCategory);

		// First sort by parent category order
		if (aParentOrder !== bParentOrder) {
			return aParentOrder - bParentOrder;
		}

		// Then sort parents before children within same parent group
		const aIsParent = getIsParent(aCategory);
		const bIsParent = getIsParent(bCategory);
		if (aIsParent !== bIsParent) {
			return aIsParent ? -1 : 1;
		}

		// Within same level, sort by category order
		const aCategoryOrder = aCategory.order || 999;
		const bCategoryOrder = bCategory.order || 999;
		if (aCategoryOrder !== bCategoryOrder) {
			return aCategoryOrder - bCategoryOrder;
		}

		// If same category order, sort by category name
		if (aCategory.name !== bCategory.name) {
			return aCategory.name.localeCompare(bCategory.name);
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
		console.log("🔄 [ProductSlice] fetchProducts function called - OFFLINE-FIRST VERSION");
		set({ isLoadingProducts: true });

		let products = null;
		let source = 'none';

		// Step 1: Try offline cache first
		if (window.offlineAPI?.getCachedProducts) {
			try {
				console.log("📦 [ProductSlice] Trying offline cache first...");
				const cachedProducts = await window.offlineAPI.getCachedProducts({ includeArchived: false });

				if (Array.isArray(cachedProducts) && cachedProducts.length > 0) {
					console.log(`✅ [ProductSlice] Loaded ${cachedProducts.length} products from cache`);

					// Hydrate relations (category, product_type)
					products = await hydrateProductRelations(cachedProducts);
					source = 'cache';
					console.log(`🔗 [ProductSlice] Hydrated ${products.length} products with relations`);
				} else {
					console.log("⚠️ [ProductSlice] Cache empty, will try API if online");
				}
			} catch (cacheError) {
				console.warn("⚠️ [ProductSlice] Cache failed, falling back to API:", cacheError);
			}
		}

		// Step 2: Fall back to API if cache empty/failed AND we're online
		if (!products && isOnline()) {
			try {
				console.log("🌐 [ProductSlice] Loading products from API...");
				const response = await getAllActiveProducts();
				const apiProducts = response.data;

				if (Array.isArray(apiProducts)) {
					products = apiProducts;
					source = 'api';
					console.log(`✅ [ProductSlice] Loaded ${products.length} products from API`);
				}
			} catch (apiError) {
				console.error("❌ [ProductSlice] API request failed:", apiError);
			}
		}

		// Step 3: Handle no data scenario
		if (!products || !Array.isArray(products)) {
			console.error("❌ [ProductSlice] No products available (cache empty, offline or API failed)");
			set({ products: [], filteredProducts: [], isLoadingProducts: false });
			return;
		}

		// Sort products using the helper function
		const sortedProducts = sortProductsByCategory(products);

		// Filter out grocery items by default (since we start with "all" products)
		const filteredProducts = filterOutGroceryItems(sortedProducts);

		// Debug: Show category breakdown
		const categoryBreakdown = {};
		filteredProducts.forEach(p => {
			const cat = p.category?.name || 'No Category';
			categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;
		});
		console.log(`📊 [ProductSlice] Category breakdown (source: ${source}):`, categoryBreakdown);

		console.log(
			`🎯 [ProductSlice] Loaded ${products.length} products from ${source}, showing ${filteredProducts.length} non-grocery products`
		);

		set({
			products: sortedProducts,
			filteredProducts: filteredProducts,
			isLoadingProducts: false,
		});
	},

	fetchParentCategories: async () => {
		console.log("🔄 [ProductSlice] fetchParentCategories - OFFLINE-FIRST VERSION");
		set({ isLoadingCategories: true });

		let categories = null;
		let source = 'none';

		// Step 1: Try offline cache first
		if (window.offlineAPI?.getCachedCategories) {
			try {
				console.log("📦 [ProductSlice] Trying categories cache first...");
				const cachedCategories = await window.offlineAPI.getCachedCategories();

				if (Array.isArray(cachedCategories) && cachedCategories.length > 0) {
					// Filter for parent categories (no parent_id)
					const parentCategories = cachedCategories.filter(
						(cat) => cat.is_active && !cat.parent_id
					);
					if (parentCategories.length > 0) {
						categories = parentCategories;
						source = 'cache';
						console.log(`✅ [ProductSlice] Loaded ${categories.length} parent categories from cache`);
					}
				}
			} catch (cacheError) {
				console.warn("⚠️ [ProductSlice] Categories cache failed:", cacheError);
			}
		}

		// Step 2: Fall back to API if cache empty/failed AND we're online
		if (!categories && isOnline()) {
			try {
				console.log("🌐 [ProductSlice] Loading parent categories from API...");
				const response = await getCategories({ parent: "null", is_active: "true" });
				const apiCategories = response.data.results || response.data;

				if (Array.isArray(apiCategories)) {
					categories = apiCategories;
					source = 'api';
					console.log(`✅ [ProductSlice] Loaded ${categories.length} parent categories from API`);
				}
			} catch (apiError) {
				console.error("❌ [ProductSlice] Categories API failed:", apiError);
			}
		}

		if (!categories) {
			console.warn("⚠️ [ProductSlice] No parent categories available");
			categories = [];
		}

		console.log(`🎯 [ProductSlice] Parent categories loaded from ${source}: ${categories.length}`);
		set({ parentCategories: categories, isLoadingCategories: false });
	},

	fetchChildCategories: async (parentId) => {
		if (!parentId || parentId === "all") {
			set({ childCategories: [], selectedChildCategory: "all" });
			get().applyFilter({});
			return;
		}

		console.log(`🔄 [ProductSlice] fetchChildCategories for parent ${parentId} - OFFLINE-FIRST`);

		let categories = null;
		let source = 'none';

		// Step 1: Try offline cache first
		if (window.offlineAPI?.getCachedCategories) {
			try {
				const cachedCategories = await window.offlineAPI.getCachedCategories();

				if (Array.isArray(cachedCategories) && cachedCategories.length > 0) {
					// Filter for children of this parent
					const childCategories = cachedCategories.filter(
						(cat) => cat.is_active && cat.parent_id == parentId
					);
					if (childCategories.length > 0) {
						categories = childCategories;
						source = 'cache';
						console.log(`✅ [ProductSlice] Loaded ${categories.length} child categories from cache`);
					} else {
						// No children found in cache - this is valid (parent may have no children)
						categories = [];
						source = 'cache';
						console.log("📦 [ProductSlice] No child categories found in cache for this parent");
					}
				}
			} catch (cacheError) {
				console.warn("⚠️ [ProductSlice] Child categories cache failed:", cacheError);
			}
		}

		// Step 2: Fall back to API if cache failed (not just empty) AND we're online
		if (categories === null && isOnline()) {
			try {
				console.log("🌐 [ProductSlice] Loading child categories from API...");
				const response = await getCategories({ parent: parentId, is_active: "true" });
				const apiCategories = response.data.results || response.data;

				categories = Array.isArray(apiCategories) ? apiCategories : [];
				source = 'api';
				console.log(`✅ [ProductSlice] Loaded ${categories.length} child categories from API`);
			} catch (apiError) {
				console.error("❌ [ProductSlice] Child categories API failed:", apiError);
				categories = [];
			}
		}

		if (categories === null) {
			categories = [];
		}

		console.log(`🎯 [ProductSlice] Child categories for ${parentId} from ${source}: ${categories.length}`);
		set({ childCategories: categories, selectedChildCategory: "all" });
		get().applyFilter({
			categoryId: parentId,
			subcategoryId: "all",
		});
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

		// If there's a search term, search through ALL products (including grocery items)
		if (finalSearchTerm) {
			const searchLower = finalSearchTerm.toLowerCase();
			filtered = filtered.filter((product) =>
				product.name.toLowerCase().includes(searchLower) ||
				(product.barcode && product.barcode.toLowerCase().includes(searchLower))
			);
			console.log(`🔍 [ProductSlice] Search found ${filtered.length} products matching "${finalSearchTerm}"`);
		} else {
			// No search term - apply category filtering and grocery exclusion
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
				// When showing "all" products (no search, no category), exclude only the specific "grocery" category
				console.log(
					`🎯 [ProductSlice] Showing all products, excluding retail grocery items`
				);
				filtered = filterOutGroceryItems(filtered);

				console.log(
					`🎯 [ProductSlice] Found ${filtered.length} products after filtering`
				);
			}
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
