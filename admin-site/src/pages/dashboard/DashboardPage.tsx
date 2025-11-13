import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation as useStoreLocation } from "@/contexts/LocationContext";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import {
	ClipboardList,
	CreditCard,
	Users,
	Package,
	Percent,
	Settings,
	FileText,
	Shield,
	ArrowRight,
	Zap,
	Activity,
	DollarSign,
	ShoppingCart,
	TrendingUp,
	AlertTriangle,
	Clock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import dashboardService from "@/services/api/dashboardService";
import type { DashboardMetrics, ActivityItem } from "@/services/api/dashboardService";

interface QuickAccessCardProps {
	to: string;
	title: string;
	description: string;
	icon: LucideIcon;
}

const QuickAccessCard: React.FC<QuickAccessCardProps> = ({
	to,
	title,
	description,
	icon: IconComponent,
}) => (
	<Link
		className="group block transition-all duration-200 focus-visible:outline-none"
		to={to}
	>
		<Card className="h-full border border-border/40 bg-card/95 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 group-focus-visible:ring-2 group-focus-visible:ring-ring/60 group-focus-visible:ring-offset-2">
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between gap-3">
					<div className="flex items-start gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-all duration-200 group-hover:bg-primary/15 group-hover:scale-105">
							<IconComponent className="h-5 w-5" />
						</div>
						<CardTitle className="text-base font-semibold text-foreground group-hover:text-primary transition-colors duration-200">
							{title}
						</CardTitle>
					</div>
					<ArrowRight className="h-5 w-5 text-muted-foreground/40 transition-all duration-200 group-hover:translate-x-1 group-hover:text-primary" />
				</div>
			</CardHeader>
			<CardContent className="pt-0">
				<p className="text-sm leading-relaxed text-muted-foreground">
					{description}
				</p>
			</CardContent>
		</Card>
	</Link>
);

interface MetricCardProps {
	icon: LucideIcon;
	label: string;
	value: string;
	subtitle?: string;
	trend?: "up" | "down" | "neutral";
	trendValue?: string;
	comparison?: string;
	linkTo?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({
	icon: IconComponent,
	label,
	value,
	subtitle,
	trend,
	trendValue,
	comparison,
	linkTo,
}) => {
	const cardContent = (
		<Card className={`h-[180px] border border-border/40 bg-card/95 shadow-md transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 ${linkTo ? 'cursor-pointer hover:-translate-y-0.5' : ''}`}>
			<CardContent className="p-6 pb-8 h-full flex flex-col justify-between">
				<div className="flex items-start justify-between gap-3">
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2 mb-1">
							<IconComponent className="h-4 w-4 text-muted-foreground flex-shrink-0" />
							<p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
								{label}
							</p>
						</div>
						<p className={`font-bold text-foreground mt-2 ${label === "Top Product" ? "text-lg leading-tight line-clamp-2" : "text-3xl"}`}>{value}</p>
						{subtitle && (
							<p className="text-xs text-muted-foreground mt-1 line-clamp-1">{subtitle}</p>
						)}
						{comparison && (
							<p className="text-xs text-muted-foreground/80 mt-1 line-clamp-1">
								{comparison}
							</p>
						)}
					</div>
					{trend && trendValue && (
						<Badge
							variant="outline"
							className={`flex items-center gap-1 px-2 py-1 flex-shrink-0 ${
								trend === "up"
									? "border-success/40 bg-success/10 text-success"
									: trend === "down"
									? "border-destructive/40 bg-destructive/10 text-destructive"
									: "border-muted/40 bg-muted/10 text-muted-foreground"
							}`}
						>
							<TrendingUp
								className={`h-3 w-3 ${trend === "down" ? "rotate-180" : ""}`}
							/>
							{trendValue}
						</Badge>
					)}
				</div>
			</CardContent>
		</Card>
	);

	if (linkTo) {
		return (
			<Link to={linkTo} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg">
				{cardContent}
			</Link>
		);
	}

	return cardContent;
};

const getIconForType = (type: string): LucideIcon => {
	switch (type) {
		case "order":
			return ShoppingCart;
		case "product":
			return Package;
		case "inventory":
			return AlertTriangle;
		case "user":
			return Users;
		default:
			return Activity;
	}
};

interface RecentActivityFeedProps {
	activities: ActivityItem[];
	loading: boolean;
}

const RecentActivityFeed: React.FC<RecentActivityFeedProps> = ({
	activities,
	loading,
}) => {
	if (loading) {
		return (
			<Card className="border border-border/40 bg-card/95 shadow-md">
				<CardHeader className="pb-3">
					<div className="flex items-center gap-2">
						<Clock className="h-5 w-5 text-primary" />
						<CardTitle className="text-lg font-semibold text-foreground">
							Recent Activity
						</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="pt-0">
					<div className="flex items-center justify-center py-8">
						<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
					</div>
				</CardContent>
			</Card>
		);
	}

	if (activities.length === 0) {
		return (
			<Card className="border border-border/40 bg-card/95 shadow-md">
				<CardHeader className="pb-3">
					<div className="flex items-center gap-2">
						<Clock className="h-5 w-5 text-primary" />
						<CardTitle className="text-lg font-semibold text-foreground">
							Recent Activity
						</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="pt-0">
					<p className="py-8 text-center text-sm text-muted-foreground">
						No recent activity
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="border border-border/40 bg-card/95 shadow-md">
			<CardHeader className="pb-3">
				<div className="flex items-center gap-2">
					<Clock className="h-5 w-5 text-primary" />
					<CardTitle className="text-lg font-semibold text-foreground">
						Recent Activity
					</CardTitle>
				</div>
			</CardHeader>
			<CardContent className="pt-0">
				<div className="space-y-3 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border/20">
					{activities.map((activity) => {
						const IconComponent = getIconForType(activity.type);
						const activityContent = (
							<div className="flex items-start gap-3 rounded-lg p-3 transition-colors duration-150 hover:bg-muted/30">
								<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
									<IconComponent className="h-4 w-4" />
								</div>
								<div className="flex-1 min-w-0">
									<p className="text-sm text-foreground">{activity.message}</p>
									<p className="text-xs text-muted-foreground mt-0.5">
										{activity.timestamp}
									</p>
								</div>
							</div>
						);

						if (activity.linkTo) {
							return (
								<Link
									key={activity.id}
									to={activity.linkTo}
									className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
								>
									{activityContent}
								</Link>
							);
						}

						return <div key={activity.id}>{activityContent}</div>;
					})}
				</div>
			</CardContent>
		</Card>
	);
};

export function DashboardPage() {
	const { user: authUser, tenant, loading: authLoading } = useAuth();
	const locationContext = useStoreLocation();
	const { selectedLocationId, locations } = locationContext;
	const permissions = useRolePermissions();
	const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
	const [activities, setActivities] = useState<ActivityItem[]>([]);
	const [metricsLoading, setMetricsLoading] = useState(true);
	const [activitiesLoading, setActivitiesLoading] = useState(true);

	// Debug: log on every render
	console.log("🔍 DashboardPage RENDER - selectedLocationId:", selectedLocationId, "context:", locationContext);

	// Get tenant slug for routing
	const tenantSlug = tenant?.slug || '';

	// Mount effect
	useEffect(() => {
		console.log("🎯 DashboardPage MOUNTED");
		return () => console.log("💀 DashboardPage UNMOUNTED");
	}, []);

	// Separate useEffect to track location changes
	useEffect(() => {
		console.log("⚡ Location changed in DashboardPage:", selectedLocationId);
	}, [selectedLocationId]);

	useEffect(() => {
		if (!authLoading && authUser) {
			console.log("📍 Dashboard refetching for location:", selectedLocationId);

			// Reset states to show fresh data is being fetched
			setMetricsLoading(true);
			setActivitiesLoading(true);
			setMetrics(null); // Clear old metrics
			setActivities([]); // Clear old activities

			// Fetch dashboard metrics filtered by selected location
			dashboardService
				.getDashboardMetrics(selectedLocationId ?? undefined)
				.then(setMetrics)
				.catch((err) => console.error("Error fetching metrics:", err))
				.finally(() => setMetricsLoading(false));

			// Fetch recent activity
			dashboardService
				.getRecentActivity(tenantSlug)
				.then(setActivities)
				.catch((err) => console.error("Error fetching activity:", err))
				.finally(() => setActivitiesLoading(false));
		}
	}, [authLoading, authUser, tenantSlug, selectedLocationId]);

	if (authLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="space-y-4 text-center">
					<div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
					<p className="text-sm text-muted-foreground">Loading dashboard...</p>
				</div>
			</div>
		);
	}

	if (!authUser) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<Card className="w-full max-w-md border border-border/40 bg-card/80 shadow-lg">
					<CardContent className="p-8 text-center text-muted-foreground">
						<Shield className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
						<p className="text-lg font-medium">Please log in to view the dashboard.</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	const dashboardCards = [
		{
			to: `/${tenantSlug}/orders`,
			title: "Orders",
			description: "View order history and manage transactions",
			icon: ClipboardList,
			show: permissions.canAccessOrders(),
		},
		{
			to: `/${tenantSlug}/products`,
			title: "Products",
			description: "Browse product catalog and manage inventory",
			icon: Package,
			show: permissions.canAccessProducts(),
		},
		{
			to: `/${tenantSlug}/inventory`,
			title: "Inventory",
			description: "Manage stock levels, track inventory, and handle adjustments",
			icon: Package,
			show: permissions.canAccessInventory(),
		},
		{
			to: `/${tenantSlug}/payments`,
			title: "Payments",
			description: "Payment history, refunds, and financial records",
			icon: CreditCard,
			show: permissions.canAccessPayments(),
		},
		{
			to: `/${tenantSlug}/users`,
			title: "Users",
			description: "Manage staff accounts, roles, and permissions",
			icon: Users,
			show: permissions.canAccessUsers(),
		},
		{
			to: `/${tenantSlug}/discounts`,
			title: "Discounts",
			description: "Create and manage promotional offers",
			icon: Percent,
			show: permissions.canAccessDiscounts(),
		},
		{
			to: `/${tenantSlug}/reports`,
			title: "Reports",
			description: "Generate business reports and analytics",
			icon: FileText,
			show: permissions.canAccessReports(),
		},
		{
			to: `/${tenantSlug}/audit`,
			title: "Audit",
			description: "Security logs and system audit trails",
			icon: Shield,
			show: permissions.canAccessAudits(),
		},
		{
			to: `/${tenantSlug}/settings`,
			title: "Settings",
			description: "Configure system preferences and business settings",
			icon: Settings,
			show: permissions.canAccessSettings(),
		},
	];

	const visibleCards = dashboardCards.filter((card) => card.show);

	return (
		<div className="min-h-full animate-fade-in-up">
			<div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 pb-12 pt-8 sm:px-6 lg:px-10">
				{/* Hero Header */}
				<header className="rounded-2xl border border-border/40 bg-card/95 p-8 shadow-lg lg:p-12">
					<div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
						<div className="space-y-4">
							<div className="flex items-center gap-4">
								<div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/20">
									<Zap className="h-7 w-7 text-primary-foreground" />
								</div>
								<div>
									<h1 className="text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
										Welcome Back!
									</h1>
									<p className="mt-1 text-base text-muted-foreground">
										<span className="font-medium text-foreground">
											{authUser?.username || authUser?.email}
										</span>{" "}
										• {authUser?.role}
									</p>
								</div>
							</div>
							<p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
								Your command center for managing all aspects of your business. Access key features and workflows instantly.
							</p>
						</div>

						{/* Status Badges */}
						<div className="flex flex-wrap gap-3 lg:flex-col lg:items-end">
							<Badge className="flex items-center gap-2 rounded-full border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
								<Activity className="h-4 w-4" />
								System Online
								<span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
							</Badge>
						</div>
					</div>
				</header>

				{/* Metrics Grid */}
				<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{metricsLoading ? (
						<>
							{[1, 2, 3, 4].map((i) => (
								<Card
									key={i}
									className="border border-border/40 bg-card/95 shadow-md"
								>
									<CardContent className="p-6">
										<div className="animate-pulse space-y-3">
											<div className="h-4 w-24 rounded bg-muted" />
											<div className="h-8 w-32 rounded bg-muted" />
											<div className="h-3 w-20 rounded bg-muted" />
										</div>
									</CardContent>
								</Card>
							))}
						</>
					) : metrics ? (
						<>
							<MetricCard
								icon={DollarSign}
								label="Today's Sales"
								value={metrics.todaySales.value}
								subtitle="Net revenue"
								trend={metrics.todaySales.trend}
								trendValue={metrics.todaySales.trendValue}
								comparison={metrics.todaySales.comparison}
								linkTo={`/${tenantSlug}/reports?filter=today&type=sales`}
							/>
							<MetricCard
								icon={ShoppingCart}
								label="Orders"
								value={metrics.ordersCount.value}
								subtitle={metrics.ordersCount.subtitle}
								trend={metrics.ordersCount.trend}
								trendValue={metrics.ordersCount.trendValue}
								comparison={metrics.ordersCount.comparison}
								linkTo={`/${tenantSlug}/orders?filter=today`}
							/>
							<MetricCard
								icon={Package}
								label="Top Product"
								value={metrics.topProduct.value}
								subtitle={metrics.topProduct.subtitle}
								trend="neutral"
								comparison={metrics.topProduct.comparison}
								linkTo={`/${tenantSlug}/products`}
							/>
							<MetricCard
								icon={AlertTriangle}
								label="Low Stock"
								value={metrics.lowStockCount.value}
								subtitle={metrics.lowStockCount.subtitle}
								trend="neutral"
								linkTo={`/${tenantSlug}/inventory?filter=low-stock`}
							/>
						</>
					) : (
						<div className="col-span-4">
							<Card className="border border-border/40 bg-card/95">
								<CardContent className="p-6 text-center text-muted-foreground">
									Failed to load metrics
								</CardContent>
							</Card>
						</div>
					)}
				</section>

				{/* Two Column Section */}
				<section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
					{/* Quick Access Grid */}
					<div className="space-y-5">
						<div className="flex items-center justify-between">
							<div className="space-y-1">
								<h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
									<Zap className="h-6 w-6 text-primary" />
									Quick Access
								</h2>
								<p className="text-sm text-muted-foreground">
									Navigate to your most frequently used modules
								</p>
							</div>
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							{visibleCards.map((card) => (
								<QuickAccessCard
									key={card.to}
									to={card.to}
									title={card.title}
									description={card.description}
									icon={card.icon}
								/>
							))}
						</div>
					</div>

					{/* Recent Activity Feed */}
					<RecentActivityFeed
						activities={activities}
						loading={activitiesLoading}
					/>
				</section>
			</div>
		</div>
	);
}