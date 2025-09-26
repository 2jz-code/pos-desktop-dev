import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";

// Navigation types
export interface NavigationRoute {
  path: string;
  title: string;
  icon: LucideIcon;
  subPages: NavigationSubPage[];
}

export interface NavigationSubPage {
  path: string;
  title: string;
}

// Route pattern configuration
export interface RoutePattern {
  pattern: RegExp;
  subPattern?: RegExp;
  title: string;
  icon: LucideIcon;
  excludeParams?: boolean;
}

// Navigation configuration
export interface NavigationConfig {
  routePatterns: RoutePattern[];
  availableRoutes: string[];
  subPageTitles?: Record<string, string>;
}

/**
 * Shared hook for generating navigation routes based on configurable patterns
 *
 * This hook takes route patterns and available routes, then generates a structured
 * navigation tree with main routes and sub-pages.
 *
 * @param config - Configuration object with route patterns and available routes
 * @returns Array of navigation routes with sub-pages
 */
export function useNavigationRoutes(config: NavigationConfig): NavigationRoute[] {
  const { routePatterns, availableRoutes, subPageTitles = {} } = config;

  return useMemo(() => {
    const navigationRoutes: NavigationRoute[] = [];

    // Process each route pattern in order
    routePatterns.forEach((routeConfig) => {
      // Find the main route
      const mainRoute = availableRoutes.find(route => routeConfig.pattern.test(route));
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
        const subRoutes = availableRoutes.filter(route => {
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
          const title = subPageTitles[subPageKey] ||
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
  }, [routePatterns, availableRoutes, subPageTitles]);
}

// Common sub-page title mappings that apps can extend
export const COMMON_SUB_PAGE_TITLES: Record<string, string> = {
  "modifiers": "Modifiers",
  "bulk-operations": "Bulk Operations",
  "stock-history": "Stock History",
  "history": "Stock History",
  "scheduled": "Scheduled Reports",
  "custom": "Custom Reports",
};

// Helper function to create route patterns with common icons
export function createRoutePattern(
  pattern: RegExp,
  title: string,
  icon: LucideIcon,
  options?: {
    subPattern?: RegExp;
    excludeParams?: boolean;
  }
): RoutePattern {
  return {
    pattern,
    title,
    icon,
    subPattern: options?.subPattern,
    excludeParams: options?.excludeParams,
  };
}

// Helper function to merge sub-page titles
export function mergeSubPageTitles(...titleMaps: Record<string, string>[]): Record<string, string> {
  return Object.assign({}, COMMON_SUB_PAGE_TITLES, ...titleMaps);
}