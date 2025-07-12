import { useEffect, useState } from "react";
import {
	createProduct,
	updateProduct,
	getProductById,
} from "@/services/api/productService";
import { getCategories } from "@/services/api/categoryService";
import { getProductTypes } from "@/services/api/productTypeService";
import { Button } from "@/components/ui/button";
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
import { Loader2 } from "lucide-react";

export function ProductFormDialog({
	open,
	onOpenChange,
	productId,
	onSuccess,
}) {
	const [loading, setLoading] = useState(false);
	const [initialLoading, setInitialLoading] = useState(false);
	const [categories, setCategories] = useState([]);
	const [productTypes, setProductTypes] = useState([]);
	const [formData, setFormData] = useState({
		name: "",
		description: "",
		price: "",
		category: "",
		product_type: "",
		track_inventory: false,
		barcode: "",
		is_active: true,
		is_public: true,
	});
	const [errors, setErrors] = useState({});
	const { toast } = useToast();
	const isEditing = !!productId;

	useEffect(() => {
		if (open) {
			fetchDropdownData();
			if (isEditing) {
				fetchProductData();
			}
		}
	}, [open, isEditing, productId]);

	const fetchDropdownData = async () => {
		try {
			const [categoriesResponse, productTypesResponse] = await Promise.all([
				getCategories(),
				getProductTypes(),
			]);
			setCategories(categoriesResponse.data || []);
			setProductTypes(productTypesResponse.data || []);
		} catch (error) {
			console.error("Failed to fetch dropdown data:", error);
			toast({
				title: "Error",
				description: "Failed to load form data.",
				variant: "destructive",
			});
		}
	};

	const fetchProductData = async () => {
		try {
			setInitialLoading(true);
			const response = await getProductById(productId);
			const product = response.data;
			setFormData({
				name: product.name || "",
				description: product.description || "",
				price: product.price?.toString() || "",
				category: product.category?.id?.toString() || "",
				product_type: product.product_type?.id?.toString() || "",
				track_inventory: product.track_inventory || false,
				barcode: product.barcode || "",
				is_active: product.is_active ?? true,
				is_public: product.is_public ?? true,
			});
		} catch (error) {
			console.error("Failed to fetch product:", error);
			toast({
				title: "Error",
				description: "Failed to load product data.",
				variant: "destructive",
			});
		} finally {
			setInitialLoading(false);
		}
	};

	const handleInputChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({
			...prev,
			[name]: value,
		}));
		// Clear error when user starts typing
		if (errors[name]) {
			setErrors((prev) => ({
				...prev,
				[name]: "",
			}));
		}
	};

	const handleSelectChange = (name, value) => {
		setFormData((prev) => ({
			...prev,
			[name]: value,
		}));
		// Clear error when user makes selection
		if (errors[name]) {
			setErrors((prev) => ({
				...prev,
				[name]: "",
			}));
		}
	};

	const handleSwitchChange = (name, checked) => {
		setFormData((prev) => ({
			...prev,
			[name]: checked,
		}));
	};

	const validateForm = () => {
		const newErrors = {};

		if (!formData.name.trim()) {
			newErrors.name = "Product name is required";
		}

		if (!formData.price || parseFloat(formData.price) <= 0) {
			newErrors.price = "Price must be a positive number";
		}

		if (!formData.category) {
			newErrors.category = "Category is required";
		}

		if (!formData.product_type) {
			newErrors.product_type = "Product type is required";
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleSubmit = async (e) => {
		e.preventDefault();

		if (!validateForm()) {
			return;
		}

		setLoading(true);

		try {
			const submitData = {
				...formData,
				price: parseFloat(formData.price),
				category_id: formData.category ? parseInt(formData.category) : null,
				product_type_id: formData.product_type
					? parseInt(formData.product_type)
					: null,
				barcode:
					formData.barcode && formData.barcode.trim() !== ""
						? formData.barcode.trim()
						: null,
			};

			// Remove the original category and product_type fields to avoid conflicts
			delete submitData.category;
			delete submitData.product_type;

			if (isEditing) {
				await updateProduct(productId, submitData);
				toast({
					title: "Success",
					description: "Product updated successfully.",
				});
			} else {
				await createProduct(submitData);
				toast({
					title: "Success",
					description: "Product created successfully.",
				});
			}

			onSuccess?.();
			onOpenChange(false);
			resetForm();
		} catch (error) {
			console.error("Failed to save product:", error);

			// Handle validation errors from backend
			if (error.response?.data) {
				const backendErrors = error.response.data;

				// Map backend field names to frontend field names
				const mappedErrors = { ...backendErrors };
				if (backendErrors.category_id) {
					mappedErrors.category = backendErrors.category_id;
					delete mappedErrors.category_id;
				}
				if (backendErrors.product_type_id) {
					mappedErrors.product_type = backendErrors.product_type_id;
					delete mappedErrors.product_type_id;
				}

				setErrors(mappedErrors);
			}

			toast({
				title: "Error",
				description:
					"Failed to save product. Please check the form and try again.",
				variant: "destructive",
			});
		} finally {
			setLoading(false);
		}
	};

	const resetForm = () => {
		setFormData({
			name: "",
			description: "",
			price: "",
			category: "",
			product_type: "",
			track_inventory: false,
			barcode: "",
			is_active: true,
			is_public: true,
		});
		setErrors({});
	};

	const handleOpenChange = (open) => {
		if (!open) {
			resetForm();
		}
		onOpenChange(open);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={handleOpenChange}
		>
			<DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>
						{isEditing ? "Edit Product" : "Add New Product"}
					</DialogTitle>
					<DialogDescription>
						{isEditing
							? "Update the product information below."
							: "Fill in the details for the new product."}
					</DialogDescription>
				</DialogHeader>

				{initialLoading ? (
					<div className="flex justify-center items-center h-48">
						<Loader2 className="h-6 w-6 animate-spin" />
					</div>
				) : (
					<form onSubmit={handleSubmit}>
						<div className="grid gap-4 py-4">
							{/* Product Name */}
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
										onChange={handleInputChange}
										placeholder="Product name"
										className={errors.name ? "border-red-500" : ""}
									/>
									{errors.name && (
										<p className="text-sm text-red-500 mt-1">{errors.name}</p>
									)}
								</div>
							</div>

							{/* Description */}
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
										onChange={handleInputChange}
										placeholder="Product description"
										rows={3}
									/>
								</div>
							</div>

							{/* Price */}
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="price"
									className="text-right"
								>
									Price <span className="text-red-500">*</span>
								</Label>
								<div className="col-span-3">
									<Input
										id="price"
										name="price"
										type="number"
										step="0.01"
										min="0"
										value={formData.price}
										onChange={handleInputChange}
										placeholder="0.00"
										className={errors.price ? "border-red-500" : ""}
									/>
									{errors.price && (
										<p className="text-sm text-red-500 mt-1">{errors.price}</p>
									)}
								</div>
							</div>

							{/* Category */}
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="category"
									className="text-right"
								>
									Category <span className="text-red-500">*</span>
								</Label>
								<div className="col-span-3">
									<Select
										value={formData.category}
										onValueChange={(value) =>
											handleSelectChange("category", value)
										}
									>
										<SelectTrigger
											className={errors.category ? "border-red-500" : ""}
										>
											<SelectValue placeholder="Select category" />
										</SelectTrigger>
										<SelectContent>
											{categories.map((category) => (
												<SelectItem
													key={category.id}
													value={category.id.toString()}
												>
													{category.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{errors.category && (
										<p className="text-sm text-red-500 mt-1">
											{errors.category}
										</p>
									)}
								</div>
							</div>

							{/* Product Type */}
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="product_type"
									className="text-right"
								>
									Type <span className="text-red-500">*</span>
								</Label>
								<div className="col-span-3">
									<Select
										value={formData.product_type}
										onValueChange={(value) =>
											handleSelectChange("product_type", value)
										}
									>
										<SelectTrigger
											className={errors.product_type ? "border-red-500" : ""}
										>
											<SelectValue placeholder="Select product type" />
										</SelectTrigger>
										<SelectContent>
											{productTypes.map((type) => (
												<SelectItem
													key={type.id}
													value={type.id.toString()}
												>
													{type.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{errors.product_type && (
										<p className="text-sm text-red-500 mt-1">
											{errors.product_type}
										</p>
									)}
								</div>
							</div>

							{/* Barcode */}
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="barcode"
									className="text-right"
								>
									Barcode
								</Label>
								<div className="col-span-3">
									<Input
										id="barcode"
										name="barcode"
										value={formData.barcode}
										onChange={handleInputChange}
										placeholder="Product barcode"
									/>
								</div>
							</div>

							{/* Track Inventory */}
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="track_inventory"
									className="text-right"
								>
									Track Inventory
								</Label>
								<div className="col-span-3">
									<Switch
										id="track_inventory"
										checked={formData.track_inventory}
										onCheckedChange={(checked) =>
											handleSwitchChange("track_inventory", checked)
										}
									/>
								</div>
							</div>

							{/* Is Active */}
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="is_active"
									className="text-right"
								>
									Active
								</Label>
								<div className="col-span-3">
									<Switch
										id="is_active"
										checked={formData.is_active}
										onCheckedChange={(checked) =>
											handleSwitchChange("is_active", checked)
										}
									/>
								</div>
							</div>

							{/* Is Public */}
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="is_public"
									className="text-right"
								>
									Public
								</Label>
								<div className="col-span-3">
									<Switch
										id="is_public"
										checked={formData.is_public}
										onCheckedChange={(checked) =>
											handleSwitchChange("is_public", checked)
										}
									/>
								</div>
							</div>
						</div>

						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => onOpenChange(false)}
								disabled={loading}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={loading}
							>
								{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
								{isEditing ? "Update" : "Create"}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
