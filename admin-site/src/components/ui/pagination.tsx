import React from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationControlsProps {
	prevUrl: string | null;
	nextUrl: string | null;
	onNavigate: (url: string) => void;
	count: number;
	currentPage: number;
	pageSize: number;
}

export function PaginationControls({
	prevUrl,
	nextUrl,
	onNavigate,
	count = 0,
	currentPage = 1,
	pageSize = 25,
}: PaginationControlsProps) {
	const totalPages = Math.ceil(count / pageSize);

	// Helper function to construct URL for a specific page
	const getPageUrl = (pageNumber: number) => {
		if (!prevUrl && !nextUrl) return null;

		// Use prevUrl or nextUrl as a template to construct the page URL
		const baseUrl = prevUrl || nextUrl;
		if (!baseUrl) return null;

		const url = new URL(baseUrl);
		url.searchParams.set("page", pageNumber.toString());
		return url.toString();
	};

	const handlePageSelect = (pageNumber: string) => {
		const pageUrl = getPageUrl(parseInt(pageNumber));
		if (pageUrl) {
			onNavigate(pageUrl);
		}
	};

	// Don't render if there's only one page or no data
	if (totalPages <= 1) {
		return null;
	}

	return (
		<div className="flex items-center justify-between py-4">
			{/* Left side - Page info */}
			<div className="text-sm text-slate-600 dark:text-slate-400">
				Showing page {currentPage} of {totalPages} ({count} total items)
			</div>

			{/* Right side - Navigation controls */}
			<div className="flex items-center space-x-2">
				{/* Page selector */}
				<div className="flex items-center space-x-2">
					<span className="text-sm text-slate-600 dark:text-slate-400">
						Go to page:
					</span>
					<Select
						value={currentPage.toString()}
						onValueChange={handlePageSelect}
					>
						<SelectTrigger className="w-20">
							<SelectValue />
						</SelectTrigger>
						<SelectContent
							className={`z-[9999] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg ${
								totalPages > 10 ? "max-h-[200px] overflow-y-auto" : ""
							}`}
							position="popper"
							sideOffset={4}
						>
							{Array.from({ length: totalPages }, (_, i) => i + 1).map(
								(page) => (
									<SelectItem
										key={page}
										value={page.toString()}
									>
										{page}
									</SelectItem>
								)
							)}
						</SelectContent>
					</Select>
				</div>

				{/* Previous/Next buttons */}
				<Button
					variant="outline"
					size="sm"
					onClick={() => prevUrl && onNavigate(prevUrl)}
					disabled={!prevUrl}
					className="border-slate-200 dark:border-slate-700"
				>
					<ChevronLeft className="h-4 w-4 mr-1" />
					Previous
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={() => nextUrl && onNavigate(nextUrl)}
					disabled={!nextUrl}
					className="border-slate-200 dark:border-slate-700"
				>
					Next
					<ChevronRight className="h-4 w-4 ml-1" />
				</Button>
			</div>
		</div>
	);
}
