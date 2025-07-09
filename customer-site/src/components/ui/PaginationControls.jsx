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

export const PaginationControls = ({
	prevUrl,
	nextUrl,
	onNavigate,
	count = 0,
	currentPage = 1,
	pageSize = 25,
}) => {
	const totalPages = Math.ceil(count / pageSize);

	// DEBUG: Log pagination data for troubleshooting
	console.log("Customer-site PaginationControls Debug:", {
		count,
		currentPage,
		pageSize,
		totalPages,
		prevUrl,
		nextUrl,
		showPageSelector: totalPages > 1,
	});

	// Helper function to construct URL for a specific page
	const getPageUrl = (pageNumber) => {
		if (!prevUrl && !nextUrl) return null;

		// Use prevUrl or nextUrl as a template to construct the page URL
		const baseUrl = prevUrl || nextUrl;
		const url = new URL(baseUrl);
		url.searchParams.set("page", pageNumber.toString());
		return url.toString();
	};

	const handlePageSelect = (pageNumber) => {
		const pageUrl = getPageUrl(parseInt(pageNumber));
		if (pageUrl) {
			onNavigate(pageUrl);
		}
	};

	// Always show Previous/Next buttons even for single page
	// Only hide the page selector if there's only one page
	const showPageSelector = totalPages > 1;

	return (
		<div className="flex items-center justify-between py-4">
			{/* Left side - Page info */}
			<div className="text-sm text-muted-foreground">
				{count > 0 ? (
					<>
						Showing page {currentPage} of {totalPages} ({count} total items)
					</>
				) : (
					<>No items to display</>
				)}
			</div>

			{/* Right side - Navigation controls */}
			<div className="flex items-center space-x-2">
				{/* Page selector - only show if multiple pages */}
				{showPageSelector && (
					<div className="flex items-center space-x-2">
						<span className="text-sm text-muted-foreground">Go to page:</span>
						<Select
							value={currentPage.toString()}
							onValueChange={handlePageSelect}
						>
							<SelectTrigger className="w-20">
								<SelectValue />
							</SelectTrigger>
							<SelectContent
								className={`z-[9999] bg-white border shadow-lg ${
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
				)}

				{/* Previous/Next buttons */}
				<Button
					variant="outline"
					size="sm"
					onClick={() => onNavigate(prevUrl)}
					disabled={!prevUrl}
				>
					<ChevronLeft className="h-4 w-4 mr-1" />
					Previous
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={() => onNavigate(nextUrl)}
					disabled={!nextUrl}
				>
					Next
					<ChevronRight className="h-4 w-4 ml-1" />
				</Button>
			</div>
		</div>
	);
};
