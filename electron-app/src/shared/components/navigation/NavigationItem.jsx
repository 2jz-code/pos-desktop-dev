import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";
import PropTypes from "prop-types";

export function NavigationItem({ route, isCollapsed, isMobile = false, permissions }) {
	const location = useLocation();
	const [isExpanded, setIsExpanded] = useState(false);
	
	// Check if current route or any sub-route is active
	const isMainActive = location.pathname === route.path || (route.path === "/" && location.pathname === "/");
	const isSubPageActive = route.subPages.some(subPage => location.pathname === subPage.path);
	const isActive = isMainActive || isSubPageActive;

	// Check permissions for the main route
	const hasPermission = () => {
		switch (route.path) {
			case "/":
				return permissions?.canAccessDashboard?.() ?? true;
			case "/payments":
				return permissions?.canAccessPayments?.() ?? true;
			case "/users":
				return permissions?.canAccessUsers?.() ?? true;
			case "/inventory":
				return permissions?.canAccessInventory?.() ?? true;
			case "/discounts":
				return permissions?.canAccessDiscounts?.() ?? true;
			case "/settings":
				return permissions?.canAccessSettings?.() ?? true;
			default:
				return true; // POS, Orders, Products are accessible to all
		}
	};

	// Don't render if user doesn't have permission
	if (!hasPermission()) {
		return null;
	}

	// If no sub-pages, render simple link
	if (route.subPages.length === 0) {
		return (
			<Link
				to={route.path}
				className={cn(
					"flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800",
					isActive && "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium",
					isCollapsed && !isMobile && "justify-center px-2"
				)}
			>
				<route.icon className="h-4 w-4 flex-shrink-0" />
				{(!isCollapsed || isMobile) && <span className="truncate">{route.title}</span>}
			</Link>
		);
	}

	// Desktop expandable behavior (when not collapsed)
	if (!isCollapsed && !isMobile) {
		return (
			<div className="space-y-1">
				<button
					onClick={() => setIsExpanded(!isExpanded)}
					className={cn(
						"flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800",
						isActive && "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
					)}
				>
					<route.icon className="h-4 w-4 flex-shrink-0" />
					<span className="flex-1 text-left truncate">{route.title}</span>
					{isExpanded ? (
						<ChevronDown className="h-3 w-3 flex-shrink-0" />
					) : (
						<ChevronRight className="h-3 w-3 flex-shrink-0" />
					)}
				</button>
				
				{isExpanded && (
					<div className="ml-7 space-y-1">
						<Link
							to={route.path}
							className={cn(
								"block rounded-lg px-3 py-2 text-sm text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800",
								isMainActive && "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
							)}
						>
							{route.title}
						</Link>
						{route.subPages.map((subPage) => (
							<Link
								key={subPage.path}
								to={subPage.path}
								className={cn(
									"block rounded-lg px-3 py-2 text-sm text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800",
									location.pathname === subPage.path && "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
								)}
							>
								{subPage.title}
							</Link>
						))}
					</div>
				)}
			</div>
		);
	}

	// Collapsed sidebar - show dropdown on hover
	if (isCollapsed && !isMobile) {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						className={cn(
							"flex items-center justify-center rounded-lg px-2 py-2.5 text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800",
							isActive && "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
						)}
					>
						<route.icon className="h-4 w-4 flex-shrink-0" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent 
					side="right" 
					align="start"
					className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
				>
					<DropdownMenuItem asChild>
						<Link
							to={route.path}
							className={cn(
								"text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer",
								isMainActive && "bg-slate-100 dark:bg-slate-800 font-medium"
							)}
						>
							{route.title}
						</Link>
					</DropdownMenuItem>
					{route.subPages.map((subPage) => (
						<DropdownMenuItem key={subPage.path} asChild>
							<Link
								to={subPage.path}
								className={cn(
									"text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer",
									location.pathname === subPage.path && "bg-slate-100 dark:bg-slate-800 font-medium"
								)}
							>
								{subPage.title}
							</Link>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	// Mobile expandable behavior
	return (
		<div className="space-y-1">
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className={cn(
					"flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800",
					isActive && "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
				)}
			>
				<route.icon className="h-4 w-4 flex-shrink-0" />
				<span className="flex-1 text-left truncate">{route.title}</span>
				{isExpanded ? (
					<ChevronDown className="h-3 w-3 flex-shrink-0" />
				) : (
					<ChevronRight className="h-3 w-3 flex-shrink-0" />
				)}
			</button>
			
			{isExpanded && (
				<div className="ml-7 space-y-1">
					<Link
						to={route.path}
						className={cn(
							"block rounded-lg px-3 py-2 text-sm text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800",
							isMainActive && "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
						)}
					>
						{route.title}
					</Link>
					{route.subPages.map((subPage) => (
						<Link
							key={subPage.path}
							to={subPage.path}
							className={cn(
								"block rounded-lg px-3 py-2 text-sm text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800",
								location.pathname === subPage.path && "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
							)}
						>
							{subPage.title}
						</Link>
					))}
				</div>
			)}
		</div>
	);
}

NavigationItem.propTypes = {
	route: PropTypes.shape({
		path: PropTypes.string.isRequired,
		title: PropTypes.string.isRequired,
		icon: PropTypes.elementType.isRequired,
		subPages: PropTypes.arrayOf(PropTypes.shape({
			path: PropTypes.string.isRequired,
			title: PropTypes.string.isRequired,
		})).isRequired,
	}).isRequired,
	isCollapsed: PropTypes.bool.isRequired,
	isMobile: PropTypes.bool,
	permissions: PropTypes.object,
};