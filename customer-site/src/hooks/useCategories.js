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
		// Filter out grocery category as in original
		select: (data) => {
			return data?.filter((category) => category.name !== "grocery") || [];
		},
	});

	return {
		categories,
		isLoading,
		error,
		refetch,
	};
};
