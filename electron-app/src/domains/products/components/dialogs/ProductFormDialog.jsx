import { useEffect, useState } from "react";
import {
	createProduct,
	updateProduct,
	getProductById,
} from "@/domains/products/services/productService";
import { createTax } from "@/domains/products/services/taxService";
import inventoryService from "@/domains/inventory/services/inventoryService";
import { useOfflineCategories, useOfflineProductTypes, useOfflineTaxes, useOfflineInventoryLocations } from "@/shared/hooks";
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
import { Textarea } from "@/shared/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { useToast } from "@/shared/components/ui/use-toast";
import { Loader2, ChevronDown, Check, X, Plus } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/shared/components/ui/command";
import ModifierSectionManager from "@/domains/products/components/modifiers/ModifierSectionManager";

export function ProductFormDialog({
	open,
	onOpenChange,
	productId,
	onSuccess,
}) {
	// Use offline hooks for cached data
	const { data: cachedCategories, loading: categoriesLoading } = useOfflineCategories();
	const { data: cachedProductTypes, loading: productTypesLoading } = useOfflineProductTypes();
	const { data: cachedTaxes, loading: taxesLoading } = useOfflineTaxes();
	const { data: cachedLocations, loading: locationsLoading } = useOfflineInventoryLocations();

	const [loading, setLoading] = useState(false);
	const [categories, setCategories] = useState([]);
	const [productTypes, setProductTypes] = useState([]);
	const [locations, setLocations] = useState([]);
	const [_initialProductState, setInitialProductState] = useState(null);
	const [formData, setFormData] = useState({
		name: "",
		description: "",
		price: "",
		category_id: "",
		product_type_id: "",
		track_inventory: false,
		initial_quantity: "",
		location_id: "",
		barcode: "",
		is_public: true,
		tax_ids: [],
	});
	const [errors, setErrors] = useState({});
	const { toast } = useToast();
	const isEditing = !!productId;

	// Show stock related inputs whenever the user chooses to track inventory
	const showStockFields = formData.track_inventory;

	// Sync cached data to local state
	useEffect(() => {
		if (cachedCategories && cachedCategories.length >= 0) {
			setCategories(cachedCategories);
		}
	}, [cachedCategories]);

	useEffect(() => {
		if (cachedProductTypes && cachedProductTypes.length >= 0) {
			setProductTypes(cachedProductTypes);
		}
	}, [cachedProductTypes]);

	useEffect(() => {
		if (cachedTaxes && cachedTaxes.length >= 0) {
			setTaxOptions(Array.isArray(cachedTaxes) ? cachedTaxes : []);
		}
	}, [cachedTaxes]);

	useEffect(() => {
		if (cachedLocations && cachedLocations.length >= 0) {
			setLocations(cachedLocations);
			// Set default location if not already set
			if (cachedLocations.length > 0 && !formData.location_id) {
				setFormData((prev) => ({
					...prev,
					location_id: cachedLocations[0].id.toString(),
				}));
			}
		}
	}, [cachedLocations]);

	useEffect(() => {
		if (open) {
			fetchInitialData();
		}
	}, [open, productId]);

	const [taxOptions, setTaxOptions] = useState([]);
	const [isTaxDialogOpen, setIsTaxDialogOpen] = useState(false);
	const [taxForm, setTaxForm] = useState({ name: "", rate: "" });
	const [taxPickerOpen, setTaxPickerOpen] = useState(false);

	const fetchInitialData = async () => {
		setLoading(true);
		try {
			// Categories, product types, taxes, and locations all come from cache via hooks
			// We only need to fetch product data when editing
			if (isEditing) {
				const productRes = await getProductById(productId);
				const product = productRes.data;
				setInitialProductState(product);

				// Handle both API format (category.id) and cache format (category_id)
				const categoryId = product.category?.id ?? product.category_id ?? "";
				const productTypeId = product.product_type?.id ?? product.product_type_id ?? "";

				setFormData({
					name: product.name || "",
					description: product.description || "",
					price: product.price ? product.price.toString() : "",
					category_id: categoryId ? categoryId.toString() : "",
					product_type_id: productTypeId ? productTypeId.toString() : "",
					track_inventory: product.track_inventory || false,
					initial_quantity: "", // Not editable after creation
					location_id: locations?.[0]?.id.toString() || "", // Default to first location from cache
					barcode: product.barcode || "",
					is_public: product.is_public,
					tax_ids: Array.isArray(product.taxes) ? product.taxes.map(t => t.id) : [],
				});
			} else {
				resetForm(locations);
				setInitialProductState(null);
			}
			setErrors({});
		} catch (error) {
			console.error("Failed to fetch initial data:", error);
			toast({
				title: "Error",
				description: "Failed to load form data.",
				variant: "destructive",
			});
		} finally {
			setLoading(false);
		}
	};

	const resetForm = (locs) => {
		setFormData({
			name: "",
			description: "",
			price: "",
			category_id: "",
			product_type_id: "",
			track_inventory: false,
			initial_quantity: "",
			location_id: locs?.[0]?.id.toString() || "",
			barcode: "",
		});
		setInitialProductState(null);
	};

	const handleInputChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
		if (errors[name]) {
			setErrors((prev) => ({ ...prev, [name]: "" }));
		}
	};

	const handleSelectChange = (name, value) => {
		const finalValue = value === "none" ? "" : value;
		setFormData((prev) => ({ ...prev, [name]: finalValue }));
		if (errors[name]) {
			setErrors((prev) => ({ ...prev, [name]: "" }));
		}
	};

	const handleSwitchChange = (name, checked) => {
		setFormData((prev) => ({ ...prev, [name]: checked }));
	};

	const validateForm = () => {
		const newErrors = {};

		// Basic validations
		if (!formData.name.trim()) newErrors.name = "Product name is required";
		if (
			!formData.price ||
			isNaN(parseFloat(formData.price)) ||
			parseFloat(formData.price) < 0
		) {
			newErrors.price = "Valid price is required";
		}
		if (!formData.product_type_id)
			newErrors.product_type_id = "Product type is required";

		// Inventory related validations
		if (formData.track_inventory) {
			const quantityProvided =
				formData.initial_quantity !== "" && formData.initial_quantity !== null;

			// For new products quantity is required. For edits it's optional but must be numeric if provided.
			if (
				(!isEditing && !quantityProvided) ||
				(quantityProvided && isNaN(parseFloat(formData.initial_quantity)))
			) {
				newErrors.initial_quantity = "Initial quantity must be a number";
			}

			// Location is required whenever we're going to adjust stock now (new product or quantity provided)
			if ((quantityProvided || !isEditing) && !formData.location_id) {
				newErrors.location_id = "Location is required when adjusting stock";
			}
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (!validateForm()) return;

		setLoading(true);
		try {
			const submitData = {
				name: formData.name.trim(),
				description: formData.description.trim(),
				price: parseFloat(formData.price),
				track_inventory: formData.track_inventory,
				barcode: formData.barcode.trim() || null,
				category_id: formData.category_id
					? parseInt(formData.category_id)
					: null,
				product_type_id: formData.product_type_id
					? parseInt(formData.product_type_id)
					: null,
				is_public: formData.is_public,
				tax_ids: formData.tax_ids || [],
			};

			// If creating a product with inventory tracking, send initial stock directly
			if (
				!isEditing &&
				formData.track_inventory &&
				formData.initial_quantity &&
				parseFloat(formData.initial_quantity) !== 0
			) {
				submitData.initial_stock = parseFloat(formData.initial_quantity);
				submitData.location_id = parseInt(formData.location_id);
			}

			let savedProduct;
			if (isEditing) {
				const response = await updateProduct(productId, submitData);
				savedProduct = response.data;
				toast({
					title: "Success",
					description: "Product updated successfully.",
				});

				// Handle optional stock adjustment when editing
				if (
					savedProduct &&
					formData.track_inventory &&
					formData.initial_quantity &&
					parseFloat(formData.initial_quantity) !== 0
				) {
					await inventoryService.adjustStock(
						productId,
						parseInt(formData.location_id),
						parseFloat(formData.initial_quantity)
					);
					toast({
						title: "Stock Adjusted",
						description: `Stock updated for ${savedProduct.name}.`,
					});
				}
			} else {
				const response = await createProduct(submitData);
				savedProduct = response.data;
				toast({
					title: "Success",
					description: "Product created successfully.",
				});
			}

			onSuccess?.();
			onOpenChange(false);
		} catch (error) {
			console.error("Failed to save product:", error);
			if (error.response?.data) {
				const backendErrors = {};
				Object.keys(error.response.data).forEach((key) => {
					let formFieldName = key;
					if (key === "product_type_id" || key === "category_id") {
						formFieldName = key;
					}
					backendErrors[formFieldName] = Array.isArray(error.response.data[key])
						? error.response.data[key][0]
						: error.response.data[key];
				});
				setErrors(backendErrors);
			}
			toast({
				title: "Error",
				description: "Failed to save product. Check form for errors.",
				variant: "destructive",
			});
		} finally {
			setLoading(false);
		}
	};

	const renderTaxControls = () => {
		return (
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<Label>Taxes</Label>
					<Button type="button" size="sm" variant="outline" onClick={() => setIsTaxDialogOpen(true)}>
						<Plus className="h-4 w-4 mr-1" />
						Add Tax
					</Button>
				</div>

				<Popover open={taxPickerOpen} onOpenChange={setTaxPickerOpen}>
					<PopoverTrigger asChild>
						<Button
							type="button"
							variant="outline"
							role="combobox"
							aria-expanded={taxPickerOpen}
							className="w-full justify-between h-auto min-h-[2.5rem] px-3 py-2"
						>
							<div className="flex flex-wrap gap-1 flex-1">
								{formData.tax_ids?.length > 0 ? (
									<>
										{formData.tax_ids.slice(0, 3).map((taxId) => {
											const tax = taxOptions.find(t => t.id === taxId);
											return tax ? (
												<Badge key={taxId} variant="secondary" className="text-xs">
													{tax.name} ({tax.rate}%)
													<X
														className="h-3 w-3 ml-1 cursor-pointer hover:text-destructive"
														onClick={(e) => {
															e.stopPropagation();
															const next = formData.tax_ids.filter(id => id !== taxId);
															setFormData({ ...formData, tax_ids: next });
														}}
													/>
												</Badge>
											) : null;
										})}
										{formData.tax_ids.length > 3 && (
											<Badge variant="outline" className="text-xs">
												+{formData.tax_ids.length - 3} more
											</Badge>
										)}
									</>
								) : (
									<span className="text-muted-foreground">Select taxes...</span>
								)}
							</div>
							<ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-full p-0" align="start">
						<Command>
							<CommandInput placeholder="Search taxes..." />
							<CommandEmpty>No taxes found.</CommandEmpty>
							<CommandList>
								<CommandGroup>
									{taxOptions.map((tax) => {
										const isSelected = (formData.tax_ids || []).includes(tax.id);
										return (
											<CommandItem
												key={tax.id}
												value={tax.name}
												onSelect={() => {
													const currentTaxes = formData.tax_ids || [];
													const newTaxes = isSelected
														? currentTaxes.filter(id => id !== tax.id)
														: [...currentTaxes, tax.id];
													setFormData({ ...formData, tax_ids: newTaxes });
												}}
											>
												<Check
													className={`h-4 w-4 mr-2 ${isSelected ? "opacity-100" : "opacity-0"}`}
												/>
												<div className="flex items-center justify-between w-full">
													<span>{tax.name}</span>
													<Badge variant="outline" className="ml-2 text-xs">
														{tax.rate}%
													</Badge>
												</div>
											</CommandItem>
										);
									})}
								</CommandGroup>
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>
			</div>
		);
	};

	const renderCategoryOptions = (parentId = null, level = 0) => {
		return categories
			.filter((c) => {
				// Handle both API format (parent.id) and cache format (parent_id)
				const catParentId = c.parent?.id ?? c.parent_id ?? null;
				return catParentId === parentId;
			})
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

	return (
		<>
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
		>
			<DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
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

				{loading && !isEditing ? (
					<div className="flex justify-center items-center h-48">
						<Loader2 className="h-6 w-6 animate-spin" />
					</div>
				) : (
					<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
						{/* Left Column - Product Form (1/3 width) */}
						<div className="lg:col-span-1 space-y-4">
							<h3 className="text-lg font-medium border-b pb-2">Product Details</h3>
							<form onSubmit={handleSubmit}>
								<div className="grid gap-4 py-4">
									<div>
										<Label htmlFor="name">
											Name <span className="text-red-500">*</span>
										</Label>
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
									<div>
										<Label htmlFor="description">Description</Label>
										<Textarea
											id="description"
											name="description"
											value={formData.description}
											onChange={handleInputChange}
											placeholder="Product description"
											rows={3}
										/>
									</div>
									
									<div className="grid grid-cols-2 gap-4">
										<div>
											<Label htmlFor="price">
												Price <span className="text-red-500">*</span>
											</Label>
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
										<div>
											<Label htmlFor="barcode">Barcode</Label>
											<Input
												id="barcode"
												name="barcode"
												value={formData.barcode}
												onChange={handleInputChange}
												placeholder="Enter or scan barcode"
												className={errors.barcode ? "border-red-500" : ""}
											/>
											{errors.barcode && (
												<p className="text-sm text-red-500 mt-1">
													{errors.barcode}
												</p>
											)}
										</div>
									</div>
									<div className="grid grid-cols-2 gap-4">
										<div>
											<Label htmlFor="category_id">Category</Label>
											<Select
												value={formData.category_id}
												onValueChange={(value) =>
													handleSelectChange("category_id", value)
												}
											>
												<SelectTrigger
													className={errors.category_id ? "border-red-500" : ""}
												>
													<SelectValue placeholder="Select category" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="none">No Category</SelectItem>
													{renderCategoryOptions()}
												</SelectContent>
											</Select>
											{errors.category_id && (
												<p className="text-sm text-red-500 mt-1">
													{errors.category_id}
												</p>
											)}
										</div>
										<div>
											<Label htmlFor="product_type_id">
												Type <span className="text-red-500">*</span>
											</Label>
											<Select
												value={formData.product_type_id}
												onValueChange={(value) =>
													handleSelectChange("product_type_id", value)
												}
											>
												<SelectTrigger
													className={errors.product_type_id ? "border-red-500" : ""}
												>
													<SelectValue placeholder="Select type" />
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
											{errors.product_type_id && (
												<p className="text-sm text-red-500 mt-1">
													{errors.product_type_id}
												</p>
											)}
										</div>
									</div>

									{/* Taxes */}
									{renderTaxControls()}

									<div className="space-y-3">
										<div className="flex items-center space-x-2">
											<Switch
												id="track_inventory"
												name="track_inventory"
												checked={formData.track_inventory}
												onCheckedChange={(checked) =>
													handleSwitchChange("track_inventory", checked)
												}
											/>
											<Label htmlFor="track_inventory">
												Track Inventory - Monitor stock levels for this product
											</Label>
										</div>
										<div className="flex items-center space-x-2">
											<Switch
												id="is_public"
												name="is_public"
												checked={formData.is_public}
												onCheckedChange={(checked) =>
													handleSwitchChange("is_public", checked)
												}
											/>
											<Label htmlFor="is_public">
												Public - Make this product visible on the website
											</Label>
										</div>
									</div>

									{showStockFields && (
										<>
											<div className="grid grid-cols-4 items-center gap-4">
												<Label
													htmlFor="initial_quantity"
													className="text-right"
												>
													Initial Quantity
												</Label>
												<div className="col-span-3">
													<Input
														id="initial_quantity"
														name="initial_quantity"
														type="number"
														placeholder="e.g., 100"
														value={formData.initial_quantity}
														onChange={handleInputChange}
														className={
															errors.initial_quantity ? "border-red-500" : ""
														}
													/>
													{errors.initial_quantity && (
														<p className="text-sm text-red-500 mt-1">
															{errors.initial_quantity}
														</p>
													)}
												</div>
											</div>

											<div className="grid grid-cols-4 items-center gap-4">
												<Label
													htmlFor="location_id"
													className="text-right"
												>
													Location
												</Label>
												<div className="col-span-3">
													<Select
														name="location_id"
														value={formData.location_id}
														onValueChange={(value) =>
															handleSelectChange("location_id", value)
														}
													>
														<SelectTrigger
															id="location_id"
															className={errors.location_id ? "border-red-500" : ""}
														>
															<SelectValue placeholder="Select location" />
														</SelectTrigger>
														<SelectContent>
															{locations.length > 0 ? (
																locations.map((loc) => (
																	<SelectItem
																		key={loc.id}
																		value={loc.id.toString()}
																	>
																		{loc.name}
																	</SelectItem>
																))
															) : (
																<SelectItem
																	value="no-locations"
																	disabled
																>
																	No locations available
																</SelectItem>
															)}
														</SelectContent>
													</Select>
													{errors.location_id && (
														<p className="text-sm text-red-500 mt-1">
															{errors.location_id}
														</p>
													)}
												</div>
											</div>
										</>
									)}
									
									<div className="pt-4 border-t">
										<Button
											type="submit"
											disabled={loading}
											className="w-full"
										>
											{loading ? (
												<>
													<Loader2 className="mr-2 h-4 w-4 animate-spin" />
													{isEditing ? "Updating..." : "Creating..."}
												</>
											) : (
												<>{isEditing ? "Update Product" : "Create Product"}</>
											)}
										</Button>
									</div>
								</div>
							</form>
						</div>
						
						{/* Right Column - Modifier Section (2/3 width) */}
						<div className="lg:col-span-2 space-y-4">
							<h3 className="text-lg font-medium border-b pb-2">Modifier Groups</h3>
							<ModifierSectionManager
								productId={productId}
								onModifierChange={() => {}}
								className=""
							/>
						</div>
					</div>
				)}
				
				<DialogFooter className="mt-6">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
        </Dialog>
        {/* Add Tax Dialog for Product */}
        <Dialog open={isTaxDialogOpen} onOpenChange={setIsTaxDialogOpen}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Add Tax</DialogTitle>
                    <DialogDescription>Create a new tax rate for products.</DialogDescription>
                </DialogHeader>
                <form
                    onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                            const payload = {
                                name: (taxForm.name || "").trim(),
                                rate: Number(taxForm.rate),
                            };
                            if (!payload.name) throw new Error("Name is required");
                            if (Number.isNaN(payload.rate)) throw new Error("Rate must be a number (e.g., 8.25)");
                            const res = await createTax(payload);
                            const created = res?.data;
                            setTaxOptions((prev) => (Array.isArray(prev) ? [...prev, created] : [created]));
                            setFormData((prev) => ({ ...prev, tax_ids: [...new Set([...(prev.tax_ids || []), created.id])] }));
                            setIsTaxDialogOpen(false);
                            setTaxForm({ name: "", rate: "" });
                            toast({ title: "Tax created" });
                        } catch (err) {
                            console.error("Failed to create tax", err);
                            const message = (err && err.response && err.response.data && err.response.data.detail) || err?.message || "Failed to create tax";
                            toast({ title: "Error", description: message, variant: "destructive" });
                        }
                    }}
                >
                    <div className="grid gap-4 py-2">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="tax-name" className="text-right">Name</Label>
                            <Input id="tax-name" value={taxForm.name} onChange={(e) => setTaxForm((p) => ({ ...p, name: e.target.value }))} className="col-span-3" required />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="tax-rate" className="text-right">Rate (%)</Label>
                            <Input id="tax-rate" type="number" step="0.01" placeholder="e.g., 8.25" value={taxForm.rate} onChange={(e) => setTaxForm((p) => ({ ...p, rate: e.target.value }))} className="col-span-3" required />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsTaxDialogOpen(false)}>Cancel</Button>
                        <Button type="submit">Save</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
		</>
	);
}
