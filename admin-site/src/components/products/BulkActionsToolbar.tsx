import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { X, Check, Archive, ArchiveRestore } from "lucide-react";
import {
	bulkUpdateProducts,
	bulkArchiveProducts,
	bulkUnarchiveProducts,
} from "@/services/api/productService";
import { useToast } from "@/components/ui/use-toast";

interface BulkActionsToolbarProps {
	selectedCount: number;
	selectedProductIds: number[];
	onClear: () => void;
	onSuccess: () => void;
	categories: any[];
	productTypes: any[];
	loading?: boolean;
}

export const BulkActionsToolbar: React.FC<BulkActionsToolbarProps> = ({
	selectedCount,
	selectedProductIds,
	onClear,
	onSuccess,
	categories,
	productTypes,
	loading = false,
}) => {
	const [selectedCategory, setSelectedCategory] = useState<string>("");
	const [selectedProductType, setSelectedProductType] = useState<string>("");
	const [isApplying, setIsApplying] = useState(false);
	const { toast } = useToast();

	const handleApplyChanges = async () => {
		// Check if at least one field is selected
		if (!selectedCategory && !selectedProductType) {
			toast({
				title: "No changes",
				description: "Please select a category or product type to update",
				variant: "destructive",
			});
			return;
		}

		setIsApplying(true);
		try {
			// Build update payload
			const updateData: any = {
				product_ids: selectedProductIds,
			};

			if (selectedCategory) {
				updateData.category = selectedCategory === "none" ? null : parseInt(selectedCategory);
			}

			if (selectedProductType) {
				updateData.product_type = selectedProductType === "none" ? null : parseInt(selectedProductType);
			}

			const response = await bulkUpdateProducts(updateData);

			if (response.data.success) {
				toast({
					title: "Success",
					description: `Updated ${response.data.updated_count} products`,
				});
				// Reset selections
				setSelectedCategory("");
				setSelectedProductType("");
				onSuccess();
			}
		} catch (err: any) {
			toast({
				title: "Error",
				description: err.response?.data?.error || "Failed to update products",
				variant: "destructive",
			});
		} finally {
			setIsApplying(false);
		}
	};

	const handleBulkArchive = async () => {
		if (selectedProductIds.length === 0) return;

		setIsApplying(true);
		try {
			const response = await bulkArchiveProducts(selectedProductIds);
			toast({
				title: "Success",
				description: `Archived ${response.data.archived_count} products`,
			});
			onSuccess();
		} catch (err: any) {
			toast({
				title: "Error",
				description: err.response?.data?.error || "Failed to archive products",
				variant: "destructive",
			});
		} finally {
			setIsApplying(false);
		}
	};

	const handleBulkUnarchive = async () => {
		if (selectedProductIds.length === 0) return;

		setIsApplying(true);
		try {
			const response = await bulkUnarchiveProducts(selectedProductIds);
			toast({
				title: "Success",
				description: `Restored ${response.data.unarchived_count} products`,
			});
			onSuccess();
		} catch (err: any) {
			toast({
				title: "Error",
				description: err.response?.data?.error || "Failed to restore products",
				variant: "destructive",
			});
		} finally {
			setIsApplying(false);
		}
	};

	return (
		<div className="sticky top-0 z-10 bg-blue-50 dark:bg-blue-950 border-b border-blue-200 dark:border-blue-800 p-4 mb-4 rounded-lg shadow-sm animate-in slide-in-from-top duration-150">
			<div className="flex items-center justify-between flex-wrap gap-4">
				<div className="flex items-center gap-4 flex-1 flex-wrap">
					<div className="flex items-center gap-2">
						<span className="font-semibold text-blue-900 dark:text-blue-100">
							{selectedCount} {selectedCount === 1 ? "product" : "products"} selected
						</span>
					</div>

					<div className="flex items-center gap-2">
						<Select
							value={selectedCategory}
							onValueChange={setSelectedCategory}
							disabled={loading || isApplying}
						>
							<SelectTrigger className="w-[200px] bg-white dark:bg-gray-800">
								<SelectValue placeholder="Change category..." />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">Remove category</SelectItem>
								{categories.map((category) => (
									<SelectItem key={category.id} value={category.id.toString()}>
										{category.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						<Select
							value={selectedProductType}
							onValueChange={setSelectedProductType}
							disabled={loading || isApplying}
						>
							<SelectTrigger className="w-[200px] bg-white dark:bg-gray-800">
								<SelectValue placeholder="Change type..." />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">Remove type</SelectItem>
								{productTypes.map((type) => (
									<SelectItem key={type.id} value={type.id.toString()}>
										{type.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				<div className="flex items-center gap-2 flex-wrap">
					<Button
						onClick={handleApplyChanges}
						disabled={(!selectedCategory && !selectedProductType) || loading || isApplying}
						size="sm"
						variant="default"
					>
						<Check className="h-4 w-4 mr-2" />
						Apply Changes
					</Button>
					<Button
						onClick={handleBulkArchive}
						disabled={loading || isApplying}
						size="sm"
						variant="destructive"
					>
						<Archive className="h-4 w-4 mr-2" />
						Archive Selected
					</Button>
					<Button
						onClick={handleBulkUnarchive}
						disabled={loading || isApplying}
						size="sm"
						variant="secondary"
					>
						<ArchiveRestore className="h-4 w-4 mr-2" />
						Restore Selected
					</Button>
					<Button
						onClick={onClear}
						disabled={loading || isApplying}
						variant="outline"
						size="sm"
					>
						<X className="h-4 w-4 mr-2" />
						Clear Selection
					</Button>
				</div>
			</div>
		</div>
	);
};