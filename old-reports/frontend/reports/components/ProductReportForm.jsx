import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { reportService } from "../../../api/services/reportService";
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
// import { Separator } from "@/components/ui/separator"; // Not used, can be removed
import {
	FileArchiveIcon, // As per your snippet
	Download,
	Bookmark,
	Loader2,
	Calendar,
	BarChart3,
} from "lucide-react";

const ProductReportForm = ({ onSubmit, isLoading }) => {
	const [formData, setFormData] = useState({
		start_date: new Date().toISOString().split("T")[0],
		end_date: new Date().toISOString().split("T")[0],
		category: "", // This will be an empty string to signify "All Categories"
		limit: 10,
		sort_by: "revenue",
		save_report: false,
		report_name: "",
	});
	const [categories, setCategories] = useState([]);
	const [loadingCategories, setLoadingCategories] = useState(false);

	useEffect(() => {
		const fetchCategories = async () => {
			setLoadingCategories(true);
			try {
				const data = await reportService.getProductCategories();
				// Filter out categories that might result in an empty value for SelectItem
				const validCategories = data.filter((cat) => {
					const catValue = typeof cat === "object" ? cat.id : cat;
					return catValue !== "" && catValue != null;
				});
				setCategories(validCategories);
			} catch (error) {
				console.error("Error fetching categories:", error);
			} finally {
				setLoadingCategories(false);
			}
		};
		fetchCategories();
	}, []);

	const handleChange = (e) => {
		const { name, value, type, checked } = e.target;
		setFormData({
			...formData,
			[name]: type === "checkbox" ? checked : value,
		});
	};

	const handleSelectChange = (name, value) => {
		if (name === "category") {
			// If the special value for "All Categories" is selected, set formData.category to ""
			// Otherwise, use the selected category's actual value (ID or name)
			setFormData({
				...formData,
				[name]: value === "__ALL_CATEGORIES__" ? "" : value,
			});
		} else {
			setFormData({
				...formData,
				[name]: value,
			});
		}
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
					<FileArchiveIcon className="h-6 w-6 text-primary" />
					<h1 className="text-2xl font-bold">Generate Product Report</h1>
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
										htmlFor="prod_start_date"
										className="flex items-center gap-1"
									>
										<Calendar className="h-3.5 w-3.5" />
										Start Date
									</Label>
									<Input
										type="date"
										id="prod_start_date"
										name="start_date"
										value={formData.start_date}
										onChange={handleChange}
										required
									/>
								</div>
								<div className="space-y-2">
									<Label
										htmlFor="prod_end_date"
										className="flex items-center gap-1"
									>
										<Calendar className="h-3.5 w-3.5" />
										End Date
									</Label>
									<Input
										type="date"
										id="prod_end_date"
										name="end_date"
										value={formData.end_date}
										onChange={handleChange}
										required
									/>
								</div>
							</div>

							<div className="space-y-2">
								<Label
									htmlFor="prod_category"
									className="flex items-center gap-1"
								>
									Category
									{loadingCategories && (
										<Loader2 className="h-3.5 w-3.5 animate-spin" />
									)}
								</Label>
								<Select
									value={
										formData.category === ""
											? "__ALL_CATEGORIES__"
											: formData.category
									}
									onValueChange={(value) =>
										handleSelectChange("category", value)
									}
									disabled={loadingCategories}
								>
									<SelectTrigger id="prod_category">
										<SelectValue placeholder="All Categories" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="__ALL_CATEGORIES__">
											All Categories
										</SelectItem>
										{categories.map((cat, index) => {
											const catValue =
												typeof cat === "object" ? String(cat.id) : String(cat);
											const catName = typeof cat === "object" ? cat.name : cat;
											// Ensure value is a non-empty string. If ID is somehow number 0, convert to string "0".
											// This was already filtered above, but an extra check here for safety.
											const finalValue =
												catValue == null || catValue === ""
													? `_cat_val_${index}`
													: catValue;

											return (
												<SelectItem
													key={finalValue}
													value={finalValue}
												>
													{catName || `Category ${index + 1}`}
												</SelectItem>
											);
										})}
									</SelectContent>
								</Select>
							</div>

							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="prod_limit">Number of Products</Label>
									<Input
										type="number"
										id="prod_limit"
										name="limit"
										value={formData.limit}
										onChange={handleChange}
										min="1"
										max="100"
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="prod_sort_by">Sort By</Label>
									<Select
										value={formData.sort_by}
										onValueChange={(value) =>
											handleSelectChange("sort_by", value)
										}
									>
										<SelectTrigger id="prod_sort_by">
											<SelectValue placeholder="Select sorting" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="revenue">
												Revenue (highest first)
											</SelectItem>
											<SelectItem value="quantity">
												Quantity Sold (highest first)
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
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
									id="prod_save_report"
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
									<Label htmlFor="prod_report_name">
										Report Name <span className="text-destructive">*</span>
									</Label>
									<Input
										type="text"
										id="prod_report_name"
										name="report_name"
										value={formData.report_name}
										onChange={handleChange}
										placeholder="e.g., Top Products Q1"
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

ProductReportForm.propTypes = {
	onSubmit: PropTypes.func.isRequired,
	isLoading: PropTypes.bool,
};

export default ProductReportForm;
