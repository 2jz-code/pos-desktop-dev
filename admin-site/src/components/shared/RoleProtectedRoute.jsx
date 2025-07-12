import React from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldX, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Component that protects routes based on user permissions
 * Shows appropriate error messages for unauthorized access
 */
export const RoleProtectedRoute = ({
	children,
	requiredPermission,
	fallbackPath = "/dashboard",
	showAccessDenied = true,
}) => {
	const permissions = useRolePermissions();
	const navigate = useNavigate();

	// Check if user has the required permission
	const hasPermission = requiredPermission
		? requiredPermission(permissions)
		: true;

	if (!hasPermission) {
		if (!showAccessDenied) {
			return (
				<Navigate
					to={fallbackPath}
					replace
				/>
			);
		}

		return (
			<div className="flex items-center justify-center min-h-[60vh] p-6">
				<Card className="w-full max-w-md">
					<CardHeader className="text-center">
						<div className="mx-auto w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
							<ShieldX className="w-6 h-6 text-red-600 dark:text-red-400" />
						</div>
						<CardTitle className="text-xl">Access Restricted</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<Alert variant="destructive">
							<AlertDescription>
								You don't have permission to access this page. Your role:{" "}
								<strong>{permissions.role}</strong>
							</AlertDescription>
						</Alert>

						<div className="text-sm text-muted-foreground space-y-2">
							<p>
								<strong>What you can access:</strong>
							</p>
							<ul className="list-disc list-inside space-y-1">
								<li>Dashboard overview</li>
								{permissions.canAccessOrders() && (
									<li>Orders and order history</li>
								)}
								{permissions.canAccessProducts() && <li>Product management</li>}
								{permissions.canAccessUsers() && <li>User management</li>}
								{permissions.canAccessInventory() && (
									<li>Inventory management</li>
								)}
								{permissions.canAccessReports() && (
									<li>Reports and analytics</li>
								)}
								{permissions.canAccessAudits() && (
									<li>Audit logs and monitoring</li>
								)}
								{permissions.canEditDisplaySettings() && (
									<li>Display settings</li>
								)}
								{permissions.canAccessAdvancedFeatures() && (
									<li>Advanced features and settings</li>
								)}
							</ul>
						</div>

						<div className="flex gap-2">
							<Button
								variant="outline"
								onClick={() => navigate(-1)}
								className="flex-1"
							>
								<ArrowLeft className="w-4 h-4 mr-2" />
								Go Back
							</Button>
							<Button
								onClick={() => navigate("/dashboard")}
								className="flex-1"
							>
								Go to Dashboard
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	return children;
};

/**
 * Higher-order component for protecting components based on permissions
 */
export const withRoleProtection = (
	Component,
	requiredPermission,
	options = {}
) => {
	return (props) => (
		<RoleProtectedRoute
			requiredPermission={requiredPermission}
			{...options}
		>
			<Component {...props} />
		</RoleProtectedRoute>
	);
};
