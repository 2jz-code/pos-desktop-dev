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

export const useProducts = (categoryId = null) => {
	const {
		data: products = [],
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: ["products", categoryId],
		queryFn: () => productsAPI.getProducts({ category: categoryId }),
		staleTime: 5 * 60 * 1000, // 5 minutes
		cacheTime: 15 * 60 * 1000, // 15 minutes, slightly longer cache
		enabled: true, // Always enabled, will fetch when categoryId changes
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

// This hook is now deprecated and will be removed after refactoring the Menu page.
// The filtering logic is now handled by the backend.
// The special UI grouping logic will be moved into the component.
export const useFilteredProducts = (selectedCategory) => {
	const {
		products: filteredProducts,
		isLoading,
		error,
	} = useProducts(selectedCategory);

	return {
		filteredProducts,
		isLoading,
		error,
	};
};
