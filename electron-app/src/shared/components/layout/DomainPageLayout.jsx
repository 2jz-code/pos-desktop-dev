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
import { PageHeader } from "./PageHeader";

/**
 * Unified layout component for domain pages
 * Provides consistent structure, padding, card layout, and overflow handling
 */
export function DomainPageLayout({
	// Page header props
	pageTitle,
	pageDescription,
	pageIcon,
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
}) {
	if (error) {
		return <div className="p-4 text-red-500 text-center">{error}</div>;
	}

	return (
		<div className="flex flex-col h-full">
			{/* Optional Page Header */}
			{pageTitle && (
				<PageHeader
					icon={pageIcon}
					title={pageTitle}
					description={pageDescription}
					actions={pageActions}
					className="flex-shrink-0"
				/>
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
							{showSearch && (
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

DomainPageLayout.propTypes = {
	// Page header props
	pageTitle: PropTypes.string,
	pageDescription: PropTypes.string,
	pageIcon: PropTypes.elementType,
	pageActions: PropTypes.node,

	// Card header props
	title: PropTypes.string,
	description: PropTypes.string,
	headerActions: PropTypes.node,

	// Search and filter props
	searchPlaceholder: PropTypes.string,
	searchValue: PropTypes.string,
	onSearchChange: PropTypes.func,
	showSearch: PropTypes.bool,
	filterControls: PropTypes.node,

	children: PropTypes.node.isRequired,
	error: PropTypes.string,
};

export default DomainPageLayout;
