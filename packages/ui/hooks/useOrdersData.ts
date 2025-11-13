/**
 * Shared Orders Data Hook
 *
 * Provides common data fetching, pagination, and filtering logic for order management.
 * Handles state management for orders list, filters, pagination, and loading states.
 * Persists state in URL search parameters for reliable navigation persistence.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useListStateWithUrlPersistence } from './useListStateWithUrlPersistence';

export interface OrdersFilters {
	order_type: string;
	status: string;
	search: string;
	created_at__gte: string; // Start date in ISO format
	created_at__lte: string; // End date in ISO format
}

interface PaginationData {
	results: any[];
	next: string | null;
	previous: string | null;
	count: number;
}

interface UseOrdersDataProps {
	getAllOrdersService: (filters: OrdersFilters & Record<string, any>, url?: string | null) => Promise<PaginationData>;
	initialFilters?: Partial<OrdersFilters>;
	additionalFilters?: Record<string, any>;
}

interface UseOrdersDataReturn {
	// Data
	orders: any[];
	loading: boolean;
	error: string | null;

	// Pagination
	nextUrl: string | null;
	prevUrl: string | null;
	count: number;
	currentPage: number;

	// Filters
	filters: OrdersFilters;
	searchInput: string;  // Separate search input value for the UI
	hasFilters: boolean;

	// Actions
	fetchOrders: (url?: string | null) => Promise<void>;
	handleNavigate: (url: string) => void;
	handleFilterChange: (filterName: keyof OrdersFilters, value: string) => void;
	handleSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	clearFilters: () => void;
	refetch: () => Promise<void>;
}

const defaultFilters: OrdersFilters = {
	order_type: "",
	status: "",
	search: "",
	created_at__gte: "",
	created_at__lte: "",
};

// Stable default object to prevent infinite loops
const DEFAULT_ADDITIONAL_FILTERS = {};

export function useOrdersData({
	getAllOrdersService,
	initialFilters = {},
	additionalFilters = DEFAULT_ADDITIONAL_FILTERS,
}: UseOrdersDataProps): UseOrdersDataReturn {
	// Use the generic list state hook for URL persistence
	const {
		filters,
		currentPage,
		setCurrentPage,
		updateFilter,
		clearFilters: clearFiltersBase,
		filtersRef,
		currentPageRef
	} = useListStateWithUrlPersistence<OrdersFilters>({
		defaultFilters,
		initialFilters
	});

	// Data state
	const [orders, setOrders] = useState<any[]>([]);
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
	const serviceRef = useRef(getAllOrdersService);
	const additionalFiltersRef = useRef(additionalFilters);

	// Track the stringified version of additionalFilters to detect real changes
	const additionalFiltersStringRef = useRef(JSON.stringify(additionalFilters));

	// Debounce timer ref
	const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

	// Update refs when props change
	useEffect(() => {
		serviceRef.current = getAllOrdersService;
	}, [getAllOrdersService]);

	useEffect(() => {
		const newStringified = JSON.stringify(additionalFilters);
		if (newStringified !== additionalFiltersStringRef.current) {
			additionalFiltersStringRef.current = newStringified;
			additionalFiltersRef.current = additionalFilters;
			// Trigger refetch by incrementing counter
			setAdditionalFiltersTrigger(prev => prev + 1);
		}
	}, [additionalFilters]);

	const fetchOrders = useCallback(
		async (url: string | null = null) => {
			try {
				setLoading(true);
				// Use refs to get the latest values (important for when state updates trigger this)
				const mergedFilters = { ...filtersRef.current, ...additionalFiltersRef.current };

				// Add page parameter if not using a pagination URL and currentPage > 1
				if (!url && currentPageRef.current > 1) {
					mergedFilters.page = currentPageRef.current;
				}

				// Filter out internal trigger fields (prefixed with _) before sending to API
				const apiFilters = Object.entries(mergedFilters).reduce((acc, [key, value]) => {
					if (!key.startsWith('_')) {
						acc[key] = value;
					}
					return acc;
				}, {} as Record<string, any>);

				const response = await serviceRef.current(apiFilters, url);
				setOrders(response.results || []);
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
				setError("Failed to fetch orders.");
				console.error("Order fetch error:", err);
			} finally {
				setLoading(false);
			}
		},
		[filters, currentPage, additionalFiltersTrigger] // Depend on filters and page to trigger refetch when they change
	);

	useEffect(() => {
		fetchOrders();
	}, [fetchOrders]);

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
			// Call fetchOrders with the pagination URL directly
			fetchOrders(url);
		}
	}, [fetchOrders]);

	const handleFilterChange = useCallback((filterName: keyof OrdersFilters, value: string) => {
		const actualValue = value === "ALL" ? "" : value;
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
		return fetchOrders();
	}, [fetchOrders]);

	const hasFilters = !!(filters.order_type || filters.status || filters.search);

	return {
		// Data
		orders,
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
		fetchOrders,
		handleNavigate,
		handleFilterChange,
		handleSearchChange,
		clearFilters,
		refetch,
	};
}
