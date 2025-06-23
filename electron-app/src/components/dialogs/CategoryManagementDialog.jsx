import { useEffect, useState } from "react";
import {
	getCategories,
	createCategory,
	updateCategory,
	deleteCategory,
} from "@/api/services/categoryService";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	DialogFooter,
	DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

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
	});
	const { toast } = useToast();

	useEffect(() => {
		fetchCategories();
	}, []);

	const fetchCategories = async () => {
		try {
			const response = await getCategories();
			setCategories(response.data);
		} catch (error) {
			console.error("Failed to fetch categories:", error);
			toast({
				title: "Error",
				description: "Failed to fetch categories.",
				variant: "destructive",
			});
		}
	};

	const handleFormChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

	const handleParentChange = (value) => {
		const parentId = value === "null" ? null : parseInt(value, 10);
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
				  }
				: { name: "", description: "", parent_id: null }
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
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>Manage Categories</DialogTitle>
				</DialogHeader>
				<div className="py-4">
					<div className="flex justify-end mb-4">
						<Button onClick={() => openFormDialog()}>Add Category</Button>
					</div>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Description</TableHead>
								<TableHead>Parent</TableHead>
								<TableHead>Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{flattenedCategories().map((category) => (
								<TableRow key={category.id}>
									<TableCell
										style={{ paddingLeft: `${category.level * 20}px` }}
									>
										{category.name}
									</TableCell>
									<TableCell>{category.description}</TableCell>
									<TableCell>{category.parent?.name || "None"}</TableCell>
									<TableCell>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => openFormDialog(category)}
										>
											Edit
										</Button>
										<Button
											variant="ghost"
											size="sm"
											className="text-red-500"
											onClick={() => openDeleteDialog(category)}
										>
											Delete
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
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
									name="name"
									value={formData.name}
									onChange={handleFormChange}
									className="col-span-3"
									required
								/>
							</div>
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="description"
									className="text-right"
								>
									Description
								</Label>
								<Input
									id="description"
									name="description"
									value={formData.description}
									onChange={handleFormChange}
									className="col-span-3"
								/>
							</div>
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="parent"
									className="text-right"
								>
									Parent Category
								</Label>
								<Select
									value={
										formData.parent_id ? String(formData.parent_id) : "null"
									}
									onValueChange={handleParentChange}
								>
									<SelectTrigger className="col-span-3">
										<SelectValue placeholder="Select a parent category" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="null">None</SelectItem>
										{renderCategoryOptions()}
									</SelectContent>
								</Select>
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
