/**
 * Payments Data Management Hook with URL Persistence
 *
 * Provides payment list state management with automatic URL persistence.
 * Built on top of useListStateWithUrlPersistence for consistency across domains.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useListStateWithUrlPersistence } from './useListStateWithUrlPersistence';

export interface PaymentFilters {
	status: string;
	method: string;
	search: string;
	created_at__gte: string; // Start date in ISO format
	created_at__lte: string; // End date in ISO format
}

interface UsePaymentsDataOptions {
	initialFilters?: Partial<PaymentFilters>;
	additionalFilters?: Record<string, any>;
}

interface UsePaymentsDataReturn {
	// State
	filters: PaymentFilters;
	searchInput: string;
	currentPage: number;
	loading: boolean;
	error: string | null;

	// Actions
	setSearchInput: (value: string) => void;
	updateFilter: (key: keyof PaymentFilters, value: string) => void;
	clearFilters: () => void;
	setCurrentPage: (page: number) => void;

	// Fetch function
	fetchPayments: (url?: string) => Promise<any>;

	// Refs for stable async access
	filtersRef: React.MutableRefObject<PaymentFilters>;
	currentPageRef: React.MutableRefObject<number>;
	additionalFiltersRef: React.MutableRefObject<Record<string, any>>;
}

/**
 * Hook for managing payments data with URL persistence
 *
 * @example
 * ```ts
 * const {
 *   filters,
 *   searchInput,
 *   setSearchInput,
 *   updateFilter,
 *   fetchPayments,
 * } = usePaymentsData({
 *   additionalFilters: { store_location: selectedLocationId }
 * });
 * ```
 */
export function usePaymentsData({
	initialFilters = {},
	additionalFilters = {},
}: UsePaymentsDataOptions = {}): UsePaymentsDataReturn {
	const {
		filters,
		currentPage,
		updateFilter: updateFilterBase,
		setCurrentPage,
		clearFilters: clearFiltersBase,
		filtersRef,
		currentPageRef,
	} = useListStateWithUrlPersistence<PaymentFilters>({
		defaultFilters: {
			status: '',
			method: '',
			search: '',
			created_at__gte: '',
			created_at__lte: '',
		},
		initialFilters,
	});

	// Separate state for search input (for immediate UI updates before debounce)
	const [searchInput, setSearchInput] = useState(filters.search);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Ref for additional filters (like store_location from middleware)
	const additionalFiltersRef = useRef(additionalFilters);

	// Keep additionalFiltersRef in sync
	useEffect(() => {
		additionalFiltersRef.current = additionalFilters;
	}, [additionalFilters]);

	// Debounced search effect
	useEffect(() => {
		const timer = setTimeout(() => {
			if (searchInput !== filters.search) {
				updateFilterBase('search', searchInput);
			}
		}, 500); // 500ms debounce

		return () => clearTimeout(timer);
	}, [searchInput, filters.search, updateFilterBase]);

	// Sync searchInput when filters.search changes (e.g., from URL navigation)
	useEffect(() => {
		setSearchInput(filters.search);
	}, [filters.search]);

	const fetchPayments = useCallback(
		async (url?: string) => {
			try {
				setLoading(true);

				// Use the payment service from the application
				// This is just a placeholder - the actual implementation
				// will be in the component that uses this hook
				const mergedFilters = {
					...filtersRef.current,
					...additionalFiltersRef.current,
				};

				// Add page parameter if not using a pagination URL
				if (!url && currentPageRef.current > 1) {
					mergedFilters.page = currentPageRef.current;
				}

				// Return the filters so the component can call the actual API
				return { filters: mergedFilters, url };
			} catch (err: any) {
				setError(err.message || 'Failed to fetch payments');
				throw err;
			} finally {
				setLoading(false);
			}
		},
		[filters, currentPage] // Dependencies to trigger refetch
	);

	const updateFilter = useCallback(
		(key: keyof PaymentFilters, value: string) => {
			// For search, update the input state directly (debounce will handle filter update)
			if (key === 'search') {
				setSearchInput(value);
			} else {
				updateFilterBase(key, value);
			}
		},
		[updateFilterBase]
	);

	const clearFilters = useCallback(() => {
		setSearchInput('');
		clearFiltersBase();
	}, [clearFiltersBase]);

	return {
		filters,
		searchInput,
		currentPage,
		loading,
		error,
		setSearchInput,
		updateFilter,
		clearFilters,
		setCurrentPage,
		fetchPayments,
		filtersRef,
		currentPageRef,
		additionalFiltersRef,
	};
}
