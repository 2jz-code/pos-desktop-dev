import type { LucideIcon } from "lucide-react";

export interface NavigationSubPage {
	path: string;
	title: string;
	description?: string;
}

export interface NavigationRoute {
	path: string;
	title: string;
	icon: LucideIcon;
	subPages: NavigationSubPage[];
}

export interface NavigationConfig {
	[key: string]: NavigationRoute;
}

export interface RouteDefinition {
	path: string;
	element: React.ReactElement;
	isParameterRoute?: boolean;
	parentPath?: string;
}