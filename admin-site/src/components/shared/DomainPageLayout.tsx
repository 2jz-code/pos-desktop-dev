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
		return <div className="p-4 text-destructive text-center">{error}</div>;
	}

	return (
		<div className="flex flex-col h-full">
			{/* Optional Page Header */}
			{pageTitle && Icon && (
				<div className="flex items-center justify-between border-b border-border/60 bg-card/80 p-6 flex-shrink-0 backdrop-blur">
					<div className="flex items-center gap-3">
						<div className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-inset ring-primary/30">
							<Icon className="h-5 w-5" />
						</div>
						<div>
							<h1 className="text-2xl font-semibold text-foreground">
								{pageTitle}
							</h1>
							{pageDescription && (
								<p className="text-muted-foreground mt-1 text-sm leading-relaxed">
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
				<Card className="flex flex-col h-full border-border/60 bg-card/80 shadow-sm">
					{/* Card Header - Fixed */}
					{(title || showSearch || filterControls) && (
						<CardHeader className="flex-shrink-0 pb-4">
							{(title || headerActions) && (
								<div className="flex justify-between items-center">
									<div>
										{title && (
											<CardTitle className="text-lg font-semibold text-foreground">
												{title}
											</CardTitle>
										)}
										{description && (
											<CardDescription className="text-muted-foreground">
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
								<div className="mb-4">
									{filterControls}
								</div>
							)}

							{/* Search Bar */}
							{showSearch && onSearchChange && (
								<div className="relative max-w-md">
									<Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
									<Input
										placeholder={searchPlaceholder}
										value={searchValue}
										onChange={onSearchChange}
										className="pl-8 border-border/60 bg-transparent"
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
