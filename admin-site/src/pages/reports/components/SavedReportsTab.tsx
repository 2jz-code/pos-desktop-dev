"use client";

import { useState, useEffect } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	BookOpen,
	Plus,
	Search,
	MoreHorizontal,
	Play,
	Copy,
	Edit,
	Trash2,
	Download,
	RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
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

export function SavedReportsTab() {
	const [reports, setReports] = useState<SavedReport[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [searchTerm, setSearchTerm] = useState("");
	const [filterType, setFilterType] = useState<string>("all");
	const [filterStatus, setFilterStatus] = useState<string>("all");
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
	const [newReport, setNewReport] = useState({
		name: "",
		report_type: "summary",
		schedule: "manual",
		format: "xlsx",
		parameters: {},
	});

	const fetchSavedReports = async () => {
		setLoading(true);
		setError(null);

		try {
			const params: Record<string, string> = {};
			if (filterType !== "all") params.report_type = filterType;
			if (filterStatus !== "all") params.status = filterStatus;
			if (searchTerm) params.search = searchTerm;

			const data = await reportsService.listSavedReports(params);
			setReports(data.results || data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchSavedReports();
	}, [filterType, filterStatus, searchTerm]);

	const handleCreateReport = async () => {
		try {
			await reportsService.createSavedReport(newReport);
			setIsCreateDialogOpen(false);
			setNewReport({
				name: "",
				report_type: "summary",
				schedule: "manual",
				format: "xlsx",
				parameters: {},
			});
			fetchSavedReports();
		} catch (err) {
			console.error("Failed to create report:", err);
		}
	};

	const handleRunReport = async (reportId: number) => {
		try {
			await reportsService.generateSavedReport(reportId.toString());
			fetchSavedReports();
		} catch (err) {
			console.error("Failed to run report:", err);
		}
	};

	const handleDuplicateReport = async (reportId: number) => {
		try {
			// Find the report to duplicate
			const reportToDuplicate = reports.find(r => r.id === reportId);
			if (!reportToDuplicate) {
				throw new Error("Report not found");
			}

			// Create a new report with the same settings but different name
			const duplicatedReport = {
				...reportToDuplicate,
				name: `${reportToDuplicate.name} (Copy)`,
				id: undefined, // Remove id so it creates a new one
			};

			await reportsService.createSavedReport(duplicatedReport);
			fetchSavedReports();
		} catch (err) {
			console.error("Failed to duplicate report:", err);
		}
	};

	const handleDeleteReport = async (reportId: number) => {
		if (confirm("Are you sure you want to delete this report?")) {
			try {
				await reportsService.deleteSavedReport(reportId.toString());
				fetchSavedReports();
			} catch (err) {
				console.error("Failed to delete report:", err);
			}
		}
	};

	const getStatusBadge = (status: string) => {
		switch (status) {
			case "active":
				return <Badge className="bg-green-100 text-green-800">Active</Badge>;
			case "paused":
				return <Badge variant="secondary">Paused</Badge>;
			case "error":
				return <Badge variant="destructive">Error</Badge>;
			default:
				return <Badge variant="outline">{status}</Badge>;
		}
	};

	const getReportTypeLabel = (type: string) => {
		switch (type) {
			case "summary":
				return "Dashboard Summary";
			case "sales":
				return "Sales Report";
			case "products":
				return "Products Report";
			case "payments":
				return "Payments Report";
			case "operations":
				return "Operations Report";
			default:
				return type;
		}
	};

	if (loading) {
		return (
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="space-y-1">
						<h3 className="text-2xl font-semibold tracking-tight">
							Saved Reports
						</h3>
						<p className="text-sm text-muted-foreground">
							Manage and schedule your reports
						</p>
					</div>
				</div>
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{[...Array(6)].map((_, i) => (
						<Card key={i}>
							<CardHeader>
								<div className="h-4 w-32 bg-muted animate-pulse rounded" />
								<div className="h-3 w-24 bg-muted animate-pulse rounded" />
							</CardHeader>
							<CardContent>
								<div className="space-y-2">
									<div className="h-3 w-full bg-muted animate-pulse rounded" />
									<div className="h-3 w-3/4 bg-muted animate-pulse rounded" />
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="space-y-4">
				<Card>
					<CardContent className="pt-6">
						<div className="text-center">
							<p className="text-sm text-muted-foreground mb-4">
								Error loading saved reports: {error}
							</p>
							<Button
								onClick={fetchSavedReports}
								variant="outline"
							>
								<RefreshCw className="mr-2 h-4 w-4" />
								Retry
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="space-y-1">
					<h3 className="text-2xl font-semibold tracking-tight">
						Saved Reports
					</h3>
					<p className="text-sm text-muted-foreground">
						Manage and schedule your reports
					</p>
				</div>
				<Dialog
					open={isCreateDialogOpen}
					onOpenChange={setIsCreateDialogOpen}
				>
					<DialogTrigger asChild>
						<Button>
							<Plus className="mr-2 h-4 w-4" />
							New Report
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-[425px]">
						<DialogHeader>
							<DialogTitle>Create New Report</DialogTitle>
							<DialogDescription>
								Set up a new saved report with custom parameters and scheduling.
							</DialogDescription>
						</DialogHeader>
						<div className="grid gap-4 py-4">
							<div className="grid gap-2">
								<Label htmlFor="name">Report Name</Label>
								<Input
									id="name"
									value={newReport.name}
									onChange={(e) =>
										setNewReport({ ...newReport, name: e.target.value })
									}
									placeholder="Enter report name"
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="type">Report Type</Label>
								<Select
									value={newReport.report_type}
									onValueChange={(value) =>
										setNewReport({ ...newReport, report_type: value })
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="summary">Dashboard Summary</SelectItem>
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
									value={newReport.schedule}
									onValueChange={(value) =>
										setNewReport({ ...newReport, schedule: value })
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
									value={newReport.format}
									onValueChange={(value) =>
										setNewReport({ ...newReport, format: value })
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="xlsx">Excel (XLSX)</SelectItem>
										<SelectItem value="csv">CSV</SelectItem>
										<SelectItem value="pdf">PDF</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
						<DialogFooter>
							<Button
								type="submit"
								onClick={handleCreateReport}
							>
								Create Report
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			{/* Filters */}
			<div className="flex items-center space-x-4">
				<div className="relative flex-1 max-w-sm">
					<Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Search reports..."
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						className="pl-8"
					/>
				</div>
				<Select
					value={filterType}
					onValueChange={setFilterType}
				>
					<SelectTrigger className="w-40">
						<SelectValue placeholder="All Types" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Types</SelectItem>
						<SelectItem value="summary">Summary</SelectItem>
						<SelectItem value="sales">Sales</SelectItem>
						<SelectItem value="products">Products</SelectItem>
						<SelectItem value="payments">Payments</SelectItem>
						<SelectItem value="operations">Operations</SelectItem>
					</SelectContent>
				</Select>
				<Select
					value={filterStatus}
					onValueChange={setFilterStatus}
				>
					<SelectTrigger className="w-32">
						<SelectValue placeholder="All Status" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Status</SelectItem>
						<SelectItem value="active">Active</SelectItem>
						<SelectItem value="paused">Paused</SelectItem>
						<SelectItem value="error">Error</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{/* Reports Grid */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{reports.map((report) => (
					<Card key={report.id}>
						<CardHeader className="pb-3">
							<div className="flex items-start justify-between">
								<div className="space-y-1">
									<CardTitle className="text-base">{report.name}</CardTitle>
									<CardDescription>
										{getReportTypeLabel(report.report_type)}
									</CardDescription>
								</div>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											variant="ghost"
											className="h-8 w-8 p-0"
										>
											<MoreHorizontal className="h-4 w-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuLabel>Actions</DropdownMenuLabel>
										<DropdownMenuItem
											onClick={() => handleRunReport(report.id)}
										>
											<Play className="mr-2 h-4 w-4" />
											Run Report
										</DropdownMenuItem>
										<DropdownMenuItem
											onClick={() => handleDuplicateReport(report.id)}
										>
											<Copy className="mr-2 h-4 w-4" />
											Duplicate
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem>
											<Edit className="mr-2 h-4 w-4" />
											Edit
										</DropdownMenuItem>
										<DropdownMenuItem
											onClick={() => handleDeleteReport(report.id)}
											className="text-red-600"
										>
											<Trash2 className="mr-2 h-4 w-4" />
											Delete
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex items-center justify-between">
								{getStatusBadge(report.status)}
								<Badge
									variant="outline"
									className="capitalize"
								>
									{report.format}
								</Badge>
							</div>

							<div className="space-y-2 text-sm">
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground">Schedule:</span>
									<span className="capitalize">{report.schedule}</span>
								</div>
								{report.last_run && (
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">Last Run:</span>
										<span>
											{format(new Date(report.last_run), "MMM dd, HH:mm")}
										</span>
									</div>
								)}
								{report.next_run && (
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">Next Run:</span>
										<span>
											{format(new Date(report.next_run), "MMM dd, HH:mm")}
										</span>
									</div>
								)}
								{report.file_size_mb > 0 && (
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">File Size:</span>
										<span>{report.file_size_mb} MB</span>
									</div>
								)}
							</div>

							<div className="flex items-center space-x-2 pt-2">
								<Button
									size="sm"
									onClick={() => handleRunReport(report.id)}
									className="flex-1"
								>
									<Play className="mr-2 h-4 w-4" />
									Run
								</Button>
								{report.file_size_mb > 0 && (
									<Button
										size="sm"
										variant="outline"
									>
										<Download className="h-4 w-4" />
									</Button>
								)}
							</div>
						</CardContent>
					</Card>
				))}
			</div>

			{reports.length === 0 && (
				<Card>
					<CardContent className="pt-6">
						<div className="text-center">
							<BookOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
							<h3 className="text-lg font-medium mb-2">No saved reports</h3>
							<p className="text-sm text-muted-foreground mb-4">
								Create your first saved report to get started.
							</p>
							<Button onClick={() => setIsCreateDialogOpen(true)}>
								<Plus className="mr-2 h-4 w-4" />
								Create Report
							</Button>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
