"use client";

import { useState } from "react";
import {
	CalendarDays,
	BarChart3,
	TrendingUp,
	CreditCard,
	Package,
	Users,
	BookmarkCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

import { SummaryTab } from "./components/SummaryTab";
import { SalesTab } from "./components/SalesTab";
import { PaymentsTab } from "./components/PaymentsTab";
import { ProductsTab } from "./components/ProductsTab";
import { OperationsTab } from "./components/OperationsTab";
import { SavedReportsTab } from "./components/SavedReportsTab";
import reportsService from "@/services/api/reportsService";

export default function ReportsPage() {
	// Default to last 7 days
	const today = new Date();
	const sevenDaysAgo = new Date();
	sevenDaysAgo.setDate(today.getDate() - 7);

	const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
		from: sevenDaysAgo,
		to: today,
	});

	// Format dates for API
	const formatDateForApi = (date: Date) => {
		return reportsService.formatDateForApi(date);
	};

	// Export all reports
	const handleExportAll = async () => {
		try {
			const startDate = formatDateForApi(dateRange.from);
			const endDate = formatDateForApi(dateRange.to);

			if (!startDate || !endDate) {
				console.error("Invalid date range");
				return;
			}

			const reportTypes = [
				"summary",
				"sales",
				"products",
				"payments",
				"operations",
			];

			const exportConfig = {
				report_configs: reportTypes.map((type) => ({
					report_type: type,
					start_date: startDate,
					end_date: endDate,
					filters: {},
				})),
				export_format: "xlsx",
				compress: true,
				priority: 2, // Normal priority
			};

			const result = await reportsService.createBulkExport(exportConfig);
			console.log("Bulk export created:", result);
			// You could show a notification here
		} catch (error) {
			console.error("Error creating bulk export:", error);
			// Show error notification
		}
	};

	return (
		<div className="h-full flex flex-col overflow-hidden">
			<div className="flex-1 overflow-y-auto">
				<div className="container mx-auto p-6">
					<div className="flex items-center justify-between mb-6">
						<div>
							<h1 className="text-3xl font-bold">Reports Dashboard</h1>
							<p className="text-muted-foreground">
								Comprehensive analytics for your POS system
							</p>
						</div>
						<div className="flex items-center gap-4">
							<Popover>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										className="w-[280px] justify-start text-left font-normal bg-transparent"
									>
										<CalendarDays className="mr-2 h-4 w-4" />
										{dateRange?.from ? (
											dateRange.to ? (
												<>
													{format(dateRange.from, "LLL dd, y")} -{" "}
													{format(dateRange.to, "LLL dd, y")}
												</>
											) : (
												format(dateRange.from, "LLL dd, y")
											)
										) : (
											<span>Pick a date range</span>
										)}
									</Button>
								</PopoverTrigger>
								<PopoverContent
									className="w-auto p-0"
									align="start"
								>
									<Calendar
										initialFocus
										mode="range"
										defaultMonth={dateRange?.from}
										selected={dateRange}
										onSelect={(range) =>
											range &&
											setDateRange({
												from: range.from ?? new Date(),
												to: range.to ?? new Date(),
											})
										}
										numberOfMonths={2}
									/>
								</PopoverContent>
							</Popover>
							<Button
								onClick={handleExportAll}
								className="bg-primary text-primary-foreground hover:bg-primary/90"
							>
								Export All
							</Button>
						</div>
					</div>

					<Tabs
						defaultValue="summary"
						className="space-y-6"
					>
						<TabsList className="grid w-full grid-cols-6">
							<TabsTrigger
								value="summary"
								className="flex items-center gap-2"
							>
								<BarChart3 className="h-4 w-4" />
								Summary
							</TabsTrigger>
							<TabsTrigger
								value="sales"
								className="flex items-center gap-2"
							>
								<TrendingUp className="h-4 w-4" />
								Sales
							</TabsTrigger>
							<TabsTrigger
								value="payments"
								className="flex items-center gap-2"
							>
								<CreditCard className="h-4 w-4" />
								Payments
							</TabsTrigger>
							<TabsTrigger
								value="products"
								className="flex items-center gap-2"
							>
								<Package className="h-4 w-4" />
								Products
							</TabsTrigger>
							<TabsTrigger
								value="operations"
								className="flex items-center gap-2"
							>
								<Users className="h-4 w-4" />
								Operations
							</TabsTrigger>
							<TabsTrigger
								value="saved"
								className="flex items-center gap-2"
							>
								<BookmarkCheck className="h-4 w-4" />
								Saved Reports
							</TabsTrigger>
						</TabsList>

						<TabsContent value="summary">
							<SummaryTab dateRange={dateRange} />
						</TabsContent>

						<TabsContent value="sales">
							<SalesTab dateRange={dateRange} />
						</TabsContent>

						<TabsContent value="payments">
							<PaymentsTab dateRange={dateRange} />
						</TabsContent>

						<TabsContent value="products">
							<ProductsTab dateRange={dateRange} />
						</TabsContent>

						<TabsContent value="operations">
							<OperationsTab dateRange={dateRange} />
						</TabsContent>

						<TabsContent value="saved">
							<SavedReportsTab />
						</TabsContent>
					</Tabs>
				</div>
			</div>
		</div>
	);
}
