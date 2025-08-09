"use client";

import { useEffect, useState } from "react";
import {
	getCategories,
	createCategory,
	updateCategory,
	archiveCategory,
	unarchiveCategory,
	bulkUpdateCategories,
} from "@/domains/products/services/categoryService";
import { Button } from "@/shared/components/ui/button";
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
import DraggableList from "@/shared/components/ui/draggable-list";
import { Edit, Archive, ArchiveRestore } from "lucide-react";

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
	const [showArchivedCategories, setShowArchivedCategories] = useState(false);
	const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
	const [editingCategory, setEditingCategory] = useState(null);
	const [formData, setFormData] = useState({
		name: "",
		description: "",
		parent_id: null,
		order: 0,
		is_public: true,
	});
	const [dataChanged, setDataChanged] = useState(false);
	const { toast } = useToast();

	useEffect(() => {
		fetchCategories();
	}, [showArchivedCategories]);

	const fetchCategories = async () => {
		try {
			const params = {};
			if (showArchivedCategories) {
				params.include_archived = "only";
			} else {
				// When showing active categories, don't send any parameter to get only active records
				// The backend defaults to showing only active records when no include_archived parameter is provided
			}

			console.log("Fetching categories with params:", params);
			const response = await getCategories(params);
			console.log("Categories response:", response);
			const data = response.data?.results || response.data || [];
			console.log("Processed categories data:", data);
			// Sort categories by order field for management interface
			const sortedData = [...data].sort(
				(a, b) => (a.order || 0) - (b.order || 0)
			);
			setCategories(sortedData);
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
			// Sort updated categories by order field for management interface
			return updated.sort((a, b) => (a.order || 0) - (b.order || 0));
		});
		// Mark that data has changed
		setDataChanged(true);
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

		setCategories(updatedCategories);
		setDataChanged(true);

		// Save the new order to backend
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
			toast({
				title: "Error",
				description: "Failed to update category order.",
				variant: "destructive",
			});
			fetchCategories();
		}
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

	const handleDialogClose = (isOpen) => {
		if (!isOpen) {
			// Dialog is closing, notify parent if data changed
			onOpenChange(dataChanged);
			// Reset the dataChanged flag for next time
			setDataChanged(false);
		} else {
			onOpenChange(isOpen);
		}
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
			setDataChanged(true);
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

	const handleArchiveToggle = async (category) => {
		try {
			if (category.is_active) {
				const response = await archiveCategory(category.id);
				console.log("Archive response:", response);
				toast({
					title: "Success",
					description: "Category archived successfully.",
				});
			} else {
				const response = await unarchiveCategory(category.id);
				console.log("Unarchive response:", response);
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

	return (
		<Dialog
			open={open}
			onOpenChange={handleDialogClose}
		>
			<DialogContent className="!max-w-7xl max-h-[95vh] overflow-hidden flex flex-col">
				<DialogHeader>
					<DialogTitle>
						{showArchivedCategories
							? "Archived Categories"
							: "Manage Categories"}
					</DialogTitle>
				</DialogHeader>
				<div className="flex-1 overflow-hidden">
					<div className="flex justify-between items-center mb-4">
						<Button
							variant={showArchivedCategories ? "default" : "outline"}
							size="sm"
							onClick={() => setShowArchivedCategories(!showArchivedCategories)}
						>
							{showArchivedCategories ? (
								<ArchiveRestore className="mr-2 h-4 w-4" />
							) : (
								<Archive className="mr-2 h-4 w-4" />
							)}
							{showArchivedCategories ? "Show Active" : "Show Archived"}
						</Button>
						<Button onClick={() => openFormDialog()}>Add Category</Button>
					</div>
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
												<span className="text-gray-400 text-xs mr-2">└</span>
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
												category.is_active ? "" : "line-through text-gray-500"
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
		</Dialog>
	);
}
