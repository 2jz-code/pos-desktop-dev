/**
 * Electron-app navigation routes wrapper that uses the shared @ajeen/ui navigation hook
 * Configured for POS system with specific routes and icons
 */
import {
	useNavigationRoutes as useSharedNavigationRoutes,
	createRoutePattern,
	mergeSubPageTitles,
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
	ShoppingCart,
} from "lucide-react";

// Electron-app specific route patterns (in order)
const POS_ROUTE_PATTERNS = [
	// Simple routes without sub-pages
	createRoutePattern(/^\/$/, "Dashboard", Home),
	createRoutePattern(/^\/pos$/, "POS", ShoppingCart),
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
	createRoutePattern(/^\/settings$/, "Settings", Settings),
];

// Electron-app specific routes
const POS_AVAILABLE_ROUTES = [
	"/",
	"/pos",
	"/orders",
	"/payments",
	"/users",
	"/products",
	"/products/modifiers",
	"/inventory",
	"/inventory/history",
	"/discounts",
	"/settings"
];

// Electron-app specific sub-page titles
const POS_SUB_PAGE_TITLES = mergeSubPageTitles({
	"history": "Stock History",
});

export function useNavigationRoutes() {
	return useSharedNavigationRoutes({
		routePatterns: POS_ROUTE_PATTERNS,
		availableRoutes: POS_AVAILABLE_ROUTES,
		subPageTitles: POS_SUB_PAGE_TITLES,
	});
}