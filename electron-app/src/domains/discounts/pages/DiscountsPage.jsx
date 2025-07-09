import { useEffect, useState } from "react";
import { usePosStore } from "@/domains/pos/store/posStore";
import { TableCell } from "@/shared/components/ui/table";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { MoreHorizontal, Plus, Trash2, Edit, Percent } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { format } from "date-fns";
import AddEditDiscountDialog from "@/domains/discounts/components/AddEditDiscountDialog";
import { useToast } from "@/shared/components/ui/use-toast";
import { DomainPageLayout, StandardTable } from "@/shared/components/layout";
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
	const [filteredDiscounts, setFilteredDiscounts] = useState([]);
	const [filters, setFilters] = useState({
		search: "",
	});

	useEffect(() => {
		fetchDiscounts();
	}, [fetchDiscounts]);

	useEffect(() => {
		applyFilters();
	}, [discounts, filters.search]);

	const applyFilters = () => {
		let filtered = [...(discounts || [])];

		if (filters.search) {
			const searchLower = filters.search.toLowerCase();
			filtered = filtered.filter(
				(discount) =>
					discount.name.toLowerCase().includes(searchLower) ||
					discount.description?.toLowerCase().includes(searchLower) ||
					discount.type.toLowerCase().includes(searchLower) ||
					discount.scope.toLowerCase().includes(searchLower)
			);
		}

		setFilteredDiscounts(filtered);
	};

	const handleSearchChange = (e) => {
		const value = e.target.value;
		setFilters((prev) => ({ ...prev, search: value }));
	};

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
		} catch (err) {
			console.error("Failed to save discount:", err);
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
			} catch (err) {
				console.error("Failed to delete discount:", err);
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

	const getStatusBadge = (discount) => {
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

	const getDiscountValue = (discount) => {
		if (discount.type === "PERCENTAGE") {
			return `${discount.value}%`;
		}
		return `$${parseFloat(discount.value).toFixed(2)}`;
	};

	const headers = [
		{ label: "Status" },
		{ label: "Name" },
		{ label: "Type" },
		{ label: "Scope" },
		{ label: "Applies To" },
		{ label: "Value" },
		{ label: "Start Date" },
		{ label: "End Date" },
		{ label: "Actions", className: "text-right" },
	];

	const renderDiscountRow = (discount) => (
		<>
			<TableCell>{getStatusBadge(discount)}</TableCell>
			<TableCell className="font-medium">{discount.name}</TableCell>
			<TableCell>
				<Badge variant="outline">
					{discount.type === "PERCENTAGE" ? "Percentage" : "Fixed Amount"}
				</Badge>
			</TableCell>
			<TableCell>
				<Badge variant="secondary">{discount.scope}</Badge>
			</TableCell>
			<TableCell>{getAppliesToText(discount)}</TableCell>
			<TableCell className="font-mono">{getDiscountValue(discount)}</TableCell>
			<TableCell>{formatDate(discount.start_date)}</TableCell>
			<TableCell>{formatDate(discount.end_date)}</TableCell>
			<TableCell
				onClick={(e) => e.stopPropagation()}
				className="text-right"
			>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
						>
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={() => openEditDialog(discount)}>
							<Edit className="mr-2 h-4 w-4" />
							Edit
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => handleDelete(discount.id)}
							className="text-destructive"
						>
							<Trash2 className="mr-2 h-4 w-4" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</TableCell>
		</>
	);

	const headerActions = (
		<Button onClick={openAddDialog}>
			<Plus className="mr-2 h-4 w-4" />
			Add Discount
		</Button>
	);

	if (error) {
		return (
			<DomainPageLayout
				pageTitle="Discount Management"
				pageDescription="Create, manage, and schedule all promotional discounts."
				pageIcon={Percent}
				error="Failed to load discounts."
			>
				<div className="flex items-center justify-center h-24">
					<Button onClick={fetchDiscounts}>Retry</Button>
				</div>
			</DomainPageLayout>
		);
	}

	return (
		<>
			<DomainPageLayout
				pageTitle="Discount Management"
				pageDescription="Create, manage, and schedule all promotional discounts."
				pageIcon={Percent}
				pageActions={headerActions}
				title="Filters & Search"
				searchPlaceholder="Search by name, description, type, or scope..."
				searchValue={filters.search}
				onSearchChange={handleSearchChange}
			>
				<StandardTable
					headers={headers}
					data={filteredDiscounts}
					loading={isLoading}
					emptyMessage="No discounts found for the selected filters."
					renderRow={renderDiscountRow}
				/>
			</DomainPageLayout>

			<AddEditDiscountDialog
				isOpen={isDialogOpen}
				onOpenChange={setIsDialogOpen}
				discount={selectedDiscount}
				onSave={handleSave}
			/>
		</>
	);
}
