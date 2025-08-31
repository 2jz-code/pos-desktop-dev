import React, { useState, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { getCategories } from "@/services/api/categoryService";
import CategoryTree from "./CategoryTree";
import type { Category } from "@/types";

// Helper to build the category tree
const buildTree = (categories: Category[]): Category[] => {
	const tree: Category[] = [];
	const map: { [key: number]: Category } = {};
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

interface Printer {
	id: number;
	name: string;
	connection_type: string;
	ip_address: string;
}

interface Zone {
	id: number;
	name: string;
	printerId: number;
	categories: (string | number)[];
}
interface AddEditKitchenZoneDialogProps {
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	onSave: (data: Partial<Zone>) => void;
	zone: Zone | null;
	printers: Printer[];
}

export const AddEditKitchenZoneDialog: React.FC<
	AddEditKitchenZoneDialogProps
> = ({ isOpen, onOpenChange, onSave, zone, printers }) => {
	const [formData, setFormData] = useState({
		name: "",
		printerId: "",
		categories: [] as (string | number)[], // Array of category IDs
	});

	const [categoryTree, setCategoryTree] = useState<Category[]>([]);
	const [loading, setLoading] = useState(false);

	// Fetch categories and product types when dialog opens
	useEffect(() => {
		if (isOpen) {
			fetchData();
		}
	}, [isOpen]);

	useEffect(() => {
		if (zone) {
			// Handle both printerId and printer_name for compatibility
			let printerValue = "";
			if (zone.printer_name) {
				// Find printer by name and get its ID
				const printer = printers.find(p => p.name === zone.printer_name);
				printerValue = printer ? String(printer.id) : "";
			} else if (zone.printerId) {
				printerValue = String(zone.printerId);
			}
			
			setFormData({
				name: zone.name || "",
				printerId: printerValue,
				categories: zone.categories || [],
			});
		} else {
			setFormData({
				name: "",
				printerId: "",
				categories: [],
			});
		}
	}, [zone, isOpen, printers]);

	const fetchData = async () => {
		setLoading(true);
		try {
			const categoriesResponse = await getCategories();
			setCategoryTree(buildTree(categoriesResponse.data?.results));
		} catch (error) {
			console.error("Failed to fetch categories:", error);
		} finally {
			setLoading(false);
		}
	};

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

	const handleSelectChange = (value: string) => {
		setFormData((prev) => ({ ...prev, printerId: value }));
	};

	const handleCategoryChange = (node: Category, checked: boolean) => {
		setFormData((prev) => {
			let newSelected = [...prev.categories];

			// Get all descendant IDs
			const getAllChildIds = (n: Category): number[] => {
				let ids = [n.id];
				n.children.forEach((child) => {
					ids = [...ids, ...getAllChildIds(child)];
				});
				return ids;
			};
			const childIds = getAllChildIds(node);

			if (checked) {
				// Add the node and all its children
				newSelected = [...new Set([...newSelected, ...childIds])];
			} else {
				// Remove the node and all its children
				newSelected = newSelected.filter(
					(id) => !childIds.includes(id as number)
				);
			}

			// Remove "ALL" if any specific category is toggled
			const allIndex = newSelected.indexOf("ALL");
			if (allIndex > -1) {
				newSelected.splice(allIndex, 1);
			}

			return { ...prev, categories: newSelected };
		});
	};

	const handleSelectAll = (checked: boolean) => {
		if (checked) {
			setFormData((prev) => ({ ...prev, categories: ["ALL"] }));
		} else {
			setFormData((prev) => ({ ...prev, categories: [] }));
		}
	};

	const handleSave = () => {
		onSave({
			...formData,
			printerId: parseInt(formData.printerId, 10),
		});
		onOpenChange(false);
	};

	const isAllSelected = formData.categories.includes("ALL");

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
								value={String(formData.printerId)}
								onValueChange={handleSelectChange}
							>
								<SelectTrigger className="col-span-3">
									<SelectValue placeholder="Select a printer" />
								</SelectTrigger>
								<SelectContent>
									{printers.map((p) => (
										<SelectItem
											key={p.id}
											value={String(p.id)}
										>
											{p.name} ({p.connection_type})
										</SelectItem>
									))}
								</SelectContent>
							</Select>
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
										checked={isAllSelected}
										onCheckedChange={handleSelectAll}
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
									<div className="pl-6">
										<CategoryTree
											nodes={categoryTree}
											selectedCategories={formData.categories}
											onCategoryChange={handleCategoryChange}
											disabled={isAllSelected}
										/>
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
