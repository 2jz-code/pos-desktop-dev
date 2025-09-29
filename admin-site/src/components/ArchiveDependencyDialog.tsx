import React, { useState, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle, Package2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface DependentProduct {
	id: number;
	name: string;
	price: string;
	price_display?: string;
	product_type_name?: string;
	category_name?: string;
	is_public: boolean;
}

interface Dependencies {
	category_id?: number;
	category_name?: string;
	product_type_id?: number;
	product_type_name?: string;
	dependent_products_count: number;
	dependent_products: DependentProduct[];
	has_more_products: boolean;
}

interface ValidationData {
	can_archive: boolean;
	requires_confirmation: boolean;
	warnings: string[];
	dependencies: Dependencies;
}

interface ArchiveDependencyDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	type: "category" | "product-type";
	itemId: number;
	itemName: string;
	onValidate: (id: number, force?: boolean) => Promise<{ data: ValidationData }>;
	onArchive: (id: number, options?: any) => Promise<any>;
	onGetAlternatives?: (excludeId?: number) => Promise<{ data: any[] }>;
	onReassignProducts?: (productIds: number[], options: any) => Promise<any>;
}

export const ArchiveDependencyDialog: React.FC<ArchiveDependencyDialogProps> = ({
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
	const [validationData, setValidationData] = useState<ValidationData | null>(null);
	const [handleProducts, setHandleProducts] = useState<"set_null" | "archive" | "reassign">("set_null");
	const [alternatives, setAlternatives] = useState<any[]>([]);
	const [selectedAlternativeId, setSelectedAlternativeId] = useState<string>("");
	const [showReassignOptions, setShowReassignOptions] = useState(false);
	
	const { toast } = useToast();

	// Load validation data when dialog opens
	useEffect(() => {
		if (open && itemId) {
			loadValidationData();
		}
	}, [open, itemId]);

	// Load alternatives when reassign option is selected
	useEffect(() => {
		if (handleProducts === "reassign" && onGetAlternatives) {
			loadAlternatives();
		}
	}, [handleProducts, onGetAlternatives]);

	const loadValidationData = async () => {
		setLoading(true);
		try {
			const response = await onValidate(itemId);
			setValidationData(response.data);
		} catch (error) {
			console.error("Failed to load validation data:", error);
			toast({
				title: "Error",
				description: "Failed to load dependency information.",
				variant: "destructive",
			});
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
				description: "Failed to load alternative options.",
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
					const reassignOptions: any = {};
					
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
			
			const archiveOptions: any = {
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

	const handleOpenChange = (open: boolean) => {
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
						<AlertTriangle className="h-5 w-5 text-warning" />
						Archive "{itemName}"?
					</DialogTitle>
					<DialogDescription>
						{validationData.can_archive
							? "This action will archive the selected item."
							: "This item cannot be archived due to dependencies."}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{/* Warnings */}
					{validationData.warnings.length > 0 && (
						<Alert variant={validationData.can_archive ? "default" : "destructive"}>
							<AlertTriangle className="h-4 w-4" />
							<AlertDescription>
								<ul className="list-disc list-inside space-y-1">
									{validationData.warnings.map((warning, index) => (
										<li key={index} className="text-sm">{warning}</li>
									))}
								</ul>
							</AlertDescription>
						</Alert>
					)}

					{/* Dependency Information */}
					{validationData.dependencies && validationData.dependencies.dependent_products_count > 0 && (
						<div className="space-y-3">
							<div className="flex items-center gap-2">
								<Package2 className="h-5 w-5 text-primary" />
								<h4 className="font-medium">Affected Products</h4>
								<Badge variant="secondary">
									{validationData.dependencies.dependent_products_count} products
								</Badge>
							</div>

							{/* Show first few products */}
							<div className="bg-muted/50 rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
								{validationData.dependencies.dependent_products.map((product) => (
									<div key={product.id} className="flex items-center justify-between text-sm">
										<span className="font-medium">{product.name}</span>
										<div className="flex items-center gap-2">
											<span className="text-muted-foreground">
												{product.price_display || product.price}
											</span>
											{!product.is_public && (
												<Badge variant="outline" className="text-xs">Private</Badge>
											)}
										</div>
									</div>
								))}
								{validationData.dependencies.has_more_products && (
									<div className="text-sm text-muted-foreground text-center py-1">
										... and {validationData.dependencies.dependent_products_count - validationData.dependencies.dependent_products.length} more
									</div>
								)}
							</div>

							{/* Product handling options */}
							{type === "category" && validationData.dependencies.dependent_products_count > 0 && (
								<div className="space-y-3">
									<Label className="text-base font-medium">How should the affected products be handled?</Label>
									
									<div className="space-y-2">
										<div className="flex items-start gap-3">
											<input
												type="radio"
												id="set_null"
												name="handle_products"
												value="set_null"
												checked={handleProducts === "set_null"}
												onChange={(e) => setHandleProducts(e.target.value as "set_null")}
												className="mt-1"
											/>
											<div>
												<label htmlFor="set_null" className="font-medium cursor-pointer">
													Remove category assignment
												</label>
												<p className="text-sm text-muted-foreground">
													Products will become uncategorized but remain active
												</p>
											</div>
										</div>

										<div className="flex items-start gap-3">
											<input
												type="radio"
												id="archive"
												name="handle_products"
												value="archive"
												checked={handleProducts === "archive"}
												onChange={(e) => setHandleProducts(e.target.value as "archive")}
												className="mt-1"
											/>
											<div>
												<label htmlFor="archive" className="font-medium cursor-pointer">
													Archive all products
												</label>
												<p className="text-sm text-muted-foreground">
													All affected products will also be archived
												</p>
											</div>
										</div>

										{onReassignProducts && onGetAlternatives && (
											<div className="flex items-start gap-3">
												<input
													type="radio"
													id="reassign"
													name="handle_products"
													value="reassign"
													checked={handleProducts === "reassign"}
													onChange={(e) => setHandleProducts(e.target.value as "reassign")}
													className="mt-1"
												/>
												<div className="flex-1">
													<label htmlFor="reassign" className="font-medium cursor-pointer">
														Reassign to another category
													</label>
													<p className="text-sm text-muted-foreground">
														Move all products to a different category first
													</p>
												</div>
											</div>
										)}
									</div>

									{/* Alternative selection */}
									{handleProducts === "reassign" && (
										<div className="ml-6 space-y-2">
											<Label>Select alternative {type}</Label>
											<Select value={selectedAlternativeId} onValueChange={setSelectedAlternativeId}>
												<SelectTrigger>
													<SelectValue placeholder={`Choose a ${type}...`} />
												</SelectTrigger>
												<SelectContent>
													{alternatives.map((alt) => (
														<SelectItem key={alt.id} value={alt.id.toString()}>
															{alt.name}
															{alt.description && (
																<span className="text-muted-foreground ml-2">
																	- {alt.description}
																</span>
															)}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									)}
								</div>
							)}

							{/* Product type handling options */}
							{type === "product-type" && !validationData.can_archive && validationData.dependencies.dependent_products_count > 0 && (
								<div className="space-y-3">
									<Label className="text-base font-medium">How should the affected products be handled?</Label>
									
									<div className="space-y-2">
										{onReassignProducts && onGetAlternatives && (
											<div className="flex items-start gap-3">
												<input
													type="radio"
													id="reassign-pt"
													name="handle_products"
													value="reassign"
													checked={handleProducts === "reassign"}
													onChange={(e) => setHandleProducts(e.target.value as "reassign")}
													className="mt-1"
												/>
												<div className="flex-1">
													<label htmlFor="reassign-pt" className="font-medium cursor-pointer">
														Reassign to another product type
													</label>
													<p className="text-sm text-muted-foreground">
														Move all products to a different product type first
													</p>
												</div>
											</div>
										)}
										
										<div className="flex items-start gap-3">
											<input
												type="radio"
												id="archive-pt"
												name="handle_products"
												value="archive"
												checked={handleProducts === "archive"}
												onChange={(e) => setHandleProducts(e.target.value as "archive")}
												className="mt-1"
											/>
											<div>
												<label htmlFor="archive-pt" className="font-medium cursor-pointer">
													Archive all products first
												</label>
												<p className="text-sm text-muted-foreground">
													All affected products will be archived before archiving the product type
												</p>
											</div>
										</div>
									</div>

									{/* Alternative product type selection */}
									{handleProducts === "reassign" && (
										<div className="ml-6 space-y-2">
											<Label>Select alternative product type</Label>
											<Select value={selectedAlternativeId} onValueChange={setSelectedAlternativeId}>
												<SelectTrigger>
													<SelectValue placeholder="Choose a product type..." />
												</SelectTrigger>
												<SelectContent>
													{alternatives.map((alt) => (
														<SelectItem key={alt.id} value={alt.id.toString()}>
															{alt.name}
															{alt.description && (
																<span className="text-muted-foreground ml-2">
																	- {alt.description}
																</span>
															)}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									)}
								</div>
							)}
						</div>
					)}

					{/* Success message for items with no dependencies */}
					{validationData.dependencies.dependent_products_count === 0 && (
						<Alert>
							<CheckCircle2 className="h-4 w-4" />
							<AlertDescription>
								This {type} has no dependent products and can be safely archived.
							</AlertDescription>
						</Alert>
					)}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => handleOpenChange(false)}>
						Cancel
					</Button>
					{validationData.can_archive || 
					 (validationData.dependencies.dependent_products_count > 0 && (handleProducts === "reassign" || handleProducts === "archive" || handleProducts === "set_null")) ||
					 handleProducts === "reassign" ? (
						<Button
							onClick={handleArchive}
							disabled={archiving || (handleProducts === "reassign" && !selectedAlternativeId)}
							variant="destructive"
						>
							{archiving ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									{handleProducts === "reassign" ? "Reassigning & Archiving..." : "Archiving..."}
								</>
							) : (
								"Archive"
							)}
						</Button>
					) : null}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};