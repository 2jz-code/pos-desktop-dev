import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import {
	Home,
	ClipboardList,
	CreditCard,
	Users,
	Package,
	Percent,
	Settings,
	DollarSign,
	Activity,
	FileText,
	Shield,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface DashboardCardProps {
	to: string;
	title: string;
	description: string;
	icon: LucideIcon;
	roleRequired?: boolean;
}

interface StatsCardProps {
	icon: LucideIcon;
	label: string;
	value: string;
	status: "online" | "active" | "default";
}

interface DashboardCard {
	to: string;
	title: string;
	description: string;
	icon: LucideIcon;
	show: boolean;
	roleRequired?: boolean;
}

// Professional Dashboard Card Component
const ProfessionalDashboardCard: React.FC<DashboardCardProps> = ({
	to,
	title,
	description,
	icon: IconComponent,
}) => (
	<Link
		to={to}
		className="block group"
	>
		<Card className="h-full transition-all duration-200 hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-600 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
			<CardHeader className="pb-4">
				<div className="flex items-start justify-between">
					<div className="flex items-center gap-3">
						<div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-lg group-hover:bg-slate-200 dark:group-hover:bg-slate-700 transition-colors">
							<IconComponent className="h-5 w-5 text-slate-700 dark:text-slate-300" />
						</div>
						<div>
							<CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
								{title}
							</CardTitle>
						</div>
					</div>
				</div>
			</CardHeader>
			<CardContent className="pt-0">
				<p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
					{description}
				</p>
			</CardContent>
		</Card>
	</Link>
);

// Professional Stats Card Component
const StatsCard: React.FC<StatsCardProps> = ({
	icon: IconComponent,
	label,
	value,
	status,
}) => (
	<Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
		<CardContent className="p-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
						<IconComponent className="h-4 w-4 text-slate-700 dark:text-slate-300" />
					</div>
					<div>
						<p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
							{label}
						</p>
						<p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
							{value}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-1">
					<div
						className={`w-2 h-2 rounded-full ${
							status === "online"
								? "bg-emerald-500"
								: status === "active"
								? "bg-blue-500"
								: "bg-slate-400"
						}`}
					></div>
				</div>
			</div>
		</CardContent>
	</Card>
);

export function DashboardPage() {
	const { user: authUser, loading: authLoading } = useAuth();
	const permissions = useRolePermissions();

	if (authLoading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
			</div>
		);
	}

	if (!authUser) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<Card className="p-6 max-w-md mx-auto">
					<CardContent className="text-center">
						<p className="text-slate-600 dark:text-slate-400">
							Please log in to view the dashboard.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	const dashboardCards: DashboardCard[] = [
		{
			to: "/orders",
			title: "Orders",
			description: "View order history and manage transactions",
			icon: ClipboardList,
			show: permissions.canAccessOrders(),
		},
		{
			to: "/products",
			title: "Products",
			description: "Browse product catalog and manage inventory",
			icon: Package,
			show: permissions.canAccessProducts(),
		},
		{
			to: "/inventory",
			title: "Inventory",
			description:
				"Manage stock levels, track inventory, and handle adjustments",
			icon: Package,
			show: permissions.canAccessInventory(),
			roleRequired: true,
		},
		{
			to: "/payments",
			title: "Payments",
			description: "Payment history, refunds, and financial records",
			icon: CreditCard,
			show: permissions.canAccessPayments(),
			roleRequired: true,
		},
		{
			to: "/users",
			title: "Users",
			description: "Manage staff accounts, roles, and permissions",
			icon: Users,
			show: permissions.canAccessUsers(),
			roleRequired: true,
		},
		{
			to: "/discounts",
			title: "Discounts",
			description: "Create and manage promotional offers",
			icon: Percent,
			show: permissions.canAccessDiscounts(),
			roleRequired: true,
		},
		{
			to: "/reports",
			title: "Reports",
			description: "Generate business reports and analytics",
			icon: FileText,
			show: permissions.canAccessReports(),
			roleRequired: true,
		},
		{
			to: "/audit",
			title: "Audit",
			description: "Security logs and system audit trails",
			icon: Shield,
			show: permissions.canAccessAudits(),
			roleRequired: true,
		},
		{
			to: "/settings",
			title: "Settings",
			description: "Configure system preferences and business settings",
			icon: Settings,
			show: permissions.canAccessSettings(),
		},
	];

	const visibleCards = dashboardCards.filter((card) => card.show);

	return (
		<div className="p-6">
			{/* Header Section */}
			<div className="mb-8">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
							Admin Dashboard
						</h1>
						<p className="text-slate-600 dark:text-slate-400 mt-1">
							Welcome back,{" "}
							<span className="font-medium text-slate-900 dark:text-slate-100">
								{authUser?.username || authUser?.email}
							</span>
						</p>
					</div>
					<div className="flex items-center gap-4">
						<Badge
							variant="outline"
							className="hidden sm:flex items-center gap-2 px-3 py-1.5 border-slate-200 dark:border-slate-700"
						>
							<div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
							<span className="text-xs font-medium">{authUser?.role}</span>
						</Badge>
					</div>
				</div>
			</div>

			{/* Main Content */}
			<div>
				{/* Quick Stats */}
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
					<StatsCard
						icon={Activity}
						label="System Status"
						value="Online"
						status="online"
					/>
					<StatsCard
						icon={DollarSign}
						label="Today's Sales"
						value="Active"
						status="active"
					/>
					<StatsCard
						icon={Home}
						label="Access Level"
						value={authUser?.role || "User"}
						status="default"
					/>
				</div>

				{/* Navigation Cards */}
				<div className="mb-8">
					<div className="flex items-center justify-between mb-6">
						<h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
							Quick Access
						</h2>
					</div>
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
						{visibleCards.map((card) => (
							<ProfessionalDashboardCard
								key={card.to}
								to={card.to}
								title={card.title}
								description={card.description}
								icon={card.icon}
								roleRequired={card.roleRequired}
							/>
						))}
					</div>
				</div>

				{/* Role-based Information */}
				{permissions.isCashier && (
					<Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
						<CardHeader className="pb-4">
							<CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
								Cashier Quick Guide
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
								<div>
									<h4 className="font-medium text-slate-900 dark:text-slate-100 mb-3">
										Your Main Tasks:
									</h4>
									<ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
										<li className="flex items-center gap-2">
											<div className="w-1.5 h-1.5 bg-slate-400 rounded-full"></div>
											View orders and transactions
										</li>
										<li className="flex items-center gap-2">
											<div className="w-1.5 h-1.5 bg-slate-400 rounded-full"></div>
											Browse product catalog
										</li>
										<li className="flex items-center gap-2">
											<div className="w-1.5 h-1.5 bg-slate-400 rounded-full"></div>
											View basic reports
										</li>
										<li className="flex items-center gap-2">
											<div className="w-1.5 h-1.5 bg-slate-400 rounded-full"></div>
											Adjust display settings
										</li>
									</ul>
								</div>
								<div>
									<h4 className="font-medium text-slate-900 dark:text-slate-100 mb-3">
										Need Help?
									</h4>
									<p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
										Contact your manager for advanced features like user
										management, inventory adjustments, or business settings.
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
				)}
			</div>
		</div>
	);
}
