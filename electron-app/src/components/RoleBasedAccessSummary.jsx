import React from "react";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	CheckCircle,
	XCircle,
	ShieldCheck,
	Users,
	Package,
	ClipboardList,
	CreditCard,
	Percent,
	Settings,
	Home,
	ShoppingCart,
} from "lucide-react";

/**
 * Component that shows what the current user can access based on their role
 * Useful for debugging and helping users understand their permissions
 */
export const RoleBasedAccessSummary = () => {
	const permissions = useRolePermissions();

	const accessItems = [
		{
			name: "Dashboard",
			icon: Home,
			canAccess: permissions.canAccessDashboard(),
			description: "View business analytics and overview",
		},
		{
			name: "Point of Sale (POS)",
			icon: ShoppingCart,
			canAccess: permissions.canAccessPOS(),
			description: "Process sales and transactions",
		},
		{
			name: "Orders",
			icon: ClipboardList,
			canAccess: permissions.canAccessOrders(),
			description: "View orders and resume held orders",
		},
		{
			name: "Payments",
			icon: CreditCard,
			canAccess: permissions.canAccessPayments(),
			description: "View payment history and process refunds",
		},
		{
			name: "Products",
			icon: Package,
			canAccess: permissions.canAccessProducts(),
			description: "View product catalog (editing restricted by role)",
		},
		{
			name: "Users",
			icon: Users,
			canAccess: permissions.canAccessUsers(),
			description: "Manage staff accounts and permissions",
		},
		{
			name: "Discounts",
			icon: Percent,
			canAccess: permissions.canAccessDiscounts(),
			description: "Create and manage promotional discounts",
		},
		{
			name: "Settings",
			icon: Settings,
			canAccess: permissions.canAccessSettings(),
			description: "Configure system settings (with role-based restrictions)",
		},
	];

	const settingsPermissions = [
		{
			name: "Business Settings",
			canAccess: permissions.canAccessBusinessSettings(),
			description: "Store info, hours, financial settings",
		},
		{
			name: "Terminal Settings",
			canAccess: permissions.canAccessTerminalSettings(),
			description: "Display, sync, and behavior settings",
		},
		{
			name: "Hardware Settings",
			canAccess: permissions.canAccessHardwareSettings(),
			description: "Printers and payment terminals",
		},
		{
			name: "Advanced Settings",
			canAccess: permissions.canAccessAdvancedSettings(),
			description: "API keys and system maintenance",
		},
	];

	const operationPermissions = [
		{
			name: "Create Orders",
			canAccess: permissions.canCreateOrders(),
		},
		{
			name: "Cancel Orders",
			canAccess: permissions.canCancelOrders(),
		},
		{
			name: "Process Refunds",
			canAccess: permissions.canRefundPayments(),
		},
		{
			name: "Hold/Resume Orders",
			canAccess: permissions.canHoldOrders(),
		},
		{
			name: "Clear Cart",
			canAccess: permissions.canClearCart(),
		},
	];

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<ShieldCheck className="h-5 w-5" />
						Your Access Permissions
						<Badge variant="outline">{permissions.role}</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<Alert className="mb-4">
						<AlertDescription>
							This shows what features you can access with your current role:{" "}
							<strong>{permissions.role}</strong>
						</AlertDescription>
					</Alert>
				</CardContent>
			</Card>

			{/* Page Access */}
			<Card>
				<CardHeader>
					<CardTitle>Page Access</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{accessItems.map((item) => (
							<div
								key={item.name}
								className="flex items-start gap-3 p-3 border rounded-lg"
							>
								<item.icon className="h-5 w-5 mt-0.5 text-muted-foreground" />
								<div className="flex-1">
									<div className="flex items-center gap-2 mb-1">
										<span className="font-medium">{item.name}</span>
										{item.canAccess ? (
											<CheckCircle className="h-4 w-4 text-green-600" />
										) : (
											<XCircle className="h-4 w-4 text-red-600" />
										)}
									</div>
									<p className="text-sm text-muted-foreground">
										{item.description}
									</p>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Settings Access */}
			<Card>
				<CardHeader>
					<CardTitle>Settings Access</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{settingsPermissions.map((item) => (
							<div
								key={item.name}
								className="flex items-center justify-between p-3 border rounded-lg"
							>
								<div>
									<span className="font-medium">{item.name}</span>
									<p className="text-sm text-muted-foreground">
										{item.description}
									</p>
								</div>
								{item.canAccess ? (
									<CheckCircle className="h-4 w-4 text-green-600" />
								) : (
									<XCircle className="h-4 w-4 text-red-600" />
								)}
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Operation Permissions */}
			<Card>
				<CardHeader>
					<CardTitle>POS Operations</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-2 md:grid-cols-3 gap-4">
						{operationPermissions.map((item) => (
							<div
								key={item.name}
								className="flex items-center justify-between p-3 border rounded-lg"
							>
								<span className="font-medium text-sm">{item.name}</span>
								{item.canAccess ? (
									<CheckCircle className="h-4 w-4 text-green-600" />
								) : (
									<XCircle className="h-4 w-4 text-red-600" />
								)}
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Role-specific guidance */}
			{permissions.isCashier && (
				<Card>
					<CardHeader>
						<CardTitle className="text-blue-600">
							Cashier Role Guidance
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-2 text-sm">
							<p>
								<strong>What you can do:</strong>
							</p>
							<ul className="list-disc list-inside space-y-1 ml-4">
								<li>Process sales using the POS system</li>
								<li>View dashboard and business analytics</li>
								<li>Access orders page to resume held orders</li>
								<li>View products catalog (read-only)</li>
								<li>Hold and resume orders</li>
								<li>Clear the cart</li>
								<li>Adjust display settings for your terminal</li>
							</ul>
							<p className="mt-4">
								<strong>What you cannot do:</strong>
							</p>
							<ul className="list-disc list-inside space-y-1 ml-4">
								<li>Access payment pages or process refunds</li>
								<li>Edit/add/remove products</li>
								<li>Modify sync or behavior settings</li>
								<li>Access business settings or advanced features</li>
								<li>Manage user accounts or discounts</li>
							</ul>
						</div>
					</CardContent>
				</Card>
			)}

			{permissions.isManager && (
				<Card>
					<CardHeader>
						<CardTitle className="text-green-600">
							Manager Role Guidance
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-2 text-sm">
							<p>
								<strong>Additional manager capabilities:</strong>
							</p>
							<ul className="list-disc list-inside space-y-1 ml-4">
								<li>View all orders and payment history</li>
								<li>Process refunds and cancel orders</li>
								<li>Manage cashier accounts</li>
								<li>Modify products, inventory, and discounts</li>
								<li>Configure most business and terminal settings</li>
							</ul>
							<p className="mt-4">
								<strong>Owner-only restrictions:</strong>
							</p>
							<ul className="list-disc list-inside space-y-1 ml-4">
								<li>Financial settings and payment providers</li>
								<li>API key management</li>
								<li>Creating/modifying owner accounts</li>
							</ul>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
};
