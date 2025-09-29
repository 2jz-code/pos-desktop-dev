"use client";

import { useEffect } from "react";
import { Link } from "react-router-dom";
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

const STATUS_STYLES = {
	online: {
		dot: "bg-primary",
		badge: "border border-primary/30 bg-primary/15 text-primary",
		label: "Online",
	},
	active: {
		dot: "bg-accent-foreground",
		badge: "border border-accent/25 bg-accent/15 text-accent-foreground",
		label: "Active",
	},
	default: {
		dot: "bg-muted-foreground/60",
		badge: "border border-muted/30 bg-muted/20 text-muted-foreground",
		label: "Idle",
	},
};

const StatsCard = ({ icon: IconComponent, label, value, status = "default" }) => {
	const style = STATUS_STYLES[status] ?? STATUS_STYLES.default;

	return (
		<Card className="border border-border/60 bg-card/80 shadow-sm">
			<CardContent className="flex items-center justify-between gap-4 p-5">
				<div className="flex items-center gap-3">
					<div className="flex size-10 items-center justify-center rounded-lg bg-muted/20 text-primary ring-1 ring-inset ring-border/30">
						<IconComponent className="size-5" />
					</div>
					<div className="space-y-1">
						<p className="text-[0.7rem] uppercase tracking-[0.32em] text-muted-foreground">
							{label}
						</p>
						<p className="text-lg font-semibold text-foreground">{value}</p>
					</div>
				</div>
				<span
					className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200 ease-standard ${style.badge}`}
				>
					<span className={`size-1.5 rounded-full ${style.dot}`} />
					{style.label}
				</span>
			</CardContent>
		</Card>
	);
};

const ProfessionalDashboardCard = ({
	to,
	title,
	description,
	icon: IconComponent, // eslint-disable-line
	roleRequired = false,
}) => (
	<Link className="group block focus-visible:outline-none" to={to}>
		<Card className="h-full border border-border/60 bg-card/80 shadow-sm transition-all duration-200 ease-standard group-hover:-translate-y-0.5 group-hover:border-border group-hover:shadow-lg group-focus-visible:ring-2 group-focus-visible:ring-ring/60 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background">
			<CardHeader className="flex flex-col gap-4 pb-3">
				<div className="flex items-start justify-between gap-4">
					<div className="flex items-start gap-3">
						<div className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-inset ring-primary/30 transition-colors duration-200 ease-standard group-hover:bg-primary/20">
							<IconComponent className="size-5" />
						</div>
						<div className="space-y-1">
							<CardTitle className="text-base font-semibold text-foreground">
								{title}
							</CardTitle>
						</div>
					</div>
					<ArrowRight className="mt-1 size-4 text-muted-foreground/60 transition-transform duration-200 ease-standard group-hover:translate-x-1 group-hover:text-primary" />
				</div>
				{roleRequired && (
					<Badge
						variant="outline"
						className="w-fit rounded-full border-dashed border-border/60 bg-transparent px-2.5 py-0.5 text-[0.65rem] uppercase tracking-wide text-muted-foreground"
					>
						Manager Access
					</Badge>
				)}
			</CardHeader>
			<CardContent className="pt-0">
				<p className="text-sm leading-relaxed text-muted-foreground">
					{description}
				</p>
			</CardContent>
		</Card>
	</Link>
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
			<div className="flex min-h-screen items-center justify-center bg-background">
				<Card className="w-full max-w-md border border-border/60 bg-card/80 shadow-sm">
					<CardContent className="text-center text-muted-foreground">
						<p>Please log in to view the dashboard.</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	const dashboardCards = [
		{
			to: "/pos",
			title: "Point of Sale",
			description: "Process sales, manage carts, and handle payments in one place.",
			icon: ShoppingCart,
			show: true,
		},
		{
			to: "/orders",
			title: "Orders",
			description: "Review history, resume held tickets, and monitor fulfillment.",
			icon: ClipboardList,
			show: permissions.canAccessOrders(),
		},
		{
			to: "/products",
			title: "Products",
			description: "Browse the catalog, adjust availability, and check pricing.",
			icon: Package,
			show: permissions.canAccessProducts(),
		},
		{
			to: "/inventory",
			title: "Inventory",
			description: "Track stock levels, restock alerts, and audit adjustments.",
			icon: Package,
			show: permissions.canAccessInventory(),
			roleRequired: true,
		},
		{
			to: "/payments",
			title: "Payments",
			description: "Monitor transaction history, refunds, and settlements.",
			icon: CreditCard,
			show: permissions.canAccessPayments(),
			roleRequired: true,
		},
		{
			to: "/users",
			title: "Users",
			description: "Manage staff access, roles, and security controls.",
			icon: Users,
			show: permissions.canAccessUsers(),
			roleRequired: true,
		},
		{
			to: "/discounts",
			title: "Discounts",
			description: "Create promos, manage rules, and monitor redemptions.",
			icon: Percent,
			show: permissions.canAccessDiscounts(),
			roleRequired: true,
		},
		{
			to: "/settings",
			title: "Settings",
			description: "Configure devices, receipts, taxes, and business hours.",
			icon: Settings,
			show: permissions.canAccessSettings(),
		},
	];

	const visibleCards = dashboardCards.filter((card) => card.show);

	const stats = [
		{
			icon: Activity,
			label: "System Status",
			value: "Healthy",
			status: "online",
		},
		{
			icon: DollarSign,
			label: "Today's Sales",
			value: "Active",
			status: "active",
		},
		{
			icon: Home,
			label: "Access Level",
			value: permissions.role,
			status: "default",
		},
	];

	return (
		<div className="min-h-full bg-background">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-12 pt-8 sm:px-6 lg:px-8">
				<header className="rounded-2xl border border-border/60 bg-card/80 px-6 py-7 shadow-sm backdrop-blur">
					<div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
						<div className="space-y-2">
							<span className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
								Control Center
							</span>
							<h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
							<p className="text-sm leading-relaxed text-muted-foreground">
								Welcome back, <span className="text-foreground font-medium">{authUser?.username}</span>. Your restaurant is ready for the next rush.
							</p>
						</div>
						<div className="flex flex-col items-start gap-3 text-sm text-muted-foreground md:items-end">
							<span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/20 px-3 py-1 text-xs uppercase tracking-wide">
								<span className="size-1.5 rounded-full bg-primary" />
								System online
							</span>
							<Badge
								variant="outline"
								className="rounded-full border-border/60 bg-transparent px-3 py-1 text-xs uppercase tracking-wide text-muted-foreground"
							>
								{permissions.role}
							</Badge>
						</div>
					</div>
				</header>

				<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{stats.map((stat) => (
						<StatsCard
							key={stat.label}
							icon={stat.icon}
							label={stat.label}
							value={stat.value}
							status={stat.status}
						/>
					))}
				</section>

				<section className="space-y-4">
					<div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h2 className="text-lg font-semibold text-foreground">Quick Access</h2>
							<p className="text-sm text-muted-foreground">
								Jump into the workflows you touch most often.
							</p>
						</div>
					</div>
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
				</section>

				{permissions.isCashier && (
					<Card className="border border-border/60 bg-card/80 shadow-sm">
						<CardHeader className="pb-2">
							<CardTitle className="text-base font-semibold text-foreground">
								Cashier Quick Guide
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="grid gap-6 md:grid-cols-2">
								<div>
									<h4 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
										Your main tasks
									</h4>
									<ul className="mt-3 space-y-2 text-sm text-muted-foreground">
										{[
											"Process sales at the POS",
											"Resume held or online orders",
											"Check product availability",
											"Adjust customer display settings",
										].map((item) => (
											<li key={item} className="flex items-center gap-2">
												<span className="size-1.5 rounded-full bg-muted-foreground/50" />
												{item}
											</li>
										))}
									</ul>
								</div>
								<div className="space-y-3 text-sm text-muted-foreground">
									<h4 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
										Need help?
									</h4>
									<p>
										Managers can assist with refunds, drawer counts, or account changes. Tap
											{" "}<kbd>Ctrl</kbd><span className="px-1 text-muted-foreground/70">+</span><kbd>M</kbd>{" "} to open the support panel.
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



