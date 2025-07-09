"use client";

import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useRolePermissions } from "@/shared/hooks/useRolePermissions";
import {
	Home,
	Users,
	LogOut,
	PanelLeft,
	Menu,
	PanelLeftClose,
	PanelLeftOpen,
	Package,
	ShoppingCart,
	ClipboardList,
	Percent,
	Settings,
	CreditCard,
	Warehouse,
	Bell,
	Wifi,
	WifiOff,
	Power,
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
import { useState, useEffect } from "react";
import { cn } from "@/shared/lib/utils";
import {
	useSyncToCustomerDisplay,
	useCustomerTipListener,
} from "@/domains/pos";
import { useNotificationManager } from "@/shared/hooks/useNotificationManager";
import WebOrderNotification from "@/shared/components/notifications/WebOrderNotification";

//eslint-disable-next-line
function NavLink({ to, icon: Icon, children, isCollapsed }) {
	const location = useLocation();
	const isActive = location.pathname.startsWith(to) && to !== "/";
	const isDashboard = location.pathname === "/" && to === "/";

	return (
		<Link
			to={to}
			className={cn(
				"flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800",
				(isActive || isDashboard) &&
					"bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium",
				isCollapsed && "justify-center px-2"
			)}
		>
			<Icon className="h-4 w-4 flex-shrink-0" />
			{!isCollapsed && <span className="truncate">{children}</span>}
		</Link>
	);
}

NavLink.propTypes = {
	to: PropTypes.string.isRequired,
	icon: PropTypes.elementType.isRequired,
	children: PropTypes.node.isRequired,
	isCollapsed: PropTypes.bool.isRequired,
};

export function Layout({ children }) {
	const { user, logout } = useAuth();
	const permissions = useRolePermissions();
	const [isCollapsed, setIsCollapsed] = useState(
		JSON.parse(localStorage.getItem("sidebar-collapsed")) || false
	);

	// Initialize notification system
	const {
		notifications,
		// connectionStatus, // Available for future debugging/logging
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

	return (
		<div
			className={cn(
				"grid min-h-screen w-full transition-[grid-template-columns] duration-300 ease-in-out bg-slate-50 dark:bg-slate-900",
				isCollapsed ? "lg:grid-cols-[80px_1fr]" : "lg:grid-cols-[280px_1fr]"
			)}
		>
			{/* Desktop Sidebar */}
			<div className="hidden border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 lg:block">
				<div className="flex h-full max-h-screen flex-col">
					{/* Logo/Brand */}
					<div className="flex h-[60px] items-center border-b border-slate-200 dark:border-slate-700 px-4">
						<Link
							to="/"
							className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100"
						>
							<div className="p-1.5 bg-slate-900 dark:bg-slate-100 rounded-lg">
								<PanelLeft className="h-4 w-4 text-white dark:text-slate-900" />
							</div>
							{!isCollapsed && <span>Ajeen POS</span>}
						</Link>
					</div>

					{/* Navigation */}
					<div className="flex-1 overflow-auto py-4">
						<nav className="grid items-start px-3 text-sm font-medium gap-1">
							<NavLink
								to="/"
								icon={Home}
								isCollapsed={isCollapsed}
							>
								Dashboard
							</NavLink>
							<NavLink
								to="/pos"
								icon={ShoppingCart}
								isCollapsed={isCollapsed}
							>
								POS
							</NavLink>
							<NavLink
								to="/orders"
								icon={ClipboardList}
								isCollapsed={isCollapsed}
							>
								Orders
							</NavLink>
							{permissions.canAccessPayments() && (
								<NavLink
									to="/payments"
									icon={CreditCard}
									isCollapsed={isCollapsed}
								>
									Payments
								</NavLink>
							)}
							{permissions.canAccessUsers() && (
								<NavLink
									to="/users"
									icon={Users}
									isCollapsed={isCollapsed}
								>
									Users
								</NavLink>
							)}
							<NavLink
								to="/products"
								icon={Package}
								isCollapsed={isCollapsed}
							>
								Products
							</NavLink>
							{permissions.canAccessProducts() && (
								<NavLink
									to="/inventory"
									icon={Warehouse}
									isCollapsed={isCollapsed}
								>
									Inventory
								</NavLink>
							)}
							{permissions.canAccessDiscounts() && (
								<NavLink
									to="/discounts"
									icon={Percent}
									isCollapsed={isCollapsed}
								>
									Discounts
								</NavLink>
							)}
							<NavLink
								to="/settings"
								icon={Settings}
								isCollapsed={isCollapsed}
							>
								Settings
							</NavLink>
						</nav>
					</div>

					{/* Logout */}
					<div className="border-t border-slate-200 dark:border-slate-700 p-3 mt-auto">
						<button
							onClick={logout}
							className={cn(
								"flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800",
								isCollapsed && "justify-center px-2"
							)}
						>
							<LogOut className="h-4 w-4 flex-shrink-0" />
							{!isCollapsed && <span className="truncate">Logout</span>}
						</button>
						<button
							onClick={() => window.electronAPI.shutdown()}
							className={cn(
								"flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-red-500 dark:text-red-400 transition-all hover:text-red-700 dark:hover:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 mt-1",
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
			<div className="flex flex-col h-screen">
				{/* Top Header */}
				<header className="flex h-14 lg:h-[60px] items-center gap-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 sticky top-0 z-30">
					{/* Desktop Sidebar Toggle */}
					<Button
						variant="outline"
						size="icon"
						className="hidden lg:inline-flex border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 bg-transparent"
						onClick={() => setIsCollapsed(!isCollapsed)}
					>
						{isCollapsed ? (
							<PanelLeftOpen className="h-4 w-4" />
						) : (
							<PanelLeftClose className="h-4 w-4" />
						)}
						<span className="sr-only">Toggle sidebar</span>
					</Button>

					{/* Mobile Menu */}
					<Sheet>
						<SheetTrigger asChild>
							<Button
								variant="outline"
								size="icon"
								className="shrink-0 lg:hidden border-slate-200 dark:border-slate-700 bg-transparent"
							>
								<Menu className="h-4 w-4" />
								<span className="sr-only">Toggle navigation menu</span>
							</Button>
						</SheetTrigger>
						<SheetContent
							side="left"
							className="flex flex-col bg-white dark:bg-slate-900"
						>
							<nav className="grid gap-2 text-lg font-medium">
								<Link
									to="/"
									className="flex items-center gap-2 text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100"
								>
									<div className="p-1.5 bg-slate-900 dark:bg-slate-100 rounded-lg">
										<PanelLeft className="h-4 w-4 text-white dark:text-slate-900" />
									</div>
									<span>Ajeen POS</span>
								</Link>

								<NavLink
									to="/"
									icon={Home}
									isCollapsed={false}
								>
									Dashboard
								</NavLink>
								<NavLink
									to="/pos"
									icon={ShoppingCart}
									isCollapsed={false}
								>
									POS
								</NavLink>
								<NavLink
									to="/orders"
									icon={ClipboardList}
									isCollapsed={false}
								>
									Orders
								</NavLink>
								{permissions.canAccessPayments() && (
									<NavLink
										to="/payments"
										icon={CreditCard}
										isCollapsed={false}
									>
										Payments
									</NavLink>
								)}
								{permissions.canAccessUsers() && (
									<NavLink
										to="/users"
										icon={Users}
										isCollapsed={false}
									>
										Users
									</NavLink>
								)}
								<NavLink
									to="/products"
									icon={Package}
									isCollapsed={false}
								>
									Products
								</NavLink>
								{permissions.canAccessProducts() && (
									<NavLink
										to="/inventory"
										icon={Warehouse}
										isCollapsed={false}
									>
										Inventory
									</NavLink>
								)}
								{permissions.canAccessDiscounts() && (
									<NavLink
										to="/discounts"
										icon={Percent}
										isCollapsed={false}
									>
										Discounts
									</NavLink>
								)}
								<NavLink
									to="/settings"
									icon={Settings}
									isCollapsed={false}
								>
									Settings
								</NavLink>
							</nav>
							<div className="mt-auto p-4">
								<button
									onClick={logout}
									className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-slate-600 dark:text-slate-400 transition-all hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
								>
									<LogOut className="h-4 w-4" />
									<span className="truncate">Logout</span>
								</button>
								<button
									onClick={() => window.electronAPI.shutdown()}
									className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-red-500 dark:text-red-400 transition-all hover:text-red-700 dark:hover:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 mt-1"
								>
									<Power className="h-4 w-4" />
									<span className="truncate">Shutdown</span>
								</button>
							</div>
						</SheetContent>
					</Sheet>

					<div className="w-full flex-1">
						{/* Search bar can be added here */}
					</div>

					{/* Notification & Connection Status */}
					<div className="flex items-center gap-2">
						{/* Connection Status Indicator */}
						<Tooltip>
							<TooltipTrigger asChild>
								<div className="flex items-center">
									{isConnected ? (
										<Wifi className="h-4 w-4 text-green-600 dark:text-green-400" />
									) : isConnecting ? (
										<Wifi className="h-4 w-4 text-yellow-600 dark:text-yellow-400 animate-pulse" />
									) : (
										<WifiOff className="h-4 w-4 text-red-600 dark:text-red-400" />
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

						{/* Notification Bell */}
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="outline"
									size="icon"
									className="relative border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 bg-transparent"
								>
									<Bell className="h-4 w-4" />
									{notifications.length > 0 && (
										<Badge className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs">
											{notifications.length}
										</Badge>
									)}
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								className="w-[350px]"
							>
								<DropdownMenuLabel className="flex justify-between items-center">
									<span>Web Order Notifications</span>
									{notifications.length > 0 && (
										<Button
											variant="ghost"
											size="sm"
											onClick={clearAllNotifications}
											className="h-auto px-2 py-1 text-xs"
										>
											Clear All
										</Button>
									)}
								</DropdownMenuLabel>
								<DropdownMenuSeparator />
								{notifications.length > 0 ? (
									<div className="max-h-[400px] overflow-y-auto">
										{notifications.map((notification) => (
											<DropdownMenuItem
												key={notification.id}
												className="p-0"
												onSelect={(e) => e.preventDefault()}
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
									<div className="p-4 text-sm text-center text-slate-500">
										No new notifications
									</div>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>

					{/* User Menu */}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
							>
								<div className="relative flex-shrink-0">
									<img
										className="h-8 w-8 rounded-full border border-slate-200 dark:border-slate-700"
										src={`https://avatar.vercel.sh/${user?.username}.png`}
										alt="Avatar"
									/>
								</div>
								<span className="sr-only">Toggle user menu</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
						>
							<DropdownMenuLabel className="text-slate-900 dark:text-slate-100">
								My Account
							</DropdownMenuLabel>
							<DropdownMenuSeparator className="bg-slate-200 dark:bg-slate-700" />
							<DropdownMenuItem className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
								Settings
							</DropdownMenuItem>
							<DropdownMenuItem className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
								Support
							</DropdownMenuItem>
							<DropdownMenuSeparator className="bg-slate-200 dark:bg-slate-700" />
							<DropdownMenuItem
								onClick={logout}
								className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
							>
								<LogOut className="mr-2 h-4 w-4" />
								<span>Logout</span>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</header>

				{/* Main Content */}
				<main className="flex flex-1 flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden">
					{children}
				</main>
			</div>
		</div>
	);
}


Layout.propTypes = {
	children: PropTypes.node.isRequired,
};
