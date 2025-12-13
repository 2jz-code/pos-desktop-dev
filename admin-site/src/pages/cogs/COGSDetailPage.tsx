import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation as useStoreLocation } from "@/contexts/LocationContext";
import { formatCurrency } from "@ajeen/ui";
import { DomainPageLayout } from "@/components/shared/DomainPageLayout";
import { StandardTable } from "@/components/shared/StandardTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Calculator,
	ArrowLeft,
	DollarSign,
	TrendingUp,
	AlertTriangle,
	CheckCircle2,
	Package,
	Save,
	RefreshCw,
	Zap,
} from "lucide-react";
import { toast } from "sonner";
import cogsService, {
	type MenuItemCostBreakdown,
	type IngredientCostResult,
	type Unit,
} from "@/services/api/cogsService";
import { IngredientCostDrawer } from "@/components/cogs/IngredientCostDrawer";

export const COGSDetailPage = () => {
	const { menuItemId } = useParams<{ menuItemId: string }>();
	const navigate = useNavigate();
	const { tenant } = useAuth();
	const tenantSlug = tenant?.slug || "";
	const { selectedLocationId } = useStoreLocation();
	const queryClient = useQueryClient();

	// Fast setup dialog state
	const [showFastSetup, setShowFastSetup] = useState(false);
	const [fastSetupData, setFastSetupData] = useState<
		Record<number, { unit_cost: string; unit_code: string }>
	>({});

	// Ingredient cost drawer state
	const [selectedIngredient, setSelectedIngredient] = useState<IngredientCostResult | null>(null);
	const [showIngredientDrawer, setShowIngredientDrawer] = useState(false);

	// Fetch units for fast setup
	const { data: units = [] } = useQuery<Unit[]>({
		queryKey: ["units"],
		queryFn: () => cogsService.getUnits(),
	});

	// Fetch menu item COGS detail
	const {
		data: breakdown,
		isLoading,
		refetch,
	} = useQuery<MenuItemCostBreakdown>({
		queryKey: ["menu-item-cogs", menuItemId, selectedLocationId],
		queryFn: () => cogsService.getMenuItemCOGSDetail(Number(menuItemId)),
		enabled: !!menuItemId && !!selectedLocationId,
	});

	// Fast setup mutation
	const fastSetupMutation = useMutation({
		mutationFn: (data: { ingredients: Array<{ product_id: number; unit_cost: string; unit_code: string }> }) =>
			cogsService.fastSetupMenuItemCosts(Number(menuItemId), data),
		onSuccess: () => {
			toast.success("Costs updated successfully");
			setShowFastSetup(false);
			queryClient.invalidateQueries({ queryKey: ["menu-item-cogs"] });
			queryClient.invalidateQueries({ queryKey: ["menu-items-cogs"] });
		},
		onError: (error: Error) => {
			toast.error(`Failed to update costs: ${error.message}`);
		},
	});

	// Initialize fast setup data when dialog opens
	const handleOpenFastSetup = () => {
		if (!breakdown) return;

		const initialData: Record<number, { unit_cost: string; unit_code: string }> = {};
		breakdown.ingredients.forEach((ing) => {
			initialData[ing.product_id] = {
				unit_cost: ing.unit_cost || "",
				unit_code: ing.unit_code,
			};
		});
		setFastSetupData(initialData);
		setShowFastSetup(true);
	};

	// Handle fast setup submit
	const handleFastSetupSubmit = () => {
		const ingredients = Object.entries(fastSetupData)
			.filter(([_, data]) => data.unit_cost && parseFloat(data.unit_cost) > 0)
			.map(([productId, data]) => ({
				product_id: Number(productId),
				unit_cost: data.unit_cost,
				unit_code: data.unit_code,
			}));

		if (ingredients.length === 0) {
			toast.error("Please enter at least one cost");
			return;
		}

		fastSetupMutation.mutate({ ingredients });
	};

	// Get margin badge color
	// UX Plan: >50% green (good), 20-50% yellow (low margin), <20% red (poor/negative)
	const getMarginBadge = (marginPercent: string | null, size: "sm" | "lg" = "sm") => {
		if (!marginPercent) return null;
		const margin = parseFloat(marginPercent);
		const className = size === "lg" ? "text-lg px-3 py-1" : "";

		if (margin >= 50) {
			return (
				<Badge className={`bg-green-500/15 text-green-600 border-green-500/30 ${className}`}>
					{margin.toFixed(1)}%
				</Badge>
			);
		} else if (margin >= 20) {
			return (
				<Badge className={`bg-yellow-500/15 text-yellow-600 border-yellow-500/30 ${className}`}>
					{margin.toFixed(1)}%
				</Badge>
			);
		} else {
			return (
				<Badge className={`bg-red-500/15 text-red-600 border-red-500/30 ${className}`}>
					{margin.toFixed(1)}%
				</Badge>
			);
		}
	};

	// Get ingredient status icon
	const getIngredientStatusIcon = (ingredient: IngredientCostResult) => {
		if (ingredient.has_cost) {
			return <CheckCircle2 className="h-4 w-4 text-green-500" />;
		}
		return <AlertTriangle className="h-4 w-4 text-orange-500" />;
	};

	// Handle opening ingredient cost drawer
	const handleIngredientClick = (ingredient: IngredientCostResult) => {
		setSelectedIngredient(ingredient);
		setShowIngredientDrawer(true);
	};

	// Handle cost updated from drawer
	const handleCostUpdated = () => {
		refetch();
	};

	if (isLoading) {
		return (
			<DomainPageLayout
				pageTitle="Loading..."
				pageIcon={Calculator}
			>
				<div className="flex items-center justify-center h-64">
					<RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
				</div>
			</DomainPageLayout>
		);
	}

	if (!breakdown) {
		return (
			<DomainPageLayout
				pageTitle="Menu Item Not Found"
				pageIcon={Calculator}
			>
				<div className="text-center py-12">
					<p className="text-muted-foreground">
						Could not load cost data for this menu item.
					</p>
					<Button
						variant="outline"
						className="mt-4"
						onClick={() => navigate(`/${tenantSlug}/cogs`)}
					>
						<ArrowLeft className="h-4 w-4 mr-2" />
						Back to COGS
					</Button>
				</div>
			</DomainPageLayout>
		);
	}

	return (
		<DomainPageLayout
			pageTitle={breakdown.menu_item_name}
			pageDescription="Cost breakdown and profit margin analysis"
			pageIcon={Calculator}
			pageActions={
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => navigate(`/${tenantSlug}/cogs`)}
					>
						<ArrowLeft className="h-4 w-4 mr-2" />
						Back
					</Button>
					{breakdown.has_recipe && (
						<Button size="sm" onClick={handleOpenFastSetup}>
							<DollarSign className="h-4 w-4 mr-2" />
							{breakdown.is_complete ? "Edit Costs" : "Set Up Costs"}
						</Button>
					)}
				</div>
			}
			showSearch={false}
		>
			{/* Summary Cards */}
			<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
				<Card className="border-border/60">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Selling Price</CardTitle>
						<DollarSign className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{formatCurrency(parseFloat(breakdown.price))}
						</div>
					</CardContent>
				</Card>

				<Card className="border-border/60">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Total Cost</CardTitle>
						<Package className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{breakdown.total_cost
								? formatCurrency(parseFloat(breakdown.total_cost))
								: "—"}
						</div>
						{!breakdown.is_complete && (
							<p className="text-xs text-orange-500 mt-1">Incomplete</p>
						)}
					</CardContent>
				</Card>

				<Card className="border-border/60">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Profit Margin</CardTitle>
						<TrendingUp className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{breakdown.margin_amount
								? formatCurrency(parseFloat(breakdown.margin_amount))
								: "—"}
						</div>
						{breakdown.margin_percent && (
							<div className="mt-1">
								{getMarginBadge(breakdown.margin_percent)}
							</div>
						)}
					</CardContent>
				</Card>

				<Card className="border-border/60">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Status</CardTitle>
						{breakdown.is_complete ? (
							<CheckCircle2 className="h-4 w-4 text-green-500" />
						) : (
							<AlertTriangle className="h-4 w-4 text-orange-500" />
						)}
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{breakdown.ingredients.length}
						</div>
						<p className="text-xs text-muted-foreground">
							{breakdown.missing_products.length > 0
								? `${breakdown.missing_products.length} missing costs`
								: "All costs set"}
						</p>
					</CardContent>
				</Card>
			</div>

			{/* Errors and Warnings */}
			{(breakdown.errors.length > 0 || !breakdown.has_recipe) && (
				<Card className="border-orange-500/30 bg-orange-500/5 mb-6">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-orange-600 flex items-center gap-2">
							<AlertTriangle className="h-4 w-4" />
							Attention Required
						</CardTitle>
					</CardHeader>
					<CardContent>
						<ul className="text-sm text-orange-600 space-y-1">
							{!breakdown.has_recipe && (
								<li>This menu item has no recipe. Add a recipe to track COGS.</li>
							)}
							{breakdown.errors.map((error, i) => (
								<li key={i}>{error}</li>
							))}
						</ul>
					</CardContent>
				</Card>
			)}

			{/* Ingredients Table */}
			{breakdown.has_recipe && (
				<Card className="border-border/60">
					<CardHeader>
						<CardTitle className="text-lg">Ingredient Costs</CardTitle>
						<CardDescription>
							Cost breakdown by ingredient based on recipe quantities. Click a row to edit costs.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<StandardTable
							headers={[
								{ label: "Status", className: "w-[60px]" },
								{ label: "Ingredient" },
								{ label: "Quantity", className: "text-right" },
								{ label: "Unit Cost", className: "text-right" },
								{ label: "Extended Cost", className: "text-right" },
							]}
							data={breakdown.ingredients}
							emptyMessage="No ingredients in recipe"
							onRowClick={(ingredient: IngredientCostResult) => handleIngredientClick(ingredient)}
							renderRow={(ingredient: IngredientCostResult) => (
								<>
									<TableCell>{getIngredientStatusIcon(ingredient)}</TableCell>
									<TableCell>
										<div className="flex flex-col">
											<div className="flex items-center gap-2">
												<span className="font-medium">{ingredient.product_name}</span>
												{ingredient.cost_type === "computed" && (
													<Badge
														variant="outline"
														className="border-blue-500/30 text-blue-600 text-[10px] px-1 py-0"
													>
														<Zap className="h-3 w-3 mr-0.5" />
														Recipe
													</Badge>
												)}
											</div>
											{ingredient.error && (
												<span className="text-xs text-orange-500">
													{ingredient.error}
												</span>
											)}
										</div>
									</TableCell>
									<TableCell className="text-right">
										{ingredient.quantity_display} {ingredient.unit_display}
									</TableCell>
									<TableCell className="text-right">
										{ingredient.unit_cost
											? `${formatCurrency(parseFloat(ingredient.unit_cost))}/${ingredient.unit_code}`
											: "—"}
									</TableCell>
									<TableCell className="text-right font-medium">
										{ingredient.extended_cost
											? formatCurrency(parseFloat(ingredient.extended_cost))
											: "—"}
									</TableCell>
								</>
							)}
						/>
					</CardContent>
				</Card>
			)}

			{/* Edit COGS Dialog - Shows ALL ingredients for editing */}
			<Dialog open={showFastSetup} onOpenChange={setShowFastSetup}>
				<DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle className="text-xl">{breakdown?.menu_item_name}</DialogTitle>
						<DialogDescription>
							Edit ingredient costs. Changes take effect immediately.
						</DialogDescription>
					</DialogHeader>

					{/* Live-updating summary header */}
					{breakdown && (
						<div className="flex items-center gap-6 p-4 rounded-lg bg-muted/50 border">
							<div>
								<p className="text-sm text-muted-foreground">Price</p>
								<p className="text-lg font-bold">{formatCurrency(parseFloat(breakdown.price))}</p>
							</div>
							<div>
								<p className="text-sm text-muted-foreground">Est. Cost</p>
								<p className="text-lg font-bold">
									{breakdown.total_cost ? formatCurrency(parseFloat(breakdown.total_cost)) : "—"}
								</p>
							</div>
							<div>
								<p className="text-sm text-muted-foreground">Margin</p>
								<div className="flex items-center gap-2">
									<p className="text-lg font-bold">
										{breakdown.margin_amount ? formatCurrency(parseFloat(breakdown.margin_amount)) : "—"}
									</p>
									{breakdown.margin_percent && getMarginBadge(breakdown.margin_percent)}
								</div>
							</div>
							<div className="ml-auto">
								{breakdown.is_complete ? (
									<Badge className="bg-green-500/15 text-green-600 border-green-500/30">
										<CheckCircle2 className="w-3 h-3 mr-1" />
										Complete
									</Badge>
								) : (
									<Badge className="bg-orange-500/15 text-orange-600 border-orange-500/30">
										<AlertTriangle className="w-3 h-3 mr-1" />
										{breakdown.missing_products.length} missing
									</Badge>
								)}
							</div>
						</div>
					)}

					{/* Ingredients table */}
					<div className="space-y-3 py-4">
						<div className="grid grid-cols-[1fr,80px,80px,100px,100px] gap-2 px-3 text-xs font-medium text-muted-foreground">
							<span>Ingredient</span>
							<span className="text-right">Qty</span>
							<span>Unit</span>
							<span>Unit Cost</span>
							<span className="text-right">Line Cost</span>
						</div>
						{breakdown?.ingredients.map((ingredient) => {
							const hasEditedCost = fastSetupData[ingredient.product_id]?.unit_cost;
							const displayUnitCost = hasEditedCost || ingredient.unit_cost || "";
							const lineCost = displayUnitCost && parseFloat(displayUnitCost) > 0
								? (parseFloat(ingredient.quantity) * parseFloat(displayUnitCost)).toFixed(2)
								: null;

							return (
								<div
									key={ingredient.product_id}
									className={`grid grid-cols-[1fr,80px,80px,100px,100px] gap-2 items-center p-3 rounded-lg border ${
										!ingredient.has_cost && !hasEditedCost ? "border-orange-500/30 bg-orange-500/5" : ""
									}`}
								>
									<div className="flex items-center gap-2">
										{ingredient.has_cost || hasEditedCost ? (
											<CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
										) : (
											<AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0" />
										)}
										<span className="font-medium truncate">{ingredient.product_name}</span>
									</div>
									<span className="text-right tabular-nums">{ingredient.quantity_display}</span>
									<span className="text-muted-foreground">{ingredient.unit_display}</span>
									<div className="flex items-center gap-1">
										<span className="text-muted-foreground">$</span>
										<Input
											type="number"
											step="0.0001"
											min="0"
											placeholder="0.00"
											className="h-8 w-20"
											value={fastSetupData[ingredient.product_id]?.unit_cost ?? ingredient.unit_cost ?? ""}
											onChange={(e) =>
												setFastSetupData((prev) => ({
													...prev,
													[ingredient.product_id]: {
														unit_cost: e.target.value,
														unit_code: prev[ingredient.product_id]?.unit_code || ingredient.unit_code,
													},
												}))
											}
										/>
									</div>
									<span className="text-right font-medium tabular-nums">
										{lineCost ? formatCurrency(parseFloat(lineCost)) : "—"}
									</span>
								</div>
							);
						})}
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setShowFastSetup(false)}>
							Cancel
						</Button>
						<Button
							onClick={handleFastSetupSubmit}
							disabled={fastSetupMutation.isPending}
						>
							{fastSetupMutation.isPending ? (
								<>
									<RefreshCw className="h-4 w-4 mr-2 animate-spin" />
									Saving...
								</>
							) : (
								<>
									<Save className="h-4 w-4 mr-2" />
									Save Costs
								</>
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Ingredient Cost Drawer - for editing individual ingredient costs */}
			<IngredientCostDrawer
				open={showIngredientDrawer}
				onOpenChange={setShowIngredientDrawer}
				ingredient={selectedIngredient}
				productId={selectedIngredient?.product_id || null}
				productName={selectedIngredient?.product_name || null}
				onCostUpdated={handleCostUpdated}
			/>
		</DomainPageLayout>
	);
};

export default COGSDetailPage;
