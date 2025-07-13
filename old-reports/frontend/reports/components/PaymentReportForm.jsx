import { useState } from "react";
import { motion } from "framer-motion";
import PropTypes from "prop-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	CreditCardIcon as CreditCardFormIcon, // Renamed to avoid conflict
	Download,
	Bookmark,
	Loader2,
	Calendar,
	BarChart3,
} from "lucide-react";

const PaymentReportForm = ({ onSubmit, isLoading }) => {
	const [formData, setFormData] = useState({
		start_date: new Date().toISOString().split("T")[0],
		end_date: new Date().toISOString().split("T")[0],
		group_by: "payment_method",
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

	const handleSelectChange = (value) => {
		setFormData({
			...formData,
			group_by: value,
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

	return (
		<div className="p-6 max-w-3xl mx-auto">
			<motion.div
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.3 }}
				className="space-y-6"
			>
				<div className="flex items-center gap-2">
					<CreditCardFormIcon className="h-6 w-6 text-primary" />
					<h1 className="text-2xl font-bold">Generate Payment Report</h1>
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
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label
										htmlFor="pay_start_date"
										className="flex items-center gap-1"
									>
										<Calendar className="h-3.5 w-3.5" />
										Start Date
									</Label>
									<Input
										type="date"
										id="pay_start_date"
										name="start_date"
										value={formData.start_date}
										onChange={handleChange}
										required
									/>
								</div>
								<div className="space-y-2">
									<Label
										htmlFor="pay_end_date"
										className="flex items-center gap-1"
									>
										<Calendar className="h-3.5 w-3.5" />
										End Date
									</Label>
									<Input
										type="date"
										id="pay_end_date"
										name="end_date"
										value={formData.end_date}
										onChange={handleChange}
										required
									/>
								</div>
							</div>

							<div className="space-y-2">
								<Label htmlFor="pay_group_by">Group By</Label>
								<Select
									value={formData.group_by}
									onValueChange={handleSelectChange}
								>
									<SelectTrigger id="pay_group_by">
										<SelectValue placeholder="Select grouping" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="payment_method">
											Payment Method
										</SelectItem>
										<SelectItem value="day">Daily</SelectItem>
										<SelectItem value="week">Weekly</SelectItem>
										<SelectItem value="month">Monthly</SelectItem>
									</SelectContent>
								</Select>
							</div>
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
									id="pay_save_report"
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
									<Label htmlFor="pay_report_name">
										Report Name <span className="text-destructive">*</span>
									</Label>
									<Input
										type="text"
										id="pay_report_name"
										name="report_name"
										value={formData.report_name}
										onChange={handleChange}
										placeholder="e.g., Monthly Payment Breakdown"
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

PaymentReportForm.propTypes = {
	onSubmit: PropTypes.func.isRequired,
	isLoading: PropTypes.bool,
};

export default PaymentReportForm;
