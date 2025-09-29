import { useAuth } from "@/contexts/AuthContext";
import { useRolePermissions as useSharedRolePermissions } from "@ajeen/ui";

/**
 * Hook that provides role-based permission checks for the admin site (owner-only)
 * Uses the shared useRolePermissions hook from @ajeen/ui with owner-only configuration
 */
export const useRolePermissions = () => {
	const authContext = useAuth();

	// Use the shared hook with owner-only configuration
	return useSharedRolePermissions(authContext, {
		ownerOnlyApp: true, // This is an owner-only admin site
		enabledFeatures: {
			pos: true,
			inventory: true,
			reports: true,
			audits: true,
			terminal: true,
		}
	});
};
