import { useAuth } from "@/context/AuthContext";

/**
 * Hook that provides role-based permission checks for the POS system
 *
 * Permission Hierarchy:
 * - OWNER: Full access to everything
 * - MANAGER: Can manage users (cashiers), view all data, some settings
 * - CASHIER: Can only use POS, view own orders, minimal settings (display only)
 * - ADMIN: Same as OWNER (included for completeness)
 */
export const useRolePermissions = () => {
	const { user, isOwner, isManager, isCashier } = useAuth();

	// Page-level permissions
	const canAccessDashboard = () => true; // All authenticated users
	const canAccessPOS = () => true; // All authenticated users
	const canAccessOrders = () => true; // All authenticated users (cashiers need to resume held orders)
	const canAccessPayments = () => isOwner || isManager;
	const canAccessProducts = () => true; // All authenticated users (cashiers need to view products)
	const canAccessUsers = () => isOwner || isManager;
	const canAccessDiscounts = () => isOwner || isManager;
	const canAccessSettings = () => true; // All users can access settings (with restrictions inside)

	// Settings-level permissions
	const canAccessBusinessSettings = () => isOwner || isManager;
	const canAccessTerminalSettings = () => true; // All users (but limited for cashiers)
	const canAccessHardwareSettings = () => isOwner || isManager;
	const canAccessAdvancedSettings = () => isOwner || isManager;

	// Specific settings permissions
	const canEditBusinessHours = () => isOwner || isManager;
	const canEditStoreInfo = () => isOwner || isManager;
	const canEditFinancialSettings = () => isOwner;
	const canEditReceiptSettings = () => isOwner || isManager;
	const canEditPaymentProviders = () => isOwner;
	const canEditPrinterSettings = () => isOwner || isManager;
	const canEditStripeSettings = () => isOwner;

	// Terminal settings - cashiers can only edit display settings
	const canEditDisplaySettings = () => true; // All users
	const canEditSyncSettings = () => isOwner || isManager;
	const canEditBehaviorSettings = () => isOwner || isManager;

	// Order/POS operation permissions
	const canCreateOrders = () => true; // All authenticated users
	const canCancelOrders = () => isOwner || isManager;
	const canRefundPayments = () => isOwner || isManager;
	const canViewAllOrders = () => isOwner || isManager;
	const canViewOwnOrders = () => true; // All users can view their own orders
	const canHoldOrders = () => true; // All users
	const canResumeOrders = () => true; // All users
	const canClearCart = () => true; // All users

	// User management permissions
	const canCreateUsers = () => isOwner || isManager;
	const canEditUser = (targetUser) => {
		if (!user || !targetUser) return false;
		if (user.id === targetUser.id) return true; // Can edit own profile
		if (isCashier) return false;
		if (isManager) return targetUser.role === "CASHIER";
		if (isOwner) return true;
		return false;
	};
	const canDeleteUser = (targetUser) => {
		if (!user || !targetUser || user.id === targetUser.id) return false;
		if (isCashier) return false;
		if (isManager) return targetUser.role === "CASHIER";
		if (isOwner) return true;
		return false;
	};

	// Product management permissions
	const canCreateProducts = () => isOwner || isManager;
	const canEditProducts = () => isOwner || isManager;
	const canDeleteProducts = () => isOwner || isManager;
	const canViewProducts = () => true; // All users need to see products for POS

	// Discount management permissions
	const canCreateDiscounts = () => isOwner || isManager;
	const canEditDiscounts = () => isOwner || isManager;
	const canDeleteDiscounts = () => isOwner || isManager;
	const canApplyDiscounts = () => true; // All users can apply existing discounts

	// System permissions
	const canAccessAdvancedFeatures = () => isOwner || isManager;
	const canManageAPIKeys = () => isOwner;
	const canViewSystemLogs = () => isOwner || isManager;
	const canPerformSync = () => isOwner || isManager;

	return {
		user,
		role: user?.role,
		isOwner,
		isManager,
		isCashier,

		// Page permissions
		canAccessDashboard,
		canAccessPOS,
		canAccessOrders,
		canAccessPayments,
		canAccessProducts,
		canAccessUsers,
		canAccessDiscounts,
		canAccessSettings,

		// Settings permissions
		canAccessBusinessSettings,
		canAccessTerminalSettings,
		canAccessHardwareSettings,
		canAccessAdvancedSettings,
		canEditBusinessHours,
		canEditStoreInfo,
		canEditFinancialSettings,
		canEditReceiptSettings,
		canEditPaymentProviders,
		canEditPrinterSettings,
		canEditStripeSettings,
		canEditDisplaySettings,
		canEditSyncSettings,
		canEditBehaviorSettings,

		// Operation permissions
		canCreateOrders,
		canCancelOrders,
		canRefundPayments,
		canViewAllOrders,
		canViewOwnOrders,
		canHoldOrders,
		canResumeOrders,
		canClearCart,

		// Management permissions
		canCreateUsers,
		canEditUser,
		canDeleteUser,
		canCreateProducts,
		canEditProducts,
		canDeleteProducts,
		canViewProducts,
		canCreateDiscounts,
		canEditDiscounts,
		canDeleteDiscounts,
		canApplyDiscounts,

		// System permissions
		canAccessAdvancedFeatures,
		canManageAPIKeys,
		canViewSystemLogs,
		canPerformSync,
	};
};
