import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select as ShadSelect, // Renamed to avoid conflict
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/shared/components/ui/popover";
import { Calendar } from "@/shared/components/ui/calendar";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import * as productService from "@/domains/products/services/productService";
import * as categoryService from "@/domains/products/services/categoryService";
import { useToast } from "@/shared/components/ui/use-toast";

// --- NEW: Import react-select ---
import Select from "react-select";

export default function AddEditDiscountDialog({
	isOpen,
	onOpenChange,
	discount,
	onSave,
}) {
	const { toast } = useToast();
	const [formData, setFormData] = useState({});
	const [products, setProducts] = useState([]);
	const [categories, setCategories] = useState([]);
	const [isLoading, setIsLoading] = useState(false);

	// Fetch products and categories when the dialog opens
	useEffect(() => {
		if (isOpen) {
			const fetchData = async () => {
				setIsLoading(true);
				try {
					const [productsRes, categoriesRes] = await Promise.all([
						productService.getProducts(),
						categoryService.getCategories(),
					]);
					console.log("Raw products response:", productsRes.data);
					console.log("Raw categories response:", categoriesRes.data);

					// Handle different response structures
					const productsData = Array.isArray(productsRes.data)
						? productsRes.data
						: productsRes.data.results || [];
					const categoriesData = categoriesRes.data.results || [];
					console.log("Loaded products:", productsData);
					console.log("Loaded categories:", categoriesData);
					setProducts(productsData);
					setCategories(categoriesData);
					//eslint-disable-next-line
				} catch (error) {
					toast({
						title: "Error fetching data",
						description: "Could not load products and categories.",
						variant: "destructive",
					});
				} finally {
					setIsLoading(false);
				}
			};
			fetchData();
		}
	}, [isOpen, toast]);

	// Initialize form data
	useEffect(() => {
		const getInitialData = () => {
			if (discount) {
				return {
					...discount,
					start_date: discount.start_date
						? new Date(discount.start_date)
						: null,
					end_date: discount.end_date ? new Date(discount.end_date) : null,
					// --- FIX: Ensure these are arrays for multi-select ---
					applicable_products: discount.applicable_products || [],
					applicable_categories: discount.applicable_categories || [],
				};
			} else {
				// Default for a new discount
				return {
					name: "",
					description: "",
					type: "PERCENTAGE",
					scope: "ORDER",
					value: 0,
					is_active: true,
					min_purchase_amount: 0.0,
					start_date: null,
					end_date: null,
					// --- FIX: Initialize as empty arrays ---
					applicable_products: [],
					applicable_categories: [],
					code: "",
				};
			}
		};
		setFormData(getInitialData());
	}, [discount, isOpen]);

	const handleInputChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

	const handleSelectChange = (name, value) => {
		const newFormData = { ...formData, [name]: value };

		// --- NEW: Handle BXGY logic ---
		if (name === "type" && value === "BUY_X_GET_Y") {
			// BXGY discounts are always for specific products
			newFormData.scope = "PRODUCT";
			newFormData.value = 0; // Does not use the 'value' field
			newFormData.applicable_categories = [];
		}

		if (name === "scope") {
			newFormData.applicable_products = [];
			newFormData.applicable_categories = [];
		}
		setFormData(newFormData);
	};

	// --- NEW: Handler for the multi-select component ---
	const handleMultiSelectChange = (name, selectedOptions) => {
		// react-select gives an array of { value, label }, we just need the values (IDs)
		const selectedIds = selectedOptions
			? selectedOptions.map((option) => option.value)
			: [];
		setFormData((prev) => ({ ...prev, [name]: selectedIds }));
	};

	const handleDateChange = (name, date) => {
		setFormData((prev) => ({ ...prev, [name]: date }));
	};

	const handleSwitchChange = (name, checked) => {
		setFormData((prev) => ({ ...prev, [name]: checked }));
	};

	const handleSave = () => {
		const dataToSend = { ...formData };

		// --- THE FIX: Rename keys to match the backend's writeable fields ---

		// The backend expects the list of IDs under the 'write_' prefixed fields.
		dataToSend.write_applicable_products = dataToSend.applicable_products;
		dataToSend.write_applicable_categories = dataToSend.applicable_categories;

		// Clean up the original read-only keys so we don't send them.
		delete dataToSend.applicable_products;
		delete dataToSend.applicable_categories;
		// --- END FIX ---

		// Format dates for serialization
		dataToSend.start_date = dataToSend.start_date
			? dataToSend.start_date.toISOString()
			: null;
		dataToSend.end_date = dataToSend.end_date
			? dataToSend.end_date.toISOString()
			: null;

		// onSave now sends a payload with the correct keys for the backend to process.
		onSave(dataToSend);
	};

	// --- NEW: Prepare options for react-select ---
	const productOptions = products.map((p) => ({ value: p.id, label: p.name }));
	const categoryOptions = categories.map((c) => ({
		value: c.id,
		label: c.name,
	}));

	console.log("Product options:", productOptions);
	console.log("Category options:", categoryOptions);

	return (
		<Dialog
			open={isOpen}
			onOpenChange={onOpenChange}
		>
			<DialogContent className="w-[90vw] max-w-4xl sm:max-w-6xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>
						{discount ? "Edit Discount" : "Add New Discount"}
					</DialogTitle>
					<DialogDescription>
						Fill in the details for the discount below.
					</DialogDescription>
				</DialogHeader>

				{isLoading ? (
					<div className="flex justify-center items-center h-48">
						<Loader2 className="h-8 w-8 animate-spin" />
					</div>
				) : (
					<div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-4">
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
								value={formData.name || ""}
								onChange={handleInputChange}
								className="col-span-3"
							/>
						</div>
						<div className="grid grid-cols-4 items-center gap-4">
							<Label
								htmlFor="code"
								className="text-right"
							>
								Code
							</Label>
							<Input
								id="code"
								name="code"
								value={formData.code || ""}
								onChange={handleInputChange}
								className="col-span-3"
								placeholder="Optional, e.g., SUMMER20"
							/>
						</div>
						<div className="grid grid-cols-4 items-center gap-4">
							<Label
								htmlFor="type"
								className="text-right"
							>
								Type
							</Label>
							<ShadSelect
								value={formData.type || "PERCENTAGE"}
								onValueChange={(v) => handleSelectChange("type", v)}
							>
								<SelectTrigger className="col-span-3">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="PERCENTAGE">Percentage</SelectItem>
									<SelectItem value="FIXED_AMOUNT">Fixed Amount</SelectItem>
									<SelectItem value="BUY_X_GET_Y">Buy X Get Y</SelectItem>
								</SelectContent>
							</ShadSelect>
						</div>

						{/* Conditionally show Value field */}
						{formData.type !== "BUY_X_GET_Y" && (
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="value"
									className="text-right"
								>
									Value
								</Label>
								<Input
									id="value"
									name="value"
									type="number"
									value={formData.value || 0}
									onChange={handleInputChange}
									className="col-span-3"
								/>
							</div>
						)}

						{/* Conditionally show Buy/Get Quantity fields */}
						{formData.type === "BUY_X_GET_Y" && (
							<>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label
										htmlFor="buy_quantity"
										className="text-right"
									>
										Buy Quantity (X)
									</Label>
									<Input
										id="buy_quantity"
										name="buy_quantity"
										type="number"
										placeholder="e.g., 2"
										value={formData.buy_quantity || ""}
										onChange={handleInputChange}
										className="col-span-3"
									/>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label
										htmlFor="get_quantity"
										className="text-right"
									>
										Get Quantity (Y)
									</Label>
									<Input
										id="get_quantity"
										name="get_quantity"
										type="number"
										placeholder="e.g., 1"
										value={formData.get_quantity || ""}
										onChange={handleInputChange}
										className="col-span-3"
									/>
								</div>
							</>
						)}

						<div className="grid grid-cols-4 items-center gap-4">
							<Label
								htmlFor="scope"
								className="text-right"
							>
								Scope
							</Label>
							<ShadSelect
								value={formData.scope || "ORDER"}
								onValueChange={(v) => handleSelectChange("scope", v)}
								disabled={formData.type === "BUY_X_GET_Y"}
							>
								<SelectTrigger className="col-span-3">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="ORDER">Entire Order</SelectItem>
									<SelectItem value="PRODUCT">Specific Products</SelectItem>
									<SelectItem value="CATEGORY">Specific Categories</SelectItem>
								</SelectContent>
							</ShadSelect>
						</div>

						{formData.scope === "PRODUCT" && (
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="products"
									className="text-right"
								>
									Products
								</Label>
								<Select
									id="products"
									isMulti
									options={productOptions}
									className="col-span-3"
									placeholder="Select products..."
									value={productOptions.filter((option) =>
										formData.applicable_products.includes(option.value)
									)}
									onChange={(options) =>
										handleMultiSelectChange("applicable_products", options)
									}
								/>
							</div>
						)}
						{formData.scope === "CATEGORY" && (
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="categories"
									className="text-right"
								>
									Categories
								</Label>
								<Select
									id="categories"
									isMulti
									options={categoryOptions}
									className="col-span-3"
									placeholder="Select categories..."
									value={categoryOptions.filter((option) =>
										formData.applicable_categories.includes(option.value)
									)}
									onChange={(options) =>
										handleMultiSelectChange("applicable_categories", options)
									}
								/>
							</div>
						)}

						{/* ... (min_purchase_amount, dates, and active switch remain the same) ... */}
						<div className="grid grid-cols-4 items-center gap-4">
							<Label
								htmlFor="min_purchase_amount"
								className="text-right"
							>
								Min. Purchase
							</Label>
							<Input
								id="min_purchase_amount"
								name="min_purchase_amount"
								type="number"
								value={formData.min_purchase_amount || 0}
								onChange={handleInputChange}
								className="col-span-3"
							/>
						</div>
						<div className="grid grid-cols-4 items-center gap-4">
							<Label
								htmlFor="start_date"
								className="text-right"
							>
								Start Date
							</Label>
							<Popover>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										className={cn(
											"col-span-3 justify-start text-left font-normal",
											!formData.start_date && "text-muted-foreground"
										)}
									>
										<CalendarIcon className="mr-2 h-4 w-4" />
										{formData.start_date ? (
											format(formData.start_date, "PPP")
										) : (
											<span>Pick a date</span>
										)}
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-auto p-0">
									<Calendar
										mode="single"
										selected={formData.start_date}
										onSelect={(d) => handleDateChange("start_date", d)}
										initialFocus
									/>
								</PopoverContent>
							</Popover>
						</div>
						<div className="grid grid-cols-4 items-center gap-4">
							<Label
								htmlFor="end_date"
								className="text-right"
							>
								End Date
							</Label>
							<Popover>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										className={cn(
											"col-span-3 justify-start text-left font-normal",
											!formData.end_date && "text-muted-foreground"
										)}
									>
										<CalendarIcon className="mr-2 h-4 w-4" />
										{formData.end_date ? (
											format(formData.end_date, "PPP")
										) : (
											<span>Pick a date</span>
										)}
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-auto p-0">
									<Calendar
										mode="single"
										selected={formData.end_date}
										onSelect={(d) => handleDateChange("end_date", d)}
										initialFocus
									/>
								</PopoverContent>
							</Popover>
						</div>
						<div className="grid grid-cols-4 items-center gap-4">
							<Label
								htmlFor="is_active"
								className="text-right"
							>
								Active
							</Label>
							<Switch
								id="is_active"
								checked={formData.is_active}
								onCheckedChange={(c) => handleSwitchChange("is_active", c)}
							/>
						</div>
					</div>
				)}
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						onClick={handleSave}
						disabled={isLoading}
					>
						Save Discount
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
