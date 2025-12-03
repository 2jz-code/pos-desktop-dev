/**
 * Admin-site navigation routes wrapper that uses the shared @ajeen/ui navigation hook
 * Configured for admin dashboard with specific routes and icons
 */
import {
	useNavigationRoutes as useSharedNavigationRoutes,
	createRoutePattern,
	mergeSubPageTitles,
	type NavigationRoute,
} from "@ajeen/ui";
import {
	Home,
	Users,
	Package,
	ClipboardList,
	Percent,
	Settings,
	CreditCard,
	Warehouse,
	FileText,
	Shield,
	Monitor,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// Admin-site specific sub-page titles
const ADMIN_SUB_PAGE_TITLES = mergeSubPageTitles({
	"scheduled": "Scheduled Reports",
	"custom": "Custom Reports",
	"activate": "Pair New Terminal",
});

export function useNavigationRoutes(): NavigationRoute[] {
	const { tenant } = useAuth();

	// If no tenant yet, return empty routes (loading state)
	if (!tenant?.slug) {
		return [];
	}

	const tenantSlug = tenant.slug;

	// Admin-site specific route patterns (tenant-aware)
	const ADMIN_ROUTE_PATTERNS = [
		// Simple routes without sub-pages
		createRoutePattern(new RegExp(`^/${tenantSlug}/dashboard$`), "Dashboard", Home),
		createRoutePattern(new RegExp(`^/${tenantSlug}/orders$`), "Orders", ClipboardList),
		createRoutePattern(new RegExp(`^/${tenantSlug}/payments$`), "Payments", CreditCard),
		createRoutePattern(new RegExp(`^/${tenantSlug}/users$`), "Users", Users),
		// Routes with sub-pages
		createRoutePattern(new RegExp(`^/${tenantSlug}/products$`), "Products", Package, {
			subPattern: new RegExp(`^/${tenantSlug}/products/([^/]+)$`),
			excludeParams: true
		}),
		createRoutePattern(new RegExp(`^/${tenantSlug}/inventory$`), "Inventory", Warehouse, {
			subPattern: new RegExp(`^/${tenantSlug}/inventory/([^/]+)$`),
			excludeParams: true
		}),
		createRoutePattern(new RegExp(`^/${tenantSlug}/discounts$`), "Discounts", Percent),
		createRoutePattern(new RegExp(`^/${tenantSlug}/reports$`), "Reports", FileText, {
			subPattern: new RegExp(`^/${tenantSlug}/reports/([^/]+)$`),
			excludeParams: true
		}),
		createRoutePattern(new RegExp(`^/${tenantSlug}/audit$`), "Audit", Shield),
		createRoutePattern(new RegExp(`^/${tenantSlug}/terminals$`), "Terminals", Monitor, {
			subPattern: new RegExp(`^/${tenantSlug}/terminals/([^/]+)$`),
			excludeParams: true
		}),
		createRoutePattern(new RegExp(`^/${tenantSlug}/settings$`), "Settings", Settings),
	];

	// Admin-site specific routes (tenant-aware)
	const ADMIN_AVAILABLE_ROUTES = [
		`/${tenantSlug}/dashboard`,
		`/${tenantSlug}/orders`,
		`/${tenantSlug}/payments`,
		`/${tenantSlug}/users`,
		`/${tenantSlug}/products`,
		`/${tenantSlug}/products/modifiers`,
		`/${tenantSlug}/inventory`,
		`/${tenantSlug}/inventory/bulk-operations`,
		`/${tenantSlug}/inventory/stock-history`,
		`/${tenantSlug}/reports`,
		`/${tenantSlug}/discounts`,
		`/${tenantSlug}/audit`,
		`/${tenantSlug}/terminals`,
		`/${tenantSlug}/terminals/activate`,
		`/${tenantSlug}/settings`
	];

	return useSharedNavigationRoutes({
		routePatterns: ADMIN_ROUTE_PATTERNS,
		availableRoutes: ADMIN_AVAILABLE_ROUTES,
		subPageTitles: ADMIN_SUB_PAGE_TITLES,
	});
}