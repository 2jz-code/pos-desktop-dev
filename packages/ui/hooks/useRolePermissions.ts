import { useMemo } from 'react';

/**
 * User role types supported by the role permissions system
 */
export type UserRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'CASHIER' | 'CUSTOMER';

/**
 * User object structure expected by the hook
 */
export interface User {
  id: string;
  role: UserRole;
  [key: string]: any;
}

/**
 * Auth context structure expected by the hook
 */
export interface AuthContext {
  user: User | null;
  isOwner: boolean;
  isManager: boolean;
  isCashier: boolean;
}

/**
 * Configuration options for the role permissions hook
 */
export interface RolePermissionsConfig {
  /**
   * Whether this is an owner-only application (like admin dashboard)
   * If true, all permissions will return true since only owners can access
   */
  ownerOnlyApp?: boolean;

  /**
   * Enable specific permission groups
   */
  enabledFeatures?: {
    pos?: boolean;
    inventory?: boolean;
    reports?: boolean;
    audits?: boolean;
    terminal?: boolean;
  };
}

/**
 * Return type for the useRolePermissions hook
 */
export interface RolePermissions {
  // User info
  user: User | null;
  role: UserRole | undefined;
  isOwner: boolean;
  isManager: boolean;
  isCashier: boolean;

  // Page permissions
  canAccessDashboard(): boolean;
  canAccessPOS(): boolean;
  canAccessOrders(): boolean;
  canAccessPayments(): boolean;
  canAccessProducts(): boolean;
  canAccessInventory(): boolean;
  canAccessUsers(): boolean;
  canAccessDiscounts(): boolean;
  canAccessSettings(): boolean;
  canAccessReports(): boolean;
  canAccessAudits(): boolean;

  // Settings permissions
  canAccessBusinessSettings(): boolean;
  canAccessTerminalSettings(): boolean;
  canAccessHardwareSettings(): boolean;
  canAccessAdvancedSettings(): boolean;
  canEditBusinessHours(): boolean;
  canEditStoreInfo(): boolean;
  canEditFinancialSettings(): boolean;
  canEditReceiptSettings(): boolean;
  canEditPaymentProviders(): boolean;
  canEditPrinterSettings(): boolean;
  canEditStripeSettings(): boolean;
  canEditDisplaySettings(): boolean;
  canEditSyncSettings(): boolean;
  canEditBehaviorSettings(): boolean;

  // Operation permissions
  canCreateOrders(): boolean;
  canCancelOrders(): boolean;
  canRefundPayments(): boolean;
  canViewAllOrders(): boolean;
  canViewOwnOrders(): boolean;
  canHoldOrders(): boolean;
  canResumeOrders(): boolean;
  canClearCart(): boolean;

  // Management permissions
  canCreateUsers(): boolean;
  canEditUser(targetUser?: User | null): boolean;
  canDeleteUser(targetUser?: User | null): boolean;
  canCreateProducts(): boolean;
  canEditProducts(): boolean;
  canDeleteProducts(): boolean;
  canViewProducts(): boolean;
  canCreateDiscounts(): boolean;
  canEditDiscounts(): boolean;
  canDeleteDiscounts(): boolean;
  canApplyDiscounts(): boolean;

  // Inventory permissions
  canViewInventory(): boolean;
  canEditInventory(): boolean;
  canAdjustStock(): boolean;
  canTransferStock(): boolean;

  // Reporting permissions
  canViewSalesReports(): boolean;
  canViewInventoryReports(): boolean;
  canViewUserReports(): boolean;
  canViewPaymentReports(): boolean;
  canExportReports(): boolean;

  // Audit permissions
  canViewAuditLogs(): boolean;
  canViewSystemLogs(): boolean;
  canViewUserActivity(): boolean;

  // System permissions
  canAccessAdvancedFeatures(): boolean;
  canManageAPIKeys(): boolean;
  canPerformSync(): boolean;
}

/**
 * Hook that provides comprehensive role-based permission checks
 *
 * Permission Hierarchy:
 * - OWNER/ADMIN: Full access to everything
 * - MANAGER: Can manage users (cashiers), view all data, most settings
 * - CASHIER: Can use POS, view own orders, minimal settings (display only)
 * - CUSTOMER: Read-only access to own data (used in customer-facing apps)
 *
 * @param authContext - The authentication context containing user and role flags
 * @param config - Configuration options for the permissions
 * @returns Object containing all permission checks as functions
 */
export function useRolePermissions(
  authContext: AuthContext,
  config: RolePermissionsConfig = {}
): RolePermissions {
  const { user, isOwner, isManager, isCashier } = authContext;
  const { ownerOnlyApp = false, enabledFeatures = {} } = config;

  return useMemo(() => {
    // Helper function: If owner-only app, all permissions are true
    const ownerOnlyPermission = () => ownerOnlyApp;

    // Helper function: Owner and Admin have full access
    const isOwnerOrAdmin = () => isOwner || user?.role === 'ADMIN';

    // Helper function: Owner, Admin, or Manager access
    const isOwnerManagerOrAdmin = () => isOwnerOrAdmin() || isManager;

    return {
      // User info
      user,
      role: user?.role,
      isOwner,
      isManager,
      isCashier,

      // Page permissions
      canAccessDashboard: () => ownerOnlyPermission() || true, // All authenticated users
      canAccessPOS: () => ownerOnlyPermission() || (enabledFeatures.pos !== false && true),
      canAccessOrders: () => ownerOnlyPermission() || true, // All users (cashiers need to resume held orders)
      canAccessPayments: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canAccessProducts: () => ownerOnlyPermission() || true, // All users (cashiers need to view products)
      canAccessInventory: () => ownerOnlyPermission() || (enabledFeatures.inventory !== false && isOwnerManagerOrAdmin()),
      canAccessUsers: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canAccessDiscounts: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canAccessSettings: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canAccessReports: () => ownerOnlyPermission() || (enabledFeatures.reports !== false && isOwnerManagerOrAdmin()),
      canAccessAudits: () => ownerOnlyPermission() || (enabledFeatures.audits !== false && isOwnerManagerOrAdmin()),

      // Settings permissions
      canAccessBusinessSettings: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canAccessTerminalSettings: () => ownerOnlyPermission() || (enabledFeatures.terminal !== false && true), // All users (limited for cashiers)
      canAccessHardwareSettings: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canAccessAdvancedSettings: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canEditBusinessHours: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canEditStoreInfo: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canEditFinancialSettings: () => ownerOnlyPermission() || isOwnerOrAdmin(),
      canEditReceiptSettings: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canEditPaymentProviders: () => ownerOnlyPermission() || isOwnerOrAdmin(),
      canEditPrinterSettings: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canEditStripeSettings: () => ownerOnlyPermission() || isOwnerOrAdmin(),
      canEditDisplaySettings: () => ownerOnlyPermission() || true, // All users
      canEditSyncSettings: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canEditBehaviorSettings: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),

      // Operation permissions
      canCreateOrders: () => ownerOnlyPermission() || true, // All authenticated users
      canCancelOrders: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canRefundPayments: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canViewAllOrders: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canViewOwnOrders: () => ownerOnlyPermission() || true, // All users can view their own orders
      canHoldOrders: () => ownerOnlyPermission() || true, // All users
      canResumeOrders: () => ownerOnlyPermission() || true, // All users
      canClearCart: () => ownerOnlyPermission() || true, // All users

      // Management permissions
      canCreateUsers: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canEditUser: (targetUser?: User | null) => {
        if (ownerOnlyPermission()) return true;
        if (!user || !targetUser) return false;
        if (user.id === targetUser.id) return true; // Can edit own profile
        if (isCashier) return false;
        if (isManager) return targetUser.role === 'CASHIER';
        if (isOwnerOrAdmin()) return true;
        return false;
      },
      canDeleteUser: (targetUser?: User | null) => {
        if (ownerOnlyPermission()) return true;
        if (!user || !targetUser || user.id === targetUser.id) return false;
        if (isCashier) return false;
        if (isManager) return targetUser.role === 'CASHIER';
        if (isOwnerOrAdmin()) return true;
        return false;
      },
      canCreateProducts: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canEditProducts: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canDeleteProducts: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canViewProducts: () => ownerOnlyPermission() || true, // All users need to see products
      canCreateDiscounts: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canEditDiscounts: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canDeleteDiscounts: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canApplyDiscounts: () => ownerOnlyPermission() || true, // All users can apply existing discounts

      // Inventory permissions
      canViewInventory: () => ownerOnlyPermission() || (enabledFeatures.inventory !== false && isOwnerManagerOrAdmin()),
      canEditInventory: () => ownerOnlyPermission() || (enabledFeatures.inventory !== false && isOwnerManagerOrAdmin()),
      canAdjustStock: () => ownerOnlyPermission() || (enabledFeatures.inventory !== false && isOwnerManagerOrAdmin()),
      canTransferStock: () => ownerOnlyPermission() || (enabledFeatures.inventory !== false && isOwnerManagerOrAdmin()),

      // Reporting permissions
      canViewSalesReports: () => ownerOnlyPermission() || (enabledFeatures.reports !== false && isOwnerManagerOrAdmin()),
      canViewInventoryReports: () => ownerOnlyPermission() || (enabledFeatures.reports !== false && isOwnerManagerOrAdmin()),
      canViewUserReports: () => ownerOnlyPermission() || (enabledFeatures.reports !== false && isOwnerManagerOrAdmin()),
      canViewPaymentReports: () => ownerOnlyPermission() || (enabledFeatures.reports !== false && isOwnerManagerOrAdmin()),
      canExportReports: () => ownerOnlyPermission() || (enabledFeatures.reports !== false && isOwnerManagerOrAdmin()),

      // Audit permissions
      canViewAuditLogs: () => ownerOnlyPermission() || (enabledFeatures.audits !== false && isOwnerManagerOrAdmin()),
      canViewSystemLogs: () => ownerOnlyPermission() || (enabledFeatures.audits !== false && isOwnerOrAdmin()),
      canViewUserActivity: () => ownerOnlyPermission() || (enabledFeatures.audits !== false && isOwnerManagerOrAdmin()),

      // System permissions
      canAccessAdvancedFeatures: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
      canManageAPIKeys: () => ownerOnlyPermission() || isOwnerOrAdmin(),
      canPerformSync: () => ownerOnlyPermission() || isOwnerManagerOrAdmin(),
    };
  }, [user, isOwner, isManager, isCashier, ownerOnlyApp, enabledFeatures]);
}