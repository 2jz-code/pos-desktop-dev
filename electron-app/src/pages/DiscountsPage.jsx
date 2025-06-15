import { useEffect, useState } from "react";
import { usePosStore } from "@/store/posStore";
import {
	Table,
	TableHeader,
	TableRow,
	TableHead,
	TableBody,
	TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { MoreHorizontal, Tag, Trash2, Edit, Loader2 } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import AddEditDiscountDialog from "@/features/discounts/components/AddEditDiscountDialog";
import { useToast } from "@/components/ui/use-toast";
import { shallow } from "zustand/shallow";

export default function DiscountsPage() {
	const {
		discounts,
		isLoading,
		error,
		fetchDiscounts,
		updateDiscount,
		createDiscount,
		deleteDiscount,
	} = usePosStore(
		(state) => ({
			discounts: state.discounts,
			isLoading: state.isLoading,
			error: state.error,
			fetchDiscounts: state.fetchDiscounts,
			updateDiscount: state.updateDiscount,
			createDiscount: state.createDiscount,
			deleteDiscount: state.deleteDiscount,
		}),
		shallow
	);
	const { toast } = useToast();
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [selectedDiscount, setSelectedDiscount] = useState(null);

	useEffect(() => {
		fetchDiscounts();
	}, [fetchDiscounts]);

	const handleSave = async (data) => {
		try {
			if (selectedDiscount) {
				await updateDiscount(selectedDiscount.id, data);
				toast({
					title: "Success",
					description: "Discount updated successfully.",
				});
			} else {
				await createDiscount(data);
				toast({
					title: "Success",
					description: "Discount created successfully.",
				});
			}
			setIsDialogOpen(false);
			setSelectedDiscount(null);
			//eslint-disable-next-line
		} catch (err) {
			toast({
				title: "Error",
				description: "Failed to save discount.",
				variant: "destructive",
			});
		}
	};

	const handleDelete = async (id) => {
		if (window.confirm("Are you sure you want to delete this discount?")) {
			try {
				await deleteDiscount(id);
				toast({
					title: "Success",
					description: "Discount deleted successfully.",
				});
				//eslint-disable-next-line
			} catch (err) {
				toast({
					title: "Error",
					description: "Failed to delete discount.",
					variant: "destructive",
				});
			}
		}
	};

	const openAddDialog = () => {
		setSelectedDiscount(null);
		setIsDialogOpen(true);
	};

	const openEditDialog = (discount) => {
		setSelectedDiscount(discount);
		setIsDialogOpen(true);
	};

	const formatDate = (dateString) => {
		if (!dateString) return "Always";
		return format(new Date(dateString), "MMM dd, yyyy");
	};
	// --- NEW: Helper function to determine what the discount applies to ---
	const getAppliesToText = (discount) => {
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
	return (
		<>
			<div className="p-4 md:p-6 lg:p-8">
				<div className="flex items-center justify-between mb-4">
					<div>
						<CardTitle className="text-2xl font-bold flex items-center gap-2">
							<Tag className="h-6 w-6" />
							<span>Discount Management</span>
						</CardTitle>
						<CardDescription className="mt-2">
							Create, manage, and schedule all promotional discounts.
						</CardDescription>
					</div>
					<Button onClick={openAddDialog}>Add Discount</Button>
				</div>
				<Card>
					<CardContent className="p-0">
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Status</TableHead>
										<TableHead>Name</TableHead>
										<TableHead>Type</TableHead>
										<TableHead>Scope</TableHead>
										<TableHead>Applies To</TableHead>
										<TableHead>Value</TableHead>
										<TableHead>Start Date</TableHead>
										<TableHead>End Date</TableHead>
										<TableHead className="text-right">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{isLoading ? (
										<TableRow>
											<TableCell
												colSpan="9"
												className="h-24 text-center"
											>
												<Loader2 className="h-6 w-6 animate-spin mx-auto" />
											</TableCell>
										</TableRow>
									) : error ? (
										<TableRow>
											<TableCell
												colSpan="9"
												className="h-24 text-center text-red-500"
											>
												Failed to load discounts.
											</TableCell>
										</TableRow>
									) : discounts.length > 0 ? (
										discounts.map((discount) => (
											<TableRow key={discount.id}>
												<TableCell>
													<Badge
														variant={
															discount.is_active ? "success" : "secondary"
														}
													>
														{discount.is_active ? "Active" : "Inactive"}
													</Badge>
												</TableCell>
												<TableCell className="font-medium">
													{discount.name}
												</TableCell>
												<TableCell>{discount.type}</TableCell>
												<TableCell>{discount.scope}</TableCell>
												<TableCell>{getAppliesToText(discount)}</TableCell>
												<TableCell>
													{discount.type === "PERCENTAGE"
														? `${discount.value}%`
														: `$${discount.value}`}
												</TableCell>
												<TableCell>{formatDate(discount.start_date)}</TableCell>
												<TableCell>{formatDate(discount.end_date)}</TableCell>
												<TableCell className="text-right">
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button
																variant="ghost"
																className="h-8 w-8 p-0"
															>
																<span className="sr-only">Open menu</span>
																<MoreHorizontal className="h-4 w-4" />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end">
															<DropdownMenuItem
																onClick={() => openEditDialog(discount)}
															>
																<Edit className="mr-2 h-4 w-4" />
																<span>Edit</span>
															</DropdownMenuItem>
															<DropdownMenuItem
																className="text-red-600"
																onClick={() => handleDelete(discount.id)}
															>
																<Trash2 className="mr-2 h-4 w-4" />
																<span>Delete</span>
															</DropdownMenuItem>
														</DropdownMenuContent>
													</DropdownMenu>
												</TableCell>
											</TableRow>
										))
									) : (
										<TableRow>
											<TableCell
												colSpan="9"
												className="h-24 text-center"
											>
												No discounts found. Click "Add Discount" to create one.
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>
			</div>
			<AddEditDiscountDialog
				isOpen={isDialogOpen}
				onOpenChange={setIsDialogOpen}
				discount={selectedDiscount}
				onSave={handleSave}
			/>
		</>
	);
}
