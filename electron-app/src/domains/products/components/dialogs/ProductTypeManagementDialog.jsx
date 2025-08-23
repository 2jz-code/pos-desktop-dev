import { useEffect, useState } from "react";
import {
	getProductTypes,
	createProductType,
	updateProductType,
	archiveProductType,
	unarchiveProductType,
	validateProductTypeArchiving,
	archiveProductTypeWithDependencies,
	getAlternativeProductTypes,
} from "@/domains/products/services/productTypeService";
import { reassignProducts } from "@/domains/products/services/categoryService";
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
	DialogTrigger,
	DialogFooter,
	DialogDescription,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { useToast } from "@/shared/components/ui/use-toast";
import { ArchiveDependencyDialog } from "@/shared/components/ui/ArchiveDependencyDialog";
import { Edit, Archive, ArchiveRestore } from "lucide-react";

export function ProductTypeManagementDialog({ open, onOpenChange }) {
	const [productTypes, setProductTypes] = useState([]);
	const [showArchivedProductTypes, setShowArchivedProductTypes] = useState(false);
	const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
	const [editingType, setEditingType] = useState(null);
	const [formData, setFormData] = useState({ name: "", description: "" });
	const [dataChanged, setDataChanged] = useState(false);
	
	// Archive dialog state
	const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
	const [productTypeToArchive, setProductTypeToArchive] = useState(null);
	
	const { toast } = useToast();

	useEffect(() => {
		fetchProductTypes();
	}, [showArchivedProductTypes]);

	const fetchProductTypes = async () => {
		try {
			const params = {};
			if (showArchivedProductTypes) {
				params.include_archived = 'only';
			}
			
			console.log('Fetching product types with params:', params);
			const response = await getProductTypes(params);
			console.log('Product types response:', response);
			
			const data = response.data?.results || response.data || [];
			console.log('Processed data:', data);
			setProductTypes(Array.isArray(data) ? data : []);
		} catch (error) {
			console.error("Failed to fetch product types:", error);
			toast({
				title: "Error",
				description: "Failed to fetch product types.",
				variant: "destructive",
			});
		}
	};

	const handleFormChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

	const openFormDialog = (type = null) => {
		setEditingType(type);
		setFormData(
			type
				? { name: type.name, description: type.description }
				: { name: "", description: "" }
		);
		setIsFormDialogOpen(true);
	};

	const closeFormDialog = () => {
		setIsFormDialogOpen(false);
		setEditingType(null);
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


	const handleArchiveToggle = async (productType) => {
		try {
			console.log('Archive toggle called for product type:', productType);
			if (productType.is_active) {
				// Use dependency-aware archiving for active product types
				setProductTypeToArchive(productType);
				setArchiveDialogOpen(true);
			} else {
				// Direct unarchive for inactive product types (no dependencies)
				console.log('Unarchiving product type with ID:', productType.id);
				const response = await unarchiveProductType(productType.id);
				console.log("Unarchive response:", response);
				toast({
					title: "Success",
					description: "Product type restored successfully.",
				});
				setDataChanged(true);
				fetchProductTypes();
			}
		} catch (error) {
			console.error("Archive/restore error:", error);
			
			// Better error handling - check for specific error messages
			let errorMessage = "Failed to update product type status.";
			if (error.response?.status === 403) {
				errorMessage = "You don't have permission to archive product types.";
			} else if (error.response?.status === 401) {
				errorMessage = "You need to be logged in to archive product types.";
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

	// Archive dialog handlers
	const handleArchiveDialogOpenChange = (open) => {
		if (!open) {
			setProductTypeToArchive(null);
		}
		setArchiveDialogOpen(open);
	};

	const archiveWithCallback = async (id, options) => {
		const result = await archiveProductTypeWithDependencies(id, options);
		setDataChanged(true);
		fetchProductTypes();
		return result;
	};

	const handleFormSubmit = async (e) => {
		e.preventDefault();
		try {
			if (editingType) {
				await updateProductType(editingType.id, formData);
				toast({ title: "Success", description: "Product type updated." });
			} else {
				await createProductType(formData);
				toast({ title: "Success", description: "Product type created." });
			}
			setDataChanged(true);
			fetchProductTypes();
			closeFormDialog();
		} catch (error) {
			console.error("Failed to save product type:", error);
			toast({
				title: "Error",
				description: "Failed to save product type.",
				variant: "destructive",
			});
		}
	};


	return (
		<Dialog
			open={open}
			onOpenChange={handleDialogClose}
		>
			<DialogContent className="!max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
				<DialogHeader>
					<DialogTitle>
						{showArchivedProductTypes ? "Archived Product Types" : "Manage Product Types"}
					</DialogTitle>
				</DialogHeader>
				<div className="flex-1 overflow-hidden">
					<div className="flex justify-between items-center mb-4">
						<Button
							variant={showArchivedProductTypes ? "default" : "outline"}
							size="sm"
							onClick={() => setShowArchivedProductTypes(!showArchivedProductTypes)}
						>
							{showArchivedProductTypes ? (
								<ArchiveRestore className="mr-2 h-4 w-4" />
							) : (
								<Archive className="mr-2 h-4 w-4" />
							)}
							{showArchivedProductTypes ? "Show Active" : "Show Archived"}
						</Button>
						<Button onClick={() => openFormDialog()}>Add Product Type</Button>
					</div>
					<div className="border rounded-lg overflow-hidden">
						<div className="max-h-[60vh] overflow-y-auto">
							<Table>
								<TableHeader className="sticky top-0 bg-background">
									<TableRow>
										<TableHead className="w-[250px]">Name</TableHead>
										<TableHead className="w-[300px]">Description</TableHead>
										<TableHead className="w-[100px] text-center">Status</TableHead>
										<TableHead className="w-[120px] text-center">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{(Array.isArray(productTypes) ? productTypes : []).map((type) => (
										<TableRow 
											key={type.id}
											className={type.is_active ? "" : "opacity-60"}
										>
											<TableCell 
												className={`font-medium ${
													type.is_active ? "" : "line-through text-gray-500"
												}`}
											>
												<div className="truncate max-w-[230px]" title={type.name}>
													{type.name}
													{!type.is_active && (
														<span className="ml-2 text-xs text-orange-600 font-normal">
															(Archived)
														</span>
													)}
												</div>
											</TableCell>
											<TableCell className="text-slate-600 dark:text-slate-400">
												<div className="truncate max-w-[280px]" title={type.description || ""}>
													{type.description || "—"}
												</div>
											</TableCell>
											<TableCell className="text-center">
												<Badge
													variant={type.is_active ? "default" : "secondary"}
													className={`text-xs whitespace-nowrap ${
														type.is_active
															? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
															: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
													}`}
												>
													{type.is_active ? "Active" : "Archived"}
												</Badge>
											</TableCell>
											<TableCell>
												<div className="flex items-center justify-center gap-1">
													<Button
														variant="ghost"
														size="sm"
														onClick={() => openFormDialog(type)}
														className="h-8 w-8 p-0"
													>
														<Edit className="h-4 w-4" />
														<span className="sr-only">Edit product type</span>
													</Button>
													<Button
														variant="ghost"
														size="sm"
														onClick={() => handleArchiveToggle(type)}
														className={`h-8 w-8 p-0 ${
															type.is_active 
																? "text-orange-500 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950"
																: "text-green-500 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
														}`}
													>
														{type.is_active ? (
															<Archive className="h-4 w-4" />
														) : (
															<ArchiveRestore className="h-4 w-4" />
														)}
														<span className="sr-only">
															{type.is_active ? "Archive product type" : "Restore product type"}
														</span>
													</Button>
												</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
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
							{editingType ? "Edit Product Type" : "Add Product Type"}
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
			
			{/* Archive Dependency Dialog */}
			{productTypeToArchive && (
				<ArchiveDependencyDialog
					open={archiveDialogOpen}
					onOpenChange={handleArchiveDialogOpenChange}
					type="product-type"
					itemId={productTypeToArchive.id}
					itemName={productTypeToArchive.name}
					onValidate={validateProductTypeArchiving}
					onArchive={archiveWithCallback}
					onGetAlternatives={getAlternativeProductTypes}
					onReassignProducts={reassignProducts}
				/>
			)}

		</Dialog>
	);
}
