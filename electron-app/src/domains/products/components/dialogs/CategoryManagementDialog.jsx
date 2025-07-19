"use client";

import { useEffect, useState } from "react";
import {
	getCategories,
	createCategory,
	updateCategory,
	deleteCategory,
} from "@/domains/products/services/categoryService";
import { Button } from "@/shared/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/shared/components/ui/table";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
	DialogDescription,
} from "@/shared/components/ui/dialog";
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
import { useToast } from "@/shared/components/ui/use-toast";
import { Edit, Trash2 } from "lucide-react";

// Inline Order Editor Component
function InlineOrderEditor({ category, onOrderChange }) {
	const [isEditing, setIsEditing] = useState(false);
	const [orderValue, setOrderValue] = useState(category.order);
	const [isSaving, setIsSaving] = useState(false);
	const { toast } = useToast();

	const handleSave = async () => {
		if (orderValue === category.order) {
			setIsEditing(false);
			return;
		}

		setIsSaving(true);
		try {
			// Send all existing category data with the updated order
			const updateData = {
				name: category.name,
				description: category.description,
				parent_id: category.parent?.id || null,
				order: parseInt(orderValue),
				is_public: category.is_public,
			};
			await updateCategory(category.id, updateData);
			onOrderChange(category.id, parseInt(orderValue));
			setIsEditing(false);
			toast({
				title: "Success",
				description: `Order updated to ${orderValue}`,
			});
		} catch (error) {
			console.error("Failed to update order:", error);
			setOrderValue(category.order); // Reset to original value
			toast({
				title: "Error",
				description: "Failed to update order.",
				variant: "destructive",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const handleKeyPress = (e) => {
		if (e.key === "Enter") {
			handleSave();
		} else if (e.key === "Escape") {
			setOrderValue(category.order);
			setIsEditing(false);
		}
	};

	const handleBlur = () => {
		handleSave();
	};

	if (isEditing) {
		return (
			<Input
				type="number"
				value={orderValue}
				onChange={(e) => setOrderValue(e.target.value)}
				onKeyDown={handleKeyPress}
				onBlur={handleBlur}
				className="w-16 h-6 text-center text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
				disabled={isSaving}
				autoFocus
			/>
		);
	}

	return (
		<Badge
			variant="secondary"
			className="text-xs cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700"
			onClick={() => setIsEditing(true)}
			title="Click to edit order"
		>
			{category.order}
		</Badge>
	);
}

export function CategoryManagementDialog({ open, onOpenChange }) {
	const [categories, setCategories] = useState([]);
	const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [editingCategory, setEditingCategory] = useState(null);
	const [categoryToDelete, setCategoryToDelete] = useState(null);
	const [formData, setFormData] = useState({
		name: "",
		description: "",
		parent_id: null,
		order: 0,
		is_public: true,
	});
	const { toast } = useToast();

	useEffect(() => {
		fetchCategories();
	}, []);

	const fetchCategories = async () => {
		try {
			const response = await getCategories();
			const sorted = [...response.data].sort((a, b) => a.order - b.order);
			setCategories(sorted);
		} catch (error) {
			console.error("Failed to fetch categories:", error);
			toast({
				title: "Error",
				description: "Failed to fetch categories.",
				variant: "destructive",
			});
		}
	};

	const handleOrderChange = (categoryId, newOrder) => {
		setCategories((prevCategories) => {
			const updated = prevCategories.map((cat) =>
				cat.id === categoryId ? { ...cat, order: newOrder } : cat
			);
			// Re-sort categories by order
			return updated.sort((a, b) => a.order - b.order);
		});
	};

	const handleFormChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

	const handleParentChange = (value) => {
		const parentId = value === "null" ? null : Number.parseInt(value, 10);
		setFormData((prev) => ({ ...prev, parent_id: parentId }));
	};

	const openFormDialog = (category = null) => {
		setEditingCategory(category);
		setFormData(
			category
				? {
						name: category.name,
						description: category.description,
						parent_id: category.parent?.id || null,
						order: category.order || 0,
						is_public: category.is_public,
				  }
				: {
						name: "",
						description: "",
						parent_id: null,
						order: 0,
						is_public: true,
				  }
		);
		setIsFormDialogOpen(true);
	};

	const closeFormDialog = () => {
		setIsFormDialogOpen(false);
		setEditingCategory(null);
	};

	const openDeleteDialog = (category) => {
		setCategoryToDelete(category);
		setIsDeleteDialogOpen(true);
	};

	const closeDeleteDialog = () => {
		setIsDeleteDialogOpen(false);
		setCategoryToDelete(null);
	};

	const handleFormSubmit = async (e) => {
		e.preventDefault();
		try {
			if (editingCategory) {
				await updateCategory(editingCategory.id, formData);
				toast({ title: "Success", description: "Category updated." });
			} else {
				await createCategory(formData);
				toast({ title: "Success", description: "Category created." });
			}
			fetchCategories();
			closeFormDialog();
		} catch (error) {
			console.error("Failed to save category:", error);
			toast({
				title: "Error",
				description: "Failed to save category.",
				variant: "destructive",
			});
		}
	};

	const handleDelete = async () => {
		if (!categoryToDelete) return;
		try {
			await deleteCategory(categoryToDelete.id);
			toast({ title: "Success", description: "Category deleted." });
			fetchCategories();
			closeDeleteDialog();
		} catch (error) {
			console.error("Failed to delete category:", error);
			toast({
				title: "Error",
				description: "Failed to delete category.",
				variant: "destructive",
			});
		}
	};

	const renderCategoryOptions = (parentId = null, level = 0) => {
		return categories
			.filter((c) => (c.parent?.id || null) === parentId)
			.flatMap((c) => [
				<SelectItem
					key={c.id}
					value={String(c.id)}
				>
					{"\u00A0".repeat(level * 4)}
					{c.name}
				</SelectItem>,
				...renderCategoryOptions(c.id, level + 1),
			]);
	};

	const flattenedCategories = (parentId = null, level = 0) => {
		return categories
			.filter((c) => (c.parent?.id || null) === parentId)
			.flatMap((c) => [
				{ ...c, level },
				...flattenedCategories(c.id, level + 1),
			]);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
		>
			<DialogContent className="!max-w-7xl max-h-[95vh] overflow-hidden flex flex-col">
				<DialogHeader>
					<DialogTitle>Manage Categories</DialogTitle>
				</DialogHeader>
				<div className="flex-1 overflow-hidden">
					<div className="flex justify-end mb-4">
						<Button onClick={() => openFormDialog()}>Add Category</Button>
					</div>
					<div className="border rounded-lg">
						<Table>
							<TableHeader className="sticky top-0 bg-background">
								<TableRow>
									<TableHead className="w-[200px]">Name</TableHead>
									<TableHead className="w-[150px]">Description</TableHead>
									<TableHead className="w-[100px]">Parent</TableHead>
									<TableHead className="w-[80px] text-center">Order</TableHead>
									<TableHead className="w-[80px] text-center">Public</TableHead>
									<TableHead className="w-[100px] text-center">
										Actions
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{flattenedCategories().map((category) => (
									<TableRow key={category.id}>
										<TableCell
											className="font-medium"
											style={{ paddingLeft: `${category.level * 20 + 12}px` }}
										>
											{category.name}
										</TableCell>
										<TableCell className="text-slate-600 dark:text-slate-400 truncate max-w-[150px]">
											{category.description || "—"}
										</TableCell>
										<TableCell>
											{category.parent?.name ? (
												<Badge
													variant="outline"
													className="text-xs"
												>
													{category.parent.name}
												</Badge>
											) : (
												<span className="text-slate-500 dark:text-slate-400 text-xs">
													None
												</span>
											)}
										</TableCell>
										<TableCell className="text-center">
											<InlineOrderEditor
												category={category}
												onOrderChange={handleOrderChange}
											/>
										</TableCell>
										<TableCell className="text-center">
											<Badge
												variant={category.is_public ? "default" : "outline"}
												className={`text-xs ${
													category.is_public
														? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
														: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
												}`}
											>
												{category.is_public ? "Public" : "Private"}
											</Badge>
										</TableCell>
										<TableCell>
											<div className="flex items-center justify-center gap-1">
												<Button
													variant="ghost"
													size="sm"
													onClick={() => openFormDialog(category)}
													className="h-8 w-8 p-0"
												>
													<Edit className="h-4 w-4" />
													<span className="sr-only">Edit category</span>
												</Button>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => openDeleteDialog(category)}
													className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
												>
													<Trash2 className="h-4 w-4" />
													<span className="sr-only">Delete category</span>
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</div>
			</DialogContent>

			{/* Form Dialog for Add/Edit */}
			<Dialog
				open={isFormDialogOpen}
				onOpenChange={setIsFormDialogOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{editingCategory ? "Edit Category" : "Add Category"}
						</DialogTitle>
					</DialogHeader>
					<form onSubmit={handleFormSubmit}>
						<div className="space-y-6 py-4">
							<div className="space-y-2">
								<Label htmlFor="name">Name</Label>
								<Input
									id="name"
									name="name"
									value={formData.name}
									onChange={handleFormChange}
									placeholder="Enter category name"
									required
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="description">Description</Label>
								<Input
									id="description"
									name="description"
									value={formData.description}
									onChange={handleFormChange}
									placeholder="Enter category description (optional)"
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="parent">Parent Category</Label>
								<Select
									value={
										formData.parent_id ? String(formData.parent_id) : "null"
									}
									onValueChange={handleParentChange}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select a parent category" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="null">None</SelectItem>
										{renderCategoryOptions()}
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-2">
								<Label htmlFor="order">Display Order</Label>
								<Input
									id="order"
									name="order"
									type="number"
									value={formData.order}
									onChange={handleFormChange}
									placeholder="0"
									min="0"
								/>
								<p className="text-sm text-slate-500 dark:text-slate-400">
									Lower numbers appear first
								</p>
							</div>

							<div className="flex items-center justify-between">
								<div className="space-y-1">
									<Label htmlFor="is_public">Public Visibility</Label>
									<p className="text-sm text-slate-500 dark:text-slate-400">
										Show this category and its products on the website
									</p>
								</div>
								<Switch
									id="is_public"
									checked={formData.is_public}
									onCheckedChange={(checked) =>
										setFormData((prev) => ({
											...prev,
											is_public: checked,
										}))
									}
								/>
							</div>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={closeFormDialog}
							>
								Cancel
							</Button>
							<Button type="submit">Save</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Dialog */}
			<Dialog
				open={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Are you sure?</DialogTitle>
						<DialogDescription>
							This action cannot be undone. This will permanently delete the
							category: <strong>{categoryToDelete?.name}</strong> and all its
							sub-categories.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={closeDeleteDialog}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={handleDelete}
						>
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Dialog>
	);
}
