import React, { useEffect } from "react";
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
	TrendingUp,
	Clock,
	DollarSign,
} from "lucide-react";

// Modern Dashboard Card Component
const ModernDashboardCard = ({
	to,
	title,
	description,
	icon: IconComponent, //eslint-disable-line
	gradient,
	roleRequired = false,
}) => (
	<Link
		to={to}
		className="block group"
	>
		<Card className="h-full transition-all duration-300 hover:shadow-xl hover:scale-105 border-0 bg-gradient-to-br from-white to-gray-50/50 dark:from-gray-900 dark:to-gray-800/50">
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<div className={`p-3 rounded-xl ${gradient} shadow-lg`}>
						<IconComponent className="h-6 w-6 text-white" />
					</div>
					{roleRequired && (
						<Badge
							variant="secondary"
							className="text-xs"
						>
							Manager+
						</Badge>
					)}
				</div>
			</CardHeader>
			<CardContent className="pt-0">
				<CardTitle className="text-lg mb-2 group-hover:text-primary transition-colors">
					{title}
				</CardTitle>
				<p className="text-sm text-muted-foreground leading-relaxed">
					{description}
				</p>
			</CardContent>
		</Card>
	</Link>
);

export function DashboardPage() {
	// Get user and loading state from AuthContext
	const { user: authUser, loading: authLoading } = useAuth();
	const permissions = useRolePermissions();

	// Get the action to set currentUser in posStore
	const setCurrentUserInPosStore = usePosStore((state) => state.setCurrentUser);

	// Synchronize AuthContext user with posStore's currentUser
	useEffect(() => {
		// Only attempt to set user once AuthContext has finished its initial loading
		if (!authLoading) {
			setCurrentUserInPosStore(authUser);
		}
	}, [authUser, authLoading, setCurrentUserInPosStore]);

	// Show a loader while authentication status is being checked
	if (authLoading) {
		return <FullScreenLoader />;
	}

	// Redirect or show a message if the user is not authenticated
	if (!authUser) {
		return (
			<p className="p-4 text-center text-red-500">
				Please log in to view the dashboard.
			</p>
		);
	}

	// Define all dashboard cards with role-based visibility
	const dashboardCards = [
		{
			to: "/pos",
			title: "Point of Sale",
			description: "Process sales, manage cart, and handle transactions",
			icon: ShoppingCart,
			gradient: "bg-gradient-to-br from-blue-500 to-blue-600",
			show: true, // Always visible
		},
		{
			to: "/orders",
			title: "Orders",
			description: "View order history and resume held orders",
			icon: ClipboardList,
			gradient: "bg-gradient-to-br from-green-500 to-green-600",
			show: permissions.canAccessOrders(),
		},
		{
			to: "/products",
			title: "Products",
			description: "Browse product catalog and inventory",
			icon: Package,
			gradient: "bg-gradient-to-br from-purple-500 to-purple-600",
			show: permissions.canAccessProducts(),
		},
		{
			to: "/inventory",
			title: "Inventory",
			description:
				"Manage stock levels, track inventory, and handle adjustments",
			icon: Package,
			gradient: "bg-gradient-to-br from-indigo-500 to-indigo-600",
			show: permissions.canAccessProducts(),
			roleRequired: true,
		},
		{
			to: "/payments",
			title: "Payments",
			description: "Payment history, refunds, and financial records",
			icon: CreditCard,
			gradient: "bg-gradient-to-br from-emerald-500 to-emerald-600",
			show: permissions.canAccessPayments(),
			roleRequired: true,
		},
		{
			to: "/users",
			title: "Users",
			description: "Manage staff accounts, roles, and permissions",
			icon: Users,
			gradient: "bg-gradient-to-br from-orange-500 to-orange-600",
			show: permissions.canAccessUsers(),
			roleRequired: true,
		},
		{
			to: "/discounts",
			title: "Discounts",
			description: "Create and manage promotional offers",
			icon: Percent,
			gradient: "bg-gradient-to-br from-pink-500 to-pink-600",
			show: permissions.canAccessDiscounts(),
			roleRequired: true,
		},
		{
			to: "/settings",
			title: "Settings",
			description: "Configure system preferences and business settings",
			icon: Settings,
			gradient: "bg-gradient-to-br from-gray-500 to-gray-600",
			show: permissions.canAccessSettings(),
		},
	];

	const visibleCards = dashboardCards.filter((card) => card.show);

	return (
		<div className="h-screen flex flex-col bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
			{/* Header Section - Fixed */}
			<div className="flex-shrink-0 bg-white/70 dark:bg-gray-900/70 backdrop-blur-sm border-b border-gray-200/50 dark:border-gray-700/50">
				<div className="p-6 sm:p-8">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
								Dashboard
							</h1>
							<p className="text-muted-foreground mt-2 text-lg">
								Welcome back,{" "}
								<span className="font-semibold text-primary">
									{authUser?.username}
								</span>
							</p>
						</div>
						<div className="flex items-center gap-3">
							<Badge
								variant="outline"
								className="hidden sm:flex items-center gap-2 px-3 py-1"
							>
								<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
								{permissions.role}
							</Badge>
							<div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg">
								<TrendingUp className="h-6 w-6 text-white" />
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Main Content - Scrollable */}
			<div className="flex-1 overflow-y-auto">
				<div className="p-6 sm:p-8">
					{/* Quick Stats Row */}
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
						<Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-blue-200 dark:border-blue-800">
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<div className="p-2 bg-blue-500 rounded-lg">
										<Clock className="h-4 w-4 text-white" />
									</div>
									<div>
										<p className="text-sm text-muted-foreground">
											System Status
										</p>
										<p className="font-semibold text-blue-700 dark:text-blue-300">
											Online
										</p>
									</div>
								</div>
							</CardContent>
						</Card>
						<Card className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border-green-200 dark:border-green-800">
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<div className="p-2 bg-green-500 rounded-lg">
										<DollarSign className="h-4 w-4 text-white" />
									</div>
									<div>
										<p className="text-sm text-muted-foreground">
											Today's Sales
										</p>
										<p className="font-semibold text-green-700 dark:text-green-300">
											Active
										</p>
									</div>
								</div>
							</CardContent>
						</Card>
						<Card className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950 border-purple-200 dark:border-purple-800">
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<div className="p-2 bg-purple-500 rounded-lg">
										<Home className="h-4 w-4 text-white" />
									</div>
									<div>
										<p className="text-sm text-muted-foreground">
											Access Level
										</p>
										<p className="font-semibold text-purple-700 dark:text-purple-300">
											{permissions.role}
										</p>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Navigation Cards */}
					<div className="mb-6">
						<h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
							Quick Access
						</h2>
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
							{visibleCards.map((card) => (
								<ModernDashboardCard
									key={card.to}
									to={card.to}
									title={card.title}
									description={card.description}
									icon={card.icon}
									gradient={card.gradient}
									roleRequired={card.roleRequired}
								/>
							))}
						</div>
					</div>

					{/* Role-based Information */}
					{permissions.isCashier && (
						<Card className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950 dark:to-cyan-950 border-blue-200 dark:border-blue-800">
							<CardHeader>
								<CardTitle className="text-blue-700 dark:text-blue-300">
									Cashier Quick Guide
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
									<div>
										<h4 className="font-semibold mb-2 text-blue-600 dark:text-blue-400">
											Your Main Tasks:
										</h4>
										<ul className="space-y-1 text-muted-foreground">
											<li>• Process sales at POS</li>
											<li>• Resume held orders</li>
											<li>• View product information</li>
											<li>• Adjust display settings</li>
										</ul>
									</div>
									<div>
										<h4 className="font-semibold mb-2 text-blue-600 dark:text-blue-400">
											Need Help?
										</h4>
										<p className="text-muted-foreground">
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
		</div>
	);
}
