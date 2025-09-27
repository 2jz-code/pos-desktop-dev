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
							{!isCollapsed && <span>Ajeen Admin</span>}
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
					</div>
				</div>
			</div>

			{/* Main Content Area */}
			<div className="flex h-screen flex-col">
				{/* Top Header */}
				<header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-card/80 px-4 shadow-xs backdrop-blur lg:h-[60px] lg:px-6">
					{/* Desktop Sidebar Toggle */}
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

					{/* Mobile Menu */}
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
									to="/dashboard"
									className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sidebar-foreground hover:bg-sidebar-accent/60"
								>
									<div className="rounded-lg bg-primary/20 p-1.5 text-primary ring-1 ring-inset ring-primary/40">
										<PanelLeft className="h-4 w-4" />
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
							<div className="mt-auto space-y-2 border-t border-sidebar-border/70 pt-4">
								<button
									onClick={logout}
									className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
								>
									<LogOut className="h-4 w-4" />
									<span className="truncate">Logout</span>
								</button>
							</div>
						</SheetContent>
					</Sheet>

					<div className="flex-1" />

					{/* Theme Toggle */}
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

					{/* User Menu */}
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
							className="border border-border/60 bg-card text-card-foreground"
						>
							<DropdownMenuLabel className="text-sm font-medium text-foreground">
								My Account
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

				{/* Main Content */}
				<main className="flex flex-1 flex-col overflow-y-auto bg-background">
					{children}
				</main>
			</div>
		</div>
	);
}
