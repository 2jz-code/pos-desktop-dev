/**
 * IngredientCostDrawer - Drawer for editing ingredient costs.
 *
 * Provides three modes:
 * 1. Direct Cost Entry: Set cost per unit directly
 * 2. Pack Calculator: Enter pack cost and quantity to derive unit cost
 * 3. Prep Item (Recipe): View/edit sub-recipe costs for producible ingredients
 *
 * Per the COGS UX plan, this supports:
 * - "case of 48 for $24" workflow (pack calculator)
 * - Drill-down for prep items like dough that have their own recipes
 */
import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation as useStoreLocation } from "@/contexts/LocationContext";
import { formatCurrency } from "@ajeen/ui";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import {
	Calculator,
	Package,
	DollarSign,
	RefreshCw,
	Save,
	ArrowRight,
	ChefHat,
	AlertTriangle,
	CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import cogsService, {
	type IngredientCostResult,
	type MenuItemCostBreakdown,
	type Unit,
} from "@/services/api/cogsService";

interface IngredientCostDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	ingredient: IngredientCostResult | null;
	productId: number | null;
	productName: string | null;
	onCostUpdated?: () => void;
}

export const IngredientCostDrawer = ({
	open,
	onOpenChange,
	ingredient,
	productId,
	productName,
	onCostUpdated,
}: IngredientCostDrawerProps) => {
	const { selectedLocationId } = useStoreLocation();
	const queryClient = useQueryClient();

	// Tab state - "recipe" tab is only shown if ingredient is a prep item
	const [activeTab, setActiveTab] = useState<"direct" | "pack" | "recipe">("direct");

	// Direct cost form state
	const [directCost, setDirectCost] = useState("");
	const [directUnitId, setDirectUnitId] = useState<number | null>(null);

	// Pack calculator form state
	const [packCost, setPackCost] = useState("");
	const [unitsPerPack, setUnitsPerPack] = useState("");
	const [packUnitId, setPackUnitId] = useState<number | null>(null);
	const [baseUnitId, setBaseUnitId] = useState<number | null>(null);

	// Fetch units
	const { data: units = [] } = useQuery<Unit[]>({
		queryKey: ["units"],
		queryFn: () => cogsService.getUnits(),
	});

	// Fetch ingredient's recipe breakdown (for prep items like dough)
	// This enables drill-down to see sub-ingredient costs
	const {
		data: subRecipeBreakdown,
		isLoading: isLoadingSubRecipe,
	} = useQuery<MenuItemCostBreakdown>({
		queryKey: ["ingredient-recipe", productId, selectedLocationId],
		queryFn: () => cogsService.getMenuItemCOGSDetail(productId!),
		enabled: !!productId && !!selectedLocationId && open && ingredient?.cost_type === "computed",
	});

	// Check if this ingredient is a prep item (has its own recipe)
	const isComputedFromRecipe = ingredient?.cost_type === "computed";
	const hasSubRecipe = isComputedFromRecipe && subRecipeBreakdown?.has_recipe;

	// Group units by category for easier selection
	const unitsByCategory = useMemo(() => {
		const grouped: Record<string, Unit[]> = {
			weight: [],
			volume: [],
			count: [],
		};
		units.forEach((unit) => {
			if (grouped[unit.category]) {
				grouped[unit.category].push(unit);
			}
		});
		return grouped;
	}, [units]);

	// Reset form when drawer opens or ingredient changes
	useEffect(() => {
		if (open && ingredient) {
			// Set default direct cost from existing ingredient data
			setDirectCost(ingredient.unit_cost || "");

			// Try to find matching unit
			const matchingUnit = units.find((u) => u.code === ingredient.unit_code);
			if (matchingUnit) {
				setDirectUnitId(matchingUnit.id);
				setBaseUnitId(matchingUnit.id);
			}

			// Reset pack calculator
			setPackCost("");
			setUnitsPerPack("");
			setPackUnitId(null);

			// Set default tab based on cost type
			// If cost is computed from recipe, show recipe tab first
			if (ingredient.cost_type === "computed") {
				setActiveTab("recipe");
			} else {
				setActiveTab("direct");
			}
		}
	}, [open, ingredient, units]);

	// Calculate derived cost per base unit
	const derivedUnitCost = useMemo(() => {
		if (!packCost || !unitsPerPack) return null;
		const cost = parseFloat(packCost);
		const qty = parseFloat(unitsPerPack);
		if (isNaN(cost) || isNaN(qty) || qty <= 0) return null;
		return (cost / qty).toFixed(4);
	}, [packCost, unitsPerPack]);

	// Direct cost mutation
	const directCostMutation = useMutation({
		mutationFn: async () => {
			if (!productId || !selectedLocationId || !directUnitId || !directCost) {
				throw new Error("Missing required fields");
			}

			return cogsService.createCostSource({
				product: productId,
				store_location: selectedLocationId,
				unit: directUnitId,
				unit_cost: directCost,
				effective_at: new Date().toISOString(),
				source_type: "manual",
			});
		},
		onSuccess: () => {
			toast.success("Cost saved successfully");
			queryClient.invalidateQueries({ queryKey: ["menu-item-cogs"] });
			queryClient.invalidateQueries({ queryKey: ["menu-items-cogs"] });
			onCostUpdated?.();
			onOpenChange(false);
		},
		onError: (error: Error) => {
			toast.error(`Failed to save cost: ${error.message}`);
		},
	});

	// Pack calculator mutation
	const packCostMutation = useMutation({
		mutationFn: async () => {
			if (
				!productId ||
				!selectedLocationId ||
				!packUnitId ||
				!baseUnitId ||
				!packCost ||
				!unitsPerPack
			) {
				throw new Error("Missing required fields");
			}

			return cogsService.calculatePackCost({
				product_id: productId,
				store_location_id: selectedLocationId,
				pack_unit_id: packUnitId,
				base_unit_id: baseUnitId,
				pack_cost: packCost,
				units_per_pack: unitsPerPack,
			});
		},
		onSuccess: (result) => {
			toast.success(
				`Cost calculated: ${formatCurrency(parseFloat(result.derived_base_unit_cost))} per ${result.base_unit}`
			);
			queryClient.invalidateQueries({ queryKey: ["menu-item-cogs"] });
			queryClient.invalidateQueries({ queryKey: ["menu-items-cogs"] });
			onCostUpdated?.();
			onOpenChange(false);
		},
		onError: (error: Error) => {
			toast.error(`Failed to calculate cost: ${error.message}`);
		},
	});

	const handleSave = () => {
		if (activeTab === "direct") {
			directCostMutation.mutate();
		} else if (activeTab === "pack") {
			packCostMutation.mutate();
		}
		// Recipe tab doesn't have a save action - changes are made to sub-ingredients
	};

	const isLoading = directCostMutation.isPending || packCostMutation.isPending;

	const canSaveDirect = productId && selectedLocationId && directUnitId && directCost && parseFloat(directCost) >= 0;
	const canSavePack =
		productId &&
		selectedLocationId &&
		packUnitId &&
		baseUnitId &&
		packUnitId !== baseUnitId &&
		packCost &&
		unitsPerPack &&
		parseFloat(packCost) >= 0 &&
		parseFloat(unitsPerPack) > 0;

	// Recipe tab is read-only (drill-down view), so no save needed
	const canSave = activeTab === "direct" ? canSaveDirect : activeTab === "pack" ? canSavePack : false;
	const showSaveButton = activeTab !== "recipe";

	// Get unit name for display
	const getUnitName = (unitId: number | null) => {
		if (!unitId) return "";
		const unit = units.find((u) => u.id === unitId);
		return unit?.name || "";
	};

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="sm:max-w-md">
				<SheetHeader>
					<SheetTitle className="flex items-center gap-2">
						<DollarSign className="h-5 w-5" />
						{productName || "Set Ingredient Cost"}
					</SheetTitle>
					<SheetDescription>
						Enter the cost for this ingredient. You can set a direct unit cost
						or calculate from pack pricing.
					</SheetDescription>
				</SheetHeader>

				<div className="py-6">
					{/* Current cost display */}
					{ingredient?.has_cost && (
						<div className="mb-4 p-3 rounded-lg bg-muted/50 border">
							<p className="text-xs text-muted-foreground mb-1">Current Cost</p>
							<div className="flex items-center gap-2">
								<span className="text-lg font-bold">
									{formatCurrency(parseFloat(ingredient.unit_cost || "0"))}
								</span>
								<span className="text-muted-foreground">
									/ {ingredient.unit_display}
								</span>
								{ingredient.cost_type && (
									<Badge
										variant="outline"
										className={
											ingredient.cost_type === "computed"
												? "border-blue-500/30 text-blue-600"
												: ""
										}
									>
										{ingredient.cost_type === "computed" ? "From Recipe" : "Manual"}
									</Badge>
								)}
							</div>
						</div>
					)}

					<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "direct" | "pack" | "recipe")}>
						<TabsList className={`grid w-full ${isComputedFromRecipe ? "grid-cols-3" : "grid-cols-2"}`}>
							<TabsTrigger value="direct" className="gap-2">
								<DollarSign className="h-4 w-4" />
								Direct
							</TabsTrigger>
							<TabsTrigger value="pack" className="gap-2">
								<Package className="h-4 w-4" />
								Pack
							</TabsTrigger>
							{isComputedFromRecipe && (
								<TabsTrigger value="recipe" className="gap-2">
									<ChefHat className="h-4 w-4" />
									Recipe
								</TabsTrigger>
							)}
						</TabsList>

						{/* Direct Cost Tab */}
						<TabsContent value="direct" className="space-y-4 mt-4">
							<div className="space-y-2">
								<Label htmlFor="direct-cost">Cost per Unit</Label>
								<div className="flex gap-2">
									<div className="relative flex-1">
										<span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
											$
										</span>
										<Input
											id="direct-cost"
											type="number"
											step="0.0001"
											min="0"
											placeholder="0.00"
											className="pl-7"
											value={directCost}
											onChange={(e) => setDirectCost(e.target.value)}
										/>
									</div>
									<Select
										value={directUnitId?.toString() || ""}
										onValueChange={(v) => setDirectUnitId(parseInt(v))}
									>
										<SelectTrigger className="w-[140px]">
											<SelectValue placeholder="Unit" />
										</SelectTrigger>
										<SelectContent>
											{Object.entries(unitsByCategory).map(([category, categoryUnits]) =>
												categoryUnits.length > 0 && (
													<div key={category}>
														<div className="px-2 py-1 text-xs font-medium text-muted-foreground capitalize">
															{category}
														</div>
														{categoryUnits.map((unit) => (
															<SelectItem key={unit.id} value={unit.id.toString()}>
																{unit.name} ({unit.code})
															</SelectItem>
														))}
													</div>
												)
											)}
										</SelectContent>
									</Select>
								</div>
								<p className="text-xs text-muted-foreground">
									Enter the cost per single unit (e.g., $0.50 per oz)
								</p>
							</div>
						</TabsContent>

						{/* Pack Calculator Tab */}
						<TabsContent value="pack" className="space-y-4 mt-4">
							<div className="space-y-4">
								<div className="space-y-2">
									<Label htmlFor="pack-cost">Pack Cost</Label>
									<div className="relative">
										<span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
											$
										</span>
										<Input
											id="pack-cost"
											type="number"
											step="0.01"
											min="0"
											placeholder="24.00"
											className="pl-7"
											value={packCost}
											onChange={(e) => setPackCost(e.target.value)}
										/>
									</div>
									<p className="text-xs text-muted-foreground">
										Total cost for one pack/case
									</p>
								</div>

								<div className="grid grid-cols-2 gap-3">
									<div className="space-y-2">
										<Label htmlFor="units-per-pack">Units per Pack</Label>
										<Input
											id="units-per-pack"
											type="number"
											step="1"
											min="1"
											placeholder="48"
											value={unitsPerPack}
											onChange={(e) => setUnitsPerPack(e.target.value)}
										/>
									</div>
									<div className="space-y-2">
										<Label>Base Unit</Label>
										<Select
											value={baseUnitId?.toString() || ""}
											onValueChange={(v) => setBaseUnitId(parseInt(v))}
										>
											<SelectTrigger>
												<SelectValue placeholder="Select" />
											</SelectTrigger>
											<SelectContent>
												{Object.entries(unitsByCategory).map(([category, categoryUnits]) =>
													categoryUnits.length > 0 && (
														<div key={category}>
															<div className="px-2 py-1 text-xs font-medium text-muted-foreground capitalize">
																{category}
															</div>
															{categoryUnits.map((unit) => (
																<SelectItem key={unit.id} value={unit.id.toString()}>
																	{unit.name}
																</SelectItem>
															))}
														</div>
													)
												)}
											</SelectContent>
										</Select>
									</div>
								</div>

								<div className="space-y-2">
									<Label>Pack Unit</Label>
									<Select
										value={packUnitId?.toString() || ""}
										onValueChange={(v) => setPackUnitId(parseInt(v))}
									>
										<SelectTrigger>
											<SelectValue placeholder="Select pack unit (case, box, etc.)" />
										</SelectTrigger>
										<SelectContent>
											{Object.entries(unitsByCategory).map(([category, categoryUnits]) =>
												categoryUnits.length > 0 && (
													<div key={category}>
														<div className="px-2 py-1 text-xs font-medium text-muted-foreground capitalize">
															{category}
														</div>
														{categoryUnits.map((unit) => (
															<SelectItem
																key={unit.id}
																value={unit.id.toString()}
																disabled={unit.id === baseUnitId}
															>
																{unit.name}
															</SelectItem>
														))}
													</div>
												)
											)}
										</SelectContent>
									</Select>
									<p className="text-xs text-muted-foreground">
										e.g., case, box, bag - must be different from base unit
									</p>
								</div>

								{/* Calculation Preview */}
								{derivedUnitCost && baseUnitId && (
									<div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
										<div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
											<Calculator className="h-4 w-4" />
											Calculated Cost
										</div>
										<div className="flex items-center gap-2">
											<span className="text-muted-foreground">
												${packCost} ÷ {unitsPerPack} =
											</span>
											<ArrowRight className="h-4 w-4 text-muted-foreground" />
											<span className="text-xl font-bold text-green-600">
												{formatCurrency(parseFloat(derivedUnitCost))}
											</span>
											<span className="text-muted-foreground">
												/ {getUnitName(baseUnitId)}
											</span>
										</div>
									</div>
								)}
							</div>
						</TabsContent>

						{/* Recipe Tab - shows sub-recipe breakdown for prep items */}
						{isComputedFromRecipe && (
							<TabsContent value="recipe" className="space-y-4 mt-4">
								<div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
									<div className="flex items-center gap-2 text-sm text-blue-600 mb-1">
										<ChefHat className="h-4 w-4" />
										Prep Item
									</div>
									<p className="text-xs text-muted-foreground">
										This ingredient's cost is computed from its own recipe.
										{subRecipeBreakdown?.is_complete
											? " All sub-ingredients have costs set."
											: " Some sub-ingredients are missing costs."}
									</p>
								</div>

								{isLoadingSubRecipe ? (
									<div className="flex items-center justify-center py-8">
										<RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
									</div>
								) : subRecipeBreakdown?.has_recipe ? (
									<div className="space-y-3">
										{/* Recipe summary */}
										<div className="grid grid-cols-2 gap-3 text-sm">
											<div className="p-2 rounded bg-muted/50">
												<p className="text-xs text-muted-foreground">Total Cost</p>
												<p className="font-semibold">
													{subRecipeBreakdown.total_cost
														? formatCurrency(parseFloat(subRecipeBreakdown.total_cost))
														: "Incomplete"}
												</p>
											</div>
											<div className="p-2 rounded bg-muted/50">
												<p className="text-xs text-muted-foreground">Ingredients</p>
												<p className="font-semibold">
													{subRecipeBreakdown.ingredients.length} items
												</p>
											</div>
										</div>

										{/* Sub-ingredients list */}
										<Accordion type="single" collapsible className="w-full">
											<AccordionItem value="ingredients" className="border rounded-lg">
												<AccordionTrigger className="px-3 py-2 text-sm hover:no-underline">
													<span className="flex items-center gap-2">
														Sub-Ingredients
														{!subRecipeBreakdown.is_complete && (
															<Badge variant="outline" className="border-orange-500/30 text-orange-600 text-[10px]">
																{subRecipeBreakdown.missing_products.length} missing
															</Badge>
														)}
													</span>
												</AccordionTrigger>
												<AccordionContent className="px-3 pb-3">
													<div className="space-y-2">
														{subRecipeBreakdown.ingredients.map((subIng) => (
															<div
																key={subIng.product_id}
																className={`flex items-center justify-between p-2 rounded text-sm ${
																	!subIng.has_cost ? "bg-orange-500/5 border border-orange-500/20" : "bg-muted/30"
																}`}
															>
																<div className="flex items-center gap-2">
																	{subIng.has_cost ? (
																		<CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
																	) : (
																		<AlertTriangle className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
																	)}
																	<span className="font-medium">{subIng.product_name}</span>
																</div>
																<div className="text-right">
																	<span className="text-muted-foreground">
																		{subIng.quantity_display} {subIng.unit_display}
																	</span>
																	{subIng.extended_cost && (
																		<span className="ml-2 font-medium">
																			{formatCurrency(parseFloat(subIng.extended_cost))}
																		</span>
																	)}
																</div>
															</div>
														))}
													</div>

													{!subRecipeBreakdown.is_complete && (
														<p className="text-xs text-orange-600 mt-3">
															Set costs for missing ingredients to complete this prep item's cost.
														</p>
													)}
												</AccordionContent>
											</AccordionItem>
										</Accordion>

										<p className="text-xs text-muted-foreground">
											To change this ingredient's cost, edit the costs of its sub-ingredients or
											switch to "Direct" to override with a manual cost.
										</p>
									</div>
								) : (
									<div className="text-center py-6 text-muted-foreground">
										<ChefHat className="h-8 w-8 mx-auto mb-2 opacity-50" />
										<p className="text-sm">Recipe data not available</p>
									</div>
								)}
							</TabsContent>
						)}
					</Tabs>
				</div>

				<SheetFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						{showSaveButton ? "Cancel" : "Close"}
					</Button>
					{showSaveButton && (
						<Button onClick={handleSave} disabled={!canSave || isLoading}>
							{isLoading ? (
								<>
									<RefreshCw className="h-4 w-4 mr-2 animate-spin" />
									Saving...
								</>
							) : (
								<>
									<Save className="h-4 w-4 mr-2" />
									Save Cost
								</>
							)}
						</Button>
					)}
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
};

export default IngredientCostDrawer;
