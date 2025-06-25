import { useEffect, useState } from "react";
import {
	getProductTypes,
	createProductType,
	updateProductType,
	deleteProductType,
} from "@/domains/products/services/productTypeService";
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
import { useToast } from "@/shared/components/ui/use-toast";

export function ProductTypeManagementDialog({ open, onOpenChange }) {
	const [productTypes, setProductTypes] = useState([]);
	const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [editingType, setEditingType] = useState(null);
	const [typeToDelete, setTypeToDelete] = useState(null);
	const [formData, setFormData] = useState({ name: "", description: "" });
	const { toast } = useToast();

	useEffect(() => {
		fetchProductTypes();
	}, []);

	const fetchProductTypes = async () => {
		try {
			const response = await getProductTypes();
			setProductTypes(response.data);
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

	const openDeleteDialog = (type) => {
		setTypeToDelete(type);
		setIsDeleteDialogOpen(true);
	};

	const closeDeleteDialog = () => {
		setIsDeleteDialogOpen(false);
		setTypeToDelete(null);
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

	const handleDelete = async () => {
		if (!typeToDelete) return;
		try {
			await deleteProductType(typeToDelete.id);
			toast({ title: "Success", description: "Product type deleted." });
			fetchProductTypes();
			closeDeleteDialog();
		} catch (error) {
			console.error("Failed to delete product type:", error);
			toast({
				title: "Error",
				description: "Failed to delete product type.",
				variant: "destructive",
			});
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
		>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>Manage Product Types</DialogTitle>
				</DialogHeader>
				<div className="py-4">
					<div className="flex justify-end mb-4">
						<Button onClick={() => openFormDialog()}>Add Product Type</Button>
					</div>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Description</TableHead>
								<TableHead>Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{productTypes.map((type) => (
								<TableRow key={type.id}>
									<TableCell>{type.name}</TableCell>
									<TableCell>{type.description}</TableCell>
									<TableCell>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => openFormDialog(type)}
										>
											Edit
										</Button>
										<Button
											variant="ghost"
											size="sm"
											className="text-red-500"
											onClick={() => openDeleteDialog(type)}
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
							product type: <strong>{typeToDelete?.name}</strong>.
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
