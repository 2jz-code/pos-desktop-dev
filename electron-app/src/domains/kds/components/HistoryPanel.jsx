import React, { useState, useEffect } from "react";
import {
	Button,
	Input,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui";
import {
	X,
	Search,
	Calendar,
	RefreshCw,
	Clock,
	Filter,
	ChevronLeft,
	ChevronRight,
} from "lucide-react";
import { HistoryOrderCard } from "./HistoryOrderCard";
import { OrderTimeline } from "./OrderTimeline";

/**
 * History Panel Component
 * Slide-out panel for viewing completed orders history with search functionality
 */
export function HistoryPanel({
	isOpen,
	onClose,
	zoneId,
	isQCStation,
	onGetHistory,
	onSearchHistory,
	onGetOrderTimeline,
	historyData,
	searchResults,
	timelineData,
	isLoading,
}) {
	const [searchTerm, setSearchTerm] = useState("");
	const [showTimeline, setShowTimeline] = useState(false);
	const [selectedOrderId, setSelectedOrderId] = useState(null); //eslint-disable-line
	const [dateRange, setDateRange] = useState({
		from: "",
		to: "",
	});
	const [currentPage, setCurrentPage] = useState(1);
	const [isSearchMode, setIsSearchMode] = useState(false);
	const [showDateFilter, setShowDateFilter] = useState(false);

	// Auto-load initial history when panel opens
	useEffect(() => {
		if (isOpen && !isSearchMode && !historyData?.orders?.length) {
			handleLoadHistory(1);
		}
	}, [isOpen, zoneId]);

	const handleLoadHistory = (page = 1) => {
		setCurrentPage(page);
		setIsSearchMode(false);
		const filters = {
			page,
			page_size: 20,
			...(dateRange.from && {
				date_from: new Date(dateRange.from).toISOString(),
			}),
			...(dateRange.to && { date_to: new Date(dateRange.to).toISOString() }),
		};
		onGetHistory(filters);
	};

	const handleSearch = () => {
		if (!searchTerm.trim() || searchTerm.trim().length < 2) {
			// If search is cleared, go back to history mode
			if (isSearchMode) {
				setIsSearchMode(false);
				handleLoadHistory(1);
			}
			return;
		}

		setIsSearchMode(true);
		setCurrentPage(1);
		const filters = {
			search_term: searchTerm.trim(),
			page: 1,
			page_size: 20,
			search_all_zones: isQCStation, // QC can search all zones
			...(dateRange.from && {
				date_from: new Date(dateRange.from).toISOString(),
			}),
			...(dateRange.to && { date_to: new Date(dateRange.to).toISOString() }),
		};
		onSearchHistory(filters);
	};

	const handleSearchKeyPress = (e) => {
		if (e.key === "Enter") {
			handleSearch();
		}
	};

	const handleClearSearch = () => {
		setSearchTerm("");
		setIsSearchMode(false);
		handleLoadHistory(1);
	};

	const handleRefresh = () => {
		if (isSearchMode) {
			handleSearch();
		} else {
			handleLoadHistory(currentPage);
		}
	};

	const handleOrderClick = (orderId) => {
		setSelectedOrderId(orderId);
		setShowTimeline(true);
		onGetOrderTimeline(orderId);
	};

	const handleBackToHistory = () => {
		setShowTimeline(false);
		setSelectedOrderId(null);
	};

	const handlePageChange = (newPage) => {
		if (isSearchMode) {
			const filters = {
				search_term: searchTerm.trim(),
				page: newPage,
				page_size: 20,
				search_all_zones: isQCStation,
				...(dateRange.from && {
					date_from: new Date(dateRange.from).toISOString(),
				}),
				...(dateRange.to && { date_to: new Date(dateRange.to).toISOString() }),
			};
			onSearchHistory(filters);
		} else {
			handleLoadHistory(newPage);
		}
		setCurrentPage(newPage);
	};

	const getCurrentData = () => {
		return isSearchMode ? searchResults : historyData;
	};

	const data = getCurrentData();
	const orders = data?.orders || [];
	const pagination = data?.pagination || {};

	return (
		<div
			className={`fixed inset-0 z-50 flex transition-all duration-300 ${
				isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
			}`}
		>
			{/* Backdrop */}
			<div
				className={`fixed inset-0 bg-black/20 transition-all duration-300 ${
					isOpen ? "bg-opacity-40" : "bg-opacity-0"
				}`}
				onClick={onClose}
			/>

			{/* Panel */}
			<div
				className={`relative ml-auto w-full max-w-4xl h-full bg-white shadow-2xl transform transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
					isOpen ? "translate-x-0 scale-100" : "translate-x-full scale-95"
				}`}
				style={{
					boxShadow: isOpen
						? "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)"
						: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
				}}
			>
				{showTimeline ? (
					/* Timeline View */
					<OrderTimeline
						orderData={timelineData}
						onBack={handleBackToHistory}
						isLoading={isLoading}
					/>
				) : (
					/* History List View */
					<div className="flex flex-col h-full">
						{/* Header */}
						<div
							className={`p-6 border-b border-gray-200 bg-gray-50 transform transition-all duration-500 delay-100 ${
								isOpen
									? "translate-y-0 opacity-100"
									: "-translate-y-4 opacity-0"
							}`}
						>
							<div className="flex items-center justify-between mb-4">
								<div className="flex items-center space-x-3">
									<Clock className="h-6 w-6 text-blue-600" />
									<div>
										<h2 className="text-xl font-semibold text-gray-900">
											Order History
										</h2>
										<p className="text-sm text-gray-600">
											{isSearchMode
												? `Search results${
														isQCStation ? " (all zones)" : ` for ${zoneId}`
												  }`
												: `Completed orders for ${zoneId}`}
										</p>
									</div>
								</div>
								<Button
									onClick={onClose}
									variant="ghost"
									size="sm"
									className="text-gray-400 hover:text-gray-600"
								>
									<X className="h-5 w-5" />
								</Button>
							</div>

							{/* Search and Filters */}
							<div className="space-y-3">
								{/* Search Bar */}
								<div className="flex space-x-2">
									<div className="flex-1 relative">
										<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
										<Input
											placeholder="Search by order number, customer name, phone..."
											value={searchTerm}
											onChange={(e) => setSearchTerm(e.target.value)}
											onKeyPress={handleSearchKeyPress}
											className="pl-10"
										/>
									</div>
									<Button
										onClick={handleSearch}
										disabled={isLoading}
									>
										<Search className="h-4 w-4" />
									</Button>
									{isSearchMode && (
										<Button
											onClick={handleClearSearch}
											variant="outline"
											disabled={isLoading}
										>
											Clear
										</Button>
									)}
									<Button
										onClick={handleRefresh}
										variant="outline"
										disabled={isLoading}
									>
										<RefreshCw
											className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
										/>
									</Button>
								</div>

								{/* Date Filter Toggle */}
								<div className="flex space-x-2">
									<Button
										onClick={() => setShowDateFilter(!showDateFilter)}
										variant="outline"
										size="sm"
										className="text-xs"
									>
										<Filter className="h-3 w-3 mr-1" />
										Date Filter
									</Button>
									{(dateRange.from || dateRange.to) && (
										<Button
											onClick={() => {
												setDateRange({ from: "", to: "" });
												// Re-run current query without date filter
												setTimeout(() => {
													if (isSearchMode) {
														handleSearch();
													} else {
														handleLoadHistory(currentPage);
													}
												}, 100);
											}}
											variant="ghost"
											size="sm"
											className="text-xs text-red-600"
										>
											Clear Dates
										</Button>
									)}
								</div>

								{/* Date Range Inputs */}
								{showDateFilter && (
									<div className="flex space-x-2 p-3 bg-gray-100 rounded-md">
										<div className="flex-1">
											<label className="block text-xs text-gray-600 mb-1">
												From Date
											</label>
											<Input
												type="date"
												value={dateRange.from}
												onChange={(e) =>
													setDateRange((prev) => ({
														...prev,
														from: e.target.value,
													}))
												}
												className="text-sm"
											/>
										</div>
										<div className="flex-1">
											<label className="block text-xs text-gray-600 mb-1">
												To Date
											</label>
											<Input
												type="date"
												value={dateRange.to}
												onChange={(e) =>
													setDateRange((prev) => ({
														...prev,
														to: e.target.value,
													}))
												}
												className="text-sm"
											/>
										</div>
										<div className="flex items-end">
											<Button
												onClick={() => {
													if (isSearchMode) {
														handleSearch();
													} else {
														handleLoadHistory(1);
													}
												}}
												size="sm"
												disabled={isLoading}
											>
												Apply
											</Button>
										</div>
									</div>
								)}
							</div>
						</div>

						{/* Content */}
						<div
							className={`flex-1 overflow-y-auto p-6 transform transition-all duration-500 delay-200 ${
								isOpen ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
							}`}
						>
							{isLoading ? (
								<div className="flex items-center justify-center py-12">
									<RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
									<span className="ml-2 text-gray-600">
										{isSearchMode ? "Searching..." : "Loading history..."}
									</span>
								</div>
							) : orders.length === 0 ? (
								<div className="text-center py-12">
									<Clock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
									<h3 className="text-lg font-medium text-gray-900 mb-2">
										{isSearchMode ? "No search results" : "No completed orders"}
									</h3>
									<p className="text-gray-500">
										{isSearchMode
											? "Try adjusting your search terms or date range"
											: "Completed orders will appear here"}
									</p>
								</div>
							) : (
								<div className="space-y-4">
									{orders.map((order, index) => (
										<div
											key={order.id}
											className={`transform transition-all duration-300 ${
												isOpen
													? "translate-x-0 opacity-100"
													: "translate-x-8 opacity-0"
											}`}
											style={{
												transitionDelay: isOpen
													? `${300 + index * 50}ms`
													: "0ms",
											}}
										>
											<HistoryOrderCard
												order={order}
												onClick={() => handleOrderClick(order.id)}
												zoneId={zoneId}
												isQCStation={isQCStation}
											/>
										</div>
									))}
								</div>
							)}
						</div>

						{/* Pagination */}
						{pagination.total_pages > 1 && (
							<div
								className={`p-4 border-t border-gray-200 bg-gray-50 transform transition-all duration-500 delay-300 ${
									isOpen
										? "translate-y-0 opacity-100"
										: "translate-y-4 opacity-0"
								}`}
							>
								<div className="flex items-center justify-between">
									<div className="text-sm text-gray-600">
										Page {pagination.current_page} of {pagination.total_pages}(
										{pagination.total_count} total orders)
									</div>
									<div className="flex space-x-2">
										<Button
											onClick={() =>
												handlePageChange(pagination.current_page - 1)
											}
											disabled={!pagination.has_previous || isLoading}
											variant="outline"
											size="sm"
										>
											<ChevronLeft className="h-4 w-4" />
										</Button>
										<Button
											onClick={() =>
												handlePageChange(pagination.current_page + 1)
											}
											disabled={!pagination.has_next || isLoading}
											variant="outline"
											size="sm"
										>
											<ChevronRight className="h-4 w-4" />
										</Button>
									</div>
								</div>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
