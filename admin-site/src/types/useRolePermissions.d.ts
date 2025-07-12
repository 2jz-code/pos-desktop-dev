export interface RolePermissions {
	// Navigation permissions - all true for owner-only admin site
	canAccessDashboard: boolean;
	canAccessOrders: boolean;
	canAccessProducts: boolean;
	canAccessUsers: boolean;
	canAccessInventory: boolean;
	canAccessPayments: boolean;
	canAccessDiscounts: boolean;
	canAccessReports: boolean;
	canAccessAudits: boolean;
	canAccessSettings: boolean;

	// Action permissions - all true for owner-only admin site
	canCreateOrders: boolean;
	canUpdateOrders: boolean;
	canDeleteOrders: boolean;
	canCreateProducts: boolean;
	canUpdateProducts: boolean;
	canDeleteProducts: boolean;
	canCreateUsers: boolean;
	canUpdateUsers: boolean;
	canDeleteUsers: boolean;
	canManageInventory: boolean;
	canViewReports: boolean;
	canAccessAudit: boolean;
	canManageSettings: boolean;
	canProcessPayments: boolean;
	canManageDiscounts: boolean;

	// User info
	isOwner: boolean;
	isManager: boolean;
	isCashier: boolean;
	role: string;
}

export function useRolePermissions(): RolePermissions;
