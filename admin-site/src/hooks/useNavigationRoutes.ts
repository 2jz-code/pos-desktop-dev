import { useMemo } from "react";
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
import type { NavigationConfig } from "@/types/navigation";

// Define the route patterns that should appear in navigation (in order)
const ROUTE_PATTERNS = [
	// Simple routes without sub-pages
	{ pattern: /^\/dashboard$/, title: "Dashboard", icon: Home },
	{ pattern: /^\/orders$/, title: "Orders", icon: ClipboardList },
	{ pattern: /^\/payments$/, title: "Payments", icon: CreditCard },
	{ pattern: /^\/users$/, title: "Users", icon: Users },
	// Routes with sub-pages
	{ 
		pattern: /^\/products$/, 
		subPattern: /^\/products\/([^\/]+)$/,
		title: "Products", 
		icon: Package,
		excludeParams: true // Exclude routes with :id parameters
	},
	{ 
		pattern: /^\/inventory$/, 
		subPattern: /^\/inventory\/([^\/]+)$/,
		title: "Inventory", 
		icon: Warehouse,
		excludeParams: true
	},
	{ pattern: /^\/discounts$/, title: "Discounts", icon: Percent },
	{ 
		pattern: /^\/reports$/, 
		subPattern: /^\/reports\/([^\/]+)$/,
		title: "Reports", 
		icon: FileText,
		excludeParams: true
	},
	{ pattern: /^\/audit$/, title: "Audit", icon: Shield },
	{ pattern: /^\/settings$/, title: "Settings", icon: Settings },
];

// Known sub-page titles for better labeling
const SUB_PAGE_TITLES: Record<string, string> = {
	"modifiers": "Modifiers",
	"bulk-operations": "Bulk Operations", 
	"stock-history": "Stock History",
	"scheduled": "Scheduled Reports",
	"custom": "Custom Reports",
};

export function useNavigationRoutes(): NavigationRoute[] {
	return useMemo(() => {
		const navigationRoutes: NavigationRoute[] = [];
		
		// Get all routes from the current application
		// Note: In a real app, you might want to get this from your router configuration
		const allRoutes = [
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

		// Process each route pattern in order
		ROUTE_PATTERNS.forEach((routeConfig) => {
			// Find the main route
			const mainRoute = allRoutes.find(route => routeConfig.pattern.test(route));
			if (!mainRoute) return;
			
			// Initialize the navigation item
			const navigationRoute: NavigationRoute = {
				path: mainRoute,
				title: routeConfig.title,
				icon: routeConfig.icon,
				subPages: []
			};

			// If this route has sub-patterns, find matching sub-routes
			if (routeConfig.subPattern) {
				const subRoutes = allRoutes.filter(route => {
					const match = routeConfig.subPattern!.test(route);
					if (!match) return false;
					
					// If excludeParams is true, filter out routes with parameters like :id
					if (routeConfig.excludeParams) {
						const subPath = route.split('/').slice(2).join('/'); // Get part after /products/ or /inventory/
						return !subPath.includes(':') && subPath.length > 0;
					}
					
					return true;
				});

				// Add sub-routes to the navigation config
				subRoutes.forEach(subRoute => {
					const pathParts = subRoute.split('/');
					const subPageKey = pathParts[pathParts.length - 1];
					const title = SUB_PAGE_TITLES[subPageKey] || 
						subPageKey.split('-').map(word => 
							word.charAt(0).toUpperCase() + word.slice(1)
						).join(' ');

					navigationRoute.subPages.push({
						path: subRoute,
						title: title
					});
				});
			}

			navigationRoutes.push(navigationRoute);
		});

		return navigationRoutes;
	}, []);
}