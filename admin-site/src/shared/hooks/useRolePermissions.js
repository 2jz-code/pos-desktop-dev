import { useAuth } from "@/contexts/AuthContext";

export const useRolePermissions = () => {
	const { user } = useAuth();

	// Since this is an owner-only admin site, all permissions are true
	// Only owners can access this site as verified during login
	return {
		// Navigation permissions
		canAccessDashboard: true,
		canAccessOrders: true,
		canAccessProducts: true,
		canAccessUsers: true,
		canAccessInventory: true,
		canAccessPayments: true,
		canAccessDiscounts: true,
		canAccessReports: true,
		canAccessAudits: true,
		canAccessSettings: true,

		// Action permissions
		canCreateOrders: true,
		canUpdateOrders: true,
		canDeleteOrders: true,
		canCreateProducts: true,
		canUpdateProducts: true,
		canDeleteProducts: true,
		canCreateUsers: true,
		canUpdateUsers: true,
		canDeleteUsers: true,
		canManageInventory: true,
		canViewReports: true,
		canAccessAudit: true,
		canManageSettings: true,
		canProcessPayments: true,
		canManageDiscounts: true,

		// User info
		isOwner: true,
		isManager: true, // Owner has manager permissions too
		isCashier: true, // Owner has cashier permissions too
		role: user?.role || "OWNER",
	};
};
