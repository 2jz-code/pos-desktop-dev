import { useEffect, useState } from "react";
import { usePosStore } from "@/domains/pos/store/posStore";
import { TableCell } from "@/shared/components/ui/table";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
	MoreHorizontal,
	Plus,
	Trash2,
	Edit,
	Percent,
	AlertTriangle,
	Archive,
	ArchiveRestore,
} from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { format } from "date-fns";
import AddEditDiscountDialog from "@/domains/discounts/components/AddEditDiscountDialog";
import { useToast } from "@/shared/components/ui/use-toast";
import { useConfirmation } from "@/shared/components/ui/confirmation-dialog";
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
		archiveDiscount,
		unarchiveDiscount,
	} = usePosStore(
		(state) => ({
			discounts: state.discounts,
			isLoading: state.isLoading,
			error: state.error,
			fetchDiscounts: state.fetchDiscounts,
			updateDiscount: state.updateDiscount,
			createDiscount: state.createDiscount,
			deleteDiscount: state.deleteDiscount,
			archiveDiscount: state.archiveDiscount,
			unarchiveDiscount: state.unarchiveDiscount,
		}),
		shallow
	);
	const { toast } = useToast();
	const confirmation = useConfirmation();
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [selectedDiscount, setSelectedDiscount] = useState(null);
	const [filteredDiscounts, setFilteredDiscounts] = useState([]);
	const [showArchivedDiscounts, setShowArchivedDiscounts] = useState(false);
	const [filters, setFilters] = useState({
		search: "",
	});

	useEffect(() => {
		fetchDiscounts();
	}, [fetchDiscounts]);

	useEffect(() => {
		applyFilters();
	}, [discounts, filters.search, showArchivedDiscounts]);

	const applyFilters = () => {
		let filtered = [...(discounts || [])];

		// Filter by archived status
		filtered = filtered.filter((discount) =>
			showArchivedDiscounts ? !discount.is_active : discount.is_active
		);

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

	const handleDelete = async (discountToDelete) => {
		confirmation.show({
			title: "Delete Discount",
			description: `Are you sure you want to delete "${discountToDelete.name}"? This action cannot be undone.`,
			confirmText: "Delete",
			cancelText: "Cancel",
			variant: "destructive",
			icon: AlertTriangle,
			onConfirm: async () => {
				try {
					await deleteDiscount(discountToDelete.id);
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
			},
		});
	};

	const handleArchive = async (discountId) => {
		try {
			await archiveDiscount(discountId);
			toast({
				title: "Success",
				description: "Discount archived successfully.",
			});
		} catch (err) {
			console.error("Failed to archive discount:", err);
			toast({
				title: "Error",
				description: "Failed to archive discount.",
				variant: "destructive",
			});
		}
	};

	const handleUnarchive = async (discountId) => {
		try {
			await unarchiveDiscount(discountId);
			toast({
				title: "Success",
				description: "Discount unarchived successfully.",
			});
		} catch (err) {
			console.error("Failed to unarchive discount:", err);
			toast({
				title: "Error",
				description: "Failed to unarchive discount.",
				variant: "destructive",
			});
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

		// Check if archived first
		if (!discount.is_active) {
			return <Badge variant="secondary">Archived</Badge>;
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

	const headerActions = (
		<div className="flex items-center gap-4">
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
			<Button onClick={openAddDialog}>
				<Plus className="mr-2 h-4 w-4" />
				Add Discount
			</Button>
		</div>
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
				pageTitle={`${showArchivedDiscounts ? "Archived" : "Active"} Discounts`}
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
					emptyMessage={
						showArchivedDiscounts
							? "No archived discounts found."
							: "No active discounts found."
					}
					renderRow={renderDiscountRow}
				/>
			</DomainPageLayout>

			<AddEditDiscountDialog
				isOpen={isDialogOpen}
				onOpenChange={setIsDialogOpen}
				discount={selectedDiscount}
				onSave={handleSave}
			/>

			{/* Confirmation Dialog */}
			{confirmation.dialog}
		</>
	);
}
