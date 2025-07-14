"use client";

import { useState } from "react";
import { format as formatDate } from "date-fns";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
	FileText,
	FileSpreadsheet,
	File,
	Download,
	RefreshCw,
	Settings,
	Calendar,
} from "lucide-react";
import { DualDatePicker } from "@/components/ui/dual-date-picker";
import reportsService from "@/services/api/reportsService";

interface ExportDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	reportType: "summary" | "sales" | "products" | "payments" | "operations";
	defaultStartDate?: Date;
	defaultEndDate?: Date;
	defaultFilters?: Record<string, any>;
}

interface FormatOption {
	value: "PDF" | "Excel" | "CSV";
	label: string;
	description: string;
	icon: React.ReactNode;
}

const formatOptions: FormatOption[] = [
	{
		value: "PDF",
		label: "PDF Document",
		description: "Professional formatted report for viewing and printing",
		icon: <FileText className="h-5 w-5" />,
	},
	{
		value: "Excel",
		label: "Excel Spreadsheet",
		description: "Editable data for analysis and further processing",
		icon: <FileSpreadsheet className="h-5 w-5" />,
	},
	{
		value: "CSV",
		label: "CSV File",
		description: "Raw data compatible with any spreadsheet application",
		icon: <File className="h-5 w-5" />,
	},
];

const reportTypeLabels = {
	summary: "Dashboard Summary",
	sales: "Sales Report",
	products: "Products Report",
	payments: "Payments Report",
	operations: "Operations Report",
};

export function ExportDialog({
	open,
	onOpenChange,
	reportType,
	defaultStartDate,
	defaultEndDate,
	defaultFilters = {},
}: ExportDialogProps) {
	const [format, setFormat] = useState<"PDF" | "Excel" | "CSV">("Excel");
	const [startDate, setStartDate] = useState<Date | undefined>(defaultStartDate);
	const [endDate, setEndDate] = useState<Date | undefined>(defaultEndDate);
	const [loading, setLoading] = useState(false);
	
	// Report-specific parameters
	const [categoryFilter, setCategoryFilter] = useState<string>(
		defaultFilters.category_id || "all"
	);
	const [limit, setLimit] = useState<number>(defaultFilters.limit || 50);
	const [includeDetails, setIncludeDetails] = useState(true);
	const [includeCharts, setIncludeCharts] = useState(format === "PDF");

	const handleFormatChange = (newFormat: "PDF" | "Excel" | "CSV") => {
		setFormat(newFormat);
		// PDF can include charts, others cannot
		if (newFormat === "PDF") {
			setIncludeCharts(true);
		} else {
			setIncludeCharts(false);
		}
	};

	const handleExport = async () => {
		if (!startDate || !endDate) {
			console.error("Start and end dates are required");
			return;
		}

		setLoading(true);
		try {
			const formattedStartDate = reportsService.formatDateForApi(startDate);
			const formattedEndDate = reportsService.formatEndDateForApi(endDate);

			if (!formattedStartDate || !formattedEndDate) {
				console.error("Invalid date range");
				return;
			}

			// Build filters based on report type
			const filters: Record<string, any> = {};
			
			if (reportType === "products") {
				if (categoryFilter !== "all") {
					filters.category_id = categoryFilter;
				}
				filters.limit = limit;
			}

			await reportsService.exportReport(
				reportType,
				formattedStartDate,
				formattedEndDate,
				format,
				filters
			);

			// Close dialog on success
			onOpenChange(false);
			console.log("Export completed successfully");
		} catch (err) {
			console.error("Export failed:", err);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Download className="h-5 w-5" />
						Export {reportTypeLabels[reportType]}
					</DialogTitle>
					<DialogDescription>
						Configure your export settings and download your report in the desired format.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-6">
					{/* Date Range Selection */}
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-base flex items-center gap-2">
								<Calendar className="h-4 w-4" />
								Date Range
							</CardTitle>
						</CardHeader>
						<CardContent>
							<DualDatePicker
								startDate={startDate}
								endDate={endDate}
								onStartDateChange={setStartDate}
								onEndDateChange={setEndDate}
							/>
							{startDate && endDate && (
								<p className="text-sm text-muted-foreground mt-2">
									{formatDate(startDate, "PPP")} to {formatDate(endDate, "PPP")} 
									{" "}({Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))} days)
								</p>
							)}
						</CardContent>
					</Card>

					{/* Format Selection */}
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-base">Export Format</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							{formatOptions.map((option) => (
								<div
									key={option.value}
									className={`border rounded-lg p-3 cursor-pointer transition-colors ${
										format === option.value
											? "border-primary bg-primary/5"
											: "border-border hover:border-primary/50"
									}`}
									onClick={() => handleFormatChange(option.value)}
								>
									<div className="flex items-start gap-3">
										<div className={`mt-1 ${format === option.value ? "text-primary" : "text-muted-foreground"}`}>
											{option.icon}
										</div>
										<div className="flex-1">
											<div className="flex items-center gap-2">
												<h4 className="font-medium">{option.label}</h4>
												{format === option.value && (
													<div className="w-2 h-2 bg-primary rounded-full" />
												)}
											</div>
											<p className="text-sm text-muted-foreground">{option.description}</p>
										</div>
									</div>
								</div>
							))}
						</CardContent>
					</Card>

					{/* Report-Specific Options */}
					{reportType === "products" && (
						<Card>
							<CardHeader className="pb-3">
								<CardTitle className="text-base flex items-center gap-2">
									<Settings className="h-4 w-4" />
									Products Report Options
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="space-y-2">
									<Label htmlFor="category-filter">Category Filter</Label>
									<Select value={categoryFilter} onValueChange={setCategoryFilter}>
										<SelectTrigger>
											<SelectValue placeholder="Select category" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Categories</SelectItem>
											{/* Add actual categories here if needed */}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-2">
									<Label htmlFor="limit">Number of Products</Label>
									<Select value={limit.toString()} onValueChange={(value) => setLimit(Number(value))}>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="25">Top 25</SelectItem>
											<SelectItem value="50">Top 50</SelectItem>
											<SelectItem value="100">Top 100</SelectItem>
											<SelectItem value="250">Top 250</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Export Options */}
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-base">Export Options</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex items-center justify-between">
								<div>
									<Label htmlFor="include-details">Include Detailed Data</Label>
									<p className="text-sm text-muted-foreground">
										Include all available data fields and breakdowns
									</p>
								</div>
								<Switch
									id="include-details"
									checked={includeDetails}
									onCheckedChange={setIncludeDetails}
								/>
							</div>
							
							{format === "PDF" && (
								<div className="flex items-center justify-between">
									<div>
										<Label htmlFor="include-charts">Include Charts</Label>
										<p className="text-sm text-muted-foreground">
											Add visual charts and graphs to the PDF
										</p>
									</div>
									<Switch
										id="include-charts"
										checked={includeCharts}
										onCheckedChange={setIncludeCharts}
									/>
								</div>
							)}
						</CardContent>
					</Card>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={loading}
					>
						Cancel
					</Button>
					<Button
						onClick={handleExport}
						disabled={loading || !startDate || !endDate}
					>
						{loading ? (
							<>
								<RefreshCw className="mr-2 h-4 w-4 animate-spin" />
								Exporting...
							</>
						) : (
							<>
								<Download className="mr-2 h-4 w-4" />
								Export {format}
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}