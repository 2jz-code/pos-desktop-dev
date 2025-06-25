// desktop-combined/electron-app/src/store/slices/productSlice.js
import { getProducts } from "@/domains/products/services/productService";
import { getCategories } from "@/domains/products/services/categoryService";

export const createProductSlice = (set, get) => ({
	products: [],
	filteredProducts: [],
	searchTerm: "",
	parentCategories: [],
	childCategories: [],
	selectedParentCategory: "all",
	selectedChildCategory: "all",

	fetchProducts: async () => {
		try {
			console.log("🔄 [ProductSlice] Fetching products from API...");
			const response = await getProducts();
			const products = response.data;
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
			});
		} catch (error) {
			console.error(
				"❌ [ProductSlice] Failed to fetch products from API:",
				error.response?.data?.detail || error.message
			);
			// Set empty state on failure
			set({ products: [], filteredProducts: [] });
		}
	},

	fetchParentCategories: async () => {
		try {
			console.log("🔄 [ProductSlice] Fetching parent categories from API...");
			const response = await getCategories();
			const allCategories = response.data;
			const categories = allCategories.filter((cat) => cat.parent_id === null);
			set({ parentCategories: categories });
		} catch (error) {
			console.error(
				"❌ [ProductSlice] Failed to fetch parent categories from API:",
				error.response?.data?.detail || error.message
			);
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
			console.log(
				`🔄 [ProductSlice] Fetching child categories for parent ${parentId} from API...`
			);
			const response = await getCategories();
			const allCategories = response.data;
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
