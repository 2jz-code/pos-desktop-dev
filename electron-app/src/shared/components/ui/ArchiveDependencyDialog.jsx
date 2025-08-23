import React, { useState, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Loader2, AlertTriangle, Package2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/shared/components/ui/use-toast";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Label } from "@/shared/components/ui/label";

/**
 * @typedef {Object} DependentProduct
 * @property {number} id
 * @property {string} name
 * @property {string} price
 * @property {string} [price_display]
 * @property {string} [product_type_name]
 * @property {string} [category_name]
 * @property {boolean} is_public
 */

/**
 * @typedef {Object} Dependencies
 * @property {number} [category_id]
 * @property {string} [category_name]
 * @property {number} [product_type_id]
 * @property {string} [product_type_name]
 * @property {number} dependent_products_count
 * @property {DependentProduct[]} dependent_products
 * @property {boolean} has_more_products
 */

/**
 * @typedef {Object} ValidationData
 * @property {boolean} can_archive
 * @property {boolean} requires_confirmation
 * @property {string[]} warnings
 * @property {Dependencies} dependencies
 */

/**
 * @typedef {Object} ArchiveDependencyDialogProps
 * @property {boolean} open
 * @property {function(boolean): void} onOpenChange
 * @property {"category" | "product-type"} type
 * @property {number} itemId
 * @property {string} itemName
 * @property {function(number, boolean?): Promise<{data: ValidationData}>} onValidate
 * @property {function(number, any?): Promise<any>} onArchive
 * @property {function(number?): Promise<{data: any[]}>} [onGetAlternatives]
 * @property {function(number[], any): Promise<any>} [onReassignProducts]
 */

/**
 * Archive Dependency Dialog Component
 * 
 * Provides a comprehensive interface for archiving categories and product types
 * with dependency validation and resolution options.
 * 
 * @param {ArchiveDependencyDialogProps} props
 */
export const ArchiveDependencyDialog = ({
	open,
	onOpenChange,
	type,
	itemId,
	itemName,
	onValidate,
	onArchive,
	onGetAlternatives,
	onReassignProducts,
}) => {
	const [loading, setLoading] = useState(false);
	const [archiving, setArchiving] = useState(false);
	const [validationData, setValidationData] = useState(null);
	const [handleProducts, setHandleProducts] = useState("set_null");
	const [showReassignOptions, setShowReassignOptions] = useState(false);
	const [selectedAlternativeId, setSelectedAlternativeId] = useState("");
	const [alternatives, setAlternatives] = useState([]);
	
	const { toast } = useToast();

	// Load validation data when dialog opens
	useEffect(() => {
		if (open && itemId) {
			loadValidationData();
		}
	}, [open, itemId]);

	// Handle reassign option selection
	useEffect(() => {
		if (handleProducts === "reassign") {
			setShowReassignOptions(true);
			if (onGetAlternatives && alternatives.length === 0) {
				loadAlternatives();
			}
		} else {
			setShowReassignOptions(false);
			setSelectedAlternativeId("");
		}
	}, [handleProducts]);

	const loadValidationData = async () => {
		if (!onValidate) return;
		
		try {
			setLoading(true);
			const response = await onValidate(itemId, false);
			setValidationData(response.data);
		} catch (error) {
			console.error("Failed to validate archiving:", error);
			toast({
				title: "Validation Failed",
				description: "Failed to check dependencies. Please try again.",
				variant: "destructive",
			});
			onOpenChange(false);
		} finally {
			setLoading(false);
		}
	};

	const loadAlternatives = async () => {
		if (!onGetAlternatives) return;
		
		try {
			const response = await onGetAlternatives(itemId);
			setAlternatives(response.data || []);
		} catch (error) {
			console.error("Failed to load alternatives:", error);
			toast({
				title: "Error",
				description: `Failed to load alternative ${type === "category" ? "categories" : "product types"}.`,
				variant: "destructive",
			});
		}
	};

	const handleArchive = async () => {
		if (!validationData) return;

		// If we need to reassign products first
		if (handleProducts === "reassign" && validationData.dependencies.dependent_products.length > 0) {
			if (!selectedAlternativeId) {
				toast({
					title: "Selection Required",
					description: `Please select an alternative ${type} for reassignment.`,
					variant: "destructive",
				});
				return;
			}

			// Reassign products first
			if (onReassignProducts) {
				try {
					setArchiving(true);
					
					const productIds = validationData.dependencies.dependent_products.map(p => p.id);
					const reassignOptions = {};
					
					if (type === "category") {
						reassignOptions.new_category_id = parseInt(selectedAlternativeId);
					} else {
						reassignOptions.new_product_type_id = parseInt(selectedAlternativeId);
					}
					
					await onReassignProducts(productIds, reassignOptions);
					
					toast({
						title: "Products Reassigned",
						description: `${productIds.length} products have been reassigned successfully.`,
					});
				} catch (error) {
					console.error("Failed to reassign products:", error);
					toast({
						title: "Reassignment Failed",
						description: "Failed to reassign products. Please try again.",
						variant: "destructive",
					});
					setArchiving(false);
					return;
				}
			}
		}

		// Now archive the item
		try {
			setArchiving(true);
			
			const archiveOptions = {
				force: !validationData.can_archive || handleProducts !== "set_null",
			};
			
			if (type === "category") {
				archiveOptions.handle_products = handleProducts;
			}
			
			await onArchive(itemId, archiveOptions);
			
			toast({
				title: "Success",
				description: `${type === "category" ? "Category" : "Product type"} "${itemName}" has been archived successfully.`,
			});
			
			onOpenChange(false);
		} catch (error) {
			console.error("Failed to archive:", error);
			toast({
				title: "Archive Failed",
				description: `Failed to archive ${type}. Please try again.`,
				variant: "destructive",
			});
		} finally {
			setArchiving(false);
		}
	};

	const resetDialog = () => {
		setValidationData(null);
		setHandleProducts("set_null");
		setSelectedAlternativeId("");
		setShowReassignOptions(false);
	};

	const handleOpenChange = (open) => {
		if (!open) {
			resetDialog();
		}
		onOpenChange(open);
	};

	if (loading) {
		return (
			<Dialog open={open} onOpenChange={handleOpenChange}>
				<DialogContent className="sm:max-w-md">
					<div className="flex items-center justify-center p-8">
						<Loader2 className="h-8 w-8 animate-spin mr-2" />
						<span>Loading dependency information...</span>
					</div>
				</DialogContent>
			</Dialog>
		);
	}

	if (!validationData) {
		return null;
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<AlertTriangle className="h-5 w-5 text-amber-500" />
						Archive "{itemName}"?
					</DialogTitle>
					<DialogDescription>
						{validationData.can_archive
							? `This ${type} will be archived and hidden from the system.`
							: `This ${type} cannot be archived due to dependencies.`}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{/* Warnings */}
					{validationData.warnings.length > 0 && (
						<Alert>
							<AlertTriangle className="h-4 w-4" />
							<AlertDescription>
								<ul className="list-disc list-inside space-y-1">
									{validationData.warnings.map((warning, index) => (
										<li key={index}>{warning}</li>
									))}
								</ul>
							</AlertDescription>
						</Alert>
					)}

					{/* Dependencies Info */}
					{validationData.dependencies.dependent_products_count > 0 && (
						<div className="space-y-3">
							<div className="flex items-center gap-2">
								<Package2 className="h-4 w-4 text-blue-500" />
								<span className="font-medium">
									{validationData.dependencies.dependent_products_count} dependent product
									{validationData.dependencies.dependent_products_count !== 1 ? "s" : ""}
								</span>
							</div>

							{/* Product List */}
							<div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-1">
								{validationData.dependencies.dependent_products.map((product) => (
									<div
										key={product.id}
										className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded"
									>
										<div>
											<span className="font-medium">{product.name}</span>
											{product.price && (
												<span className="text-gray-600 ml-2">
													${product.price}
												</span>
											)}
										</div>
										<Badge variant={product.is_public ? "default" : "secondary"}>
											{product.is_public ? "Public" : "Private"}
										</Badge>
									</div>
								))}
								{validationData.dependencies.has_more_products && (
									<div className="text-sm text-gray-500 text-center p-2">
										... and {validationData.dependencies.dependent_products_count - validationData.dependencies.dependent_products.length} more products
									</div>
								)}
							</div>

							{/* Handling Options - Only for categories */}
							{type === "category" && (
								<div className="space-y-3">
									<Label className="text-sm font-medium">
										How should dependent products be handled?
									</Label>
									
									<div className="space-y-2">
										<div className="flex items-center space-x-2">
											<input
												type="radio"
												id="set_null"
												name="handleProducts"
												value="set_null"
												checked={handleProducts === "set_null"}
												onChange={(e) => setHandleProducts(e.target.value)}
												className="h-4 w-4"
											/>
											<Label htmlFor="set_null" className="text-sm cursor-pointer">
												Remove category from products (products become "Uncategorized")
											</Label>
										</div>
										
										<div className="flex items-center space-x-2">
											<input
												type="radio"
												id="archive"
												name="handleProducts"
												value="archive"
												checked={handleProducts === "archive"}
												onChange={(e) => setHandleProducts(e.target.value)}
												className="h-4 w-4"
											/>
											<Label htmlFor="archive" className="text-sm cursor-pointer">
												Archive all dependent products as well
											</Label>
										</div>
										
										{onGetAlternatives && onReassignProducts && (
											<div className="flex items-center space-x-2">
												<input
													type="radio"
													id="reassign"
													name="handleProducts"
													value="reassign"
													checked={handleProducts === "reassign"}
													onChange={(e) => setHandleProducts(e.target.value)}
													className="h-4 w-4"
												/>
												<Label htmlFor="reassign" className="text-sm cursor-pointer">
													Reassign products to a different category
												</Label>
											</div>
										)}
									</div>

									{/* Alternative Selection */}
									{showReassignOptions && alternatives.length > 0 && (
										<div className="space-y-2 pl-6 border-l-2 border-blue-200">
											<Label htmlFor="alternative-select" className="text-sm font-medium">
												Select new category:
											</Label>
											<Select value={selectedAlternativeId} onValueChange={setSelectedAlternativeId}>
												<SelectTrigger>
													<SelectValue placeholder="Choose a category..." />
												</SelectTrigger>
												<SelectContent>
													{alternatives.map((alternative) => (
														<SelectItem key={alternative.id} value={alternative.id.toString()}>
															{alternative.name}
															{alternative.parent && (
																<span className="text-gray-500 ml-1">
																	(under {alternative.parent})
																</span>
															)}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									)}

									{showReassignOptions && alternatives.length === 0 && (
										<Alert>
											<AlertTriangle className="h-4 w-4" />
											<AlertDescription>
												No alternative categories available for reassignment.
											</AlertDescription>
										</Alert>
									)}
								</div>
							)}
						</div>
					)}

					{/* No Dependencies Message */}
					{validationData.dependencies.dependent_products_count === 0 && (
						<div className="flex items-center gap-2 text-green-600">
							<CheckCircle2 className="h-4 w-4" />
							<span>No dependent products found. Safe to archive.</span>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={archiving}>
						Cancel
					</Button>
					{(validationData.can_archive || 
					  (validationData.dependencies.dependent_products_count > 0 && (handleProducts === "reassign" || handleProducts === "archive" || handleProducts === "set_null")) ||
					  handleProducts === "reassign") && (
						<Button
							onClick={handleArchive}
							disabled={archiving || (handleProducts === "reassign" && !selectedAlternativeId)}
							className="bg-amber-600 hover:bg-amber-700"
						>
							{archiving ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Archiving...
								</>
							) : (
								`Archive ${type === "category" ? "Category" : "Product Type"}`
							)}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};