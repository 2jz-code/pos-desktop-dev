// desktop-combined/electron-app/src/store/slices/productSlice.js

import * as productService from "@/api/services/productService";
import * as categoryService from "@/api/services/categoryService";

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
			const response = await productService.getProducts();
			const products = response.data || [];
			set({ products: products, filteredProducts: products });
		} catch (error) {
			console.error("Failed to fetch products:", error);
			set({ products: [], filteredProducts: [] });
		}
	},
	fetchParentCategories: async () => {
		try {
			const response = await categoryService.getCategories({ parent: "null" });
			const categories = response.data || [];
			set({ parentCategories: categories });
		} catch (error) {
			console.error("Failed to fetch parent categories:", error);
		}
	},
	fetchChildCategories: async (parentId) => {
		if (!parentId || parentId === "all") {
			set({ childCategories: [], selectedChildCategory: "all" });
			get().applyFilter({});
			return;
		}
		try {
			const response = await categoryService.getCategories({
				parent: parentId,
			});
			const categories = response.data || [];
			set({ childCategories: categories, selectedChildCategory: "all" });
			get().applyFilter({
				categoryId: parentId,
				subcategoryId: "all",
			});
		} catch (error) {
			console.error(
				`Failed to fetch child categories for parent ${parentId}:`,
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
	applyFilter: ({ categoryId, subcategoryId, searchTerm }) => {
		const state = get();
		const finalCategoryId =
			categoryId !== undefined ? categoryId : state.selectedParentCategory;
		const finalSubcategoryId =
			subcategoryId !== undefined ? subcategoryId : state.selectedChildCategory;
		const finalSearchTerm =
			searchTerm !== undefined ? searchTerm : state.searchTerm;
		let filtered = state.products;

		if (finalSearchTerm) {
			filtered = filtered.filter((product) =>
				product.name.toLowerCase().includes(finalSearchTerm.toLowerCase())
			);
		}
		if (finalCategoryId && finalCategoryId !== "all") {
			const parentId = parseInt(finalCategoryId);
			if (finalSubcategoryId && finalSubcategoryId !== "all") {
				const subId = parseInt(finalSubcategoryId);
				filtered = filtered.filter((p) => p.category?.id === subId);
			} else {
				const childIds = state.childCategories.map((c) => c.id);
				filtered = filtered.filter(
					(p) =>
						p.category?.id === parentId || childIds.includes(p.category?.id)
				);
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
