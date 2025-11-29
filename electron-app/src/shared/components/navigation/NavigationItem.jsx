import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";
import PropTypes from "prop-types";

const baseItemClasses = "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200";
const defaultStateClasses = "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground active:scale-[0.98]";
const activeStateClasses = "bg-primary/10 text-primary font-medium";

export function NavigationItem({ route, isCollapsed, isMobile = false, permissions }) {
	const location = useLocation();

	const isMainActive =
		location.pathname === route.path || (route.path === "/" && location.pathname === "/");
	const isSubPageActive = route.subPages.some((subPage) => location.pathname === subPage.path);
	const isActive = isMainActive || isSubPageActive;

	// Keep expanded if we're anywhere in this route's section (main or subpage), or if manually expanded
	const [isManuallyExpanded, setIsManuallyExpanded] = useState(false);
	const hasSubPages = route.subPages.length > 0;
	const isExpanded = (hasSubPages && isActive) || isManuallyExpanded;

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
				return true;
		}
	};

	if (!hasPermission()) {
		return null;
	}

	if (route.subPages.length === 0) {
		return (
			<Link
				to={route.path}
				className={cn(
					baseItemClasses,
					defaultStateClasses,
					isActive && activeStateClasses,
					isCollapsed && !isMobile && "justify-center px-2"
				)}
			>
				<route.icon className={cn(
					"h-4 w-4 flex-shrink-0 transition-transform duration-200",
					isActive && "scale-110"
				)} />
				{(!isCollapsed || isMobile) && <span className="truncate">{route.title}</span>}
			</Link>
		);
	}

	if (!isCollapsed && !isMobile) {
		const toggleExpanded = () => {
			if (isActive && hasSubPages) {
				// If we're on this section, toggle allows collapsing
				setIsManuallyExpanded(!isExpanded);
			} else {
				setIsManuallyExpanded(!isManuallyExpanded);
			}
		};

		return (
			<div className="space-y-1">
				<button
					onClick={toggleExpanded}
					className={cn(baseItemClasses, defaultStateClasses, isActive && activeStateClasses, "w-full text-left")}
				>
					<route.icon className={cn(
						"h-4 w-4 flex-shrink-0 transition-transform duration-200",
						isActive && "scale-110"
					)} />
					<span className="flex-1 truncate text-left">{route.title}</span>
					<ChevronDown className={cn(
						"h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200",
						!isExpanded && "-rotate-90"
					)} />
				</button>

				<div className={cn(
					"ml-4 space-y-0.5 overflow-hidden border-l-2 border-border/50 pl-3 transition-all duration-200",
					isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
				)}>
					<Link
						to={route.path}
						className={cn(
							"block rounded-lg px-3 py-2 text-sm transition-all duration-150 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground active:scale-[0.98]",
							isMainActive
								? "text-primary font-medium bg-primary/5"
								: "text-sidebar-foreground/60"
						)}
					>
						{route.title}
					</Link>
					{route.subPages.map((subPage) => (
						<Link
							key={subPage.path}
							to={subPage.path}
							className={cn(
								"block rounded-lg px-3 py-2 text-sm transition-all duration-150 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground active:scale-[0.98]",
								location.pathname === subPage.path
									? "text-primary font-medium bg-primary/5"
									: "text-sidebar-foreground/60"
							)}
						>
							{subPage.title}
						</Link>
					))}
				</div>
			</div>
		);
	}

	if (isCollapsed && !isMobile) {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						className={cn(
							"flex w-full items-center justify-center rounded-xl py-2.5 transition-all duration-200 active:scale-95",
							isActive
								? activeStateClasses
								: "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
						)}
					>
						<route.icon className={cn(
							"h-4 w-4 flex-shrink-0 transition-transform duration-200",
							isActive && "scale-110"
						)} />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					side="right"
					align="start"
					className="border border-border/60 bg-card text-card-foreground"
				>
					<DropdownMenuItem asChild>
						<Link
							to={route.path}
							className={cn(
								"cursor-pointer text-sm text-muted-foreground hover:text-foreground",
								isMainActive && "font-medium text-foreground"
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
									"cursor-pointer text-sm text-muted-foreground hover:text-foreground",
									location.pathname === subPage.path && "font-medium text-foreground"
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

	// Mobile version
	const toggleExpandedMobile = () => {
		if (isActive && hasSubPages) {
			setIsManuallyExpanded(!isExpanded);
		} else {
			setIsManuallyExpanded(!isManuallyExpanded);
		}
	};

	return (
		<div className="space-y-1">
			<button
				onClick={toggleExpandedMobile}
				className={cn(baseItemClasses, defaultStateClasses, isActive && activeStateClasses, "w-full text-left")}
			>
				<route.icon className={cn(
					"h-4 w-4 flex-shrink-0 transition-transform duration-200",
					isActive && "scale-110"
				)} />
				<span className="flex-1 truncate text-left">{route.title}</span>
				<ChevronDown className={cn(
					"h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200",
					!isExpanded && "-rotate-90"
				)} />
			</button>

			<div className={cn(
				"ml-4 space-y-0.5 overflow-hidden border-l-2 border-border/50 pl-3 transition-all duration-200",
				isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
			)}>
				<Link
					to={route.path}
					className={cn(
						"block rounded-lg px-3 py-2 text-sm transition-all duration-150 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground active:scale-[0.98]",
						isMainActive
							? "text-primary font-medium bg-primary/5"
							: "text-sidebar-foreground/60"
					)}
				>
					{route.title}
				</Link>
				{route.subPages.map((subPage) => (
					<Link
						key={subPage.path}
						to={subPage.path}
						className={cn(
							"block rounded-lg px-3 py-2 text-sm transition-all duration-150 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground active:scale-[0.98]",
							location.pathname === subPage.path
								? "text-primary font-medium bg-primary/5"
								: "text-sidebar-foreground/60"
						)}
					>
						{subPage.title}
					</Link>
				))}
			</div>
		</div>
	);
}

NavigationItem.propTypes = {
	route: PropTypes.shape({
		path: PropTypes.string.isRequired,
		title: PropTypes.string.isRequired,
		icon: PropTypes.elementType.isRequired,
		subPages: PropTypes.arrayOf(
			PropTypes.shape({
				path: PropTypes.string.isRequired,
				title: PropTypes.string.isRequired,
			})
		).isRequired,
	}).isRequired,
	isCollapsed: PropTypes.bool.isRequired,
	isMobile: PropTypes.bool,
	permissions: PropTypes.object,
};

