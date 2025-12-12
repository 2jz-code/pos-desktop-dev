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
import { TableCell } from "@/components/ui/table";
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
} from "lucide-react";
import { toast } from "sonner";
import cogsService, {
	type MenuItemCostBreakdown,
	type IngredientCostResult,
	type Unit,
} from "@/services/api/cogsService";

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
	const getMarginBadge = (marginPercent: string | null, size: "sm" | "lg" = "sm") => {
		if (!marginPercent) return null;
		const margin = parseFloat(marginPercent);
		const className = size === "lg" ? "text-lg px-3 py-1" : "";

		if (margin >= 70) {
			return (
				<Badge className={`bg-green-500/15 text-green-600 border-green-500/30 ${className}`}>
					{margin.toFixed(1)}%
				</Badge>
			);
		} else if (margin >= 50) {
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
					{breakdown.has_recipe && !breakdown.is_complete && (
						<Button size="sm" onClick={handleOpenFastSetup}>
							<DollarSign className="h-4 w-4 mr-2" />
							Quick Setup Costs
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
							Cost breakdown by ingredient based on recipe quantities
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
							renderRow={(ingredient: IngredientCostResult) => (
								<>
									<TableCell>{getIngredientStatusIcon(ingredient)}</TableCell>
									<TableCell>
										<div className="flex flex-col">
											<span className="font-medium">{ingredient.product_name}</span>
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

			{/* Fast Setup Dialog */}
			<Dialog open={showFastSetup} onOpenChange={setShowFastSetup}>
				<DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Quick Cost Setup</DialogTitle>
						<DialogDescription>
							Enter costs for ingredients missing pricing data. Costs will be
							effective immediately.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-4">
						{breakdown?.ingredients
							.filter((ing) => !ing.has_cost)
							.map((ingredient) => (
								<div
									key={ingredient.product_id}
									className="flex items-center gap-4 p-3 rounded-lg border"
								>
									<div className="flex-1">
										<p className="font-medium">{ingredient.product_name}</p>
										<p className="text-sm text-muted-foreground">
											Recipe uses: {ingredient.quantity_display}{" "}
											{ingredient.unit_display}
										</p>
									</div>
									<div className="flex items-center gap-2">
										<div className="w-24">
											<Label className="sr-only">Cost</Label>
											<Input
												type="number"
												step="0.01"
												min="0"
												placeholder="0.00"
												value={
													fastSetupData[ingredient.product_id]?.unit_cost || ""
												}
												onChange={(e) =>
													setFastSetupData((prev) => ({
														...prev,
														[ingredient.product_id]: {
															...prev[ingredient.product_id],
															unit_cost: e.target.value,
														},
													}))
												}
											/>
										</div>
										<span className="text-muted-foreground">per</span>
										<Select
											value={
												fastSetupData[ingredient.product_id]?.unit_code ||
												ingredient.unit_code
											}
											onValueChange={(value) =>
												setFastSetupData((prev) => ({
													...prev,
													[ingredient.product_id]: {
														...prev[ingredient.product_id],
														unit_code: value,
													},
												}))
											}
										>
											<SelectTrigger className="w-24">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{units.map((unit) => (
													<SelectItem key={unit.code} value={unit.code}>
														{unit.code}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</div>
							))}

						{breakdown?.ingredients.filter((ing) => !ing.has_cost).length ===
							0 && (
							<p className="text-center text-muted-foreground py-4">
								All ingredients have costs set!
							</p>
						)}
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
		</DomainPageLayout>
	);
};

export default COGSDetailPage;
