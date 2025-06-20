import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useRolePermissions } from "@/hooks/useRolePermissions";
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
	CreditCard, // Using CreditCard for Payments
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
import PropTypes from "prop-types";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useSyncToCustomerDisplay } from "../store/useSyncToCustomerDisplay";
import { useCustomerTipListener } from "../store/useCustomerTipListener";

//eslint-disable-next-line
function NavLink({ to, icon: Icon, children, isCollapsed }) {
	const location = useLocation();
	const isActive = location.pathname.startsWith(to) && to !== "/";
	const isDashboard = location.pathname === "/" && to === "/";

	return (
		<Link
			to={to}
			className={cn(
				"flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-foreground",
				(isActive || isDashboard) && "bg-muted text-foreground",
				isCollapsed && "justify-center"
			)}
		>
			<Icon className="h-4 w-4" />
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

	useSyncToCustomerDisplay();
	useCustomerTipListener();

	useEffect(() => {
		localStorage.setItem("sidebar-collapsed", JSON.stringify(isCollapsed));
	}, [isCollapsed]);

	return (
		<div
			className={cn(
				"grid min-h-screen w-full transition-[grid-template-columns] duration-300 ease-in-out",
				isCollapsed ? "lg:grid-cols-[80px_1fr]" : "lg:grid-cols-[280px_1fr]"
			)}
		>
			<div className="hidden border-r bg-card/50 lg:block">
				<div className="flex h-full max-h-screen flex-col">
					<div className="flex h-[60px] items-center border-b px-4">
						<Link
							to="/"
							className="flex items-center gap-2 font-semibold"
						>
							<PanelLeft className="h-6 w-6 text-primary" />
							{!isCollapsed && <span>Ajeen POS</span>}
						</Link>
					</div>
					<div className="flex-1 overflow-auto py-2">
						<nav className="grid items-start px-4 text-sm font-medium">
							{/* Dashboard - accessible to all authenticated users */}
							<NavLink
								to="/"
								icon={Home}
								isCollapsed={isCollapsed}
							>
								Dashboard
							</NavLink>

							{/* POS - accessible to all authenticated users */}
							<NavLink
								to="/pos"
								icon={ShoppingCart}
								isCollapsed={isCollapsed}
							>
								POS
							</NavLink>

							{/* Orders - accessible to all (cashiers need to resume held orders) */}
							<NavLink
								to="/orders"
								icon={ClipboardList}
								isCollapsed={isCollapsed}
							>
								Orders
							</NavLink>

							{/* Payments - managers/owners only */}
							{permissions.canAccessPayments() && (
								<NavLink
									to="/payments"
									icon={CreditCard}
									isCollapsed={isCollapsed}
								>
									Payments
								</NavLink>
							)}

							{/* Users - managers/owners only */}
							{permissions.canAccessUsers() && (
								<NavLink
									to="/users"
									icon={Users}
									isCollapsed={isCollapsed}
								>
									Users
								</NavLink>
							)}

							{/* Products - accessible to all (cashiers need to view products) */}
							<NavLink
								to="/products"
								icon={Package}
								isCollapsed={isCollapsed}
							>
								Products
							</NavLink>

							{/* Discounts - managers/owners only */}
							{permissions.canAccessDiscounts() && (
								<NavLink
									to="/discounts"
									icon={Percent}
									isCollapsed={isCollapsed}
								>
									Discounts
								</NavLink>
							)}

							{/* Settings - all users (with restrictions inside) */}
							<NavLink
								to="/settings"
								icon={Settings}
								isCollapsed={isCollapsed}
							>
								Settings
							</NavLink>
						</nav>
					</div>
					<div className="mt-auto border-t p-4">
						<button
							onClick={logout}
							className={cn(
								"flex w-full items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-foreground",
								isCollapsed && "justify-center"
							)}
						>
							<LogOut className="h-4 w-4" />
							{!isCollapsed && <span className="truncate">Logout</span>}
						</button>
					</div>
				</div>
			</div>
			<div className="flex flex-col h-screen">
				<header className="flex h-14 lg:h-[60px] items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 sticky top-0 z-30">
					<Button
						variant="outline"
						size="icon"
						className="hidden lg:inline-flex"
						onClick={() => setIsCollapsed(!isCollapsed)}
					>
						{isCollapsed ? (
							<PanelLeftOpen className="h-5 w-5" />
						) : (
							<PanelLeftClose className="h-5 w-5" />
						)}
						<span className="sr-only">Toggle sidebar</span>
					</Button>
					<Sheet>
						<SheetTrigger asChild>
							<Button
								variant="outline"
								size="icon"
								className="shrink-0 lg:hidden"
							>
								<Menu className="h-5 w-5" />
								<span className="sr-only">Toggle navigation menu</span>
							</Button>
						</SheetTrigger>
						<SheetContent
							side="left"
							className="flex flex-col"
						>
							<nav className="grid gap-2 text-lg font-medium">
								<Link
									to="/"
									className="flex items-center gap-2 text-lg font-semibold mb-4"
								>
									<PanelLeft className="h-6 w-6" />
									<span>Ajeen POS</span>
								</Link>

								{/* Dashboard - accessible to all authenticated users */}
								<NavLink
									to="/"
									icon={Home}
									isCollapsed={false}
								>
									Dashboard
								</NavLink>

								{/* POS - accessible to all authenticated users */}
								<NavLink
									to="/pos"
									icon={ShoppingCart}
									isCollapsed={false}
								>
									POS
								</NavLink>

								{/* Orders - accessible to all (cashiers need to resume held orders) */}
								<NavLink
									to="/orders"
									icon={ClipboardList}
									isCollapsed={false}
								>
									Orders
								</NavLink>

								{/* Payments - managers/owners only */}
								{permissions.canAccessPayments() && (
									<NavLink
										to="/payments"
										icon={CreditCard}
										isCollapsed={false}
									>
										Payments
									</NavLink>
								)}

								{/* Users - managers/owners only */}
								{permissions.canAccessUsers() && (
									<NavLink
										to="/users"
										icon={Users}
										isCollapsed={false}
									>
										Users
									</NavLink>
								)}

								{/* Products - accessible to all (cashiers need to view products) */}
								<NavLink
									to="/products"
									icon={Package}
									isCollapsed={false}
								>
									Products
								</NavLink>

								{/* Discounts - managers/owners only */}
								{permissions.canAccessDiscounts() && (
									<NavLink
										to="/discounts"
										icon={Percent}
										isCollapsed={false}
									>
										Discounts
									</NavLink>
								)}

								{/* Settings - all users (with restrictions inside) */}
								<NavLink
									to="/settings"
									icon={Settings}
									isCollapsed={false}
								>
									Settings
								</NavLink>
							</nav>
							<div className="mt-auto">
								<button
									onClick={logout}
									className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-foreground"
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
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="rounded-full"
							>
								<div className="relative flex-shrink-0">
									<img
										className="h-8 w-8 rounded-full"
										src={`https://avatar.vercel.sh/${user?.username}.png`}
										alt="Avatar"
									/>
								</div>
								<span className="sr-only">Toggle user menu</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel>My Account</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuItem>Settings</DropdownMenuItem>
							<DropdownMenuItem>Support</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={logout}>
								<LogOut className="mr-2 h-4 w-4" />
								<span>Logout</span>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</header>
				<main className="flex flex-1 flex-col bg-muted/40 overflow-hidden">
					{children}
				</main>
			</div>
		</div>
	);
}

Layout.propTypes = {
	children: PropTypes.node.isRequired,
};
