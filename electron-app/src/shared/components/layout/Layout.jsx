"use client";

import { Link, useLocation } from "react-router-dom";
import { useState, useEffect, useCallback, useMemo } from "react";
import PropTypes from "prop-types";
import {
	LogOut,
	Menu,
	ChevronLeft,
	ChevronRight,
	Bell,
	Wifi,
	WifiOff,
	Power,
	Sun,
	Moon,
	Sparkles,
	Clock,
	X,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { useRolePermissions } from "@/shared/hooks/useRolePermissions";
import { useNavigationRoutes } from "@/shared/hooks/useNavigationRoutes";
import { useNotificationManager } from "@/shared/hooks/useNotificationManager";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { useSyncToCustomerDisplay, useCustomerTipListener } from "@/domains/pos";

import { NavigationItem } from "@/shared/components/navigation/NavigationItem";
import { NotificationRetryButton } from "@/components/NotificationRetryButton";
import WebOrderNotification from "@/shared/components/notifications/WebOrderNotification";

import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { Sheet, SheetContent, SheetTrigger } from "@/shared/components/ui/sheet";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

// ============================================================================
// Theme
// ============================================================================

const getInitialTheme = () => {
	if (typeof window === "undefined") return "dark";
	const stored = localStorage.getItem("preferred-theme");
	if (stored === "light" || stored === "dark") return stored;
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const applyTheme = (theme) => {
	if (typeof document === "undefined") return;
	document.documentElement.classList.toggle("dark", theme === "dark");
	document.documentElement.dataset.theme = theme;
};

// ============================================================================
// Hooks
// ============================================================================

function useCurrentTime() {
	const [time, setTime] = useState(new Date());
	useEffect(() => {
		const timer = setInterval(() => setTime(new Date()), 1000);
		return () => clearInterval(timer);
	}, []);
	return time;
}

function useGreeting(username) {
	const hour = new Date().getHours();
	const name = username?.split("@")[0] || "there";

	if (hour < 12) return `Good morning, ${name}`;
	if (hour < 17) return `Good afternoon, ${name}`;
	return `Good evening, ${name}`;
}

// ============================================================================
// Sub-Components
// ============================================================================

function LiveClock() {
	const time = useCurrentTime();
	const formatted = time.toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});

	return (
		<div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground font-mono tabular-nums">
			<Clock className="h-3 w-3" />
			{formatted}
		</div>
	);
}

function StatusPill({ isOnline, isConnected, isConnecting }) {
	if (!isOnline) {
		return (
			<div className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-destructive">
				<span className="relative flex h-2 w-2">
					<span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
					<span className="relative inline-flex h-2 w-2 rounded-full bg-destructive"></span>
				</span>
				<span className="text-xs font-medium">Offline</span>
			</div>
		);
	}

	if (isConnecting) {
		return (
			<div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-600 dark:text-amber-400">
				<span className="relative flex h-2 w-2">
					<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75"></span>
					<span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500"></span>
				</span>
				<span className="text-xs font-medium">Connecting</span>
			</div>
		);
	}

	if (isConnected) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-600 dark:text-emerald-400 cursor-default">
						<span className="relative flex h-2 w-2">
							<span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
						</span>
						<span className="text-xs font-medium">Live</span>
					</div>
				</TooltipTrigger>
				<TooltipContent>Real-time updates active</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<div className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
			<WifiOff className="h-3 w-3" />
			<span className="text-xs font-medium">Disconnected</span>
		</div>
	);
}

function NotificationBell({ notifications, onDismiss, onClearAll, onViewOrder }) {
	const count = notifications.length;
	const hasNotifications = count > 0;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className={cn(
						"relative h-9 w-9 rounded-xl transition-all",
						hasNotifications && "text-primary"
					)}
				>
					<Bell className={cn("h-4 w-4 transition-transform", hasNotifications && "animate-wiggle")} />
					{hasNotifications && (
						<span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center">
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-40"></span>
							<span className="relative flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
								{count > 9 ? "!" : count}
							</span>
						</span>
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-80 p-0 overflow-hidden">
				<div className="flex items-center justify-between bg-muted/50 px-4 py-3">
					<div className="flex items-center gap-2">
						<Sparkles className="h-4 w-4 text-primary" />
						<span className="font-semibold text-sm">Notifications</span>
					</div>
					{hasNotifications && (
						<button
							onClick={onClearAll}
							className="text-xs text-muted-foreground hover:text-foreground transition-colors"
						>
							Clear all
						</button>
					)}
				</div>
				<DropdownMenuSeparator className="m-0" />
				{hasNotifications ? (
					<div className="max-h-80 overflow-y-auto divide-y divide-border/50">
						{notifications.map((notification) => (
							<DropdownMenuItem
								key={notification.id}
								className="p-0 focus:bg-transparent rounded-none"
								onSelect={(e) => e.preventDefault()}
							>
								<WebOrderNotification
									order={notification.data.order}
									onDismiss={() => onDismiss(notification.id)}
									onViewOrder={onViewOrder}
								/>
							</DropdownMenuItem>
						))}
					</div>
				) : (
					<div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
						<Bell className="h-8 w-8 mb-2 opacity-20" />
						<p className="text-sm">All caught up!</p>
						<p className="text-xs opacity-60">No new notifications</p>
					</div>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function UserAvatar({ user, size = "md" }) {
	const sizes = {
		sm: "h-7 w-7 text-xs",
		md: "h-9 w-9 text-sm",
		lg: "h-11 w-11 text-base",
	};

	const initials = (user?.username || "U").slice(0, 2).toUpperCase();
	const colors = [
		"from-violet-500 to-purple-500",
		"from-blue-500 to-cyan-500",
		"from-emerald-500 to-teal-500",
		"from-orange-500 to-amber-500",
		"from-pink-500 to-rose-500",
	];
	const colorIndex = (user?.username?.charCodeAt(0) || 0) % colors.length;

	return (
		<div
			className={cn(
				"flex items-center justify-center rounded-xl bg-gradient-to-br font-semibold text-white shadow-sm",
				sizes[size],
				colors[colorIndex]
			)}
		>
			{initials}
		</div>
	);
}

function UserMenu({ user, greeting, onLogout, onShutdown }) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl p-0">
					<UserAvatar user={user} />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56 p-0 overflow-hidden">
				<div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4">
					<div className="flex items-center gap-3">
						<UserAvatar user={user} size="lg" />
						<div className="flex-1 min-w-0">
							<p className="font-semibold truncate">{user?.username || "User"}</p>
							<p className="text-xs text-muted-foreground capitalize">{user?.role || "Staff"}</p>
						</div>
					</div>
					<p className="mt-3 text-xs text-muted-foreground">{greeting}</p>
				</div>
				<DropdownMenuSeparator className="m-0" />
				<div className="p-1.5">
					<DropdownMenuItem
						onClick={onLogout}
						className="rounded-lg cursor-pointer"
					>
						<LogOut className="mr-2 h-4 w-4" />
						Sign out
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={onShutdown}
						className="rounded-lg cursor-pointer text-destructive focus:text-destructive"
					>
						<Power className="mr-2 h-4 w-4" />
						Shutdown terminal
					</DropdownMenuItem>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ThemeToggle({ theme, onToggle }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={onToggle}
					className="h-9 w-9 rounded-xl"
				>
					<Sun className={cn(
						"h-4 w-4 transition-all",
						theme === "dark" ? "rotate-0 scale-100" : "rotate-90 scale-0"
					)} />
					<Moon className={cn(
						"absolute h-4 w-4 transition-all",
						theme === "dark" ? "-rotate-90 scale-0" : "rotate-0 scale-100"
					)} />
				</Button>
			</TooltipTrigger>
			<TooltipContent>{theme === "dark" ? "Light mode" : "Dark mode"}</TooltipContent>
		</Tooltip>
	);
}

// ============================================================================
// Sidebar
// ============================================================================

function SidebarBrand({ collapsed }) {
	return (
		<Link to="/" className="flex items-center gap-3 group">
			<div className={cn(
				"flex items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25 transition-all duration-300",
				collapsed ? "h-10 w-10" : "h-10 w-10"
			)}>
				<span className="font-bold text-lg">A</span>
			</div>
			<div className={cn(
				"flex flex-col transition-all duration-300 overflow-hidden",
				collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
			)}>
				<span className="font-bold text-sm tracking-tight">Ajeen</span>
				<span className="text-[10px] text-muted-foreground -mt-0.5">Point of Sale</span>
			</div>
		</Link>
	);
}

function SidebarNav({ routes, permissions, collapsed, currentPath }) {
	// Group routes by section
	const groupedRoutes = useMemo(() => {
		const groups = {
			main: [],
			management: [],
			system: [],
		};

		routes.forEach((route) => {
			if (["/", "/pos", "/orders"].includes(route.path)) {
				groups.main.push(route);
			} else if (["/settings"].includes(route.path)) {
				groups.system.push(route);
			} else {
				groups.management.push(route);
			}
		});

		return groups;
	}, [routes]);

	const NavSection = ({ title, items }) => {
		if (items.length === 0) return null;
		return (
			<div className="space-y-1">
				{!collapsed && title && (
					<p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
						{title}
					</p>
				)}
				{items.map((route) => (
					<NavigationItem
						key={route.path}
						route={route}
						isCollapsed={collapsed}
						permissions={permissions}
					/>
				))}
			</div>
		);
	};

	return (
		<nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
			<div className="space-y-6">
				<NavSection items={groupedRoutes.main} />
				<NavSection title="Manage" items={groupedRoutes.management} />
				<NavSection title="System" items={groupedRoutes.system} />
			</div>
		</nav>
	);
}

function SidebarFooter({ collapsed, onLogout, onShutdown }) {
	return (
		<div className={cn("border-t border-border/50 p-3 space-y-1")}>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						onClick={onLogout}
						className={cn(
							"flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-all hover:bg-muted hover:text-foreground",
							collapsed && "justify-center px-0"
						)}
					>
						<LogOut className="h-4 w-4 shrink-0" />
						{!collapsed && <span>Sign out</span>}
					</button>
				</TooltipTrigger>
				{collapsed && <TooltipContent side="right">Sign out</TooltipContent>}
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						onClick={onShutdown}
						className={cn(
							"flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-destructive/70 transition-all hover:bg-destructive/10 hover:text-destructive",
							collapsed && "justify-center px-0"
						)}
					>
						<Power className="h-4 w-4 shrink-0" />
						{!collapsed && <span>Shutdown</span>}
					</button>
				</TooltipTrigger>
				{collapsed && <TooltipContent side="right">Shutdown</TooltipContent>}
			</Tooltip>
		</div>
	);
}

function CollapseToggle({ collapsed, onToggle }) {
	return (
		<button
			onClick={onToggle}
			className={cn(
				"absolute -right-5 top-1/2 -translate-y-1/2 z-50 flex h-10 w-10 items-center justify-center rounded-full border-2 bg-background shadow-lg transition-all active:scale-95",
				"hover:bg-primary hover:text-primary-foreground hover:border-primary"
			)}
		>
			{collapsed ? (
				<ChevronRight className="h-5 w-5" />
			) : (
				<ChevronLeft className="h-5 w-5" />
			)}
		</button>
	);
}

function DesktopSidebar({ collapsed, onToggle, routes, permissions, currentPath, onLogout, onShutdown }) {
	return (
		<aside
			className={cn(
				"relative hidden lg:flex lg:flex-col h-screen border-r border-border/50 bg-card/50 backdrop-blur-xl transition-all duration-300",
				collapsed ? "w-[72px]" : "w-[240px]"
			)}
		>
			<CollapseToggle collapsed={collapsed} onToggle={onToggle} />

			{/* Brand */}
			<div className="flex h-16 items-center px-4 border-b border-border/50">
				<SidebarBrand collapsed={collapsed} />
			</div>

			{/* Navigation */}
			<SidebarNav
				routes={routes}
				permissions={permissions}
				collapsed={collapsed}
				currentPath={currentPath}
			/>

			{/* Footer */}
			<SidebarFooter
				collapsed={collapsed}
				onLogout={onLogout}
				onShutdown={onShutdown}
			/>
		</aside>
	);
}

function MobileSidebar({ routes, permissions, currentPath, onLogout, onShutdown }) {
	return (
		<Sheet>
			<SheetTrigger asChild>
				<Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl lg:hidden">
					<Menu className="h-4 w-4" />
				</Button>
			</SheetTrigger>
			<SheetContent side="left" className="w-72 p-0 bg-card/95 backdrop-blur-xl">
				<div className="flex h-full flex-col">
					{/* Brand */}
					<div className="flex h-16 items-center px-4 border-b border-border/50">
						<SidebarBrand collapsed={false} />
					</div>

					{/* Navigation */}
					<SidebarNav
						routes={routes}
						permissions={permissions}
						collapsed={false}
						currentPath={currentPath}
					/>

					{/* Footer */}
					<SidebarFooter
						collapsed={false}
						onLogout={onLogout}
						onShutdown={onShutdown}
					/>
				</div>
			</SheetContent>
		</Sheet>
	);
}

// ============================================================================
// Main Layout
// ============================================================================

export function Layout({ children }) {
	const { user, logout } = useAuth();
	const permissions = useRolePermissions();
	const navigationRoutes = useNavigationRoutes();
	const location = useLocation();
	const isOnline = useOnlineStatus();
	const greeting = useGreeting(user?.username);

	const {
		notifications,
		dismissNotification,
		clearAllNotifications,
		handleViewOrder,
		isConnected,
		isConnecting,
	} = useNotificationManager();

	// Sidebar collapse state
	const [isCollapsed, setIsCollapsed] = useState(() => {
		try {
			return JSON.parse(localStorage.getItem("sidebar-collapsed")) ?? false;
		} catch {
			return false;
		}
	});

	// Theme state
	const [theme, setTheme] = useState(getInitialTheme);

	// POS hooks
	useSyncToCustomerDisplay();
	useCustomerTipListener();

	// Persist sidebar state
	useEffect(() => {
		localStorage.setItem("sidebar-collapsed", JSON.stringify(isCollapsed));
	}, [isCollapsed]);

	// Apply theme
	useEffect(() => {
		applyTheme(theme);
		localStorage.setItem("preferred-theme", theme);
	}, [theme]);

	const toggleTheme = useCallback(() => {
		setTheme((t) => (t === "dark" ? "light" : "dark"));
	}, []);

	const handleShutdown = useCallback(() => {
		window.electronAPI?.shutdown();
	}, []);

	return (
		<div className="flex h-screen overflow-hidden bg-background">
			{/* Desktop Sidebar */}
			<DesktopSidebar
				collapsed={isCollapsed}
				onToggle={() => setIsCollapsed(!isCollapsed)}
				routes={navigationRoutes}
				permissions={permissions}
				currentPath={location.pathname}
				onLogout={logout}
				onShutdown={handleShutdown}
			/>

			{/* Main Area */}
			<div className="flex flex-1 flex-col min-h-0">
				{/* Header */}
				<header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border/50 bg-background/80 px-4 backdrop-blur-sm">
					{/* Left side */}
					<div className="flex items-center gap-3">
						<MobileSidebar
							routes={navigationRoutes}
							permissions={permissions}
							currentPath={location.pathname}
							onLogout={logout}
							onShutdown={handleShutdown}
						/>
						<LiveClock />
					</div>

					{/* Right side */}
					<div className="flex items-center gap-2">
						<StatusPill
							isOnline={isOnline}
							isConnected={isConnected}
							isConnecting={isConnecting}
						/>
						<div className="h-4 w-px bg-border/50 mx-1" />
						<NotificationRetryButton />
						<ThemeToggle theme={theme} onToggle={toggleTheme} />
						<NotificationBell
							notifications={notifications}
							onDismiss={dismissNotification}
							onClearAll={clearAllNotifications}
							onViewOrder={handleViewOrder}
						/>
						<UserMenu
							user={user}
							greeting={greeting}
							onLogout={logout}
							onShutdown={handleShutdown}
						/>
					</div>
				</header>

				{/* Content */}
				<main className="flex-1 overflow-auto">{children}</main>
			</div>
		</div>
	);
}

Layout.propTypes = {
	children: PropTypes.node.isRequired,
};
