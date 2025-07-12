import { useEffect, useState } from "react";
import {
	getProductTypes,
	createProductType,
	updateProductType,
	deleteProductType,
} from "@/services/api/productTypeService";
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
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import {
	Plus,
	Edit,
	Trash2,
	Loader2,
	AlertCircle,
	Tag,
	Tags,
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

export function ProductTypeManagementDialog({ open, onOpenChange }) {
	const [productTypes, setProductTypes] = useState([]);
	const [loading, setLoading] = useState(false);
	const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [editingType, setEditingType] = useState(null);
	const [typeToDelete, setTypeToDelete] = useState(null);
	const [formData, setFormData] = useState({
		name: "",
		description: "",
	});
	const [errors, setErrors] = useState({});
	const { toast } = useToast();

	useEffect(() => {
		if (open) {
			fetchProductTypes();
		}
	}, [open]);

	const fetchProductTypes = async () => {
		try {
			setLoading(true);
			const response = await getProductTypes();
			setProductTypes(response.data || []);
		} catch (error) {
			console.error("Failed to fetch product types:", error);
			toast({
				title: "Error",
				description: "Failed to fetch product types.",
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

	const openFormDialog = (type = null) => {
		setEditingType(type);
		setFormData(
			type
				? {
						name: type.name,
						description: type.description || "",
				  }
				: { name: "", description: "" }
		);
		setErrors({});
		setIsFormDialogOpen(true);
	};

	const openDeleteDialog = (type) => {
		setTypeToDelete(type);
		setIsDeleteDialogOpen(true);
	};

	const validateForm = () => {
		const newErrors = {};

		if (!formData.name.trim()) {
			newErrors.name = "Product type name is required";
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleSaveProductType = async () => {
		if (!validateForm()) {
			return;
		}

		try {
			setLoading(true);

			const submitData = {
				name: formData.name.trim(),
				description: formData.description.trim(),
			};

			if (editingType) {
				await updateProductType(editingType.id, submitData);
				toast({
					title: "Success",
					description: "Product type updated successfully.",
				});
			} else {
				await createProductType(submitData);
				toast({
					title: "Success",
					description: "Product type created successfully.",
				});
			}

			setIsFormDialogOpen(false);
			fetchProductTypes();
		} catch (error) {
			console.error("Failed to save product type:", error);

			// Handle validation errors from backend
			if (error.response?.data) {
				const backendErrors = error.response.data;
				setErrors(backendErrors);
			}

			toast({
				title: "Error",
				description: "Failed to save product type.",
				variant: "destructive",
			});
		} finally {
			setLoading(false);
		}
	};

	const handleDeleteProductType = async () => {
		if (!typeToDelete) return;

		try {
			setLoading(true);
			await deleteProductType(typeToDelete.id);
			toast({
				title: "Success",
				description: "Product type deleted successfully.",
			});
			setIsDeleteDialogOpen(false);
			fetchProductTypes();
		} catch (error) {
			console.error("Failed to delete product type:", error);
			toast({
				title: "Error",
				description:
					"Failed to delete product type. It may be in use by products.",
				variant: "destructive",
			});
		} finally {
			setLoading(false);
		}
	};

	const getTypeBadge = (type) => {
		switch (type.name.toLowerCase()) {
			case "menu":
				return <Badge variant="default">Menu Item</Badge>;
			case "grocery":
				return <Badge variant="secondary">Grocery</Badge>;
			case "general":
				return <Badge variant="outline">General</Badge>;
			default:
				return <Badge variant="outline">{type.name}</Badge>;
		}
	};

	const resetForm = () => {
		setFormData({ name: "", description: "" });
		setErrors({});
		setEditingType(null);
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
						<DialogTitle>Product Type Management</DialogTitle>
						<DialogDescription>
							Create, edit, and manage your product types. Product types help
							categorize different kinds of products.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4">
						<div className="flex justify-between items-center">
							<div className="text-sm text-muted-foreground">
								Total Product Types: {productTypes.length}
							</div>
							<Button onClick={() => openFormDialog()}>
								<Plus className="mr-2 h-4 w-4" />
								Add Product Type
							</Button>
						</div>

						{loading && productTypes.length === 0 ? (
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
											<TableHead>Display</TableHead>
											<TableHead className="text-right">Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{productTypes.length === 0 ? (
											<TableRow>
												<TableCell
													colSpan={4}
													className="text-center py-8"
												>
													<div className="flex flex-col items-center space-y-2">
														<Tags className="h-12 w-12 text-muted-foreground" />
														<p className="text-muted-foreground">
															No product types found. Create your first product
															type!
														</p>
													</div>
												</TableCell>
											</TableRow>
										) : (
											productTypes.map((type) => (
												<TableRow key={type.id}>
													<TableCell className="font-medium">
														{type.name}
													</TableCell>
													<TableCell>
														{type.description || (
															<span className="text-muted-foreground">
																No description
															</span>
														)}
													</TableCell>
													<TableCell>{getTypeBadge(type)}</TableCell>
													<TableCell className="text-right">
														<div className="flex justify-end space-x-2">
															<Button
																variant="ghost"
																size="sm"
																onClick={() => openFormDialog(type)}
															>
																<Edit className="h-4 w-4" />
															</Button>
															<Button
																variant="ghost"
																size="sm"
																onClick={() => openDeleteDialog(type)}
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
							onClick={() => onOpenChange(false)}
						>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Product Type Form Dialog */}
			<Dialog
				open={isFormDialogOpen}
				onOpenChange={handleFormDialogOpenChange}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>
							{editingType ? "Edit Product Type" : "Add New Product Type"}
						</DialogTitle>
						<DialogDescription>
							{editingType
								? "Update the product type information below."
								: "Fill in the details for the new product type."}
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
									placeholder="Product type name"
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
									placeholder="Product type description"
									rows={3}
								/>
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
							onClick={handleSaveProductType}
							disabled={loading}
						>
							{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							{editingType ? "Update" : "Create"}
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
							Delete Product Type
						</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete "{typeToDelete?.name}"? This
							action cannot be undone.
							<div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
								<p className="text-sm text-yellow-800">
									<strong>Warning:</strong> This product type may be used by
									existing products. Deleting it could affect those products.
								</p>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDeleteProductType}
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
