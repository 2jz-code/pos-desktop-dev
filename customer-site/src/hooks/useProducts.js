import React from "react";
import { useQuery } from "@tanstack/react-query";
import { productsAPI } from "../api/products";

const normalizeProductData = (product) => {
	return {
		...product,
		category: product.category
			? Array.isArray(product.category)
				? product.category
				: [product.category]
			: [],
		price:
			typeof product.price === "string"
				? parseFloat(product.price)
				: product.price,
	};
};

export const useProducts = () => {
	const {
		data: products = [],
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: ["products"],
		queryFn: productsAPI.getProducts,
		staleTime: 5 * 60 * 1000, // 5 minutes
		cacheTime: 10 * 60 * 1000, // 10 minutes
		// Normalize and sort products
		select: (data) => {
			const normalizedProducts = data?.map(normalizeProductData) || [];
			// Sort products alphabetically by name
			return normalizedProducts.sort((a, b) => a.name.localeCompare(b.name));
		},
	});

	return {
		products,
		isLoading,
		error,
		refetch,
	};
};

// Helper function for filtering products by category
export const useFilteredProducts = (selectedCategory, categories) => {
	const { products, isLoading, error } = useProducts();

	const filteredProducts = React.useMemo(() => {
		if (!selectedCategory) {
			return products;
		}

		const categoryInfo = categories.find((c) => c.id === selectedCategory);
		const selectedCategoryName = categoryInfo ? categoryInfo.name : "";

		let categorySpecificProducts = products.filter((product) => {
			const productCategories = Array.isArray(product.category)
				? product.category
				: product.category
				? [product.category]
				: [];
			return productCategories.some(
				(cat) => cat && cat.id === selectedCategory
			);
		});

		// Sort products within category
		categorySpecificProducts.sort((a, b) => a.name.localeCompare(b.name));

		// Handle special category logic
		if (selectedCategoryName.toLowerCase() === "drinks") {
			const freshDrinks = [];
			const groceryDrinks = [];

			categorySpecificProducts.forEach((p) => {
				if (p.is_grocery_item) {
					groceryDrinks.push(p);
				} else {
					freshDrinks.push(p);
				}
			});

			// Sort each subgroup
			freshDrinks.sort((a, b) => a.name.localeCompare(b.name));
			groceryDrinks.sort((a, b) => a.name.localeCompare(b.name));

			const subGroups = [];
			if (freshDrinks.length > 0)
				subGroups.push({ subHeading: "Fresh Drinks", products: freshDrinks });
			if (groceryDrinks.length > 0)
				subGroups.push({
					subHeading: "Canned Drinks",
					products: groceryDrinks,
				});

			return subGroups.length > 0
				? [{ categoryName: selectedCategoryName, subGroups: subGroups }]
				: [];
		} else if (selectedCategoryName.toLowerCase() === "mana'eesh") {
			// Filter out bag items
			const filteredManaeesh = categorySpecificProducts.filter((p) => {
				return !p.name.toLowerCase().includes("bag");
			});
			return filteredManaeesh;
		}

		return categorySpecificProducts;
	}, [products, selectedCategory, categories]);

	return {
		filteredProducts,
		isLoading,
		error,
	};
};
