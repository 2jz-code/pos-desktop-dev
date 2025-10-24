import { useState, useEffect } from "react";
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
import { Switch } from "@/shared/components/ui/switch";
import { Badge } from "@/shared/components/ui/badge";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Separator } from "@/shared/components/ui/separator";
import { CategoryTree } from "./CategoryTree";
import { useQuery } from "@tanstack/react-query";
import { getAllCategories } from "@/domains/products/services/categoryService";

// Helper to build the category tree
const buildTree = (categories) => {
	const tree = [];
	const map = {};
	categories.forEach((cat) => {
		map[cat.id] = { ...cat, children: [] };
	});
	categories.forEach((cat) => {
		if (cat.parent) {
			map[cat.parent.id]?.children.push(map[cat.id]);
		} else {
			tree.push(map[cat.id]);
		}
	});
	return tree;
};

export function AddEditKitchenZoneDialog({
	isOpen,
	onOpenChange,
	onSave,
	zone,
	printers,
}) {
	const [formData, setFormData] = useState({
		name: "",
		printer: 0,
		categories: [],
		print_all_items: false,
		is_active: true,
	});

	// Fetch categories when dialog opens
	const { data: categoriesResponse, isLoading: categoriesLoading } = useQuery({
		queryKey: ["categories"],
		queryFn: getAllCategories,
		enabled: isOpen,
	});

	const categoriesData = categoriesResponse?.data || [];

	const categoryTree = buildTree(categoriesData);

	useEffect(() => {
		if (zone && isOpen) {
			setFormData({
				name: zone.name || "",
				printer: zone.printer || 0,
				categories: zone.category_ids || zone.categories || [],
				print_all_items: zone.print_all_items || false,
				is_active: zone.is_active !== undefined ? zone.is_active : true,
			});
		} else if (isOpen) {
			setFormData({
				name: "",
				printer: 0,
				categories: [],
				print_all_items: false,
				is_active: true,
			});
		}
	}, [zone, isOpen]);

	const handleChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

	const handlePrinterChange = (value) => {
		setFormData((prev) => ({ ...prev, printer: parseInt(value) }));
	};

	const handlePrintAllChange = (checked) => {
		setFormData((prev) => ({
			...prev,
			print_all_items: checked,
			// Clear categories when "print all" is enabled
			categories: checked ? [] : prev.categories,
		}));
	};

	const handleActiveChange = (checked) => {
		setFormData((prev) => ({ ...prev, is_active: checked }));
	};

	const handleCategoryChange = (node, checked) => {
		setFormData((prev) => {
			let newSelected = [...prev.categories];

			// Get all descendant IDs
			const getAllChildIds = (n) => {
				let ids = [n.id];
				if (n.children) {
					n.children.forEach((child) => {
						ids = [...ids, ...getAllChildIds(child)];
					});
				}
				return ids;
			};
			const childIds = getAllChildIds(node);

			if (checked) {
				// Add the node and all its children
				newSelected = [...new Set([...newSelected, ...childIds])];
			} else {
				// Remove the node and all its children
				newSelected = newSelected.filter((id) => !childIds.includes(id));
			}

			return { ...prev, categories: newSelected };
		});
	};

	const handleSave = () => {
		if (!formData.name || !formData.printer) {
			alert("Please fill in all required fields");
			return;
		}
		// Send category_ids instead of categories to match backend expectation
		onSave({
			...formData,
			category_ids: formData.categories,
		});
	};

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl max-h-[85vh]">
				<DialogHeader>
					<DialogTitle>
						{zone ? "Edit Kitchen Zone" : "Add Kitchen Zone"}
					</DialogTitle>
					<DialogDescription>
						Configure which items should print to this kitchen zone based on
						categories
					</DialogDescription>
				</DialogHeader>

				<ScrollArea className="max-h-[60vh] pr-4">
					<div className="grid gap-6 py-4">
						{/* Basic Zone Info */}
						<div className="grid gap-4">
							<div className="grid gap-2">
								<Label htmlFor="name">
									Zone Name <span className="text-red-500">*</span>
								</Label>
								<Input
									id="name"
									name="name"
									value={formData.name}
									onChange={handleChange}
									placeholder="e.g., Hot Line, Grill Station, Bakery"
								/>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="printer">
									Assigned Printer <span className="text-red-500">*</span>
								</Label>
								<Select
									value={String(formData.printer || "")}
									onValueChange={handlePrinterChange}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select a printer" />
									</SelectTrigger>
									<SelectContent>
										{printers.map((p) => (
											<SelectItem key={p.id} value={String(p.id)}>
												{p.name} ({p.ip_address})
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						<Separator />

						{/* Settings */}
						<div className="space-y-4">
							<Label className="text-sm font-medium">Zone Settings</Label>

							{/* Print All Items Toggle */}
							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
									<div className="flex items-center gap-2">
										<Label htmlFor="print_all_items">Print All Items</Label>
										<Badge variant="secondary">Recommended for QC</Badge>
									</div>
									<p className="text-xs text-muted-foreground">
										Print all order items regardless of category
									</p>
								</div>
								<Switch
									id="print_all_items"
									checked={formData.print_all_items}
									onCheckedChange={handlePrintAllChange}
								/>
							</div>

							{/* Active Toggle */}
							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
									<Label htmlFor="is_active">Active</Label>
									<p className="text-xs text-muted-foreground">
										Enable or disable this kitchen zone
									</p>
								</div>
								<Switch
									id="is_active"
									checked={formData.is_active}
									onCheckedChange={handleActiveChange}
								/>
							</div>
						</div>

						<Separator />

						{/* Category Filtering */}
						{!formData.print_all_items && (
							<div>
								<Label className="text-sm font-medium mb-3 block">
									Filter by Categories
								</Label>
								<p className="text-xs text-muted-foreground mb-4">
									Select which product categories should print to this zone (
									{formData.categories.length} selected)
								</p>
								{categoriesLoading ? (
									<div className="text-sm text-muted-foreground">
										Loading categories...
									</div>
								) : (
									<div className="max-h-64 overflow-y-auto border rounded-md p-4">
										<CategoryTree
											nodes={categoryTree}
											selectedCategories={formData.categories}
											onCategoryChange={handleCategoryChange}
											disabled={false}
										/>
									</div>
								)}
							</div>
						)}
					</div>
				</ScrollArea>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSave}>
						{zone ? "Update" : "Create"} Zone
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
