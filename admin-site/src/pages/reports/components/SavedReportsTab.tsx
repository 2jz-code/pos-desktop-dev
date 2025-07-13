import { useState } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	FileText,
	BarChart3,
	Package,
	CreditCard,
	Calendar,
	Clock,
	Download,
	Edit,
	Trash2,
	Play,
} from "lucide-react";

const savedReports = [
	{
		id: 1,
		name: "Weekly Sales Summary",
		type: "Sales",
		lastRun: "2024-01-07",
		schedule: "Weekly",
		status: "Active",
		size: "2.3 MB",
		format: "PDF",
	},
	{
		id: 2,
		name: "Monthly Product Performance",
		type: "Products",
		lastRun: "2024-01-01",
		schedule: "Monthly",
		status: "Active",
		size: "1.8 MB",
		format: "Excel",
	},
	{
		id: 3,
		name: "Daily Payment Breakdown",
		type: "Payments",
		lastRun: "2024-01-07",
		schedule: "Daily",
		status: "Active",
		size: "0.9 MB",
		format: "CSV",
	},
	{
		id: 4,
		name: "Staff Performance Review",
		type: "Operations",
		lastRun: "2024-01-05",
		schedule: "Bi-weekly",
		status: "Paused",
		size: "3.1 MB",
		format: "PDF",
	},
];

const quickReports = [
	{
		name: "Daily Sales Summary",
		icon: FileText,
		description: "Today's sales overview",
	},
	{
		name: "Weekly Performance",
		icon: BarChart3,
		description: "7-day performance analysis",
	},
	{
		name: "Inventory Report",
		icon: Package,
		description: "Current stock levels",
	},
	{
		name: "Payment Analysis",
		icon: CreditCard,
		description: "Payment method breakdown",
	},
];

export function SavedReportsTab() {
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
	const [newReport, setNewReport] = useState({
		name: "",
		type: "",
		schedule: "",
		format: "PDF",
	});

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="text-2xl font-bold">Saved Reports</h2>
				<Dialog
					open={isCreateDialogOpen}
					onOpenChange={setIsCreateDialogOpen}
				>
					<DialogTrigger asChild>
						<Button>Create New Report</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-[425px]">
						<DialogHeader>
							<DialogTitle>Create New Report</DialogTitle>
							<DialogDescription>
								Set up a new automated report with custom parameters.
							</DialogDescription>
						</DialogHeader>
						<div className="grid gap-4 py-4">
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="name"
									className="text-right"
								>
									Name
								</Label>
								<Input
									id="name"
									value={newReport.name}
									onChange={(e) =>
										setNewReport({ ...newReport, name: e.target.value })
									}
									className="col-span-3"
								/>
							</div>
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="type"
									className="text-right"
								>
									Type
								</Label>
								<Select
									value={newReport.type}
									onValueChange={(value) =>
										setNewReport({ ...newReport, type: value })
									}
								>
									<SelectTrigger className="col-span-3">
										<SelectValue placeholder="Select report type" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="sales">Sales</SelectItem>
										<SelectItem value="products">Products</SelectItem>
										<SelectItem value="payments">Payments</SelectItem>
										<SelectItem value="operations">Operations</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="schedule"
									className="text-right"
								>
									Schedule
								</Label>
								<Select
									value={newReport.schedule}
									onValueChange={(value) =>
										setNewReport({ ...newReport, schedule: value })
									}
								>
									<SelectTrigger className="col-span-3">
										<SelectValue placeholder="Select schedule" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="daily">Daily</SelectItem>
										<SelectItem value="weekly">Weekly</SelectItem>
										<SelectItem value="monthly">Monthly</SelectItem>
										<SelectItem value="manual">Manual</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="format"
									className="text-right"
								>
									Format
								</Label>
								<Select
									value={newReport.format}
									onValueChange={(value) =>
										setNewReport({ ...newReport, format: value })
									}
								>
									<SelectTrigger className="col-span-3">
										<SelectValue placeholder="Select format" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="PDF">PDF</SelectItem>
										<SelectItem value="Excel">Excel</SelectItem>
										<SelectItem value="CSV">CSV</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
						<DialogFooter>
							<Button
								type="submit"
								onClick={() => setIsCreateDialogOpen(false)}
							>
								Create Report
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Quick Reports</CardTitle>
						<CardDescription>Generate common reports instantly</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{quickReports.map((report, index) => (
							<Button
								key={index}
								variant="outline"
								className="w-full justify-start bg-transparent h-auto p-4"
							>
								<div className="flex items-center gap-3">
									<report.icon className="h-5 w-5" />
									<div className="text-left">
										<div className="font-medium">{report.name}</div>
										<div className="text-sm text-muted-foreground">
											{report.description}
										</div>
									</div>
								</div>
							</Button>
						))}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Report Templates</CardTitle>
						<CardDescription>Pre-configured report templates</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid gap-3">
							<Button
								variant="outline"
								className="justify-start bg-transparent"
							>
								<Calendar className="mr-2 h-4 w-4" />
								Monthly Business Review
							</Button>
							<Button
								variant="outline"
								className="justify-start bg-transparent"
							>
								<Clock className="mr-2 h-4 w-4" />
								Peak Hours Analysis
							</Button>
							<Button
								variant="outline"
								className="justify-start bg-transparent"
							>
								<BarChart3 className="mr-2 h-4 w-4" />
								Quarterly Performance
							</Button>
							<Button
								variant="outline"
								className="justify-start bg-transparent"
							>
								<Package className="mr-2 h-4 w-4" />
								Inventory Turnover
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Saved Reports</CardTitle>
					<CardDescription>
						Manage your saved and scheduled reports
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Report Name</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Last Run</TableHead>
								<TableHead>Schedule</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Size</TableHead>
								<TableHead>Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{savedReports.map((report) => (
								<TableRow key={report.id}>
									<TableCell className="font-medium">{report.name}</TableCell>
									<TableCell>
										<Badge variant="outline">{report.type}</Badge>
									</TableCell>
									<TableCell>{report.lastRun}</TableCell>
									<TableCell>{report.schedule}</TableCell>
									<TableCell>
										<Badge
											variant={
												report.status === "Active" ? "default" : "secondary"
											}
										>
											{report.status}
										</Badge>
									</TableCell>
									<TableCell className="text-sm text-muted-foreground">
										{report.size}
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<Button
												size="sm"
												variant="outline"
											>
												<Play className="h-3 w-3" />
											</Button>
											<Button
												size="sm"
												variant="outline"
											>
												<Download className="h-3 w-3" />
											</Button>
											<Button
												size="sm"
												variant="outline"
											>
												<Edit className="h-3 w-3" />
											</Button>
											<Button
												size="sm"
												variant="outline"
											>
												<Trash2 className="h-3 w-3" />
											</Button>
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Report Analytics</CardTitle>
					<CardDescription>Usage statistics for your reports</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 md:grid-cols-3">
						<div className="text-center">
							<div className="text-2xl font-bold">24</div>
							<p className="text-sm text-muted-foreground">Total Reports</p>
						</div>
						<div className="text-center">
							<div className="text-2xl font-bold">156</div>
							<p className="text-sm text-muted-foreground">Reports Generated</p>
						</div>
						<div className="text-center">
							<div className="text-2xl font-bold">89%</div>
							<p className="text-sm text-muted-foreground">Success Rate</p>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
