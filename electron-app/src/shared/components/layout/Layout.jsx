"use client";

import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useRolePermissions } from "@/shared/hooks/useRolePermissions";
import { useNavigationRoutes } from "@/shared/hooks/useNavigationRoutes";
import { NavigationItem } from "@/shared/components/navigation/NavigationItem";
import {
	LogOut,
	PanelLeft,
	Menu,
	PanelLeftClose,
	PanelLeftOpen,
	Bell,
	Wifi,
	WifiOff,
	Power,
	Sun,
	Moon,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
	Sheet,
	SheetContent,
	SheetTrigger,
} from "@/shared/components/ui/sheet";
import { Badge } from "@/shared/components/ui/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import PropTypes from "prop-types";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/shared/lib/utils";
import {
	useSyncToCustomerDisplay,
	useCustomerTipListener,
} from "@/domains/pos";
import { useNotificationManager } from "@/shared/hooks/useNotificationManager";
import WebOrderNotification from "@/shared/components/notifications/WebOrderNotification";
import { NotificationRetryButton } from "@/components/NotificationRetryButton";

const resolveInitialTheme = () => {
	if (typeof window === "undefined") {
		return "dark";
	}

	const stored = localStorage.getItem("preferred-theme");
	if (stored === "light" || stored === "dark") {
		return stored;
	}

	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
};

const applyThemePreference = (theme) => {
	if (typeof document === "undefined") {
		return;
	}

	const root = document.documentElement;
	root.classList.toggle("dark", theme === "dark");
	root.dataset.theme = theme;
};

export function Layout({ children }) {
	const { user, logout } = useAuth();
	const permissions = useRolePermissions();
	const navigationRoutes = useNavigationRoutes();
	const [isCollapsed, setIsCollapsed] = useState(() => {
		try {
			return JSON.parse(localStorage.getItem("sidebar-collapsed")) || false;
		} catch (error) {
			console.warn("Failed to read sidebar state", error);
			return false;
		}
	});
	const [theme, setTheme] = useState(() => resolveInitialTheme());

	const {
		notifications,
		dismissNotification,
		clearAllNotifications,
		handleViewOrder,
		isConnected,
		isConnecting,
	} = useNotificationManager();

	useSyncToCustomerDisplay();
	useCustomerTipListener();

	useEffect(() => {
		localStorage.setItem("sidebar-collapsed", JSON.stringify(isCollapsed));
	}, [isCollapsed]);

	useEffect(() => {
		applyThemePreference(theme);
		localStorage.setItem("preferred-theme", theme);
	}, [theme]);

	const toggleTheme = useCallback(() => {
		setTheme((current) => (current === "dark" ? "light" : "dark"));
	}, []);

	return (
		<div
			className={cn(
				"grid min-h-screen w-full bg-background text-foreground transition-[grid-template-columns] duration-300 ease-standard",
				isCollapsed ? "lg:grid-cols-[80px_1fr]" : "lg:grid-cols-[280px_1fr]"
			)}
		>
			{/* Desktop Sidebar */}
			<div className="hidden border-r border-border/60 bg-sidebar/95 text-sidebar-foreground lg:block">
				<div className="flex h-full max-h-screen flex-col backdrop-blur">
					{/* Logo/Brand */}
					<div className="flex h-[60px] items-center border-b border-sidebar-border/70 px-4">
						<Link
							to="/"
							className="flex items-center gap-2 font-semibold text-sidebar-foreground"
						>
							<div className="rounded-lg bg-primary/20 p-1.5 text-primary ring-1 ring-inset ring-primary/40">
								<PanelLeft className="h-4 w-4" />
							</div>
							{!isCollapsed && <span>Ajeen POS</span>}
						</Link>
					</div>

					{/* Navigation */}
					<div className="flex-1 overflow-auto py-4">
						<nav className="grid items-start gap-1 px-3 text-sm font-medium">
							{navigationRoutes.map((route) => (
								<NavigationItem
									key={route.path}
									route={route}
									isCollapsed={isCollapsed}
									permissions={permissions}
								/>
							))}
						</nav>
					</div>

					{/* Logout */}
					<div className="mt-auto border-t border-sidebar-border/70 p-3">
						<button
							onClick={logout}
							className={cn(
								"flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 transition-colors duration-200 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
								isCollapsed && "justify-center px-2"
							)}
						>
							<LogOut className="h-4 w-4 flex-shrink-0" />
							{!isCollapsed && <span className="truncate">Logout</span>}
						</button>
						<button
							onClick={() => window.electronAPI.shutdown()}
							className={cn(
								"mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-destructive transition-colors duration-200 hover:bg-destructive/15 hover:text-destructive",
								isCollapsed && "justify-center px-2"
							)}
						>
							<Power className="h-4 w-4 flex-shrink-0" />
							{!isCollapsed && <span className="truncate">Shutdown</span>}
						</button>
					</div>
				</div>
			</div>

			{/* Main Content Area */}
			<div className="flex h-screen flex-col">
				<header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-card/80 px-4 shadow-xs backdrop-blur lg:h-[60px] lg:px-6">
					<Button
						variant="outline"
						size="icon"
						onClick={() => setIsCollapsed(!isCollapsed)}
						className="hidden border-border/60 bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground lg:inline-flex"
					>
						{isCollapsed ? (
							<PanelLeftOpen className="h-4 w-4" />
						) : (
							<PanelLeftClose className="h-4 w-4" />
						)}
						<span className="sr-only">Toggle sidebar</span>
					</Button>

					<Sheet>
						<SheetTrigger asChild>
							<Button
								variant="outline"
								size="icon"
								className="shrink-0 border-border/60 bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground lg:hidden"
							>
								<Menu className="h-4 w-4" />
								<span className="sr-only">Toggle navigation menu</span>
							</Button>
						</SheetTrigger>
						<SheetContent
							side="left"
							className="flex flex-col gap-6 bg-sidebar text-sidebar-foreground"
						>
							<nav className="grid gap-2 text-base font-medium">
								<Link
									to="/"
									className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sidebar-foreground hover:bg-sidebar-accent/60"
								>
									<div className="rounded-lg bg-primary/20 p-1.5 text-primary ring-1 ring-inset ring-primary/40">
										<PanelLeft className="h-4 w-4" />
									</div>
									<span>Ajeen POS</span>
								</Link>

								{navigationRoutes.map((route) => (
									<NavigationItem
										key={route.path}
										route={route}
										isCollapsed={false}
										isMobile={true}
										permissions={permissions}
									/>
								))}
							</nav>
							<div className="mt-auto space-y-2 border-t border-sidebar-border/70 pt-4">
								<button
									onClick={logout}
									className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
								>
									<LogOut className="h-4 w-4" />
									<span className="truncate">Logout</span>
								</button>
								<button
									onClick={() => window.electronAPI.shutdown()}
									className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-destructive transition-colors hover:bg-destructive/15"
								>
									<Power className="h-4 w-4" />
									<span className="truncate">Shutdown</span>
								</button>
							</div>
						</SheetContent>
					</Sheet>

					<div className="flex-1" />

					<Button
						variant="outline"
						size="icon"
						onClick={toggleTheme}
						className="border-border/60 bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground"
					>
						{theme === "dark" ? (
							<Sun className="h-4 w-4" />
						) : (
							<Moon className="h-4 w-4" />
						)}
						<span className="sr-only">Toggle color theme</span>
					</Button>

					<div className="flex items-center gap-2">
						<NotificationRetryButton />

						<Tooltip>
							<TooltipTrigger asChild>
								<div className="flex items-center">
									{isConnected ? (
										<Wifi className="h-4 w-4 text-emerald-400" />
									) : isConnecting ? (
										<Wifi className="h-4 w-4 text-amber-400 animate-pulse" />
									) : (
										<WifiOff className="h-4 w-4 text-destructive" />
									)}
								</div>
							</TooltipTrigger>
							<TooltipContent>
								<p>
									Notifications:{" "}
									{isConnected
										? "Connected"
										: isConnecting
										? "Connecting..."
										: "Disconnected"}
								</p>
							</TooltipContent>
						</Tooltip>

						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="outline"
									size="icon"
									className="relative border-border/60 bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground"
								>
									<Bell className="h-4 w-4" />
									{notifications.length > 0 && (
										<Badge className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
											{notifications.length}
										</Badge>
									)}
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								className="w-[340px] border border-border/60 bg-card text-card-foreground"
							>
								<DropdownMenuLabel className="flex items-center justify-between text-sm">
									<span>Web Order Notifications</span>
									{notifications.length > 0 && (
										<Button
											variant="ghost"
											size="sm"
											onClick={clearAllNotifications}
											className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
										>
											Clear all
										</Button>
									)}
								</DropdownMenuLabel>
								<DropdownMenuSeparator className="-mx-1 border-border/60" />
								{notifications.length > 0 ? (
									<div className="max-h-[360px] space-y-1 overflow-y-auto">
										{notifications.map((notification) => (
											<DropdownMenuItem
												key={notification.id}
												className="p-0"
												onSelect={(event) => event.preventDefault()}
											>
												<WebOrderNotification
													order={notification.data.order}
													onDismiss={() => dismissNotification(notification.id)}
													onViewOrder={handleViewOrder}
												/>
											</DropdownMenuItem>
										))}
									</div>
								) : (
									<div className="p-4 text-center text-sm text-muted-foreground">
										No new notifications
									</div>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="rounded-full bg-transparent hover:bg-muted/40"
							>
								<div className="relative">
									<img
										className="h-8 w-8 rounded-full border border-border/60"
										src={`https://avatar.vercel.sh/${user?.username}.png`}
										alt="Avatar"
									/>
								</div>
								<span className="sr-only">Toggle user menu</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							className="border border-border/60 bg-card text-card-foreground"
						>
							<DropdownMenuLabel className="text-sm font-medium text-foreground">
								My account
							</DropdownMenuLabel>
							<DropdownMenuSeparator className="-mx-1 border-border/60" />
							<DropdownMenuItem className="text-muted-foreground hover:text-foreground">
								Settings
							</DropdownMenuItem>
							<DropdownMenuItem className="text-muted-foreground hover:text-foreground">
								Support
							</DropdownMenuItem>
							<DropdownMenuSeparator className="-mx-1 border-border/60" />
							<DropdownMenuItem
								onClick={logout}
								className="text-muted-foreground hover:text-foreground"
							>
								<LogOut className="mr-2 h-4 w-4" />
								<span>Logout</span>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</header>

				<main className="flex flex-1 flex-col overflow-hidden bg-background">
					{children}
				</main>
			</div>
		</div>
	);
}

Layout.propTypes = {
	children: PropTypes.node.isRequired,
};

