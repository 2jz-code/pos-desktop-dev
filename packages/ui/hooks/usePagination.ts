/**
 * Shared Pagination Logic Hook
 *
 * Handles common pagination logic for API responses that return:
 * - results: Array of items
 * - next: URL for next page
 * - previous: URL for previous page
 * - count: Total number of items
 */

interface PaginationData {
	results: any[];
	next: string | null;
	previous: string | null;
	count: number;
}

interface UsePaginationProps {
	data: PaginationData | null;
	pageSize?: number;
}

interface UsePaginationReturn {
	// Current state
	items: any[];
	currentPage: number;
	totalPages: number;
	totalItems: number;

	// Navigation
	hasNext: boolean;
	hasPrevious: boolean;
	nextUrl: string | null;
	prevUrl: string | null;

	// Utilities
	getPageUrl: (pageNumber: number) => string | null;
	getPageFromUrl: (url: string | null) => number;
}

export function usePagination({
	data,
	pageSize = 25
}: UsePaginationProps): UsePaginationReturn {
	const items = data?.results || [];
	const totalItems = data?.count || 0;
	const totalPages = Math.ceil(totalItems / pageSize);
	const nextUrl = data?.next || null;
	const prevUrl = data?.previous || null;

	// Extract current page from URLs
	const getPageFromUrl = (url: string | null): number => {
		if (!url) return 1;
		try {
			const urlObj = new URL(url);
			return parseInt(urlObj.searchParams.get("page") || "1", 10);
		} catch {
			return 1;
		}
	};

	const currentPage = nextUrl
		? getPageFromUrl(nextUrl) - 1
		: prevUrl
		? getPageFromUrl(prevUrl) + 1
		: 1;

	// Generate URL for specific page
	const getPageUrl = (pageNumber: number): string | null => {
		if (!prevUrl && !nextUrl) return null;

		const baseUrl = prevUrl || nextUrl;
		if (!baseUrl) return null;

		try {
			const url = new URL(baseUrl);
			url.searchParams.set("page", pageNumber.toString());
			return url.toString();
		} catch {
			return null;
		}
	};

	return {
		// Current state
		items,
		currentPage,
		totalPages,
		totalItems,

		// Navigation
		hasNext: !!nextUrl,
		hasPrevious: !!prevUrl,
		nextUrl,
		prevUrl,

		// Utilities
		getPageUrl,
		getPageFromUrl,
	};
}