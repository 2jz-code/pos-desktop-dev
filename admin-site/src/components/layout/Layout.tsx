import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
	LogOut,
	PanelLeft,
	Menu,
	PanelLeftClose,
	PanelLeftOpen,
	Sun,
	Moon,
} from "lucide-react";
import { useNavigationRoutes } from "@/hooks/useNavigationRoutes";
import { NavigationItem } from "@/components/navigation/NavigationItem";
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
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

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

const applyThemePreference = (theme: string) => {
	if (typeof document === "undefined") {
		return;
	}

	const root = document.documentElement;
	root.classList.toggle("dark", theme === "dark");
	root.dataset.theme = theme;
};

interface LayoutProps {
	children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
	const { user, logout } = useAuth();
	const navigationRoutes = useNavigationRoutes();
	const [isCollapsed, setIsCollapsed] = useState(
		JSON.parse(localStorage.getItem("sidebar-collapsed") || "false")
	);
	const [theme, setTheme] = useState(() => resolveInitialTheme());

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
				"grid min-h-screen w-full transition-[grid-template-columns] duration-300 ease-in-out bg-background",
				isCollapsed ? "lg:grid-cols-[80px_1fr]" : "lg:grid-cols-[280px_1fr]"
			)}
		>
			{/* Desktop Sidebar */}
			<div className="hidden border-r border-border bg-card lg:block">
				<div className="flex h-full max-h-screen flex-col">
					{/* Logo/Brand */}
					<div className="flex h-[60px] items-center border-b border-border px-4">
						<Link
							to="/"
							className="flex items-center gap-2 font-semibold text-card-foreground"
						>
							<div className="p-1.5 bg-primary rounded-lg">
								<PanelLeft className="h-4 w-4 text-primary-foreground" />
							</div>
							{!isCollapsed && <span>Ajeen Admin</span>}
						</Link>
					</div>

					{/* Navigation */}
					<div className="flex-1 overflow-auto py-4">
						<nav className="grid items-start px-3 text-sm font-medium gap-1">
							{navigationRoutes.map((route) => (
								<NavigationItem
									key={route.path}
									route={route}
									isCollapsed={isCollapsed}
								/>
							))}
						</nav>
					</div>

					{/* Logout */}
					<div className="border-t border-border p-3 mt-auto">
						<button
							onClick={logout}
							className={cn(
								"flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-muted-foreground transition-all hover:text-foreground hover:bg-accent",
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
				<header className="flex h-14 lg:h-[60px] items-center gap-4 border-b border-border bg-card px-6 sticky top-0 z-30">
					{/* Desktop Sidebar Toggle */}
					<Button
						variant="outline"
						size="icon"
						className="hidden lg:inline-flex border-border hover:bg-accent bg-transparent"
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
								className="shrink-0 lg:hidden border-border bg-transparent"
							>
								<Menu className="h-4 w-4" />
								<span className="sr-only">Toggle navigation menu</span>
							</Button>
						</SheetTrigger>
						<SheetContent
							side="left"
							className="flex flex-col bg-card"
						>
							<nav className="grid gap-2 text-lg font-medium">
								<Link
									to="/dashboard"
									className="flex items-center gap-2 text-lg font-semibold mb-4 text-card-foreground"
								>
									<div className="p-1.5 bg-primary rounded-lg">
										<PanelLeft className="h-4 w-4 text-primary-foreground" />
									</div>
									<span>Ajeen Admin</span>
								</Link>

								{navigationRoutes.map((route) => (
									<NavigationItem
										key={route.path}
										route={route}
										isCollapsed={false}
										isMobile={true}
									/>
								))}
							</nav>
							<div className="mt-auto p-4">
								<button
									onClick={logout}
									className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-muted-foreground transition-all hover:text-foreground hover:bg-accent"
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

					{/* Theme Toggle */}
					<Button
						variant="outline"
						size="icon"
						onClick={toggleTheme}
						className="border-border hover:bg-accent"
					>
						{theme === "dark" ? (
							<Sun className="h-4 w-4" />
						) : (
							<Moon className="h-4 w-4" />
						)}
						<span className="sr-only">Toggle color theme</span>
					</Button>

					{/* User Menu */}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="rounded-full hover:bg-accent"
							>
								<div className="relative flex-shrink-0">
									<img
										className="h-8 w-8 rounded-full border border-border"
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
							className="bg-popover border-border"
						>
							<DropdownMenuLabel
								inset={false}
								className="text-popover-foreground"
							>
								My Account
							</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								inset={false}
								className="text-muted-foreground hover:bg-accent hover:text-accent-foreground"
							>
								Settings
							</DropdownMenuItem>
							<DropdownMenuItem
								inset={false}
								className="text-muted-foreground hover:bg-accent hover:text-accent-foreground"
							>
								Support
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								inset={false}
								onClick={logout}
								className="text-muted-foreground hover:bg-accent hover:text-accent-foreground"
							>
								<LogOut className="mr-2 h-4 w-4" />
								<span>Logout</span>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</header>

				{/* Main Content */}
				<main className="flex flex-1 flex-col bg-background overflow-hidden">
					{children}
				</main>
			</div>
		</div>
	);
}
