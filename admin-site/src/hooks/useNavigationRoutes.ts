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
} from "lucide-react";

// Admin-site specific route patterns (in order)
const ADMIN_ROUTE_PATTERNS = [
	// Simple routes without sub-pages
	createRoutePattern(/^\/dashboard$/, "Dashboard", Home),
	createRoutePattern(/^\/orders$/, "Orders", ClipboardList),
	createRoutePattern(/^\/payments$/, "Payments", CreditCard),
	createRoutePattern(/^\/users$/, "Users", Users),
	// Routes with sub-pages
	createRoutePattern(/^\/products$/, "Products", Package, {
		subPattern: /^\/products\/([^\/]+)$/,
		excludeParams: true
	}),
	createRoutePattern(/^\/inventory$/, "Inventory", Warehouse, {
		subPattern: /^\/inventory\/([^\/]+)$/,
		excludeParams: true
	}),
	createRoutePattern(/^\/discounts$/, "Discounts", Percent),
	createRoutePattern(/^\/reports$/, "Reports", FileText, {
		subPattern: /^\/reports\/([^\/]+)$/,
		excludeParams: true
	}),
	createRoutePattern(/^\/audit$/, "Audit", Shield),
	createRoutePattern(/^\/settings$/, "Settings", Settings),
];

// Admin-site specific routes
const ADMIN_AVAILABLE_ROUTES = [
	"/dashboard",
	"/orders",
	"/payments",
	"/users",
	"/products",
	"/products/modifiers",
	"/inventory",
	"/inventory/bulk-operations",
	"/inventory/stock-history",
	"/reports",
	"/discounts",
	"/audit",
	"/settings"
];

// Admin-site specific sub-page titles
const ADMIN_SUB_PAGE_TITLES = mergeSubPageTitles({
	"scheduled": "Scheduled Reports",
	"custom": "Custom Reports",
});

export function useNavigationRoutes(): NavigationRoute[] {
	return useSharedNavigationRoutes({
		routePatterns: ADMIN_ROUTE_PATTERNS,
		availableRoutes: ADMIN_AVAILABLE_ROUTES,
		subPageTitles: ADMIN_SUB_PAGE_TITLES,
	});
}