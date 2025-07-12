import React from "react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface DomainPageLayoutProps {
	// Page header props
	pageTitle?: string;
	pageDescription?: string;
	pageIcon?: LucideIcon;
	pageActions?: React.ReactNode;

	// Card header props
	title?: string;
	description?: string;
	headerActions?: React.ReactNode;

	// Search and filter props
	searchPlaceholder?: string;
	searchValue?: string;
	onSearchChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
	showSearch?: boolean;
	filterControls?: React.ReactNode;

	children: React.ReactNode;
	error?: string | null;
}

/**
 * Unified layout component for domain pages
 * Provides consistent structure, padding, card layout, and overflow handling
 */
export function DomainPageLayout({
	// Page header props
	pageTitle,
	pageDescription,
	pageIcon: Icon,
	pageActions,

	// Card header props
	title,
	description,
	headerActions,

	// Search and filter props
	searchPlaceholder = "Search...",
	searchValue = "",
	onSearchChange,
	showSearch = true,
	filterControls,

	children,
	error = null,
}: DomainPageLayoutProps) {
	if (error) {
		return <div className="p-4 text-red-500 text-center">{error}</div>;
	}

	return (
		<div className="flex flex-col h-full">
			{/* Optional Page Header */}
			{pageTitle && Icon && (
				<div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
					<div className="flex items-center gap-3">
						<div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
							<Icon className="h-5 w-5 text-slate-700 dark:text-slate-300" />
						</div>
						<div>
							<h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
								{pageTitle}
							</h1>
							{pageDescription && (
								<p className="text-slate-600 dark:text-slate-400 mt-1">
									{pageDescription}
								</p>
							)}
						</div>
					</div>
					{pageActions && <div>{pageActions}</div>}
				</div>
			)}

			{/* Main Content Area with proper height calculation */}
			<div className="flex-1 flex flex-col min-h-0 p-4 md:p-6">
				<Card className="flex flex-col h-full border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
					{/* Card Header - Fixed */}
					{(title || showSearch || filterControls) && (
						<CardHeader className="flex-shrink-0 pb-4">
							{(title || headerActions) && (
								<div className="flex justify-between items-center">
									<div>
										{title && (
											<CardTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
												{title}
											</CardTitle>
										)}
										{description && (
											<CardDescription className="text-slate-600 dark:text-slate-400">
												{description}
											</CardDescription>
										)}
									</div>
									{headerActions && (
										<div className="flex items-center gap-2">
											{headerActions}
										</div>
									)}
								</div>
							)}

							{/* Filter Controls */}
							{filterControls && (
								<div className="flex justify-between items-center mb-4">
									<div className="flex gap-2">{filterControls}</div>
								</div>
							)}

							{/* Search Bar */}
							{showSearch && onSearchChange && (
								<div className="relative max-w-md">
									<Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
									<Input
										placeholder={searchPlaceholder}
										value={searchValue}
										onChange={onSearchChange}
										className="pl-8 border-slate-200 dark:border-slate-700"
									/>
								</div>
							)}
						</CardHeader>
					)}

					{/* Scrollable Content Area */}
					<CardContent className="flex-1 min-h-0 p-0">
						<ScrollArea className="h-full">
							<div className="p-6 pb-8">{children}</div>
						</ScrollArea>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
