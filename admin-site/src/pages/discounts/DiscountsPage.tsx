import { useState } from "react";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { MoreHorizontal, Plus, Trash2, Edit, Search } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
// @ts-expect-error - JS module with no types
import discountService from "../../services/api/discountService";
import AddEditDiscountDialog from "../../components/AddEditDiscountDialog";
import { useDebounce } from "../../hooks/useDebounce";
import { useConfirmation } from "../../components/ui/confirmation-dialog";

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
	applicable_products: Product[];
	applicable_categories: Category[];
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
	const debouncedSearchQuery = useDebounce(searchQuery, 300);

	const queryClient = useQueryClient();
	const confirmation = useConfirmation();

	const {
		data: discounts,
		isLoading,
		error,
	} = useQuery<{ results: Discount[] }, Error>({
		queryKey: ["discounts", { search: debouncedSearchQuery }],
		queryFn: () =>
			discountService.getDiscounts({ search: debouncedSearchQuery }),
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

	const handleSave = (data: DiscountFormData) => {
		if (selectedDiscount) {
			updateDiscountMutation.mutate({ id: selectedDiscount.id, data });
		} else {
			createDiscountMutation.mutate(data);
		}
	};

	const handleDelete = (id: number) => {
		const discountToDelete = discounts?.data.find((d) => d.id === id);
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
		return `${parseFloat(String(discount.value)).toFixed(2)}`;
	};

	return (
		<div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 p-6">
			<div className="flex items-center justify-between mb-6">
				<div>
					<h1 className="text-3xl font-bold">Discount Management</h1>
					<p className="text-muted-foreground">
						Create, manage, and schedule all promotional discounts.
					</p>
				</div>
				<Button onClick={openAddDialog}>
					<Plus className="mr-2 h-4 w-4" />
					Add Discount
				</Button>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>All Discounts</CardTitle>
					<CardDescription>
						<div className="relative w-full max-w-sm">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<Input
								placeholder="Search by name or code..."
								value={searchQuery}
								onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
									setSearchQuery(e.target.value)
								}
								className="pl-10"
							/>
						</div>
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="rounded-md border">
						<table className="w-full">
							<thead>
								<tr className="border-b bg-muted/50">
									<th className="p-4 text-left font-medium">Status</th>
									<th className="p-4 text-left font-medium">Name</th>
									<th className="p-4 text-left font-medium">Type</th>
									<th className="p-4 text-left font-medium">Scope</th>
									<th className="p-4 text-left font-medium">Applies To</th>
									<th className="p-4 text-left font-medium">Value</th>
									<th className="p-4 text-left font-medium">Start Date</th>
									<th className="p-4 text-left font-medium">End Date</th>
									<th className="p-4 text-left font-medium">Actions</th>
								</tr>
							</thead>
							<tbody>
								{isLoading ? (
									<tr>
										<td
											colSpan={9}
											className="text-center py-8"
										>
											Loading...
										</td>
									</tr>
								) : error ? (
									<tr>
										<td
											colSpan={9}
											className="text-center py-8 text-red-500"
										>
											Failed to load discounts.
										</td>
									</tr>
								) : (
									discounts?.results.map((discount) => (
										<tr
											key={discount.id}
											className="border-b"
										>
											<td className="p-4">{getStatusBadge(discount)}</td>
											<td className="p-4 font-medium">{discount.name}</td>
											<td className="p-4">
												<Badge variant="outline">{discount.type}</Badge>
											</td>
											<td className="p-4">
												<Badge variant="secondary">{discount.scope}</Badge>
											</td>
											<td className="p-4">{getAppliesToText(discount)}</td>
											<td className="p-4 font-mono">
												{getDiscountValue(discount)}
											</td>
											<td className="p-4">{formatDate(discount.start_date)}</td>
											<td className="p-4">{formatDate(discount.end_date)}</td>
											<td className="p-4 text-right">
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="ghost"
															className="h-8 w-8 p-0"
														>
															<MoreHorizontal className="h-4 w-4" />
														</Button>
													</DropdownMenuTrigger>
													{/* @ts-expect-error - DropdownMenuContent typing issue */}
													<DropdownMenuContent align="end">
														{/* @ts-expect-error - DropdownMenuItem typing issue */}
														<DropdownMenuItem
															onClick={() => openEditDialog(discount)}
														>
															<Edit className="mr-2 h-4 w-4" />
															Edit
														</DropdownMenuItem>
														{/* @ts-expect-error - DropdownMenuItem typing issue */}
														<DropdownMenuItem
															onClick={() => handleDelete(discount.id)}
															className="text-red-600"
														>
															<Trash2 className="mr-2 h-4 w-4" />
															Delete
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>

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
		</div>
	);
};

export default DiscountsPage;
