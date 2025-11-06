/**
 * Generic List State with URL Persistence Hook
 *
 * Provides list state management with automatic URL persistence for filters and pagination.
 * Works for any list view (orders, payments, products, etc.)
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

interface UseListStateOptions<TFilters extends Record<string, any>> {
	defaultFilters: TFilters;
	initialFilters?: Partial<TFilters>;
}

interface UseListStateReturn<TFilters extends Record<string, any>> {
	// State
	filters: TFilters;
	currentPage: number;

	// Actions
	setFilters: (filters: TFilters | ((prev: TFilters) => TFilters)) => void;
	setCurrentPage: (page: number | ((prev: number) => number)) => void;
	updateFilter: (key: keyof TFilters, value: any) => void;
	clearFilters: () => void;

	// Refs (for stable access in callbacks)
	filtersRef: React.MutableRefObject<TFilters>;
	currentPageRef: React.MutableRefObject<number>;
}

/**
 * Generic hook for managing list state with URL persistence
 *
 * @example
 * ```ts
 * const { filters, currentPage, updateFilter, setCurrentPage } = useListStateWithUrlPersistence({
 *   defaultFilters: { status: '', order_type: '', search: '' }
 * });
 * ```
 */
export function useListStateWithUrlPersistence<TFilters extends Record<string, any>>({
	defaultFilters,
	initialFilters = {},
}: UseListStateOptions<TFilters>): UseListStateReturn<TFilters> {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();

	// Initialize filters from URL or defaults
	const getInitialFilters = (): TFilters => {
		const urlFilters: Partial<TFilters> = {};

		// Read all filter keys from URL
		Object.keys(defaultFilters).forEach((key) => {
			const urlValue = searchParams.get(key);
			if (urlValue !== null) {
				urlFilters[key as keyof TFilters] = urlValue as any;
			}
		});

		return { ...defaultFilters, ...initialFilters, ...urlFilters };
	};

	const getInitialPage = (): number => {
		const pageParam = searchParams.get('page');
		return pageParam ? parseInt(pageParam, 10) : 1;
	};

	const [filters, setFilters] = useState<TFilters>(getInitialFilters());
	const [currentPage, setCurrentPage] = useState(getInitialPage());

	// Refs for stable access
	const filtersRef = useRef(filters);
	const currentPageRef = useRef(currentPage);

	// Keep refs in sync with state
	useEffect(() => {
		filtersRef.current = filters;
		currentPageRef.current = currentPage;
	}, [filters, currentPage]);

	// Track if we're mounting
	const isMounting = useRef(true);

	// Previous URL to compare and prevent loops
	const prevUrlRef = useRef(window.location.search.substring(1));

	// Sync state FROM URL when URL changes (from navigation)
	useEffect(() => {
		const currentUrl = window.location.search.substring(1);

		// Only sync if URL actually changed
		if (currentUrl === prevUrlRef.current && !isMounting.current) {
			return;
		}

		prevUrlRef.current = currentUrl;

		const urlFilters: Partial<TFilters> = {};

		Object.keys(defaultFilters).forEach((key) => {
			const urlValue = searchParams.get(key);
			urlFilters[key as keyof TFilters] = urlValue || defaultFilters[key];
		});

		const urlPage = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1;

		setFilters({ ...defaultFilters, ...urlFilters } as TFilters);
		setCurrentPage(urlPage);
		isMounting.current = false;
	}, [searchParams, defaultFilters]);

	// Update URL when filters or page changes (but not on mount)
	useEffect(() => {
		// Skip on mount
		if (isMounting.current) {
			return;
		}

		// Start with current URL params to preserve non-managed params
		const params = new URLSearchParams(window.location.search);

		// Update managed filter params (remove if empty, set if has value)
		Object.entries(filters).forEach(([key, value]) => {
			if (value && value !== '') {
				params.set(key, String(value));
			} else {
				params.delete(key);
			}
		});

		// Update page param
		if (currentPage > 1) {
			params.set('page', currentPage.toString());
		} else {
			params.delete('page');
		}

		const newUrl = params.toString();
		const actualBrowserUrl = window.location.search.substring(1);

		// Skip if the actual browser URL matches what we want
		if (newUrl === actualBrowserUrl) {
			return;
		}

		prevUrlRef.current = newUrl;
		navigate(`?${newUrl}`, { replace: true });
	}, [filters, currentPage, navigate]);

	// Helper to update a single filter
	const updateFilter = useCallback((key: keyof TFilters, value: any) => {
		setFilters((prev) => ({ ...prev, [key]: value }));
		setCurrentPage(1); // Reset to page 1 when filters change
	}, []);

	// Helper to clear all filters
	const clearFilters = useCallback(() => {
		setFilters({ ...defaultFilters, ...initialFilters });
		setCurrentPage(1);
	}, [defaultFilters, initialFilters]);

	return {
		filters,
		currentPage,
		setFilters,
		setCurrentPage,
		updateFilter,
		clearFilters,
		filtersRef,
		currentPageRef,
	};
}
