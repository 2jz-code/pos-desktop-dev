/**
 * Shared Filter Utilities
 *
 * Common filter logic, order type definitions, and helper functions
 * used across order management interfaces.
 */

// Order Types
export const ORDER_TYPES = {
	POS: "POS",
	WEB: "WEB",
	APP: "APP",
	DOORDASH: "DOORDASH",
	UBER_EATS: "UBER_EATS",
} as const;

export type OrderType = typeof ORDER_TYPES[keyof typeof ORDER_TYPES];

// Order Type Display Labels
export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
	[ORDER_TYPES.POS]: "Point of Sale",
	[ORDER_TYPES.WEB]: "Website",
	[ORDER_TYPES.APP]: "Customer App",
	[ORDER_TYPES.DOORDASH]: "DoorDash",
	[ORDER_TYPES.UBER_EATS]: "Uber Eats",
};

// Order Statuses
export const ORDER_STATUSES = {
	PENDING: "PENDING",
	HOLD: "HOLD",
	COMPLETED: "COMPLETED",
	CANCELLED: "CANCELLED",
	VOID: "VOID",
} as const;

export type OrderStatus = typeof ORDER_STATUSES[keyof typeof ORDER_STATUSES];

// Payment Statuses
export const PAYMENT_STATUSES = {
	PAID: "PAID",
	PARTIALLY_PAID: "PARTIALLY_PAID",
	UNPAID: "UNPAID",
	REFUNDED: "REFUNDED",
} as const;

export type PaymentStatus = typeof PAYMENT_STATUSES[keyof typeof PAYMENT_STATUSES];

// Filter Options
export interface FilterOption {
	value: string;
	label: string;
}

export const STATUS_FILTER_OPTIONS: FilterOption[] = [
	{ value: "ALL", label: "All Statuses" },
	{ value: ORDER_STATUSES.PENDING, label: "Pending" },
	{ value: ORDER_STATUSES.HOLD, label: "Hold" },
	{ value: ORDER_STATUSES.COMPLETED, label: "Completed" },
	{ value: ORDER_STATUSES.CANCELLED, label: "Cancelled" },
	{ value: ORDER_STATUSES.VOID, label: "Void" },
];

export const ORDER_TYPE_FILTER_OPTIONS: FilterOption[] = [
	{ value: "ALL", label: "All Types" },
	{ value: ORDER_TYPES.POS, label: ORDER_TYPE_LABELS[ORDER_TYPES.POS] },
	{ value: ORDER_TYPES.WEB, label: ORDER_TYPE_LABELS[ORDER_TYPES.WEB] },
	{ value: ORDER_TYPES.APP, label: ORDER_TYPE_LABELS[ORDER_TYPES.APP] },
	{ value: ORDER_TYPES.DOORDASH, label: ORDER_TYPE_LABELS[ORDER_TYPES.DOORDASH] },
	{ value: ORDER_TYPES.UBER_EATS, label: ORDER_TYPE_LABELS[ORDER_TYPES.UBER_EATS] },
];

// Filter Pills Configuration
export interface FilterPillConfig {
	key: string;
	label: string;
	filterKey: 'status' | 'order_type';
	filterValue: string;
	iconName?: string;
}

export const STATUS_FILTER_PILLS: FilterPillConfig[] = [
	{
		key: 'pending',
		label: 'Pending',
		filterKey: 'status',
		filterValue: ORDER_STATUSES.PENDING,
		iconName: 'Clock'
	},
	{
		key: 'completed',
		label: 'Completed',
		filterKey: 'status',
		filterValue: ORDER_STATUSES.COMPLETED,
		iconName: 'CheckCircle'
	},
	{
		key: 'hold',
		label: 'On Hold',
		filterKey: 'status',
		filterValue: ORDER_STATUSES.HOLD,
		iconName: 'Clock'
	},
	{
		key: 'cancelled',
		label: 'Cancelled',
		filterKey: 'status',
		filterValue: ORDER_STATUSES.CANCELLED,
		iconName: 'XCircle'
	},
	{
		key: 'void',
		label: 'Void',
		filterKey: 'status',
		filterValue: ORDER_STATUSES.VOID,
		iconName: 'XCircle'
	}
];

export const ORDER_TYPE_FILTER_PILLS: FilterPillConfig[] = [
	{
		key: 'pos',
		label: 'POS',
		filterKey: 'order_type',
		filterValue: ORDER_TYPES.POS
	},
	{
		key: 'web',
		label: 'Web',
		filterKey: 'order_type',
		filterValue: ORDER_TYPES.WEB
	},
	{
		key: 'app',
		label: 'Customer App',
		filterKey: 'order_type',
		filterValue: ORDER_TYPES.APP
	},
	{
		key: 'doordash',
		label: 'DoorDash',
		filterKey: 'order_type',
		filterValue: ORDER_TYPES.DOORDASH
	},
	{
		key: 'uber_eats',
		label: 'Uber Eats',
		filterKey: 'order_type',
		filterValue: ORDER_TYPES.UBER_EATS
	}
];

// Helper Functions
export function getOrderTypeLabel(orderType: string): string {
	return ORDER_TYPE_LABELS[orderType as OrderType] || orderType;
}

export function isActiveFilter(currentValue: string, targetValue: string): boolean {
	return currentValue === targetValue;
}

export function toggleFilter(currentValue: string, targetValue: string): string {
	return currentValue === targetValue ? "ALL" : targetValue;
}

export function hasActiveFilters(filters: Record<string, string>): boolean {
	return Object.values(filters).some(value => value && value !== "");
}

// Date helper functions for order filtering
export function isToday(dateString: string): boolean {
	const date = new Date(dateString);
	const today = new Date();
	return (
		date.getFullYear() === today.getFullYear() &&
		date.getMonth() === today.getMonth() &&
		date.getDate() === today.getDate()
	);
}

// formatOrderDate moved to utils.ts to avoid duplication