import { useAuth } from "@/context/AuthContext";
import { useRolePermissions as useSharedRolePermissions } from "@ajeen/ui";

/**
 * Hook that provides role-based permission checks for the POS system
 * Uses the shared useRolePermissions hook from @ajeen/ui
 */
export const useRolePermissions = () => {
	const authContext = useAuth();

	// Use the shared hook with POS-specific configuration
	return useSharedRolePermissions(authContext, {
		// Enable all features for POS system
		enabledFeatures: {
			pos: true,
			inventory: true,
			reports: false, // POS doesn't have reports
			audits: false,  // POS doesn't have audits
			terminal: true,
		}
	});
};
