import { useQuery } from "@tanstack/react-query";
import { productsAPI } from "../api/products";

export const useCategories = () => {
	const {
		data: categories = [],
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: ["categories"],
		queryFn: productsAPI.getCategories,
		staleTime: 5 * 60 * 1000, // 5 minutes
		cacheTime: 10 * 60 * 1000, // 10 minutes
		select: (data) => {
			const filtered =
				data?.filter((category) => {
					// Filter out grocery category and only show parent categories (no subcategories)
					return category.name !== "grocery" && category.parent === null;
				}) || [];

			// Sort by the backend order field, then by name as fallback
			return filtered.sort((a, b) => {
				// First, sort by order field
				if (a.order !== b.order) {
					return a.order - b.order;
				}
				// If order is the same, sort alphabetically by name
				return a.name.localeCompare(b.name);
			});
		},
	});

	return {
		categories,
		isLoading,
		error,
		refetch,
	};
};
