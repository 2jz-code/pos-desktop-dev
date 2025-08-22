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
	ShoppingCart,
} from "lucide-react";

// Define the route patterns that should appear in navigation (in order)
const ROUTE_PATTERNS = [
	// Simple routes without sub-pages
	{ pattern: /^\/$/, title: "Dashboard", icon: Home },
	{ pattern: /^\/pos$/, title: "POS", icon: ShoppingCart },
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
	{ pattern: /^\/settings$/, title: "Settings", icon: Settings },
];

// Known sub-page titles for better labeling
const SUB_PAGE_TITLES = {
	"modifiers": "Modifiers",
	"history": "Stock History",
};

export function useNavigationRoutes() {
	return useMemo(() => {
		const navigationRoutes = [];
		
		// Get all routes from the current application
		// Based on the routes in App.jsx
		const allRoutes = [
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

		// Process each route pattern in order
		ROUTE_PATTERNS.forEach((routeConfig) => {
			// Find the main route
			const mainRoute = allRoutes.find(route => routeConfig.pattern.test(route));
			if (!mainRoute) return;
			
			// Initialize the navigation item
			const navigationRoute = {
				path: mainRoute,
				title: routeConfig.title,
				icon: routeConfig.icon,
				subPages: []
			};

			// If this route has sub-patterns, find matching sub-routes
			if (routeConfig.subPattern) {
				const subRoutes = allRoutes.filter(route => {
					const match = routeConfig.subPattern.test(route);
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