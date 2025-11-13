/**
 * @ajeen/ui - Shared UI Library
 *
 * Main entry point for shared components, utilities, and types
 * used across Ajeen Fresh applications.
 */

// Order status utilities
export { getStatusConfig, getPaymentStatusConfig } from './orderStatus';
export type { StatusConfig } from './orderStatus';

// Icon utilities
export { createIconMapper } from './iconUtils';
export type { IconName, IconMapper } from './iconUtils';

// Filter utilities
export {
	ORDER_TYPES,
	ORDER_TYPE_LABELS,
	ORDER_STATUSES,
	PAYMENT_STATUSES,
	STATUS_FILTER_OPTIONS,
	ORDER_TYPE_FILTER_OPTIONS,
	STATUS_FILTER_PILLS,
	ORDER_TYPE_FILTER_PILLS,
	getOrderTypeLabel,
	isActiveFilter,
	toggleFilter,
	hasActiveFilters,
	isToday
} from './filterUtils';
export type {
	OrderType,
	OrderStatus,
	PaymentStatus,
	FilterOption,
	FilterPillConfig
} from './filterUtils';

// Shared hooks
export { usePagination } from '../hooks/usePagination';
export { useOrdersData } from '../hooks/useOrdersData';
export { usePaymentsData } from '../hooks/usePaymentsData';
export type { PaymentFilters } from '../hooks/usePaymentsData';
export { useOrderActions } from '../hooks/useOrderActions';
export { useListStateWithUrlPersistence } from '../hooks/useListStateWithUrlPersistence';
export { useDebounce } from '../hooks/useDebounce';
export { useScrollToScannedItem } from '../hooks/useScrollToScannedItem';
export type { ScrollToItemOptions, ScrollToItemWithHighlightOptions } from '../hooks/useScrollToScannedItem';
export { useRolePermissions } from '../hooks/useRolePermissions';
export type {
	UserRole,
	User,
	AuthContext,
	RolePermissionsConfig,
	RolePermissions
} from '../hooks/useRolePermissions';
export { useToast, toast, configureToast } from '../hooks/useToast';
export type {
	ToastConfig,
	ToastActionElement,
	ToastProps,
	ToasterToast
} from '../hooks/useToast';
export { useConfirmation, ConfirmationDialog, configureConfirmation } from '../hooks/useConfirmation';
export type {
	ConfirmationConfig,
	ConfirmationDialogProps,
	AlertDialogComponents,
	ConfirmationHookConfig
} from '../hooks/useConfirmation';
export { useNavigationRoutes, createRoutePattern, mergeSubPageTitles, COMMON_SUB_PAGE_TITLES } from '../hooks/useNavigationRoutes';
export type {
	NavigationRoute,
	NavigationSubPage,
	RoutePattern,
	NavigationConfig
} from '../hooks/useNavigationRoutes';
export { useBarcode, configureBarcode, createBarcodeHook, useProductBarcode, useInventoryBarcode, usePOSBarcode } from '../hooks/useBarcode';
export type {
	BarcodeConfig,
	BarcodeHookConfig
} from '../hooks/useBarcode';

// Shared utilities
export {
	cn,
	formatCurrency,
	extractErrorMessage
} from './utils';
export { debounce } from '../utils/debounce';

// Validation utilities
export {
	isValidEmail,
	isValidUsername,
	isValidPhoneNumber,
	validatePasswordStrength,
	passwordsMatch,
	formatValidationError,
	validateRequiredFields,
	PASSWORD_REQUIREMENTS
} from '../utils/validation';
export type { PasswordRequirement } from '../utils/validation';

// Formatting utilities
export {
	formatPhoneNumber,
	cleanPhoneNumber,
	normalizeEmail,
	normalizeUsername,
	formatName,
	formatAddress,
	cleanText
} from '../utils/formatting';