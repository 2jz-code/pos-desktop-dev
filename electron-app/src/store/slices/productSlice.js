// desktop-combined/electron-app/src/store/slices/productSlice.js

export const createProductSlice = (set, get) => ({
	products: [],
	filteredProducts: [],
	searchTerm: "",
	parentCategories: [],
	childCategories: [],
	selectedParentCategory: "all",
	selectedChildCategory: "all",
	isUsingFallback: false, // Track if we're using API fallback

	fetchProducts: async () => {
		try {
			console.log("🔄 [ProductSlice] Fetching products from local database...");
			// Use local database instead of API
			const products = await window.dbApi.getProducts();
			console.log("✅ [ProductSlice] Products fetched successfully:", {
				count: products?.length || 0,
				firstProduct: products?.[0],
				sampleProductStructure: products?.[0]
					? {
							id: products[0].id,
							name: products[0].name,
							category: products[0].category,
							hasCategory: !!products[0].category,
							categoryStructure: products[0].category
								? {
										id: products[0].category.id,
										name: products[0].category.name,
										parent_id: products[0].category.parent_id,
										hasParent: !!products[0].category.parent,
								  }
								: null,
					  }
					: null,
			});
			set({
				products: products,
				filteredProducts: products,
				isUsingFallback: false,
			});
		} catch (error) {
			console.error(
				"❌ [ProductSlice] Failed to fetch products from local database:",
				error
			);

			// FALLBACK: Try to fetch from API directly
			try {
				console.log("🔄 [ProductSlice] Attempting API fallback...");
				const response = await fetch("http://127.0.0.1:8001/api/products/");
				if (response.ok) {
					const apiProducts = await response.json();
					console.log(
						"✅ [ProductSlice] API fallback successful:",
						apiProducts.length
					);
					set({
						products: apiProducts,
						filteredProducts: apiProducts,
						isUsingFallback: true,
					});
					return;
				}
			} catch (apiError) {
				console.error("❌ [ProductSlice] API fallback also failed:", apiError);
			}

			// If both local and API fail, set empty state
			set({ products: [], filteredProducts: [], isUsingFallback: false });
		}
	},

	fetchParentCategories: async () => {
		try {
			// Use local database to get all categories and filter for parents
			const allCategories = await window.dbApi.getCategories();
			const categories = allCategories.filter((cat) => cat.parent_id === null);
			set({ parentCategories: categories });
		} catch (error) {
			console.error(
				"Failed to fetch parent categories from local database:",
				error
			);

			// FALLBACK: Try to fetch from API
			try {
				console.log("🔄 [ProductSlice] Attempting categories API fallback...");
				const response = await fetch("http://127.0.0.1:8001/api/categories/");
				if (response.ok) {
					const apiCategories = await response.json();
					const parentCategories = apiCategories.filter(
						(cat) => cat.parent_id === null
					);
					set({ parentCategories });
					return;
				}
			} catch (apiError) {
				console.error(
					"❌ [ProductSlice] Categories API fallback failed:",
					apiError
				);
			}

			set({ parentCategories: [] });
		}
	},

	fetchChildCategories: async (parentId) => {
		if (!parentId || parentId === "all") {
			set({ childCategories: [], selectedChildCategory: "all" });
			get().applyFilter({});
			return;
		}
		try {
			// Use local database to get all categories and filter for children
			const allCategories = await window.dbApi.getCategories();
			const categories = allCategories.filter(
				(cat) => cat.parent_id === parseInt(parentId)
			);
			set({ childCategories: categories, selectedChildCategory: "all" });
			get().applyFilter({
				categoryId: parentId,
				subcategoryId: "all",
			});
		} catch (error) {
			console.error(
				`Failed to fetch child categories for parent ${parentId} from local database:`,
				error
			);
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

	// New methods for setting data from local database
	setProducts: (products) => {
		set({ products, filteredProducts: products });
	},

	setParentCategories: (categories) => {
		set({ parentCategories: categories });
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
				filtered = filtered.filter((p) => p.category?.id === subId);
			} else {
				// Filter by parent category (show products directly under parent OR under its children)
				const childIds = state.childCategories.map((c) => c.id);
				filtered = filtered.filter((p) => {
					// Product is directly under the parent category OR under one of its child categories
					return (
						p.category?.id === parentId || childIds.includes(p.category?.id)
					);
				});
			}
		}

		set({
			filteredProducts: filtered,
			selectedParentCategory: finalCategoryId,
			selectedChildCategory: finalSubcategoryId,
			searchTerm: finalSearchTerm,
		});
	},
});

// export const createProductSlice = productSlice;
