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

const baseItemClasses = "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-200";
const defaultStateClasses = "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground";
const activeStateClasses = "bg-sidebar-accent/80 text-sidebar-foreground shadow-xs";

export function NavigationItem({ route, isCollapsed, isMobile = false, permissions }) {
	const location = useLocation();
	const [isExpanded, setIsExpanded] = useState(false);

	const isMainActive =
		location.pathname === route.path || (route.path === "/" && location.pathname === "/");
	const isSubPageActive = route.subPages.some((subPage) => location.pathname === subPage.path);
	const isActive = isMainActive || isSubPageActive;

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
				<route.icon className="h-4 w-4 flex-shrink-0" />
				{(!isCollapsed || isMobile) && <span className="truncate">{route.title}</span>}
			</Link>
		);
	}

	if (!isCollapsed && !isMobile) {
		return (
			<div className="space-y-1">
				<button
					onClick={() => setIsExpanded(!isExpanded)}
					className={cn(baseItemClasses, defaultStateClasses, isActive && activeStateClasses, "w-full text-left")}
				>
					<route.icon className="h-4 w-4 flex-shrink-0" />
					<span className="flex-1 truncate text-left">{route.title}</span>
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
								"block rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
								isMainActive && activeStateClasses
							)}
						>
							{route.title}
						</Link>
						{route.subPages.map((subPage) => (
							<Link
								key={subPage.path}
								to={subPage.path}
								className={cn(
									"block rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
									location.pathname === subPage.path && activeStateClasses
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

	if (isCollapsed && !isMobile) {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						className={cn(
							"flex items-center justify-center rounded-lg px-2 py-2.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
							isActive && activeStateClasses
						)}
					>
						<route.icon className="h-4 w-4 flex-shrink-0" />
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

	return (
		<div className="space-y-1">
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className={cn(baseItemClasses, defaultStateClasses, isActive && activeStateClasses, "w-full text-left")}
			>
				<route.icon className="h-4 w-4 flex-shrink-0" />
				<span className="flex-1 truncate text-left">{route.title}</span>
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
							"block rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
							isMainActive && activeStateClasses
						)}
					>
						{route.title}
					</Link>
					{route.subPages.map((subPage) => (
						<Link
							key={subPage.path}
							to={subPage.path}
							className={cn(
								"block rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
								location.pathname === subPage.path && activeStateClasses
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

