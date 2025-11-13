/**
 * Shared Products Data Hook
 *
 * Provides common data fetching, pagination, and filtering logic for product management.
 * Handles state management for products list, filters, pagination, and loading states.
 * Persists state in URL search parameters for reliable navigation persistence.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useListStateWithUrlPersistence } from './useListStateWithUrlPersistence';

export interface ProductsFilters {
	search: string;
	category: string;
	product_type: string;
	include_archived?: string; // 'only' for archived, undefined for active
}

interface PaginationData {
	results: any[];
	next: string | null;
	previous: string | null;
	count: number;
}

interface UseProductsDataProps {
	getProductsService: (filters: ProductsFilters & Record<string, any>, url?: string | null) => Promise<PaginationData>;
	initialFilters?: Partial<ProductsFilters>;
	additionalFilters?: Record<string, any>;
}

interface UseProductsDataReturn {
	// Data
	products: any[];
	loading: boolean;
	error: string | null;

	// Pagination
	nextUrl: string | null;
	prevUrl: string | null;
	count: number;
	currentPage: number;

	// Filters
	filters: ProductsFilters;
	searchInput: string;  // Separate search input value for the UI
	hasFilters: boolean;

	// Actions
	fetchProducts: (url?: string | null) => Promise<void>;
	handleNavigate: (url: string) => void;
	handleFilterChange: (filterName: keyof ProductsFilters, value: string) => void;
	handleSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	clearFilters: () => void;
	refetch: () => Promise<void>;
}

const defaultFilters: ProductsFilters = {
	search: "",
	category: "",
	product_type: "",
};

// Stable default object to prevent infinite loops
const DEFAULT_ADDITIONAL_FILTERS = {};

export function useProductsData({
	getProductsService,
	initialFilters = {},
	additionalFilters = DEFAULT_ADDITIONAL_FILTERS,
}: UseProductsDataProps): UseProductsDataReturn {
	// Use the generic list state hook for URL persistence
	const {
		filters,
		currentPage,
		setCurrentPage,
		updateFilter,
		clearFilters: clearFiltersBase,
		filtersRef,
		currentPageRef
	} = useListStateWithUrlPersistence<ProductsFilters>({
		defaultFilters,
		initialFilters
	});

	// Data state
	const [products, setProducts] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [nextUrl, setNextUrl] = useState<string | null>(null);
	const [prevUrl, setPrevUrl] = useState<string | null>(null);
	const [count, setCount] = useState(0);

	// Separate state for search input (immediate updates for UI)
	const [searchInput, setSearchInput] = useState(filters.search);

	// Sync searchInput with filters.search
	useEffect(() => {
		setSearchInput(filters.search);
	}, [filters.search]);

	// Use a counter to trigger refetch when additionalFilters actually changes
	const [additionalFiltersTrigger, setAdditionalFiltersTrigger] = useState(0);

	// Use refs for stable references to prevent infinite loops
	const serviceRef = useRef(getProductsService);
	const additionalFiltersRef = useRef(additionalFilters);

	// Track the stringified version of additionalFilters to detect real changes
	const additionalFiltersStringRef = useRef(JSON.stringify(additionalFilters));

	// Debounce timer ref
	const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

	// Update refs when props change
	useEffect(() => {
		serviceRef.current = getProductsService;
	}, [getProductsService]);

	useEffect(() => {
		const newStringified = JSON.stringify(additionalFilters);
		if (newStringified !== additionalFiltersStringRef.current) {
			additionalFiltersStringRef.current = newStringified;
			additionalFiltersRef.current = additionalFilters;
			// Trigger refetch by incrementing counter
			setAdditionalFiltersTrigger(prev => prev + 1);
		}
	}, [additionalFilters]);

	const fetchProducts = useCallback(
		async (url: string | null = null) => {
			try {
				setLoading(true);
				// Use refs to get the latest values (important for when state updates trigger this)
				const mergedFilters = { ...filtersRef.current, ...additionalFiltersRef.current };

				// Add page parameter if not using a pagination URL and currentPage > 1
				if (!url && currentPageRef.current > 1) {
					mergedFilters.page = currentPageRef.current;
				}

				// Filter out internal trigger fields (prefixed with _) and empty values before sending to API
				const apiFilters = Object.entries(mergedFilters).reduce((acc, [key, value]) => {
					if (!key.startsWith('_') && value !== "" && value !== null && value !== undefined) {
						acc[key] = value;
					}
					return acc;
				}, {} as Record<string, any>);

				const response = await serviceRef.current(apiFilters, url);
				setProducts(response.results || []);
				setNextUrl(response.next);
				setPrevUrl(response.previous);
				setCount(response.count || 0);

				// Only update currentPage if we used a pagination URL
				// Don't reset it when fetching with filters (let state/URL be the source of truth)
				if (url) {
					const urlObj = new URL(url);
					const page = parseInt(urlObj.searchParams.get("page") || "1", 10);
					setCurrentPage(page);
				}
				// Don't set to 1 when no URL - currentPage already has the right value from state

				setError(null);
			} catch (err) {
				setError("Failed to fetch products.");
				console.error("Product fetch error:", err);
			} finally {
				setLoading(false);
			}
		},
		[filters, currentPage, additionalFiltersTrigger] // Depend on filters and page to trigger refetch when they change
	);

	useEffect(() => {
		fetchProducts();
	}, [fetchProducts]);

	const handleNavigate = useCallback((url: string) => {
		if (url) {
			// Extract page number from the pagination URL and update currentPage state
			try {
				const urlObj = new URL(url);
				const page = parseInt(urlObj.searchParams.get("page") || "1", 10);
				setCurrentPage(page);
			} catch (e) {
				console.error("Error parsing pagination URL:", e);
			}
			// Call fetchProducts with the pagination URL directly
			fetchProducts(url);
		}
	}, [fetchProducts]);

	const handleFilterChange = useCallback((filterName: keyof ProductsFilters, value: string) => {
		const actualValue = value === "ALL" || value === "all" ? "" : value;
		updateFilter(filterName, actualValue);
	}, [updateFilter]);

	const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;

		// Update the input immediately for responsive UI
		setSearchInput(value);

		// Clear existing timer
		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current);
		}

		// Set new timer to update filters after 500ms of no typing
		debounceTimerRef.current = setTimeout(() => {
			updateFilter('search', value);
		}, 500);
	}, [updateFilter]);

	// Cleanup debounce timer on unmount
	useEffect(() => {
		return () => {
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
			}
		};
	}, []);

	const clearFilters = useCallback(() => {
		clearFiltersBase();
		setSearchInput("");
	}, [clearFiltersBase]);

	const refetch = useCallback(() => {
		return fetchProducts();
	}, [fetchProducts]);

	const hasFilters = !!(filters.category || filters.product_type || filters.search);

	return {
		// Data
		products,
		loading,
		error,

		// Pagination
		nextUrl,
		prevUrl,
		count,
		currentPage,

		// Filters
		filters,
		searchInput,  // Return the immediate search input value for the UI
		hasFilters,

		// Actions
		fetchProducts,
		handleNavigate,
		handleFilterChange,
		handleSearchChange,
		clearFilters,
		refetch,
	};
}
