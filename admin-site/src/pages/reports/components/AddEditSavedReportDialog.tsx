"use client";

import { useState, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays, subWeeks, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import reportsService from "@/services/api/reportsService";

interface SavedReport {
	id: number;
	name: string;
	report_type: string;
	parameters: any;
	schedule: string;
	format: string;
	status: string;
	last_run: string | null;
	next_run: string | null;
	file_size_mb: number;
	generation_time: number | null;
	row_count: number | null;
	created_at: string;
	updated_at: string;
}

interface AddEditSavedReportDialogProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	editingReport: SavedReport | null;
	onSaveComplete: () => void;
}

export function AddEditSavedReportDialog({
	isOpen,
	onOpenChange,
	editingReport,
	onSaveComplete,
}: AddEditSavedReportDialogProps) {
	const [dateRangePreset, setDateRangePreset] = useState("last30days");
	const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
	const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);
	
	const getDateRangeFromPreset = (preset: string): { startDate: Date, endDate: Date } => {
		const now = new Date();
		
		switch (preset) {
			case "today":
				return { startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()), endDate: now };
			case "yesterday":
				const yesterday = subDays(now, 1);
				return { startDate: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()), endDate: yesterday };
			case "last7days":
				return { startDate: subDays(now, 7), endDate: now };
			case "last30days":
				return { startDate: subDays(now, 30), endDate: now };
			case "thisweek":
				return { startDate: startOfWeek(now), endDate: endOfWeek(now) };
			case "lastweek":
				const lastWeekStart = startOfWeek(subWeeks(now, 1));
				const lastWeekEnd = endOfWeek(subWeeks(now, 1));
				return { startDate: lastWeekStart, endDate: lastWeekEnd };
			case "thismonth":
				return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
			case "lastmonth":
				const lastMonth = subMonths(now, 1);
				return { startDate: startOfMonth(lastMonth), endDate: endOfMonth(lastMonth) };
			case "custom":
				return { 
					startDate: customStartDate || subDays(now, 30), 
					endDate: customEndDate || now 
				};
			default:
				return { startDate: subDays(now, 30), endDate: now };
		}
	};

	const getDefaultReport = () => {
		const { startDate, endDate } = getDateRangeFromPreset(dateRangePreset);
		return {
			name: "",
			report_type: "sales",
			schedule: "manual",
			format: "Excel",
			status: "active",
			parameters: {
				start_date: startDate.toISOString(),
				end_date: endDate.toISOString()
			},
		};
	};

	const [currentReport, setCurrentReport] = useState(getDefaultReport());

	// Update report parameters when date range changes
	useEffect(() => {
		const { startDate, endDate } = getDateRangeFromPreset(dateRangePreset);
		setCurrentReport(prev => ({
			...prev,
			parameters: {
				...prev.parameters,
				start_date: startDate.toISOString(),
				end_date: endDate.toISOString()
			}
		}));
	}, [dateRangePreset, customStartDate, customEndDate]);

	// Helper function to detect preset from dates
	const detectPresetFromDates = (startDate: string, endDate: string): string => {
		const start = new Date(startDate);
		const end = new Date(endDate);
		const now = new Date();

		// Check if it matches any preset pattern
		const presets = [
			"today", "yesterday", "last7days", "last30days", 
			"thisweek", "lastweek", "thismonth", "lastmonth"
		];

		for (const preset of presets) {
			const { startDate: presetStart, endDate: presetEnd } = getDateRangeFromPreset(preset);
			
			// Allow some tolerance (1 day) for date comparisons
			const tolerance = 24 * 60 * 60 * 1000; // 1 day in milliseconds
			if (Math.abs(start.getTime() - presetStart.getTime()) < tolerance &&
				Math.abs(end.getTime() - presetEnd.getTime()) < tolerance) {
				return preset;
			}
		}

		return "custom";
	};

	// Reset form when dialog opens/closes or editing report changes
	useEffect(() => {
		if (isOpen) {
			if (editingReport) {
				// Editing mode - parse existing dates
				const existingStartDate = editingReport.parameters.start_date;
				const existingEndDate = editingReport.parameters.end_date;
				
				const detectedPreset = detectPresetFromDates(existingStartDate, existingEndDate);
				setDateRangePreset(detectedPreset);
				
				if (detectedPreset === "custom") {
					setCustomStartDate(new Date(existingStartDate));
					setCustomEndDate(new Date(existingEndDate));
				} else {
					setCustomStartDate(undefined);
					setCustomEndDate(undefined);
				}

				setCurrentReport({
					name: editingReport.name,
					report_type: editingReport.report_type,
					schedule: editingReport.schedule,
					format: editingReport.format,
					status: editingReport.status,
					parameters: editingReport.parameters,
				});
			} else {
				// Creating mode
				setDateRangePreset("last30days");
				setCustomStartDate(undefined);
				setCustomEndDate(undefined);
				setCurrentReport(getDefaultReport());
			}
		}
	}, [isOpen, editingReport]);

	const handleSaveReport = async () => {
		if (!currentReport.name.trim()) {
			alert("Please enter a report name");
			return;
		}

		try {
			if (editingReport) {
				// Update existing report
				await reportsService.updateSavedReport(editingReport.id.toString(), currentReport);
			} else {
				// Create new report
				await reportsService.createSavedReport(currentReport);
			}
			
			onOpenChange(false);
			onSaveComplete();
		} catch (err) {
			console.error(`Failed to ${editingReport ? 'update' : 'create'} report:`, err);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>{editingReport ? 'Edit Report' : 'Create New Report'}</DialogTitle>
					<DialogDescription>
						{editingReport 
							? 'Update the report settings and parameters.'
							: 'Set up a new saved report with custom parameters and scheduling.'
						}
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 py-4">
					<div className="grid gap-2">
						<Label htmlFor="name">Report Name</Label>
						<Input
							id="name"
							value={currentReport.name}
							onChange={(e) =>
								setCurrentReport({ ...currentReport, name: e.target.value })
							}
							placeholder="Enter report name"
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="type">Report Type</Label>
						<Select
							value={currentReport.report_type}
							onValueChange={(value) =>
								setCurrentReport({ ...currentReport, report_type: value })
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="sales">Sales Report</SelectItem>
								<SelectItem value="products">Products Report</SelectItem>
								<SelectItem value="payments">Payments Report</SelectItem>
								<SelectItem value="operations">
									Operations Report
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="schedule">Schedule</Label>
						<Select
							value={currentReport.schedule}
							onValueChange={(value) =>
								setCurrentReport({ ...currentReport, schedule: value })
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="manual">Manual</SelectItem>
								<SelectItem value="daily">Daily</SelectItem>
								<SelectItem value="weekly">Weekly</SelectItem>
								<SelectItem value="monthly">Monthly</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="format">Export Format</Label>
						<Select
							value={currentReport.format}
							onValueChange={(value) =>
								setCurrentReport({ ...currentReport, format: value })
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="Excel">Excel (XLSX)</SelectItem>
								<SelectItem value="CSV">CSV</SelectItem>
								<SelectItem value="PDF">PDF</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="dateRange">Date Range</Label>
						<Select
							value={dateRangePreset}
							onValueChange={setDateRangePreset}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="today">Today</SelectItem>
								<SelectItem value="yesterday">Yesterday</SelectItem>
								<SelectItem value="last7days">Last 7 days</SelectItem>
								<SelectItem value="last30days">Last 30 days</SelectItem>
								<SelectItem value="thisweek">This week</SelectItem>
								<SelectItem value="lastweek">Last week</SelectItem>
								<SelectItem value="thismonth">This month</SelectItem>
								<SelectItem value="lastmonth">Last month</SelectItem>
								<SelectItem value="custom">Custom range</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{dateRangePreset === "custom" && (
						<div className="grid grid-cols-2 gap-2">
							<div className="grid gap-2">
								<Label>Start Date</Label>
								<Popover>
									<PopoverTrigger asChild>
										<Button
											variant="outline"
											className={cn(
												"justify-start text-left font-normal",
												!customStartDate && "text-muted-foreground"
											)}
										>
											<CalendarIcon className="mr-2 h-4 w-4" />
											{customStartDate ? format(customStartDate, "PPP") : "Pick a date"}
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-auto p-0">
										<Calendar
											mode="single"
											selected={customStartDate}
											onSelect={setCustomStartDate}
											initialFocus
										/>
									</PopoverContent>
								</Popover>
							</div>
							<div className="grid gap-2">
								<Label>End Date</Label>
								<Popover>
									<PopoverTrigger asChild>
										<Button
											variant="outline"
											className={cn(
												"justify-start text-left font-normal",
												!customEndDate && "text-muted-foreground"
											)}
										>
											<CalendarIcon className="mr-2 h-4 w-4" />
											{customEndDate ? format(customEndDate, "PPP") : "Pick a date"}
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-auto p-0">
										<Calendar
											mode="single"
											selected={customEndDate}
											onSelect={setCustomEndDate}
											initialFocus
										/>
									</PopoverContent>
								</Popover>
							</div>
						</div>
					)}
					{editingReport && (
						<div className="grid gap-2">
							<Label htmlFor="status">Status</Label>
							<Select
								value={currentReport.status}
								onValueChange={(value) =>
									setCurrentReport({ ...currentReport, status: value })
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="active">Active</SelectItem>
									<SelectItem value="paused">Paused</SelectItem>
									<SelectItem value="error">Error</SelectItem>
								</SelectContent>
							</Select>
						</div>
					)}
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="submit"
						onClick={handleSaveReport}
					>
						{editingReport ? 'Update Report' : 'Create Report'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}