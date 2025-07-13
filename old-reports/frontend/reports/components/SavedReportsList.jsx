import { motion } from "framer-motion";
import LoadingSpinner from "./LoadingSpinner";
import PropTypes from "prop-types";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardFooter,
} from "@/components/ui/card";
import {
	BarChartBig, // Replaces DocumentChartBarIcon
	Archive, // Replaces ArchiveBoxIcon
	CreditCard, // Same name
	Settings2, // Replaces CogIcon (Settings2 is closer to Cog)
	FileText, // Replaces DocumentTextIcon
	CalendarDays, // Replaces CalendarDaysIcon
	Eye, // Replaces EyeIcon
	Trash2, // Replaces TrashIcon
	AlertTriangle, // Replaces ExclamationTriangleIcon
	BookmarkX, // Replaces BookmarkSlashIcon
} from "lucide-react";

const SavedReportsList = ({
	reports,
	isLoading,
	error,
	onReportClick,
	onDeleteReport,
}) => {
	const getReportTypeIcon = (reportType) => {
		const iconClass = "h-5 w-5 flex-shrink-0";
		switch (reportType) {
			case "daily_sales":
			case "weekly_sales":
			case "monthly_sales":
			case "sales": // Added generic sales
				return <BarChartBig className={`${iconClass} text-blue-500`} />;
			case "product_performance":
			case "product": // Added generic product
				return <Archive className={`${iconClass} text-purple-500`} />;
			case "payment_analytics":
			case "payment": // Added generic payment
				return <CreditCard className={`${iconClass} text-green-500`} />;
			case "operational_insights":
			case "operational": // Added generic operational
				return <Settings2 className={`${iconClass} text-amber-500`} />;
			default:
				return <FileText className={`${iconClass} text-slate-500`} />;
		}
	};

	const formatDate = (dateString) => {
		if (!dateString) return "N/A";
		try {
			return new Date(dateString).toLocaleString(undefined, {
				dateStyle: "medium",
				timeStyle: "short",
			});
			//eslint-disable-next-line
		} catch (e) {
			return "Invalid Date";
		}
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-full p-6">
				<LoadingSpinner size="lg" />
				<p className="text-slate-500 ml-3">Loading saved reports...</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center h-full p-6 text-center">
				<AlertTriangle className="h-10 w-10 text-destructive mb-3" />
				<h3 className="text-base font-medium text-foreground mb-1">
					Error Loading Reports
				</h3>
				<p className="text-sm text-muted-foreground">{error}</p>
			</div>
		);
	}

	if (!reports || reports.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full p-6 text-center">
				<BookmarkX className="h-12 w-12 text-muted-foreground/50 mb-4" />
				<h3 className="text-lg font-medium text-foreground mb-2">
					No Saved Reports
				</h3>
				<p className="text-sm text-muted-foreground">
					Generate a report and check &quot;Save this report&quot; to save it
					here.
				</p>
			</div>
		);
	}

	return (
		<div className="p-4 sm:p-6 h-full overflow-y-auto custom-scrollbar">
			<h2 className="text-xl font-semibold text-foreground mb-6">
				Saved Reports
			</h2>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				{reports.map((report, index) => (
					<motion.div
						key={report.id}
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.3, delay: index * 0.05 }}
					>
						<Card className="h-full flex flex-col">
							<CardHeader className="pb-3">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										{getReportTypeIcon(report.report_type)}
										<span className="text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-md border">
											{report.report_type_display ||
												report.report_type.replace(/_/g, " ")}
										</span>
									</div>
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
										onClick={(e) => {
											e.stopPropagation();
											onDeleteReport(report.id);
										}}
										title="Delete report"
									>
										<Trash2 className="h-4 w-4" />
										<span className="sr-only">Delete</span>
									</Button>
								</div>
								<CardTitle
									className="text-base pt-2 truncate"
									title={report.name}
								>
									{report.name}
								</CardTitle>
							</CardHeader>
							<CardContent className="flex-grow space-y-2 text-sm">
								<div className="flex items-center text-muted-foreground">
									<CalendarDays className="h-3.5 w-3.5 mr-1.5" />
									<span>Created: {formatDate(report.date_created)}</span>
								</div>
								{report.date_range_start && report.date_range_end && (
									<div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md border">
										<span>Range: {formatDate(report.date_range_start)}</span> -{" "}
										<span>{formatDate(report.date_range_end)}</span>
									</div>
								)}
							</CardContent>
							<CardFooter className="p-4 border-t">
								<Button
									variant="outline"
									size="sm"
									className="w-full"
									onClick={() => onReportClick(report.id)}
								>
									<Eye className="h-4 w-4 mr-2" />
									View Report
								</Button>
							</CardFooter>
						</Card>
					</motion.div>
				))}
			</div>
		</div>
	);
};

SavedReportsList.propTypes = {
	reports: PropTypes.arrayOf(
		PropTypes.shape({
			id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
			name: PropTypes.string,
			report_type: PropTypes.string,
			report_type_display: PropTypes.string,
			date_created: PropTypes.string,
			date_range_start: PropTypes.string,
			date_range_end: PropTypes.string,
		})
	),
	isLoading: PropTypes.bool,
	error: PropTypes.string,
	onReportClick: PropTypes.func.isRequired,
	onDeleteReport: PropTypes.func.isRequired,
};

export default SavedReportsList;
