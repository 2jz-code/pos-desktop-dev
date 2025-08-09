import { useEffect, useState } from "react";
import {
	getCategories,
	createCategory,
	updateCategory,
	archiveCategory,
	unarchiveCategory,
	bulkUpdateCategories,
} from "@/services/api/categoryService";
import { Button } from "@/components/ui/button";
import DraggableList from "@/components/ui/draggable-list";
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
	Loader2,
	FolderOpen,
	Folder,
	Archive,
	ArchiveRestore,
} from "lucide-react";

export function CategoryManagementDialog({ open, onOpenChange }) {
	const [categories, setCategories] = useState([]);
	const [loading, setLoading] = useState(false);
	const [showArchivedCategories, setShowArchivedCategories] = useState(false);
	const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
	const [editingCategory, setEditingCategory] = useState(null);
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
	}, [open, showArchivedCategories]);

	const fetchCategories = async () => {
		try {
			setLoading(true);
			const params = {};
			if (showArchivedCategories) {
				params.include_archived = "only";
			}
			const response = await getCategories(params);
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

	// Build hierarchical list for drag-and-drop
	const buildHierarchicalList = () => {
		const parentCategories = categories
			.filter((cat) => !cat.parent)
			.sort((a, b) => (a.order || 0) - (b.order || 0));
		const hierarchicalList = [];

		parentCategories.forEach((parent) => {
			hierarchicalList.push({ ...parent, level: 0, isParent: true });

			// Add children of this parent
			const children = categories
				.filter((cat) => cat.parent?.id === parent.id)
				.sort((a, b) => (a.order || 0) - (b.order || 0));

			children.forEach((child) => {
				hierarchicalList.push({ ...child, level: 1, isParent: false });
			});
		});

		return hierarchicalList;
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

	const handleReorder = async (
		reorderedHierarchicalList,
		sourceIndex,
		destinationIndex
	) => {
		const hierarchicalList = buildHierarchicalList();
		const sourceItem = hierarchicalList[sourceIndex];
		const destinationItem = hierarchicalList[destinationIndex];

		// Prevent invalid moves (parent to child position or child to parent position)
		const isSourceParent = sourceItem.isParent;
		const isDestinationParent = destinationItem.isParent;

		if (isSourceParent !== isDestinationParent) {
			toast({
				title: "Invalid Move",
				description:
					"Cannot move parent categories to child positions or vice versa.",
				variant: "destructive",
			});
			return;
		}

		// For children, ensure they stay within the same parent group
		if (
			!isSourceParent &&
			sourceItem.parent?.id !== destinationItem.parent?.id
		) {
			toast({
				title: "Invalid Move",
				description:
					"Child categories can only be reordered within their parent category.",
				variant: "destructive",
			});
			return;
		}

		// Update order values based on new positions within the same level
		let updatedCategories;
		if (isSourceParent) {
			// Reordering parent categories
			const parentCategories = categories.filter((cat) => !cat.parent);
			const childCategories = categories.filter((cat) => cat.parent);

			// Find original parent indices
			const parentSourceIndex = parentCategories.findIndex(
				(cat) => cat.id === sourceItem.id
			);
			const parentDestinationIndex = parentCategories.findIndex(
				(cat) => cat.id === destinationItem.id
			);

			const reorderedParents = Array.from(parentCategories);
			const [movedParent] = reorderedParents.splice(parentSourceIndex, 1);
			reorderedParents.splice(parentDestinationIndex, 0, movedParent);

			// Update parent orders
			const updatedParents = reorderedParents.map((parent, index) => ({
				...parent,
				order: index + 1,
			}));

			updatedCategories = [...updatedParents, ...childCategories];
		} else {
			// Reordering child categories within the same parent
			const parentId = sourceItem.parent.id;
			const siblingCategories = categories.filter(
				(cat) => cat.parent?.id === parentId
			);
			const otherCategories = categories.filter(
				(cat) => cat.parent?.id !== parentId
			);

			const siblingSourceIndex = siblingCategories.findIndex(
				(cat) => cat.id === sourceItem.id
			);
			const siblingDestinationIndex = siblingCategories.findIndex(
				(cat) => cat.id === destinationItem.id
			);

			const reorderedSiblings = Array.from(siblingCategories);
			const [movedChild] = reorderedSiblings.splice(siblingSourceIndex, 1);
			reorderedSiblings.splice(siblingDestinationIndex, 0, movedChild);

			// Update child orders within parent
			const updatedSiblings = reorderedSiblings.map((child, index) => ({
				...child,
				order: index + 1,
			}));

			updatedCategories = [...otherCategories, ...updatedSiblings];
		}

		// Store original state for rollback on error
		const originalCategories = [...categories];

		// Optimistically update UI first
		setCategories(updatedCategories);
		setDataChanged(true);

		// Save the new order to backend - use sequential updates to avoid race conditions
		try {
			const categoriesToUpdate = isSourceParent
				? updatedCategories.filter((cat) => !cat.parent)
				: updatedCategories.filter(
						(cat) => cat.parent?.id === sourceItem.parent.id
				  );

			// Use bulk update API for better performance
			const categoryUpdates = categoriesToUpdate.map(category => ({
				id: category.id,
				name: category.name,
				description: category.description || "",
				parent_id: category.parent?.id || null,
				order: category.order,
				is_public: category.is_public !== undefined ? category.is_public : true
			}));

			await bulkUpdateCategories(categoryUpdates);

			toast({
				title: "Success",
				description: "Category order updated successfully.",
			});
		} catch (error) {
			console.error("Failed to update category order:", error);

			// Rollback to original state instead of refetching to avoid scrambling
			setCategories(originalCategories);

			toast({
				title: "Error",
				description:
					"Failed to update category order. Changes have been reverted.",
				variant: "destructive",
			});
		}
	};

	const handleArchiveToggle = async (category) => {
		try {
			if (category.is_active) {
				await archiveCategory(category.id);
				toast({
					title: "Success",
					description: "Category archived successfully.",
				});
			} else {
				await unarchiveCategory(category.id);
				toast({
					title: "Success",
					description: "Category restored successfully.",
				});
			}
			setDataChanged(true);
			fetchCategories();
		} catch (error) {
			console.error("Archive/restore error:", error);

			// Better error handling - check for specific error messages
			let errorMessage = "Failed to update category status.";
			if (error.response?.status === 403) {
				errorMessage = "You don't have permission to archive categories.";
			} else if (error.response?.status === 401) {
				errorMessage = "You need to be logged in to archive categories.";
			} else if (error.response?.data?.error) {
				errorMessage = error.response.data.error;
			} else if (error.message) {
				errorMessage = error.message;
			}

			toast({
				title: "Error",
				description: errorMessage,
				variant: "destructive",
			});
		}
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
							<div className="flex items-center space-x-3">
								<div className="text-sm text-muted-foreground">
									{showArchivedCategories ? "Archived" : "Active"} Categories:{" "}
									{categories.length}
								</div>
								<Button
									variant={showArchivedCategories ? "default" : "outline"}
									size="sm"
									onClick={() =>
										setShowArchivedCategories(!showArchivedCategories)
									}
								>
									{showArchivedCategories ? (
										<ArchiveRestore className="mr-2 h-4 w-4" />
									) : (
										<Archive className="mr-2 h-4 w-4" />
									)}
									{showArchivedCategories ? "Show Active" : "Show Archived"}
								</Button>
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
							<DraggableList
								items={buildHierarchicalList()}
								onReorder={handleReorder}
								getItemId={(item) => item.id}
								tableStyle={true}
								showHeaders={true}
								headers={[
									{ label: "Name", className: "flex-1" },
									{ label: "Description", className: "w-[150px]" },
									{ label: "Parent", className: "w-[100px]" },
									{ label: "Order", className: "w-[80px] text-center" },
									{ label: "Public", className: "w-[80px] text-center" },
									{ label: "Actions", className: "w-[100px] text-center" },
								]}
								showEmptyState={true}
								emptyStateMessage="No categories yet"
								className="border rounded-lg"
								renderItem={({ item: category, dragHandle }) => (
									<div
										className={`flex items-center gap-3 p-3 ${
											category.is_active ? "" : "opacity-60"
										}`}
									>
										{dragHandle}

										{/* Name with visual hierarchy indicators */}
										<div className="flex-1">
											<div className="flex items-center">
												{/* Visual indicator for hierarchy level */}
												{category.level > 0 && (
													<>
														<div className="w-4 h-4 mr-2 flex items-center justify-center">
															<div className="w-2 h-px bg-gray-300"></div>
														</div>
														<span className="text-gray-400 text-xs mr-2">
															└
														</span>
													</>
												)}
												{/* Parent indicator icon */}
												{category.isParent && (
													<span className="text-blue-600 text-xs mr-2 font-semibold">
														●
													</span>
												)}
												<div
													className={`font-medium ${
														category.is_active
															? ""
															: "line-through text-gray-500"
													} ${
														category.isParent
															? "text-blue-800 font-semibold"
															: "text-gray-700"
													}`}
												>
													{category.name}
													{!category.is_active && (
														<span className="ml-2 text-xs text-orange-600 font-normal">
															(Archived)
														</span>
													)}
												</div>
											</div>
										</div>

										{/* Description */}
										<div className="w-[150px] text-slate-600 dark:text-slate-400 truncate text-sm">
											{category.description || "—"}
										</div>

										{/* Parent */}
										<div className="w-[100px]">
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
										</div>

										{/* Order */}
										<div className="w-[80px] text-center">
											<span className="text-sm font-medium">
												{category.order || 0}
											</span>
										</div>

										{/* Public */}
										<div className="w-[80px] text-center">
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
										</div>

										{/* Actions */}
										<div className="w-[100px] flex items-center justify-center gap-1">
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
												onClick={() => handleArchiveToggle(category)}
												className={`h-8 w-8 p-0 ${
													category.is_active
														? "text-orange-500 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950"
														: "text-green-500 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
												}`}
											>
												{category.is_active ? (
													<Archive className="h-4 w-4" />
												) : (
													<ArchiveRestore className="h-4 w-4" />
												)}
												<span className="sr-only">
													{category.is_active
														? "Archive category"
														: "Restore category"}
												</span>
											</Button>
										</div>
									</div>
								)}
							/>
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
		</>
	);
}
