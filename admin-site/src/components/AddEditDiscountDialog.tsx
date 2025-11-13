import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
	Select as ShadSelect,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import { Switch } from "./ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
// @ts-expect-error - JS module with no types
import productService from "../services/api/productService";
// @ts-expect-error - JS module with no types
import categoryService from "../services/api/categoryService";
import Select from "react-select";
import type {
	Discount,
	DiscountFormData as DiscountFormDataType,
} from "../pages/discounts/DiscountsPage";

type DiscountFormData = Omit<
	DiscountFormDataType,
	"start_date" | "end_date"
> & {
	start_date: Date | null;
	end_date: Date | null;
};

interface AddEditDiscountDialogProps {
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	discount: Discount | null;
	onSave: (data: DiscountFormDataType) => void;
	isSaving?: boolean;
}

export default function AddEditDiscountDialog({
	isOpen,
	onOpenChange,
	discount,
	onSave,
	isSaving,
}: AddEditDiscountDialogProps) {
	const [formData, setFormData] = useState<Partial<DiscountFormData>>({});

	const { data: products, isLoading: isLoadingProducts } = useQuery({
		queryKey: ["products"],
		queryFn: () => productService.getAllProducts(),
		enabled: isOpen,
	});

	const { data: categories, isLoading: isLoadingCategories } = useQuery({
		queryKey: ["categories"],
		queryFn: () => categoryService.getCategories({ view: 'reference' }),
		enabled: isOpen,
	});

	useEffect(() => {
		const getInitialData = (): Partial<DiscountFormData> => {
			if (discount) {
				return {
					...discount,
					start_date: discount.start_date
						? new Date(discount.start_date)
						: null,
					end_date: discount.end_date ? new Date(discount.end_date) : null,
					// API now returns IDs directly instead of nested objects
					applicable_product_ids: discount.applicable_product_ids || [],
					applicable_category_ids: discount.applicable_category_ids || [],
				};
			} else {
				return {
					name: "",
					code: "",
					type: "PERCENTAGE",
					scope: "ORDER",
					value: 0,
					start_date: null,
					end_date: null,
					usage_limit: null,
					applicable_product_ids: [],
					applicable_category_ids: [],
				};
			}
		};
		if (isOpen) {
			setFormData(getInitialData());
		}
	}, [discount, isOpen]);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

	const handleSelectChange = (name: string, value: string) => {
		const newFormData: Partial<DiscountFormData> = {
			...formData,
			[name]: value,
		};

		if (name === "scope") {
			newFormData.applicable_product_ids = [];
			newFormData.applicable_category_ids = [];
		}
		setFormData(newFormData);
	};

	const handleMultiSelectChange = (
		name: string,
		selectedOptions: readonly { value: number; label: string }[] | null
	) => {
		const selectedIds = selectedOptions
			? selectedOptions.map((option) => option.value)
			: [];
		setFormData((prev) => ({ ...prev, [name]: selectedIds }));
	};

	const handleDateChange = (name: string, date: Date | undefined) => {
		setFormData((prev) => ({ ...prev, [name]: date }));
	};

	const handleSwitchChange = (name: string, checked: boolean) => {
		setFormData((prev) => ({ ...prev, [name]: checked }));
	};

	const handleSave = () => {
		const apiPayload = {
			name: formData.name || "",
			code: formData.code,
			type: formData.type || "PERCENTAGE",
			value: Number(formData.value) || 0,
			scope: formData.scope || "ORDER",
			start_date: formData.start_date
				? new Date(formData.start_date).toISOString()
				: null,
			end_date: formData.end_date
				? new Date(formData.end_date).toISOString()
				: null,
			usage_limit: formData.usage_limit ? Number(formData.usage_limit) : null,
			write_applicable_products: formData.applicable_product_ids || [],
			write_applicable_categories: formData.applicable_category_ids || [],
		};

		// The backend now expects `write_applicable_products` and `write_applicable_categories`.
		// We cast to `any` here to bypass the parent component's strict `DiscountFormDataType`
		// which may not have these fields, ensuring the correctly formatted data is sent to the API.
		onSave(apiPayload as any);
	};

	const productOptions =
		products?.data?.map((p: { id: number; name: string }) => ({
			value: p.id,
			label: p.name,
		})) || [];

	// Handle both paginated and non-paginated category responses
	const categoryData = categories?.data?.results || categories?.data || [];
	const categoryOptions =
		categoryData.map((c: { id: number; name: string }) => ({
			value: c.id,
			label: c.name,
		})) || [];

	const isLoading = isLoadingProducts || isLoadingCategories;

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
								</SelectContent>
							</ShadSelect>
						</div>

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
									htmlFor="applicable_product_ids"
									className="text-right"
								>
									Products
								</Label>
								<Select
									id="applicable_product_ids"
									isMulti
									options={productOptions}
									value={productOptions.filter(
										(o: { value: number; label: string }) =>
											formData.applicable_product_ids?.includes(o.value)
									)}
									onChange={(o) =>
										handleMultiSelectChange("applicable_product_ids", o)
									}
									className="col-span-3"
								/>
							</div>
						)}

						{formData.scope === "CATEGORY" && (
							<div className="grid grid-cols-4 items-center gap-4">
								<Label
									htmlFor="applicable_category_ids"
									className="text-right"
								>
									Categories
								</Label>
								<Select
									id="applicable_category_ids"
									isMulti
									options={categoryOptions}
									value={categoryOptions.filter(
										(o: { value: number; label: string }) =>
											formData.applicable_category_ids?.includes(o.value)
									)}
									onChange={(o) =>
										handleMultiSelectChange("applicable_category_ids", o)
									}
									className="col-span-3"
								/>
							</div>
						)}

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
										variant={"outline"}
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
										selected={
											formData.start_date
												? new Date(formData.start_date)
												: undefined
										}
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
										variant={"outline"}
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
										selected={
											formData.end_date
												? new Date(formData.end_date)
												: undefined
										}
										onSelect={(d) => handleDateChange("end_date", d)}
										initialFocus
									/>
								</PopoverContent>
							</Popover>
						</div>

						<div className="grid grid-cols-4 items-center gap-4">
							<Label
								htmlFor="usage_limit"
								className="text-right"
							>
								Usage Limit
							</Label>
							<Input
								id="usage_limit"
								name="usage_limit"
								type="number"
								value={formData.usage_limit || ""}
								onChange={handleInputChange}
								className="col-span-3"
								placeholder="Optional, leave empty for unlimited"
							/>
						</div>

					</div>
				)}

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isSaving}
					>
						Cancel
					</Button>
					<Button
						onClick={handleSave}
						disabled={isSaving}
					>
						{isSaving ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Saving...
							</>
						) : (
							"Save"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
