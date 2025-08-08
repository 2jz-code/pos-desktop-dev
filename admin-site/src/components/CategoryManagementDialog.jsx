import { useEffect, useState } from "react";
import {
	getCategories,
	createCategory,
	updateCategory,
	deleteCategory,
} from "@/services/api/categoryService";
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
	DialogFooter,
	DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import {
	Plus,
	Edit,
	Trash2,
	Loader2,
	AlertCircle,
	FolderOpen,
	Folder,
} from "lucide-react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function CategoryManagementDialog({ open, onOpenChange }) {
	const [categories, setCategories] = useState([]);
	const [loading, setLoading] = useState(false);
	const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [editingCategory, setEditingCategory] = useState(null);
	const [categoryToDelete, setCategoryToDelete] = useState(null);
	const [dataChanged, setDataChanged] = useState(false);
	const [formData, setFormData] = useState({
		name: "",
		description: "",
		parent: "none",
		order: 0,
		is_public: true,
	});
	const [errors, setErrors] = useState({});
	const { toast } = useToast();

	useEffect(() => {
		if (open) {
			setDataChanged(false); // Reset the flag when opening
			fetchCategories();
		}
	}, [open]);

	const fetchCategories = async () => {
		try {
			setLoading(true);
			const response = await getCategories();
			const data = response.data?.results || response.data || [];
			setCategories(data);
		} catch (error) {
			console.error("Failed to fetch categories:", error);
			toast({
				title: "Error",
				description: "Failed to fetch categories.",
				variant: "destructive",
			});
		} finally {
			setLoading(false);
		}
	};

	const handleFormChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
		// Clear error when user starts typing
		if (errors[name]) {
			setErrors((prev) => ({ ...prev, [name]: "" }));
		}
	};

	const handleSelectChange = (name, value) => {
		setFormData((prev) => ({ ...prev, [name]: value }));
		// Clear error when user makes selection
		if (errors[name]) {
			setErrors((prev) => ({ ...prev, [name]: "" }));
		}
	};

	const openFormDialog = (category = null) => {
		setEditingCategory(category);
		setFormData(
			category
				? {
						name: category.name,
						description: category.description || "",
						parent: category.parent ? category.parent.id.toString() : "none",
						order: category.order || 0,
						is_public:
							category.is_public !== undefined ? category.is_public : true,
				  }
				: {
						name: "",
						description: "",
						parent: "none",
						order: 0,
						is_public: true,
				  }
		);
		setErrors({});
		setIsFormDialogOpen(true);
	};

	const openDeleteDialog = (category) => {
		setCategoryToDelete(category);
		setIsDeleteDialogOpen(true);
	};

	const validateForm = () => {
		const newErrors = {};

		if (!formData.name.trim()) {
			newErrors.name = "Category name is required";
		}

		// Check if trying to set parent to itself
		if (editingCategory && formData.parent === editingCategory.id.toString()) {
			newErrors.parent = "Cannot set category as its own parent";
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleSaveCategory = async () => {
		if (!validateForm()) {
			return;
		}

		try {
			setLoading(true);

			const submitData = {
				name: formData.name.trim(),
				description: formData.description.trim(),
				parent_id:
					formData.parent && formData.parent !== "none"
						? parseInt(formData.parent)
						: null,
				order: parseInt(formData.order) || 0,
				is_public: formData.is_public,
			};

			if (editingCategory) {
				await updateCategory(editingCategory.id, submitData);
				toast({
					title: "Success",
					description: "Category updated successfully.",
				});
			} else {
				await createCategory(submitData);
				toast({
					title: "Success",
					description: "Category created successfully.",
				});
			}

			setIsFormDialogOpen(false);
			setDataChanged(true);
			fetchCategories();
		} catch (error) {
			console.error("Failed to save category:", error);

			// Handle validation errors from backend
			if (error.response?.data) {
				const backendErrors = error.response.data;
				setErrors(backendErrors);
			}

			toast({
				title: "Error",
				description: "Failed to save category.",
				variant: "destructive",
			});
		} finally {
			setLoading(false);
		}
	};

	const handleDeleteCategory = async () => {
		if (!categoryToDelete) return;

		try {
			setLoading(true);
			await deleteCategory(categoryToDelete.id);
			toast({
				title: "Success",
				description: "Category deleted successfully.",
			});
			setIsDeleteDialogOpen(false);
			setDataChanged(true);
			fetchCategories();
		} catch (error) {
			console.error("Failed to delete category:", error);
			toast({
				title: "Error",
				description: "Failed to delete category. It may be in use by products.",
				variant: "destructive",
			});
		} finally {
			setLoading(false);
		}
	};

	const renderCategoryOptions = (parentId = null, level = 0) => {
		return categories
			.filter((c) => (c.parent?.id || null) === parentId)
			.filter((c) => !editingCategory || c.id !== editingCategory.id) // Don't allow setting self as parent
			.flatMap((c) => [
				<SelectItem
					key={c.id}
					value={c.id.toString()}
				>
					{"\u00A0".repeat(level * 4)}
					{c.name}
				</SelectItem>,
				...renderCategoryOptions(c.id, level + 1),
			]);
	};

	const getCategoryHierarchy = (category) => {
		if (!category.parent) return category.name;
		return `${category.parent.name} > ${category.name}`;
	};

	const flattenedCategories = (parentId = null, level = 0) => {
		return categories
			.filter((c) => (c.parent?.id || null) === parentId)
			.flatMap((c) => [
				{ ...c, level },
				...flattenedCategories(c.id, level + 1),
			]);
	};

	const resetForm = () => {
		setFormData({
			name: "",
			description: "",
			parent: "none",
			order: 0,
			is_public: true,
		});
		setErrors({});
		setEditingCategory(null);
	};

	const handleFormDialogOpenChange = (open) => {
		if (!open) {
			resetForm();
		}
		setIsFormDialogOpen(open);
	};

	return (
		<>
			<Dialog
				open={open}
				onOpenChange={onOpenChange}
			>
				<DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Category Management</DialogTitle>
						<DialogDescription>
							Create, edit, and manage your product categories. Parent
							categories can contain subcategories.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4">
						<div className="flex justify-between items-center">
							<div className="text-sm text-muted-foreground">
								Total Categories: {categories.length}
							</div>
							<Button onClick={() => openFormDialog()}>
								<Plus className="mr-2 h-4 w-4" />
								Add Category
							</Button>
						</div>

						{loading && categories.length === 0 ? (
							<div className="flex justify-center items-center h-48">
								<Loader2 className="h-6 w-6 animate-spin" />
							</div>
						) : (
							<div className="border rounded-lg">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Name</TableHead>
											<TableHead>Description</TableHead>
											<TableHead>Type</TableHead>
											<TableHead>Hierarchy</TableHead>
											<TableHead className="text-center">Order</TableHead>
											<TableHead className="text-center">Visibility</TableHead>
											<TableHead className="text-right">Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{categories.length === 0 ? (
											<TableRow>
												<TableCell
													colSpan={7}
													className="text-center py-8"
												>
													<div className="flex flex-col items-center space-y-2">
														<FolderOpen className="h-12 w-12 text-muted-foreground" />
														<p className="text-muted-foreground">
															No categories found. Create your first category!
														</p>
													</div>
												</TableCell>
											</TableRow>
										) : (
											flattenedCategories().map((category) => (
												<TableRow key={category.id}>
													<TableCell 
														className="font-medium"
														style={{ paddingLeft: `${category.level * 20 + 12}px` }}
													>
														{category.name}
													</TableCell>
													<TableCell>
														{category.description || (
															<span className="text-muted-foreground">
																No description
															</span>
														)}
													</TableCell>
													<TableCell>
														{category.parent ? (
															<Badge variant="secondary">
																<Folder className="mr-1 h-3 w-3" />
																Subcategory
															</Badge>
														) : (
															<Badge variant="default">
																<FolderOpen className="mr-1 h-3 w-3" />
																Parent
															</Badge>
														)}
													</TableCell>
													<TableCell>
														<span className="text-sm">
															{getCategoryHierarchy(category)}
														</span>
													</TableCell>
													<TableCell className="text-center">
														<Badge
															variant="secondary"
															className="text-xs"
														>
															{category.order || 0}
														</Badge>
													</TableCell>
													<TableCell className="text-center">
														<Badge
															variant={
																category.is_public ? "default" : "outline"
															}
															className={`text-xs ${
																category.is_public
																	? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
																	: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
															}`}
														>
															{category.is_public ? "Public" : "Private"}
														</Badge>
													</TableCell>
													<TableCell className="text-right">
														<div className="flex justify-end space-x-2">
															<Button
																variant="ghost"
																size="sm"
																onClick={() => openFormDialog(category)}
															>
																<Edit className="h-4 w-4" />
															</Button>
															<Button
																variant="ghost"
																size="sm"
																onClick={() => openDeleteDialog(category)}
																className="text-destructive hover:text-destructive"
															>
																<Trash2 className="h-4 w-4" />
															</Button>
														</div>
													</TableCell>
												</TableRow>
											))
										)}
									</TableBody>
								</Table>
							</div>
						)}
					</div>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => onOpenChange(dataChanged)}
						>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Category Form Dialog */}
			<Dialog
				open={isFormDialogOpen}
				onOpenChange={handleFormDialogOpenChange}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>
							{editingCategory ? "Edit Category" : "Add New Category"}
						</DialogTitle>
						<DialogDescription>
							{editingCategory
								? "Update the category information below."
								: "Fill in the details for the new category."}
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-4">
						<div className="grid grid-cols-4 items-center gap-4">
							<Label
								htmlFor="name"
								className="text-right"
							>
								Name <span className="text-red-500">*</span>
							</Label>
							<div className="col-span-3">
								<Input
									id="name"
									name="name"
									value={formData.name}
									onChange={handleFormChange}
									placeholder="Category name"
									className={errors.name ? "border-red-500" : ""}
								/>
								{errors.name && (
									<p className="text-sm text-red-500 mt-1">{errors.name}</p>
								)}
							</div>
						</div>

						<div className="grid grid-cols-4 items-center gap-4">
							<Label
								htmlFor="description"
								className="text-right"
							>
								Description
							</Label>
							<div className="col-span-3">
								<Textarea
									id="description"
									name="description"
									value={formData.description}
									onChange={handleFormChange}
									placeholder="Category description"
									rows={3}
								/>
							</div>
						</div>

						<div className="grid grid-cols-4 items-center gap-4">
							<Label
								htmlFor="parent"
								className="text-right"
							>
								Parent Category
							</Label>
							<div className="col-span-3">
								<Select
									value={formData.parent}
									onValueChange={(value) => handleSelectChange("parent", value)}
								>
									<SelectTrigger
										className={errors.parent ? "border-red-500" : ""}
									>
										<SelectValue placeholder="Select parent (optional)" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="none">None (Parent Category)</SelectItem>
										{renderCategoryOptions()}
									</SelectContent>
								</Select>
								{errors.parent && (
									<p className="text-sm text-red-500 mt-1">{errors.parent}</p>
								)}
							</div>
						</div>

						<div className="grid grid-cols-4 items-center gap-4">
							<Label
								htmlFor="order"
								className="text-right"
							>
								Display Order
							</Label>
							<div className="col-span-3">
								<Input
									id="order"
									name="order"
									type="number"
									value={formData.order}
									onChange={handleFormChange}
									placeholder="0"
									min="0"
								/>
								<p className="text-sm text-muted-foreground mt-1">
									Lower numbers appear first
								</p>
							</div>
						</div>

						<div className="grid grid-cols-4 items-center gap-4">
							<Label
								htmlFor="is_public"
								className="text-right"
							>
								Public Visibility
							</Label>
							<div className="col-span-3">
								<div className="flex items-center space-x-2">
									<Switch
										id="is_public"
										checked={formData.is_public}
										onCheckedChange={(checked) =>
											setFormData((prev) => ({ ...prev, is_public: checked }))
										}
									/>
									<div className="flex flex-col">
										<p className="text-sm text-muted-foreground">
											Show this category and its products on the website
										</p>
									</div>
								</div>
							</div>
						</div>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsFormDialogOpen(false)}
							disabled={loading}
						>
							Cancel
						</Button>
						<Button
							onClick={handleSaveCategory}
							disabled={loading}
						>
							{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							{editingCategory ? "Update" : "Create"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Dialog */}
			<AlertDialog
				open={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle className="flex items-center gap-2">
							<AlertCircle className="h-5 w-5 text-destructive" />
							Delete Category
						</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete "{categoryToDelete?.name}"? This
							action cannot be undone.
							{categoryToDelete && !categoryToDelete.parent && (
								<div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
									<p className="text-sm text-yellow-800">
										<strong>Warning:</strong> This is a parent category.
										Deleting it may affect its subcategories.
									</p>
								</div>
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDeleteCategory}
							disabled={loading}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{loading ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Deleting...
								</>
							) : (
								"Delete"
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
