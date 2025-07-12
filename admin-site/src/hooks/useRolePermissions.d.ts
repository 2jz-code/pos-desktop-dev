interface RolePermissions {
	role: string;
	isCashier: boolean;
	isManager: boolean;
	isOwner: boolean;
	canAccessOrders: () => boolean;
	canAccessProducts: () => boolean;
	canAccessInventory: () => boolean;
	canAccessPayments: () => boolean;
	canAccessUsers: () => boolean;
	canAccessDiscounts: () => boolean;
	canAccessReports: () => boolean;
	canAccessAudits: () => boolean;
	canAccessSettings: () => boolean;
}

declare const useRolePermissions: () => RolePermissions;

export { useRolePermissions };
export type { RolePermissions };
