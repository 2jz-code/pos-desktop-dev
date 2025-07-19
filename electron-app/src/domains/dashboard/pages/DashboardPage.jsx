"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { usePosStore } from "@/domains/pos/store/posStore";
import { useRolePermissions } from "@/shared/hooks/useRolePermissions";
import FullScreenLoader from "@/shared/components/common/FullScreenLoader";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Link } from "react-router-dom";
import {
	Home,
	ShoppingCart,
	ClipboardList,
	CreditCard,
	Users,
	Package,
	Percent,
	Settings,
	DollarSign,
	Activity,
	ArrowRight,
} from "lucide-react";

// Professional Dashboard Card Component
const ProfessionalDashboardCard = ({
	to,
	title,
	description,
	icon: IconComponent, // eslint-disable-line
	roleRequired = false,
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
					<div className="flex items-center gap-2">
						{roleRequired && (
							<Badge
								variant="secondary"
								className="text-xs px-2 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
							>
								Manager+
							</Badge>
						)}
						<ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
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
const StatsCard = (
	{ icon: IconComponent, label, value, status } // eslint-disable-line
) => (
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
	const setCurrentUserInPosStore = usePosStore((state) => state.setCurrentUser);

	useEffect(() => {
		if (!authLoading) {
			setCurrentUserInPosStore(authUser);
		}
	}, [authUser, authLoading, setCurrentUserInPosStore]);

	if (authLoading) {
		return <FullScreenLoader />;
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

	const dashboardCards = [
		{
			to: "/pos",
			title: "Point of Sale",
			description: "Process sales, manage cart, and handle transactions",
			icon: ShoppingCart,
			show: true,
		},
		{
			to: "/orders",
			title: "Orders",
			description: "View order history and resume held orders",
			icon: ClipboardList,
			show: permissions.canAccessOrders(),
		},
		{
			to: "/products",
			title: "Products",
			description: "Browse product catalog and inventory",
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
			to: "/settings",
			title: "Settings",
			description: "Configure system preferences and business settings",
			icon: Settings,
			show: permissions.canAccessSettings(),
		},
	];

	const visibleCards = dashboardCards.filter((card) => card.show);

	return (
		<div className="min-h-screen bg-slate-50 dark:bg-slate-900">
			{/* Header Section */}
			<div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
				<div className="px-6 py-8">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
								Dashboard
							</h1>
							<p className="text-slate-600 dark:text-slate-400 mt-1">
								Welcome back,{" "}
								<span className="font-medium text-slate-900 dark:text-slate-100">
									{authUser?.username}
								</span>
							</p>
						</div>
						<div className="flex items-center gap-4">
							<Badge
								variant="outline"
								className="hidden sm:flex items-center gap-2 px-3 py-1.5 border-slate-200 dark:border-slate-700"
							>
								<div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
								<span className="text-xs font-medium">{permissions.role}</span>
							</Badge>
						</div>
					</div>
				</div>
			</div>

			{/* Main Content */}
			<div className="px-6 py-6">
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
						value={permissions.role}
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
											Process sales at POS
										</li>
										<li className="flex items-center gap-2">
											<div className="w-1.5 h-1.5 bg-slate-400 rounded-full"></div>
											Resume held orders
										</li>
										<li className="flex items-center gap-2">
											<div className="w-1.5 h-1.5 bg-slate-400 rounded-full"></div>
											View product information
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
										Contact your manager for advanced features like refunds,
										user management, or business settings.
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
