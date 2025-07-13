import { useState } from "react";
import { motion } from "framer-motion";
import PropTypes from "prop-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
// Separator is not used, can be removed if not planned for future use
// import { Separator } from "@/components/ui/separator";
import {
	CogIcon as CogFormIcon, // Renamed to avoid conflict
	Download,
	Bookmark,
	Loader2,
	Calendar,
	BarChart3, // For card title icon
	Zap, // For quick date ranges section
} from "lucide-react";

const OperationalReportForm = ({ onSubmit, isLoading }) => {
	const [formData, setFormData] = useState({
		start_date: new Date().toISOString().split("T")[0],
		end_date: new Date().toISOString().split("T")[0],
		save_report: false,
		report_name: "",
	});

	const handleChange = (e) => {
		const { name, value, type, checked } = e.target;
		setFormData({
			...formData,
			[name]: type === "checkbox" ? checked : value,
		});
	};

	const handleCheckboxChange = (name, checked) => {
		setFormData({
			...formData,
			[name]: checked,
		});
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		onSubmit(formData);
	};

	const setDateRange = (range) => {
		const today = new Date();
		let startDate = new Date();
		let endDate = new Date(today);

		switch (range) {
			case "last7days":
				startDate.setDate(today.getDate() - 7);
				break;
			case "last30days":
				startDate.setDate(today.getDate() - 30);
				break;
			case "thisMonth":
				startDate = new Date(today.getFullYear(), today.getMonth(), 1);
				break;
			case "lastMonth":
				startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
				endDate = new Date(today.getFullYear(), today.getMonth(), 0);
				break;
			case "thisYear":
				startDate = new Date(today.getFullYear(), 0, 1);
				break;
			default: // today
				startDate = today;
				break;
		}

		setFormData({
			...formData,
			start_date: startDate.toISOString().split("T")[0],
			end_date: endDate.toISOString().split("T")[0],
		});
	};

	const quickDateButtonClass = "text-xs h-7"; // For smaller quick date buttons

	return (
		<div className="p-6 max-w-3xl mx-auto">
			<motion.div
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.3 }}
				className="space-y-6"
			>
				<div className="flex items-center gap-2">
					<CogFormIcon className="h-6 w-6 text-primary" />
					<h1 className="text-2xl font-bold">Generate Operational Insights</h1>
				</div>

				<form
					onSubmit={handleSubmit}
					className="space-y-6"
				>
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-lg flex items-center gap-2">
								<BarChart3 className="h-5 w-5 text-muted-foreground" />
								Report Parameters
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-5">
							{/* Quick Date Buttons */}
							<div className="space-y-2">
								<Label className="flex items-center gap-1">
									<Zap className="h-3.5 w-3.5" /> Quick Date Ranges
								</Label>
								<div className="flex flex-wrap gap-2">
									<Button
										variant="outline"
										size="sm"
										className={quickDateButtonClass}
										type="button"
										onClick={() => setDateRange("today")}
									>
										Today
									</Button>
									<Button
										variant="outline"
										size="sm"
										className={quickDateButtonClass}
										type="button"
										onClick={() => setDateRange("last7days")}
									>
										Last 7 Days
									</Button>
									<Button
										variant="outline"
										size="sm"
										className={quickDateButtonClass}
										type="button"
										onClick={() => setDateRange("last30days")}
									>
										Last 30 Days
									</Button>
									<Button
										variant="outline"
										size="sm"
										className={quickDateButtonClass}
										type="button"
										onClick={() => setDateRange("thisMonth")}
									>
										This Month
									</Button>
									<Button
										variant="outline"
										size="sm"
										className={quickDateButtonClass}
										type="button"
										onClick={() => setDateRange("lastMonth")}
									>
										Last Month
									</Button>
									<Button
										variant="outline"
										size="sm"
										className={quickDateButtonClass}
										type="button"
										onClick={() => setDateRange("thisYear")}
									>
										This Year
									</Button>
								</div>
							</div>

							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label
										htmlFor="op_start_date"
										className="flex items-center gap-1"
									>
										<Calendar className="h-3.5 w-3.5" />
										Start Date
									</Label>
									<Input
										type="date"
										id="op_start_date"
										name="start_date"
										value={formData.start_date}
										onChange={handleChange}
										required
									/>
								</div>
								<div className="space-y-2">
									<Label
										htmlFor="op_end_date"
										className="flex items-center gap-1"
									>
										<Calendar className="h-3.5 w-3.5" />
										End Date
									</Label>
									<Input
										type="date"
										id="op_end_date"
										name="end_date"
										value={formData.end_date}
										onChange={handleChange}
										required
									/>
								</div>
							</div>
							<p className="text-xs text-muted-foreground pt-1">
								Analyzes hourly trends, peak times, and day-of-week patterns.
							</p>
						</CardContent>
					</Card>

					<Card>
						<CardContent className="pt-6 space-y-4">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<Bookmark className="h-4 w-4 text-primary" />
									<h3 className="font-medium">Save Report</h3>
								</div>
								<Checkbox
									id="op_save_report"
									checked={formData.save_report}
									onCheckedChange={(checked) =>
										handleCheckboxChange("save_report", checked)
									}
								/>
							</div>

							{formData.save_report && (
								<motion.div
									initial={{ opacity: 0, height: 0 }}
									animate={{ opacity: 1, height: "auto" }}
									exit={{ opacity: 0, height: 0 }}
									transition={{ duration: 0.2 }}
									className="space-y-2 pt-2"
								>
									<Label htmlFor="op_report_name">
										Report Name <span className="text-destructive">*</span>
									</Label>
									<Input
										type="text"
										id="op_report_name"
										name="report_name"
										value={formData.report_name}
										onChange={handleChange}
										placeholder="e.g., Q1 Operational Peak Times"
										required={formData.save_report}
									/>
								</motion.div>
							)}
							<p className="text-xs text-muted-foreground flex items-start gap-1.5">
								<Bookmark className="h-3.5 w-3.5 mt-0.5 shrink-0" />
								<span>
									Save this report configuration for quick access later.
								</span>
							</p>
						</CardContent>
					</Card>

					<div className="flex justify-end pt-2">
						<Button
							type="submit"
							disabled={isLoading}
						>
							{isLoading ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									Generating...
								</>
							) : (
								<>
									<Download className="h-4 w-4 mr-2" />
									Generate Report
								</>
							)}
						</Button>
					</div>
				</form>
			</motion.div>
		</div>
	);
};

OperationalReportForm.propTypes = {
	onSubmit: PropTypes.func.isRequired,
	isLoading: PropTypes.bool,
};

export default OperationalReportForm;
