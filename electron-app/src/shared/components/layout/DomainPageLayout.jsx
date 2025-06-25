import React from "react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/shared/components/ui/card";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Input } from "@/shared/components/ui/input";
import { Search } from "lucide-react";
import PropTypes from "prop-types";

/**
 * Unified layout component for domain pages
 * Provides consistent structure, padding, card layout, and overflow handling
 */
export function DomainPageLayout({
	title,
	description,
	headerActions,
	searchPlaceholder = "Search...",
	searchValue = "",
	onSearchChange,
	showSearch = true,
	filterControls,
	children,
	error = null,
}) {
	if (error) {
		return <div className="p-4 text-red-500 text-center">{error}</div>;
	}

	return (
		<div className="p-4 md:p-8 pb-16">
			<Card className="max-h-[calc(100vh-8rem)]">
				<CardHeader>
					<div className="flex justify-between items-center">
						<div>
							<CardTitle>{title}</CardTitle>
							{description && <CardDescription>{description}</CardDescription>}
						</div>
						{headerActions && (
							<div className="flex items-center gap-2">{headerActions}</div>
						)}
					</div>

					{/* Filter Controls */}
					{filterControls && (
						<div className="flex justify-between items-center mb-4">
							<div className="flex gap-2">{filterControls}</div>
						</div>
					)}

					{/* Search Bar */}
					{showSearch && (
						<div className="relative max-w-md">
							<Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								placeholder={searchPlaceholder}
								value={searchValue}
								onChange={onSearchChange}
								className="pl-8"
							/>
						</div>
					)}
				</CardHeader>

				<CardContent>
					<ScrollArea className="h-[calc(100vh-20rem)]">{children}</ScrollArea>
				</CardContent>
			</Card>
		</div>
	);
}

DomainPageLayout.propTypes = {
	title: PropTypes.string.isRequired,
	description: PropTypes.string,
	headerActions: PropTypes.node,
	searchPlaceholder: PropTypes.string,
	searchValue: PropTypes.string,
	onSearchChange: PropTypes.func,
	showSearch: PropTypes.bool,
	filterControls: PropTypes.node,
	children: PropTypes.node.isRequired,
	error: PropTypes.string,
};

export default DomainPageLayout;
