import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { NavigationRoute } from "@/types/navigation";

interface NavigationItemProps {
	route: NavigationRoute;
	isCollapsed: boolean;
	isMobile?: boolean;
}

export function NavigationItem({ route, isCollapsed, isMobile = false }: NavigationItemProps) {
	const location = useLocation();
	const [isExpanded, setIsExpanded] = useState(false);
	
	// Check if current route or any sub-route is active
	const isMainActive = location.pathname === route.path;
	const isSubPageActive = route.subPages.some(subPage => location.pathname === subPage.path);
	const isActive = isMainActive || isSubPageActive;

	// If no sub-pages, render simple link
	if (route.subPages.length === 0) {
		return (
			<Link
				to={route.path}
				className={cn(
					"flex items-center gap-3 rounded-lg px-3 py-2.5 text-muted-foreground transition-all hover:text-foreground hover:bg-accent",
					isActive && "bg-accent text-accent-foreground font-medium",
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
			<>
				<button
					onClick={() => setIsExpanded(!isExpanded)}
					className={cn(
						"flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-muted-foreground transition-all hover:text-foreground hover:bg-accent",
						isActive && "bg-accent text-accent-foreground font-medium"
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
					<div className="ml-7 space-y-1 mt-1">
						<Link
							to={route.path}
							className={cn(
								"block rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all hover:text-foreground hover:bg-accent",
								isMainActive && "bg-accent text-accent-foreground font-medium"
							)}
						>
							{route.title}
						</Link>
						{route.subPages.map((subPage) => (
							<Link
								key={subPage.path}
								to={subPage.path}
								className={cn(
									"block rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all hover:text-foreground hover:bg-accent",
									location.pathname === subPage.path && "bg-accent text-accent-foreground font-medium"
								)}
							>
								{subPage.title}
							</Link>
						))}
					</div>
				)}
			</>
		);
	}

	// Collapsed sidebar or mobile - show expandable list
	if (isCollapsed && !isMobile) {
		// For collapsed sidebar, show dropdown on hover
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						className={cn(
							"w-full flex items-center justify-center rounded-lg px-2 py-2.5 text-muted-foreground transition-all hover:text-foreground hover:bg-accent",
							isActive && "bg-accent text-accent-foreground font-medium"
						)}
					>
						<route.icon className="h-4 w-4 flex-shrink-0" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					side="right"
					align="start"
					className="bg-popover border-border"
				>
					<DropdownMenuItem asChild>
						<Link
							to={route.path}
							className={cn(
								"text-popover-foreground hover:bg-accent cursor-pointer",
								isMainActive && "bg-accent text-accent-foreground font-medium"
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
									"text-popover-foreground hover:bg-accent cursor-pointer",
									location.pathname === subPage.path && "bg-accent text-accent-foreground font-medium"
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
					"flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-muted-foreground transition-all hover:text-foreground hover:bg-accent",
					isActive && "bg-accent text-accent-foreground font-medium"
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
							"block rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all hover:text-foreground hover:bg-accent",
							isMainActive && "bg-accent text-accent-foreground font-medium"
						)}
					>
						{route.title}
					</Link>
					{route.subPages.map((subPage) => (
						<Link
							key={subPage.path}
							to={subPage.path}
							className={cn(
								"block rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all hover:text-foreground hover:bg-accent",
								location.pathname === subPage.path && "bg-accent text-accent-foreground font-medium"
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