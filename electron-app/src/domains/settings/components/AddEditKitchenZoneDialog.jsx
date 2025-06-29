import React, { useState, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Badge } from "@/shared/components/ui/badge";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Separator } from "@/shared/components/ui/separator";
import { getCategories } from "@/domains/products/services/categoryService";
import { getProductTypes } from "@/domains/products/services/productTypeService";

export const AddEditKitchenZoneDialog = ({
	isOpen,
	onOpenChange,
	onSave,
	zone,
	printers,
}) => {
	const [formData, setFormData] = useState({
		name: "",
		printerId: "",
		categories: [], // Array of category IDs, or ["ALL"]
		productTypes: [], // Array of product type IDs, or ["ALL"]
	});

	const [categories, setCategories] = useState([]);
	const [productTypes, setProductTypes] = useState([]);
	const [loading, setLoading] = useState(false);

	// Fetch categories and product types when dialog opens
	useEffect(() => {
		if (isOpen) {
			fetchData();
		}
	}, [isOpen]);

	useEffect(() => {
		if (zone) {
			setFormData({
				name: zone.name || "",
				printerId: zone.printerId || "",
				categories: zone.categories || [],
				productTypes: zone.productTypes || [],
			});
		} else {
			setFormData({
				name: "",
				printerId: "",
				categories: [],
				productTypes: [],
			});
		}
	}, [zone, isOpen]);

	const fetchData = async () => {
		setLoading(true);
		try {
			const [categoriesResponse, productTypesResponse] = await Promise.all([
				getCategories(),
				getProductTypes(),
			]);
			setCategories(categoriesResponse.data);
			setProductTypes(productTypesResponse.data);
		} catch (error) {
			console.error("Failed to fetch categories/product types:", error);
		} finally {
			setLoading(false);
		}
	};

	const handleChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

	const handleSelectChange = (value) => {
		setFormData((prev) => ({ ...prev, printerId: value }));
	};

	const handleCategoryToggle = (categoryId, checked) => {
		setFormData((prev) => {
			const categories = [...prev.categories];

			if (categoryId === "ALL") {
				// Toggle ALL option
				return {
					...prev,
					categories: checked ? ["ALL"] : [],
				};
			}

			// Remove ALL if selecting specific categories
			const filteredCategories = categories.filter((id) => id !== "ALL");

			if (checked) {
				filteredCategories.push(categoryId);
			} else {
				const index = filteredCategories.indexOf(categoryId);
				if (index > -1) filteredCategories.splice(index, 1);
			}

			return {
				...prev,
				categories: filteredCategories,
			};
		});
	};

	const handleProductTypeToggle = (productTypeId, checked) => {
		setFormData((prev) => {
			const productTypes = [...prev.productTypes];

			if (productTypeId === "ALL") {
				// Toggle ALL option
				return {
					...prev,
					productTypes: checked ? ["ALL"] : [],
				};
			}

			// Remove ALL if selecting specific product types
			const filteredProductTypes = productTypes.filter((id) => id !== "ALL");

			if (checked) {
				filteredProductTypes.push(productTypeId);
			} else {
				const index = filteredProductTypes.indexOf(productTypeId);
				if (index > -1) filteredProductTypes.splice(index, 1);
			}

			return {
				...prev,
				productTypes: filteredProductTypes,
			};
		});
	};

	const handleSave = () => {
		onSave(formData);
		onOpenChange(false);
	};

	const isCategoryChecked = (categoryId) => {
		if (categoryId === "ALL") {
			return formData.categories.includes("ALL");
		}
		return (
			formData.categories.includes(categoryId) &&
			!formData.categories.includes("ALL")
		);
	};

	const isProductTypeChecked = (productTypeId) => {
		if (productTypeId === "ALL") {
			return formData.productTypes.includes("ALL");
		}
		return (
			formData.productTypes.includes(productTypeId) &&
			!formData.productTypes.includes("ALL")
		);
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={onOpenChange}
		>
			<DialogContent className="max-w-2xl max-h-[80vh]">
				<DialogHeader>
					<DialogTitle>{zone ? "Edit Zone" : "Add Kitchen Zone"}</DialogTitle>
					<DialogDescription>
						Configure which categories and product types this kitchen zone
						should print.
						<br />
						<strong>Note:</strong> If no categories are selected, this zone will
						not print any tickets.
					</DialogDescription>
				</DialogHeader>

				<ScrollArea className="max-h-[50vh] pr-4">
					<div className="grid gap-6 py-4">
						{/* Basic Zone Info */}
						<div className="grid grid-cols-4 items-center gap-4">
							<Label
								htmlFor="name"
								className="text-right"
							>
								Zone Name
							</Label>
							<Input
								id="name"
								name="name"
								value={formData.name}
								onChange={handleChange}
								className="col-span-3"
								placeholder="e.g., Hot Line"
							/>
						</div>

						<div className="grid grid-cols-4 items-center gap-4">
							<Label
								htmlFor="printerId"
								className="text-right"
							>
								Assigned Printer
							</Label>
							<Select
								value={formData.printerId}
								onValueChange={handleSelectChange}
							>
								<SelectTrigger className="col-span-3">
									<SelectValue placeholder="Select a printer" />
								</SelectTrigger>
								<SelectContent>
									{printers.map((p) => (
										<SelectItem
											key={p.id}
											value={p.id}
										>
											{p.name} ({p.connection_type})
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<Separator />

						{/* Product Type Filtering */}
						<div>
							<Label className="text-sm font-medium mb-3 block">
								Product Types to Print
							</Label>
							<div className="space-y-3">
								<div className="flex items-center space-x-2">
									<Checkbox
										id="productType-ALL"
										checked={isProductTypeChecked("ALL")}
										onCheckedChange={(checked) =>
											handleProductTypeToggle("ALL", checked)
										}
									/>
									<Label
										htmlFor="productType-ALL"
										className="text-sm font-medium"
									>
										All Product Types
									</Label>
									<Badge variant="secondary">Recommended for QC</Badge>
								</div>

								{loading ? (
									<div className="text-sm text-muted-foreground">
										Loading product types...
									</div>
								) : (
									<div className="grid grid-cols-2 gap-2 ml-6">
										{productTypes.map((type) => (
											<div
												key={type.id}
												className="flex items-center space-x-2"
											>
												<Checkbox
													id={`productType-${type.id}`}
													checked={isProductTypeChecked(type.id)}
													onCheckedChange={(checked) =>
														handleProductTypeToggle(type.id, checked)
													}
													disabled={formData.productTypes.includes("ALL")}
												/>
												<Label
													htmlFor={`productType-${type.id}`}
													className="text-sm"
												>
													{type.name}
												</Label>
											</div>
										))}
									</div>
								)}
							</div>
						</div>

						<Separator />

						{/* Category Filtering */}
						<div>
							<Label className="text-sm font-medium mb-3 block">
								Categories to Print
							</Label>
							<div className="space-y-3">
								<div className="flex items-center space-x-2">
									<Checkbox
										id="category-ALL"
										checked={isCategoryChecked("ALL")}
										onCheckedChange={(checked) =>
											handleCategoryToggle("ALL", checked)
										}
									/>
									<Label
										htmlFor="category-ALL"
										className="text-sm font-medium"
									>
										All Categories
									</Label>
									<Badge variant="secondary">Recommended for QC</Badge>
								</div>

								{loading ? (
									<div className="text-sm text-muted-foreground">
										Loading categories...
									</div>
								) : (
									<div className="grid grid-cols-2 gap-2 ml-6">
										{categories.map((category) => (
											<div
												key={category.id}
												className="flex items-center space-x-2"
											>
												<Checkbox
													id={`category-${category.id}`}
													checked={isCategoryChecked(category.id)}
													onCheckedChange={(checked) =>
														handleCategoryToggle(category.id, checked)
													}
													disabled={formData.categories.includes("ALL")}
												/>
												<Label
													htmlFor={`category-${category.id}`}
													className="text-sm"
												>
													{category.name}
												</Label>
											</div>
										))}
									</div>
								)}
							</div>
						</div>
					</div>
				</ScrollArea>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button onClick={handleSave}>Save Zone</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
