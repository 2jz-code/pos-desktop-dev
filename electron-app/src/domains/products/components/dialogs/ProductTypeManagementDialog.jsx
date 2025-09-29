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
import { Edit, Archive, ArchiveRestore, Package, DollarSign, Globe, ChevronDown, Check, X, Plus, ShieldCheck, Clock } from "lucide-react";
import { getTaxes, createTax } from "@/domains/products/services/taxService";
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from "@/shared/components/ui/select";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/shared/components/ui/command";

export function ProductTypeManagementDialog({ open, onOpenChange }) {
	const [productTypes, setProductTypes] = useState([]);
	const [showArchivedProductTypes, setShowArchivedProductTypes] = useState(false);
	const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
	const [editingType, setEditingType] = useState(null);
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        inventory_behavior: "QUANTITY",
        stock_enforcement: "BLOCK",
        allow_negative_stock: false,
        tax_inclusive: false,
        default_taxes_ids: [],
        pricing_method: "FIXED",
        default_markup_percent: "",
        standard_prep_minutes: 10,
        max_quantity_per_item: "",
        exclude_from_discounts: false,
    });
    const [taxOptions, setTaxOptions] = useState([]);
    const [isTaxDialogOpen, setIsTaxDialogOpen] = useState(false);
    const [taxForm, setTaxForm] = useState({ name: "", rate: "" });
    const [isSavingTax, setIsSavingTax] = useState(false);
    const [taxPickerOpen, setTaxPickerOpen] = useState(false);
	const [dataChanged, setDataChanged] = useState(false);
	
	// Archive dialog state
	const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
	const [productTypeToArchive, setProductTypeToArchive] = useState(null);
	
	const { toast } = useToast();

useEffect(() => {
    fetchProductTypes();
    fetchTaxes();
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

const fetchTaxes = async () => {
    try {
        const res = await getTaxes({ limit: 1000 });
        const data = res.data?.results || res.data || [];
        setTaxOptions(Array.isArray(data) ? data : []);
    } catch (e) {
        console.error("Failed to fetch taxes", e);
    }
};

	const handleFormChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

const openFormDialog = (type = null) => {
    setEditingType(type);
    if (type) {
        setFormData({
            name: type.name || "",
            description: type.description || "",
            inventory_behavior: type.inventory_behavior || "QUANTITY",
            stock_enforcement: type.stock_enforcement || "BLOCK",
            allow_negative_stock: !!type.allow_negative_stock,
            tax_inclusive: !!type.tax_inclusive,
            default_taxes_ids: (type.default_taxes || []).map((t) => t.id),
            pricing_method: type.pricing_method || "FIXED",
            default_markup_percent: type.default_markup_percent ?? "",
            standard_prep_minutes: type.standard_prep_minutes ?? 10,
            max_quantity_per_item: type.max_quantity_per_item ?? "",
            exclude_from_discounts: !!type.exclude_from_discounts,
        });
    } else {
        setFormData({
            name: "",
            description: "",
            inventory_behavior: "QUANTITY",
            stock_enforcement: "BLOCK",
            allow_negative_stock: false,
            tax_inclusive: false,
            default_taxes_ids: [],
            pricing_method: "FIXED",
            default_markup_percent: "",
            standard_prep_minutes: 10,
            max_quantity_per_item: "",
            exclude_from_discounts: false,
        });
    }
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
        const payload = {
            name: formData.name,
            description: formData.description,
            inventory_behavior: formData.inventory_behavior,
            stock_enforcement: formData.stock_enforcement,
            allow_negative_stock: !!formData.allow_negative_stock,
            tax_inclusive: !!formData.tax_inclusive,
            default_taxes_ids: formData.default_taxes_ids || [],
            pricing_method: formData.pricing_method,
            default_markup_percent:
                formData.default_markup_percent === "" || formData.default_markup_percent === null
                    ? null
                    : Number(formData.default_markup_percent),
            standard_prep_minutes: Number(formData.standard_prep_minutes) || 0,
            max_quantity_per_item:
                formData.max_quantity_per_item === "" || formData.max_quantity_per_item === null
                    ? null
                    : Number(formData.max_quantity_per_item),
            exclude_from_discounts: !!formData.exclude_from_discounts,
        };
        if (editingType) {
            await updateProductType(editingType.id, payload);
            toast({ title: "Success", description: "Product type updated." });
        } else {
            await createProductType(payload);
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
            <DialogContent className="sm:max-w-[95vw] max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>
							{editingType ? "Edit Product Type" : "Add Product Type"}
						</DialogTitle>
						<DialogDescription>
							Configure how this type of product behaves in your system - from inventory tracking to pricing and availability.
						</DialogDescription>
					</DialogHeader>
                    <form onSubmit={handleFormSubmit}>
                        <div className="space-y-6 py-4">
                            {/* Basic Information */}
                            <div className="grid grid-cols-3 gap-6">
                                <div className="space-y-3">
                                    <Label htmlFor="name">Name</Label>
                                    <Input
                                        id="name"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleFormChange}
                                        required
                                        placeholder="e.g., Restaurant Food, Retail Product"
                                    />
                                    <p className="text-xs text-muted-foreground">A descriptive name for this product type</p>
                                </div>
                                <div className="space-y-3">
                                    <Label htmlFor="description">Description</Label>
                                    <Input
                                        id="description"
                                        name="description"
                                        value={formData.description}
                                        onChange={handleFormChange}
                                        placeholder="Optional description"
                                    />
                                    <p className="text-xs text-muted-foreground">Additional details about this product type</p>
                                </div>
                                <div className="space-y-3">
                                    {/* Empty third column for future expansion */}
                                </div>
                            </div>

                            {/* Inventory Policy Section */}
                            <div className="border rounded-lg p-4 space-y-4">
                                <div className="flex items-center gap-3">
                                    <Package className="h-5 w-5 text-blue-600" />
                                    <div>
                                        <h4 className="text-lg font-semibold">Inventory Management</h4>
                                        <p className="text-sm text-muted-foreground">How stock is tracked and managed</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-6">
                                    <div className="space-y-3">
                                        <Label>Inventory Tracking Method</Label>
                                        <Select value={formData.inventory_behavior} onValueChange={(v) => setFormData({ ...formData, inventory_behavior: v })}>
                                            <SelectTrigger><SelectValue placeholder="Select behavior" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="NONE">No Tracking - Services, digital items</SelectItem>
                                                <SelectItem value="QUANTITY">Track Quantity - Retail products, beverages</SelectItem>
                                                <SelectItem value="RECIPE">Recipe Based - Food made from ingredients</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            How should inventory be calculated for this type of product?
                                        </p>
                                    </div>

                                    <div className="space-y-3">
                                        <Label>Stock Enforcement</Label>
                                        <Select value={formData.stock_enforcement} onValueChange={(v) => setFormData({ ...formData, stock_enforcement: v })}>
                                            <SelectTrigger><SelectValue placeholder="Select enforcement" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="IGNORE">Ignore - Always allow sales</SelectItem>
                                                <SelectItem value="WARN">Warn Only - Show warning but allow sale</SelectItem>
                                                <SelectItem value="BLOCK">Block - Prevent sales when out of stock</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            What happens when stock runs low or out?
                                        </p>
                                    </div>

                                    <div className="space-y-3">
                                        <Label>Allow Negative Stock</Label>
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id="allow_negative_stock"
                                                checked={!!formData.allow_negative_stock}
                                                onCheckedChange={(v) => setFormData({ ...formData, allow_negative_stock: !!v })}
                                            />
                                            <Label htmlFor="allow_negative_stock" className="text-sm font-normal">Enable negative stock</Label>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Allow selling even when stock shows zero (backorders)
                                        </p>
                                    </div>
                                </div>

                            </div>

                            {/* Tax & Pricing Section */}
                            <div className="border rounded-lg p-4 space-y-4">
                                <div className="flex items-center gap-3">
                                    <DollarSign className="h-5 w-5 text-green-600" />
                                    <div>
                                        <h4 className="text-lg font-semibold">Tax & Pricing Rules</h4>
                                        <p className="text-sm text-muted-foreground">Default tax and pricing behavior</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-6">
                                    <div className="space-y-3">
                                        <Label>Tax Inclusive Pricing</Label>
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id="tax_inclusive"
                                                checked={!!formData.tax_inclusive}
                                                onCheckedChange={(v) => setFormData({ ...formData, tax_inclusive: !!v })}
                                            />
                                            <Label htmlFor="tax_inclusive" className="text-sm font-normal">Include tax in prices</Label>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Check if prices already include tax (common for B2C retail)
                                        </p>
                                    </div>

                                    <div className="space-y-3">
                                        <Label>Pricing Method</Label>
                                        <Select value={formData.pricing_method} onValueChange={(v) => setFormData({ ...formData, pricing_method: v })}>
                                            <SelectTrigger><SelectValue placeholder="Select pricing method" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="FIXED">Fixed Price - Manual price setting</SelectItem>
                                                <SelectItem value="COST_PLUS">Cost Plus - Automatic markup from cost</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            How should prices be calculated for this product type?
                                        </p>
                                    </div>

                                    {formData.pricing_method === 'COST_PLUS' ? (
                                        <div className="space-y-3">
                                            <Label>Default Markup Percentage</Label>
                                            <div className="relative">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={formData.default_markup_percent}
                                                    onChange={(e) => setFormData({ ...formData, default_markup_percent: e.target.value })}
                                                    placeholder="25.00"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                Default markup percentage when using cost-plus pricing
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <Label>&nbsp;</Label>
                                            <div className="h-10"></div>
                                            <p className="text-xs text-muted-foreground">&nbsp;</p>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label>Default Taxes Applied</Label>
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
                                                    {formData.default_taxes_ids?.length > 0 ? (
                                                        <>
                                                            {formData.default_taxes_ids.slice(0, 3).map((taxId) => {
                                                                const tax = taxOptions.find(t => t.id === taxId);
                                                                return tax ? (
                                                                    <Badge key={taxId} variant="secondary" className="text-xs">
                                                                        {tax.name} ({tax.rate}%)
                                                                        <X
                                                                            className="h-3 w-3 ml-1 cursor-pointer hover:text-destructive"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                const next = formData.default_taxes_ids.filter(id => id !== taxId);
                                                                                setFormData({ ...formData, default_taxes_ids: next });
                                                                            }}
                                                                        />
                                                                    </Badge>
                                                                ) : null;
                                                            })}
                                                            {formData.default_taxes_ids.length > 3 && (
                                                                <Badge variant="outline" className="text-xs">
                                                                    +{formData.default_taxes_ids.length - 3} more
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
                                                            const isSelected = (formData.default_taxes_ids || []).includes(tax.id);
                                                            return (
                                                                <CommandItem
                                                                    key={tax.id}
                                                                    value={tax.name}
                                                                    onSelect={() => {
                                                                        const currentTaxes = formData.default_taxes_ids || [];
                                                                        const newTaxes = isSelected
                                                                            ? currentTaxes.filter(id => id !== tax.id)
                                                                            : [...currentTaxes, tax.id];
                                                                        setFormData({ ...formData, default_taxes_ids: newTaxes });
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

                                    <p className="text-xs text-muted-foreground">
                                        These taxes will be applied to products of this type by default
                                    </p>
                                </div>
                            </div>

                            {/* Order Controls Section */}
                            <div className="border rounded-lg p-4 space-y-4">
                                <div className="flex items-center gap-3">
                                    <ShieldCheck className="h-5 w-5 text-orange-600" />
                                    <div>
                                        <h4 className="text-lg font-semibold">Order Controls</h4>
                                        <p className="text-sm text-muted-foreground">Limits and restrictions for ordering</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-6">
                                    <div className="space-y-3">
                                        <Label>Max Quantity Per Order</Label>
                                        <Input
                                            type="number"
                                            value={formData.max_quantity_per_item}
                                            onChange={(e) => setFormData({ ...formData, max_quantity_per_item: e.target.value })}
                                            placeholder="e.g., 5"
                                            min="1"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Maximum quantity of this item type per order (prevents bulk ordering issues)
                                        </p>
                                    </div>

                                    <div className="space-y-3">
                                        <Label>Discount Eligibility</Label>
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                checked={!!formData.exclude_from_discounts}
                                                onCheckedChange={(v) => setFormData({ ...formData, exclude_from_discounts: !!v })}
                                                id="exclude_from_discounts"
                                            />
                                            <Label htmlFor="exclude_from_discounts" className="text-sm font-normal">Block all discounts</Label>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Check to prevent any discounts from applying to this product type (protects margins)
                                        </p>
                                    </div>

                                    <div className="space-y-3">
                                        <Label>Standard Prep Time</Label>
                                        <div className="relative">
                                            <Input
                                                type="number"
                                                value={formData.standard_prep_minutes}
                                                onChange={(e) => setFormData({ ...formData, standard_prep_minutes: e.target.value })}
                                                placeholder="10"
                                                min="0"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">min</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Typical preparation time for kitchen planning
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <DialogFooter className="mt-6">
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

        {/* Add Tax Dialog */}
        <Dialog open={isTaxDialogOpen} onOpenChange={setIsTaxDialogOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Plus className="h-5 w-5" />
                        Add Tax
                    </DialogTitle>
                    <DialogDescription>Create a new tax rate to use as a default for product types.</DialogDescription>
                </DialogHeader>
                <form
                    onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                            setIsSavingTax(true);
                            const payload = {
                                name: (taxForm.name || "").trim(),
                                rate: Number(taxForm.rate),
                            };
                            if (!payload.name) throw new Error("Name is required");
                            if (Number.isNaN(payload.rate)) throw new Error("Rate must be a number (e.g., 8.25)");
                            const res = await createTax(payload);
                            const created = res?.data;
                            setTaxOptions((prev) => (Array.isArray(prev) ? [...prev, created] : [created]));
                            setFormData((prev) => ({
                                ...prev,
                                default_taxes_ids: [...new Set([...(prev.default_taxes_ids || []), created.id])],
                            }));
                            setIsTaxDialogOpen(false);
                            setTaxForm({ name: "", rate: "" });
                            toast({ title: "Tax created", description: `${created.name} (${created.rate}%)` });
                        } catch (err) {
                            console.error("Failed to create tax", err);
                            const message = err?.response?.data?.detail || err?.message || "Failed to create tax";
                            toast({ title: "Error", description: message, variant: "destructive" });
                        } finally {
                            setIsSavingTax(false);
                        }
                    }}
                    className="space-y-4"
                >
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="tax-name">Tax Name</Label>
                            <Input
                                id="tax-name"
                                placeholder="e.g., Sales Tax, VAT, GST"
                                value={taxForm.name}
                                onChange={(e) => setTaxForm((p) => ({ ...p, name: e.target.value }))}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="tax-rate">Tax Rate (%)</Label>
                            <Input
                                id="tax-rate"
                                type="number"
                                step="0.01"
                                placeholder="e.g., 8.25"
                                value={taxForm.rate}
                                onChange={(e) => setTaxForm((p) => ({ ...p, rate: e.target.value }))}
                                required
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsTaxDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSavingTax}>
                            {isSavingTax ? "Saving..." : "Save Tax"}
                        </Button>
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
