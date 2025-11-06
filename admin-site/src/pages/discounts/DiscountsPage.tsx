import { useState } from "react";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { TableCell } from "../../components/ui/table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { MoreHorizontal, Plus, Edit, Archive, ArchiveRestore, Tag, Calendar } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
// @ts-expect-error - JS module with no types
import discountService from "../../services/api/discountService";
import AddEditDiscountDialog from "../../components/AddEditDiscountDialog";
import { useDebounce } from "@ajeen/ui";
import { useConfirmation } from "../../components/ui/confirmation-dialog";
import { DomainPageLayout } from "../../components/shared/DomainPageLayout";
import { StandardTable } from "../../components/shared/StandardTable";

interface Product {
	id: number;
	name: string;
}

interface Category {
	id: number;
	name: string;
}

export interface Discount {
	id: number;
	name: string;
	code?: string;
	type: "PERCENTAGE" | "FIXED_AMOUNT";
	value: number;
	scope: "ORDER" | "PRODUCT" | "CATEGORY";
	is_active: boolean;
	start_date: string | null;
	end_date: string | null;
	// API returns IDs by default
	applicable_product_ids: number[];
	applicable_category_ids: number[];
	// Nested objects only returned with ?expand=applicable_products,applicable_categories
	applicable_products?: Product[];
	applicable_categories?: Category[];
	usage_limit: number | null;
	used_count: number;
}

export type DiscountFormData = Partial<
	Omit<
		Discount,
		"id" | "used_count" | "applicable_products" | "applicable_categories"
	>
> & {
	applicable_product_ids?: number[];
	applicable_category_ids?: number[];
};

export const DiscountsPage = () => {
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [selectedDiscount, setSelectedDiscount] = useState<Discount | null>(
		null
	);
	const [searchQuery, setSearchQuery] = useState("");
	const [showArchivedDiscounts, setShowArchivedDiscounts] = useState(false);
	const debouncedSearchQuery = useDebounce(searchQuery, 300);

	const queryClient = useQueryClient();
	const confirmation = useConfirmation();

	const {
		data: discounts,
		isLoading,
		error,
	} = useQuery<{ results: Discount[] }, Error>({
		queryKey: ["discounts", showArchivedDiscounts],
		queryFn: () => discountService.getDiscounts({
			include_archived: showArchivedDiscounts ? "only" : undefined
		}),
	});

	const mutationOptions = {
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["discounts"] });
			setIsDialogOpen(false);
			setSelectedDiscount(null);
		},
		onError: (err: Error) => {
			toast.error("Failed to save discount", {
				description: err.message,
			});
		},
	};

	const createDiscountMutation = useMutation<Discount, Error, DiscountFormData>(
		{
			mutationFn: discountService.createDiscount,
			...mutationOptions,
			onSuccess: () => {
				mutationOptions.onSuccess();
				toast.success("Discount created successfully.");
			},
		}
	);

	const updateDiscountMutation = useMutation<
		Discount,
		Error,
		{ id: number; data: DiscountFormData }
	>({
		mutationFn: (variables) =>
			discountService.updateDiscount(variables.id, variables.data),
		...mutationOptions,
		onSuccess: () => {
			mutationOptions.onSuccess();
			toast.success("Discount updated successfully.");
		},
	});

	const deleteDiscountMutation = useMutation<void, Error, number>({
		mutationFn: discountService.deleteDiscount,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["discounts"] });
			toast.success("Discount deleted successfully.");
		},
		onError: (err: Error) => {
			toast.error("Failed to delete discount", {
				description: err.message,
			});
		},
	});

	const archiveDiscountMutation = useMutation<void, Error, number>({
		mutationFn: discountService.archiveDiscount,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["discounts"] });
			toast.success("Discount archived successfully.");
		},
		onError: (err: Error) => {
			toast.error("Failed to archive discount", {
				description: err.message,
			});
		},
	});

	const unarchiveDiscountMutation = useMutation<void, Error, number>({
		mutationFn: discountService.unarchiveDiscount,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["discounts"] });
			toast.success("Discount unarchived successfully.");
		},
		onError: (err: Error) => {
			toast.error("Failed to unarchive discount", {
				description: err.message,
			});
		},
	});

	const handleSave = (data: DiscountFormData) => {
		if (selectedDiscount) {
			updateDiscountMutation.mutate({ id: selectedDiscount.id, data });
		} else {
			createDiscountMutation.mutate(data);
		}
	};

	const handleDelete = (id: number) => {
		const discountToDelete = discounts?.results.find((d) => d.id === id);
		if (!discountToDelete) return;

		confirmation.show({
			title: "Delete Discount",
			description: `Are you sure you want to delete "${discountToDelete.name}"? This action cannot be undone.`,
			variant: "destructive",
			confirmText: "Delete",
			onConfirm: () => {
				deleteDiscountMutation.mutate(id);
			},
		});
	};

	const handleArchive = (id: number) => {
		archiveDiscountMutation.mutate(id);
	};

	const handleUnarchive = (id: number) => {
		unarchiveDiscountMutation.mutate(id);
	};

	const openAddDialog = () => {
		setSelectedDiscount(null);
		setIsDialogOpen(true);
	};

	const openEditDialog = (discount: Discount) => {
		setSelectedDiscount(discount);
		setIsDialogOpen(true);
	};

	const formatDate = (dateString: string | null) => {
		if (!dateString) return "Always";
		return format(new Date(dateString), "MMM dd, yyyy");
	};

	const getAppliesToText = (discount: Discount) => {
		switch (discount.scope) {
			case "ORDER":
				return "Entire Order";
			case "PRODUCT":
				if (discount.applicable_products?.length > 1) {
					return `${discount.applicable_products.length} Products`;
				}
				if (discount.applicable_products?.length === 1) {
					return discount.applicable_products[0].name;
				}
				return "N/A";
			case "CATEGORY":
				if (discount.applicable_categories?.length > 1) {
					return `${discount.applicable_categories.length} Categories`;
				}
				if (discount.applicable_categories?.length === 1) {
					return discount.applicable_categories[0].name;
				}
				return "N/A";
			default:
				return "N/A";
		}
	};

	const getStatusBadge = (discount: Discount) => {
		const now = new Date();
		const startDate = discount.start_date
			? new Date(discount.start_date)
			: null;
		const endDate = discount.end_date ? new Date(discount.end_date) : null;

		if (!discount.is_active) {
			return <Badge variant="secondary">Disabled</Badge>;
		}
		if (startDate && now < startDate) {
			return <Badge variant="outline">Scheduled</Badge>;
		}
		if (endDate && now > endDate) {
			return <Badge variant="destructive">Expired</Badge>;
		}
		return <Badge variant="default">Active</Badge>;
	};

	const getDiscountValue = (discount: Discount) => {
		if (discount.type === "PERCENTAGE") {
			return `${discount.value}%`;
		}
		return `$${parseFloat(String(discount.value)).toFixed(2)}`;
	};

	const getStatusDotColor = (discount: Discount) => {
		const now = new Date();
		const startDate = discount.start_date ? new Date(discount.start_date) : null;
		const endDate = discount.end_date ? new Date(discount.end_date) : null;

		if (!discount.is_active) {
			return "bg-gray-500";
		}
		if (startDate && now < startDate) {
			return "bg-blue-500";
		}
		if (endDate && now > endDate) {
			return "bg-red-500";
		}
		return "bg-emerald-500";
	};

	const filteredDiscounts = discounts?.results?.filter((discount) => {
		// No need to filter by active/archived status - backend already handles this
		// via the include_archived parameter

		// Filter by search query only
		if (debouncedSearchQuery && debouncedSearchQuery.trim()) {
			const searchLower = debouncedSearchQuery.toLowerCase();
			const matchesSearch =
				discount.name.toLowerCase().includes(searchLower) ||
				(discount.code && discount.code.toLowerCase().includes(searchLower));

			return matchesSearch;
		}

		return true; // Show all results from backend
	}) || [];

	const headers = [
		{ label: "Status", className: "w-[140px]" },
		{ label: "Name", className: "w-[220px]" },
		{ label: "Type", className: "w-[140px]" },
		{ label: "Scope", className: "w-[120px]" },
		{ label: "Applies To", className: "w-[180px]" },
		{ label: "Value", className: "w-[120px]" },
		{ label: "Start Date", className: "w-[140px]" },
		{ label: "End Date", className: "w-[140px]" },
		{ label: "", className: "text-right pr-6 w-[80px]" },
	];

	const renderDiscountRow = (discount: Discount) => (
		<>
			<TableCell className="py-3">
				<div className="flex items-center gap-2">
					<div className={`h-2 w-2 rounded-full ${getStatusDotColor(discount)} flex-shrink-0`} />
					{getStatusBadge(discount)}
				</div>
			</TableCell>
			<TableCell className="py-3">
				<div className="flex flex-col gap-0.5">
					<span className="font-semibold text-foreground">{discount.name}</span>
					{discount.code && (
						<span className="text-xs text-muted-foreground font-mono">
							{discount.code}
						</span>
					)}
				</div>
			</TableCell>
			<TableCell className="py-3">
				<Badge variant="outline" className="font-normal text-xs">
					{discount.type === "PERCENTAGE" ? "Percentage" : "Fixed Amount"}
				</Badge>
			</TableCell>
			<TableCell className="py-3">
				<Badge variant="secondary" className="font-normal text-xs">
					{discount.scope === "ORDER" ? "Order" : discount.scope === "PRODUCT" ? "Product" : "Category"}
				</Badge>
			</TableCell>
			<TableCell className="py-3 text-foreground">
				{getAppliesToText(discount)}
			</TableCell>
			<TableCell className="py-3">
				<span className="font-mono font-bold text-base text-foreground">
					{getDiscountValue(discount)}
				</span>
			</TableCell>
			<TableCell className="py-3 text-foreground">
				<div className="flex items-center gap-1.5">
					<Calendar className="h-3.5 w-3.5 text-muted-foreground" />
					{formatDate(discount.start_date)}
				</div>
			</TableCell>
			<TableCell className="py-3 text-foreground">
				<div className="flex items-center gap-1.5">
					<Calendar className="h-3.5 w-3.5 text-muted-foreground" />
					{formatDate(discount.end_date)}
				</div>
			</TableCell>
			<TableCell className="text-right pr-6">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="h-8 w-8">
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					{/* @ts-expect-error - DropdownMenuContent typing issue */}
					<DropdownMenuContent align="end">
						{/* @ts-expect-error - DropdownMenuItem typing issue */}
						<DropdownMenuItem onClick={() => openEditDialog(discount)}>
							<Edit className="mr-2 h-4 w-4" />
							Edit
						</DropdownMenuItem>
						{/* @ts-expect-error - DropdownMenuItem typing issue */}
						{showArchivedDiscounts ? (
							<DropdownMenuItem
								onClick={() => handleUnarchive(discount.id)}
								className="text-green-600"
							>
								<ArchiveRestore className="mr-2 h-4 w-4" />
								Unarchive
							</DropdownMenuItem>
						) : (
							<DropdownMenuItem
								onClick={() => handleArchive(discount.id)}
								className="text-orange-600"
							>
								<Archive className="mr-2 h-4 w-4" />
								Archive
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</TableCell>
		</>
	);

	return (
		<>
			<DomainPageLayout
				pageIcon={Tag}
				pageTitle="Discount Management"
				pageDescription="Create, manage, and schedule all promotional discounts"
				pageActions={
					<>
						<Button
							variant={showArchivedDiscounts ? "default" : "outline"}
							size="sm"
							onClick={() => setShowArchivedDiscounts(!showArchivedDiscounts)}
						>
							{showArchivedDiscounts ? (
								<ArchiveRestore className="mr-2 h-4 w-4" />
							) : (
								<Archive className="mr-2 h-4 w-4" />
							)}
							{showArchivedDiscounts ? "Show Active" : "Show Archived"}
						</Button>
						<Button onClick={openAddDialog} size="sm">
							<Plus className="mr-2 h-4 w-4" />
							Add Discount
						</Button>
					</>
				}
				title={showArchivedDiscounts ? "Archived Discounts" : "Active Discounts"}
				description={
					showArchivedDiscounts
						? "Previously archived promotional discounts"
						: "Manage all promotional discounts and codes"
				}
				searchPlaceholder="Search by name or code..."
				searchValue={searchQuery}
				onSearchChange={(e: React.ChangeEvent<HTMLInputElement>) =>
					setSearchQuery(e.target.value)
				}
			>
				<StandardTable
					headers={headers}
					data={filteredDiscounts}
					loading={isLoading}
					emptyMessage={
						showArchivedDiscounts
							? "No archived discounts available."
							: searchQuery
							? "No discounts match your search."
							: "Create your first discount to get started."
					}
					renderRow={renderDiscountRow}
					colSpan={9}
					className="border-0"
				/>
			</DomainPageLayout>

			<AddEditDiscountDialog
				isOpen={isDialogOpen}
				onOpenChange={setIsDialogOpen}
				discount={selectedDiscount}
				onSave={handleSave}
				isSaving={
					createDiscountMutation.isPending || updateDiscountMutation.isPending
				}
			/>

			{confirmation.dialog}
		</>
	);
};

export default DiscountsPage;
