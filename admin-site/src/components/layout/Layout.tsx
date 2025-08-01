import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
	Home,
	Users,
	LogOut,
	PanelLeft,
	Menu,
	PanelLeftClose,
	PanelLeftOpen,
	Package,
	ClipboardList,
	Percent,
	Settings,
	CreditCard,
	Warehouse,
	FileText,
	Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface NavLinkProps {
	to: string;
	icon: React.ComponentType<{ className?: string }>;
	children: React.ReactNode;
	isCollapsed: boolean;
}

function NavLink({ to, icon: Icon, children, isCollapsed }: NavLinkProps) {
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

interface LayoutProps {
	children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
	const { user, logout } = useAuth();
	const [isCollapsed, setIsCollapsed] = useState(
		JSON.parse(localStorage.getItem("sidebar-collapsed") || "false")
	);

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
							{!isCollapsed && <span>Ajeen Admin</span>}
						</Link>
					</div>

					{/* Navigation */}
					<div className="flex-1 overflow-auto py-4">
						<nav className="grid items-start px-3 text-sm font-medium gap-1">
							<NavLink
								to="/dashboard"
								icon={Home}
								isCollapsed={isCollapsed}
							>
								Dashboard
							</NavLink>
							<NavLink
								to="/orders"
								icon={ClipboardList}
								isCollapsed={isCollapsed}
							>
								Orders
							</NavLink>
							<NavLink
								to="/payments"
								icon={CreditCard}
								isCollapsed={isCollapsed}
							>
								Payments
							</NavLink>
							<NavLink
								to="/users"
								icon={Users}
								isCollapsed={isCollapsed}
							>
								Users
							</NavLink>
							<NavLink
								to="/products"
								icon={Package}
								isCollapsed={isCollapsed}
							>
								Products
							</NavLink>
							<NavLink
								to="/inventory"
								icon={Warehouse}
								isCollapsed={isCollapsed}
							>
								Inventory
							</NavLink>
							<NavLink
								to="/discounts"
								icon={Percent}
								isCollapsed={isCollapsed}
							>
								Discounts
							</NavLink>
							<NavLink
								to="/reports"
								icon={FileText}
								isCollapsed={isCollapsed}
							>
								Reports
							</NavLink>
							<NavLink
								to="/audit"
								icon={Shield}
								isCollapsed={isCollapsed}
							>
								Audit
							</NavLink>
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
									to="/dashboard"
									className="flex items-center gap-2 text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100"
								>
									<div className="p-1.5 bg-slate-900 dark:bg-slate-100 rounded-lg">
										<PanelLeft className="h-4 w-4 text-white dark:text-slate-900" />
									</div>
									<span>Ajeen Admin</span>
								</Link>

								<NavLink
									to="/dashboard"
									icon={Home}
									isCollapsed={false}
								>
									Dashboard
								</NavLink>
								<NavLink
									to="/orders"
									icon={ClipboardList}
									isCollapsed={false}
								>
									Orders
								</NavLink>
								<NavLink
									to="/payments"
									icon={CreditCard}
									isCollapsed={false}
								>
									Payments
								</NavLink>
								<NavLink
									to="/users"
									icon={Users}
									isCollapsed={false}
								>
									Users
								</NavLink>
								<NavLink
									to="/products"
									icon={Package}
									isCollapsed={false}
								>
									Products
								</NavLink>
								<NavLink
									to="/inventory"
									icon={Warehouse}
									isCollapsed={false}
								>
									Inventory
								</NavLink>
								<NavLink
									to="/discounts"
									icon={Percent}
									isCollapsed={false}
								>
									Discounts
								</NavLink>
								<NavLink
									to="/reports"
									icon={FileText}
									isCollapsed={false}
								>
									Reports
								</NavLink>
								<NavLink
									to="/audit"
									icon={Shield}
									isCollapsed={false}
								>
									Audit
								</NavLink>
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
							</div>
						</SheetContent>
					</Sheet>

					<div className="w-full flex-1">
						{/* Search bar can be added here */}
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
										src={`https://avatar.vercel.sh/${
											user?.username || user?.email || "user"
										}.png`}
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
							<DropdownMenuLabel
								inset={false}
								className="text-slate-900 dark:text-slate-100"
							>
								My Account
							</DropdownMenuLabel>
							<DropdownMenuSeparator className="bg-slate-200 dark:bg-slate-700" />
							<DropdownMenuItem
								inset={false}
								className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
							>
								Settings
							</DropdownMenuItem>
							<DropdownMenuItem
								inset={false}
								className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
							>
								Support
							</DropdownMenuItem>
							<DropdownMenuSeparator className="bg-slate-200 dark:bg-slate-700" />
							<DropdownMenuItem
								inset={false}
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
