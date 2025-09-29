import { useEffect, useState } from "react";
import { usePosStore } from "@/domains/pos/store/posStore";
import { TableCell } from "@/shared/components/ui/table";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import {
	MoreHorizontal,
	Plus,
	Trash2,
	Edit,
	Percent,
	AlertTriangle,
	Archive,
	ArchiveRestore,
	Search,
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
import { StandardTable } from "@/shared/components/layout";
import { PageHeader } from "@/shared/components/layout/PageHeader";
import { shallow } from "zustand/shallow";

export default function DiscountsPage() {
	const {
		discounts,
		isLoading,
		error,
		fetchDiscounts,
		updateDiscount,
		createDiscount,
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
		<div className="flex items-center gap-3">
			<Button
				variant={showArchivedDiscounts ? "default" : "outline"}
				size="sm"
				onClick={() => setShowArchivedDiscounts(!showArchivedDiscounts)}
			>
				{showArchivedDiscounts ? (
					<>
						<ArchiveRestore className="mr-2 h-4 w-4" />
						Show Active
					</>
				) : (
					<>
						<Archive className="mr-2 h-4 w-4" />
						Show Archived
					</>
				)}
			</Button>
			<Button onClick={openAddDialog}>
				<Plus className="mr-2 h-4 w-4" />
				Add Discount
			</Button>
		</div>
	);

	if (error) {
		return (
			<div className="flex flex-col h-full">
				<PageHeader
					icon={Percent}
					title="Discount Management"
					description="Create, manage, and schedule all promotional discounts"
					className="shrink-0"
				/>
				<div className="flex-1 min-h-0 p-4">
					<div className="flex items-center justify-center h-full">
						<div className="text-center space-y-4">
							<AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
							<div>
								<h3 className="font-semibold text-foreground mb-2">Failed to load discounts</h3>
								<p className="text-sm text-muted-foreground mb-4">{error}</p>
								<Button onClick={fetchDiscounts} variant="outline">
									Try Again
								</Button>
							</div>
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<>
			<div className="flex flex-col h-full">
				{/* Page Header */}
				<PageHeader
					icon={Percent}
					title={`${showArchivedDiscounts ? "Archived" : "Active"} Discounts`}
					description="Create, manage, and schedule all promotional discounts"
					actions={headerActions}
					className="shrink-0"
				/>

				{/* Search and Filters */}
				<div className="border-b bg-background/95 backdrop-blur-sm p-4 space-y-4">
					<div className="relative max-w-md">
						<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
						<Input
							placeholder="Search by name, description, type, or scope..."
							className="pl-10 h-11"
							value={filters.search}
							onChange={handleSearchChange}
						/>
					</div>
				</div>

				{/* Main Content */}
				<div className="flex-1 min-h-0 p-4">
					<ScrollArea className="h-full">
						<div className="pb-6">
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
						</div>
					</ScrollArea>
				</div>
			</div>

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
