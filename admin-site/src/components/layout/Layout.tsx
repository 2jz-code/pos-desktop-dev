import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
	LogOut,
	PanelLeft,
	Menu,
	PanelLeftClose,
	PanelLeftOpen,
	Sun,
	Moon,
	Zap,
	Bell,
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
	const location = useLocation();
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

	const getCurrentPageTitle = () => {
		const route = navigationRoutes.find((r) => r.path === location.pathname);
		return route?.title || "Dashboard";
	};

	return (
		<div
			className={cn(
				"relative grid min-h-screen w-full overflow-hidden bg-gradient-to-br from-background via-background to-primary/[0.02] text-foreground transition-[grid-template-columns] duration-200 ease-out",
				isCollapsed ? "lg:grid-cols-[80px_1fr]" : "lg:grid-cols-[260px_1fr]"
			)}
		>
			{/* Subtle Background Pattern */}
			<div className="pointer-events-none fixed inset-0 z-0">
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(120,119,198,0.08),transparent_50%)] dark:bg-[radial-gradient(circle_at_30%_20%,rgba(120,119,198,0.12),transparent_50%)]" />
			</div>

			{/* Sidebar */}
			<aside className="relative z-10 hidden lg:block">
				<div
					className={cn(
						"fixed left-0 top-0 h-screen border-r border-border/40 backdrop-blur-xl transition-all duration-200",
						isCollapsed ? "w-[80px]" : "w-[260px]",
						"bg-gradient-to-b from-card/95 to-card/90"
					)}
				>
					<div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent dark:from-white/[0.02]" />

					<div className="relative flex h-full flex-col">
						{/* Logo */}
						<div className="flex h-16 items-center justify-center border-b border-border/30 px-5">
							<Link
								to="/"
								className="group flex items-center gap-3 transition-opacity hover:opacity-80"
							>
								<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/20 transition-transform duration-200 group-hover:scale-105">
									<Zap className="h-5 w-5 text-primary-foreground" />
								</div>
								{!isCollapsed && (
									<span className="text-base font-semibold text-foreground">
										Ajeen Admin
									</span>
								)}
							</Link>
						</div>

						{/* Navigation */}
						<div className="flex-1 overflow-auto px-3 py-5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border/20">
							<nav className="space-y-1">
								{navigationRoutes.map((route) => (
									<NavigationItem
										key={route.path}
										route={route}
										isCollapsed={isCollapsed}
									/>
								))}
							</nav>
						</div>

						{/* User Card & Logout */}
						<div className="border-t border-border/30 p-3">
							{!isCollapsed && (
								<div className="mb-3 rounded-lg border border-border/40 bg-muted/10 p-3">
									<div className="flex items-center gap-3">
										<div className="relative">
											<img
												className="h-9 w-9 rounded-full border-2 border-primary/30"
												src={`https://avatar.vercel.sh/${
													user?.username || user?.email || "user"
												}.png`}
												alt="Avatar"
											/>
											<div className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-success" />
										</div>
										<div className="flex-1 overflow-hidden">
											<p className="truncate text-sm font-medium text-foreground">
												{user?.username || user?.email}
											</p>
											<p className="truncate text-xs text-muted-foreground">
												{user?.role}
											</p>
										</div>
									</div>
								</div>
							)}
							<button
								onClick={logout}
								className={cn(
									"flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive",
									isCollapsed && "justify-center"
								)}
							>
								<LogOut className="h-4 w-4" />
								{!isCollapsed && <span>Logout</span>}
							</button>
						</div>
					</div>
				</div>
			</aside>

			{/* Main Content */}
			<div className="relative z-10 flex h-screen flex-col">
				{/* Header */}
				<header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-border/40 bg-card/80 px-6 backdrop-blur-xl transition-all duration-150">
					{/* Sidebar Toggle */}
					<Button
						variant="outline"
						size="icon"
						onClick={() => setIsCollapsed(!isCollapsed)}
						className="hidden h-9 w-9 border-border/40 bg-background/50 transition-all duration-150 hover:bg-accent lg:inline-flex"
					>
						{isCollapsed ? (
							<PanelLeftOpen className="h-4 w-4" />
						) : (
							<PanelLeftClose className="h-4 w-4" />
						)}
					</Button>

					{/* Page Title */}
					<div className="hidden items-center gap-3 lg:flex">
						<div className="h-6 w-px bg-border/40" />
						<h2 className="text-sm font-semibold text-foreground">
							{getCurrentPageTitle()}
						</h2>
					</div>

					{/* Mobile Menu */}
					<Sheet>
						<SheetTrigger asChild>
							<Button
								variant="outline"
								size="icon"
								className="h-9 w-9 border-border/40 bg-background/50 lg:hidden"
							>
								<Menu className="h-4 w-4" />
							</Button>
						</SheetTrigger>
						<SheetContent
							side="left"
							className="flex flex-col gap-6 bg-card"
						>
							<nav className="grid gap-2">
								<Link
									to="/dashboard"
									className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2"
								>
									<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80">
										<Zap className="h-5 w-5 text-primary-foreground" />
									</div>
									<span className="font-semibold">Ajeen Admin</span>
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
							<div className="mt-auto border-t pt-4">
								<button
									onClick={logout}
									className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-destructive/10 hover:text-destructive"
								>
									<LogOut className="h-4 w-4" />
									<span>Logout</span>
								</button>
							</div>
						</SheetContent>
					</Sheet>

					<div className="flex-1" />

					{/* Actions */}
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="icon"
							className="relative h-9 w-9 border-border/40 bg-background/50 transition-all duration-150 hover:bg-accent"
						>
							<Bell className="h-4 w-4" />
							<span className="absolute right-1 top-1 flex h-2 w-2">
								<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
								<span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
							</span>
						</Button>

						<Button
							variant="outline"
							size="icon"
							onClick={toggleTheme}
							className="h-9 w-9 border-border/40 bg-background/50 transition-all duration-150 hover:bg-accent"
						>
							{theme === "dark" ? (
								<Sun className="h-4 w-4" />
							) : (
								<Moon className="h-4 w-4" />
							)}
						</Button>
					</div>

					{/* User Menu */}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="h-9 w-9 rounded-full"
							>
								<img
									className="h-8 w-8 rounded-full border-2 border-primary/30"
									src={`https://avatar.vercel.sh/${
										user?.username || user?.email || "user"
									}.png`}
									alt="Avatar"
								/>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							className="w-56 border border-border/40"
						>
							<DropdownMenuLabel>
								<div className="flex flex-col space-y-1">
									<p className="text-sm font-medium">
										{user?.username || "User"}
									</p>
									<p className="text-xs text-muted-foreground">
										{user?.email}
									</p>
								</div>
							</DropdownMenuLabel>
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

				{/* Main */}
				<main className="flex-1 overflow-y-auto">
					{children}
				</main>
			</div>
		</div>
	);
}