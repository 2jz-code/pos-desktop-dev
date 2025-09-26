import { useAuth } from "@/contexts/AuthContext";
import { useRolePermissions as useSharedRolePermissions } from "@ajeen/ui";

/**
 * Hook that provides role-based permission checks for the admin dashboard
 * Uses the shared useRolePermissions hook from @ajeen/ui
 */
export const useRolePermissions = () => {
	const authContext = useAuth();

	// Use the shared hook with admin-specific configuration
	return useSharedRolePermissions(authContext, {
		// Enable all features for admin dashboard
		enabledFeatures: {
			pos: true,
			inventory: true,
			reports: true,
			audits: true,
			terminal: true,
		}
	});
};
