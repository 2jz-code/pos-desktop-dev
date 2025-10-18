/**
 * Shared Orders Data Hook
 *
 * Provides common data fetching, pagination, and filtering logic for order management.
 * Handles state management for orders list, filters, pagination, and loading states.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

interface OrdersFilters {
	order_type: string;
	status: string;
	search: string;
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
};

// Stable default object to prevent infinite loops
const DEFAULT_ADDITIONAL_FILTERS = {};

export function useOrdersData({
	getAllOrdersService,
	initialFilters = {},
	additionalFilters = DEFAULT_ADDITIONAL_FILTERS
}: UseOrdersDataProps): UseOrdersDataReturn {
	const [orders, setOrders] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [nextUrl, setNextUrl] = useState<string | null>(null);
	const [prevUrl, setPrevUrl] = useState<string | null>(null);
	const [count, setCount] = useState(0);
	const [currentPage, setCurrentPage] = useState(1);
	const [filters, setFilters] = useState<OrdersFilters>({
		...defaultFilters,
		...initialFilters
	});

	// Use a counter to trigger refetch when additionalFilters actually changes
	const [additionalFiltersTrigger, setAdditionalFiltersTrigger] = useState(0);

	// Use refs for stable references to prevent infinite loops
	const serviceRef = useRef(getAllOrdersService);
	const additionalFiltersRef = useRef(additionalFilters);

	// Track the stringified version of additionalFilters to detect real changes
	const additionalFiltersStringRef = useRef(JSON.stringify(additionalFilters));

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
				// Merge additionalFilters with the main filters (use ref for stable reference)
				const mergedFilters = { ...filters, ...additionalFiltersRef.current };

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

				// Extract current page from URL or use page 1 as default
				if (url) {
					const urlObj = new URL(url);
					const page = parseInt(urlObj.searchParams.get("page") || "1", 10);
					setCurrentPage(page);
				} else {
					setCurrentPage(1);
				}

				setError(null);
			} catch (err) {
				setError("Failed to fetch orders.");
				console.error("Order fetch error:", err);
			} finally {
				setLoading(false);
			}
		},
		[filters, additionalFiltersTrigger] // Depend on filters and trigger counter (not additionalFilters directly to prevent infinite loops)
	);

	useEffect(() => {
		fetchOrders();
	}, [fetchOrders]);

	const handleNavigate = useCallback((url: string) => {
		if (url) fetchOrders(url);
	}, [fetchOrders]);

	const handleFilterChange = useCallback((filterName: keyof OrdersFilters, value: string) => {
		const actualValue = value === "ALL" ? "" : value;
		setFilters((prev) => ({ ...prev, [filterName]: actualValue }));
	}, []);

	const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setFilters((prev) => ({ ...prev, search: value }));
	}, []);

	const clearFilters = useCallback(() => {
		setFilters({ ...defaultFilters, ...initialFilters });
	}, [initialFilters]);

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