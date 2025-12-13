import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation as useStoreLocation } from "@/contexts/LocationContext";
import { formatCurrency, useDebounce } from "@ajeen/ui";
import { DomainPageLayout } from "@/components/shared/DomainPageLayout";
import { StandardTable } from "@/components/shared/StandardTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
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
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { TableCell } from "@/components/ui/table";
import {
	Calculator,
	TrendingUp,
	AlertTriangle,
	CheckCircle2,
	Package,
	RefreshCw,
	Save,
	Plus,
	Trash2,
	Layers,
} from "lucide-react";
import { toast } from "sonner";
import cogsService, {
	type MenuItemCOGSSummary,
	type MenuItemCostBreakdown,
	type Unit,
	type FastSetupIngredient,
} from "@/services/api/cogsService";
import { PaginationControls } from "@/components/ui/pagination";

export const COGSPage = () => {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const { tenant } = useAuth();
	const tenantSlug = tenant?.slug || "";
	const { selectedLocationId } = useStoreLocation();
	const queryClient = useQueryClient();

	// Pagination state from URL
	const currentPage = parseInt(searchParams.get("page") || "1", 10);

	// Filter states
	const [searchQuery, setSearchQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState<string>("all"); // all, complete, incomplete, no_recipe
	const debouncedSearchQuery = useDebounce(searchQuery, 300);

	// Edit COGS modal state
	const [editingItemId, setEditingItemId] = useState<number | null>(null);
	const [editingSetupMode, setEditingSetupMode] = useState<"recipe" | "direct">("recipe");
	const [fastSetupData, setFastSetupData] = useState<
		Record<number, { unit_cost: string; unit_code: string }>
	>({});

	// Direct cost entry state (for retail items)
	const [directCostData, setDirectCostData] = useState<{
		unit_cost: string;
		unit_id: number | null;
	}>({ unit_cost: "", unit_id: null });

	// New ingredient form state (for items without recipes or adding new ingredients)
	interface NewIngredient {
		tempId: string;
		name: string;
		quantity: string;
		unit: string;
		unit_cost: string;
	}
	const [newIngredients, setNewIngredients] = useState<NewIngredient[]>([]);

	// Fetch units for the edit modal
	const { data: units = [] } = useQuery<Unit[]>({
		queryKey: ["units"],
		queryFn: () => cogsService.getUnits(),
	});

	// Build API params based on filters
	const apiParams = useMemo(() => {
		const params: {
			page?: number;
			search?: string;
			has_recipe?: boolean;
		} = { page: currentPage };

		if (debouncedSearchQuery) {
			params.search = debouncedSearchQuery;
		}

		// Apply has_recipe filter if set (complete/incomplete implies has_recipe=true)
		if (statusFilter === "no_recipe") {
			params.has_recipe = false;
		} else if (statusFilter === "complete" || statusFilter === "incomplete") {
			params.has_recipe = true;
		}

		return params;
	}, [currentPage, debouncedSearchQuery, statusFilter]);

	// Fetch menu items COGS data
	const {
		data: cogsResponse,
		isLoading,
		refetch,
	} = useQuery({
		queryKey: ["menu-items-cogs", selectedLocationId, apiParams],
		queryFn: () => cogsService.getMenuItemsCOGS(apiParams),
		enabled: !!selectedLocationId,
	});

	// Handle pagination navigation
	const handleNavigate = useCallback((url: string) => {
		try {
			const urlObj = new URL(url);
			const page = urlObj.searchParams.get("page") || "1";
			setSearchParams((prev) => {
				const newParams = new URLSearchParams(prev);
				if (page === "1") {
					newParams.delete("page"); // Clean URL for page 1
				} else {
					newParams.set("page", page);
				}
				return newParams;
			});
		} catch (e) {
			console.error("Failed to parse pagination URL:", e);
		}
	}, [setSearchParams]);

	// Reset to page 1 when search/filter changes
	const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		setSearchQuery(e.target.value);
		// Reset to page 1 when search changes
		setSearchParams((prev) => {
			const newParams = new URLSearchParams(prev);
			newParams.delete("page");
			return newParams;
		});
	}, [setSearchParams]);

	const handleStatusFilterChange = useCallback((value: string) => {
		setStatusFilter(value);
		// Reset to page 1 when filter changes
		setSearchParams((prev) => {
			const newParams = new URLSearchParams(prev);
			newParams.delete("page");
			return newParams;
		});
	}, [setSearchParams]);

	// Fetch detail for the editing item
	const { data: editingItemBreakdown, isLoading: isLoadingBreakdown } = useQuery<MenuItemCostBreakdown>({
		queryKey: ["menu-item-cogs", editingItemId, selectedLocationId],
		queryFn: () => cogsService.getMenuItemCOGSDetail(editingItemId!),
		enabled: !!editingItemId && !!selectedLocationId,
	});

	// Fast setup mutation - uses the correct payload format for the backend
	const fastSetupMutation = useMutation({
		mutationFn: (data: { ingredients: FastSetupIngredient[] }) =>
			cogsService.fastSetupMenuItemCosts(editingItemId!, data),
		onSuccess: () => {
			toast.success("Costs updated successfully");
			handleCloseEditModal();
			queryClient.invalidateQueries({ queryKey: ["menu-item-cogs"] });
			queryClient.invalidateQueries({ queryKey: ["menu-items-cogs"] });
		},
		onError: (error: Error) => {
			toast.error(`Failed to update costs: ${error.message}`);
		},
	});

	// Direct cost mutation - for retail items
	const directCostMutation = useMutation({
		mutationFn: (data: { product: number; unit_cost: string; unit: number }) =>
			cogsService.createCostSource({
				product: data.product,
				store_location: selectedLocationId!,
				unit_cost: data.unit_cost,
				unit: data.unit,
				source_type: "manual",
				effective_at: new Date().toISOString(),
			}),
		onSuccess: () => {
			toast.success("Cost saved successfully");
			handleCloseEditModal();
			queryClient.invalidateQueries({ queryKey: ["menu-items-cogs"] });
		},
		onError: (error: Error) => {
			toast.error(`Failed to save cost: ${error.message}`);
		},
	});

	// Extract results and pagination info from response
	const menuItemsCOGS = cogsResponse?.results ?? [];
	const totalCount = cogsResponse?.count ?? 0;
	const nextUrl = cogsResponse?.next ?? null;
	const prevUrl = cogsResponse?.previous ?? null;

	// Client-side filter for complete/incomplete (search and has_recipe are server-side)
	const filteredItems = useMemo(() => {
		return menuItemsCOGS.filter((item) => {
			// Complete/incomplete filtering (can't be done server-side)
			if (statusFilter === "complete" && !item.is_cost_complete) return false;
			if (statusFilter === "incomplete" && item.is_cost_complete) return false;

			return true;
		});
	}, [menuItemsCOGS, statusFilter]);

	// Calculate summary stats (for current page - server would need aggregate endpoint for global stats)
	const summaryStats = useMemo(() => {
		// Use totalCount from API for accurate total, but page-level stats for the rest
		const pageItems = menuItemsCOGS.length;
		const withRecipe = menuItemsCOGS.filter((i) => i.has_recipe).length;
		const complete = menuItemsCOGS.filter((i) => i.is_cost_complete).length;
		const incomplete = menuItemsCOGS.filter(
			(i) => i.has_recipe && !i.is_cost_complete
		).length;
		const noRecipe = menuItemsCOGS.filter((i) => !i.has_recipe).length;

		// Calculate average margin for complete items on this page
		const completeItems = menuItemsCOGS.filter(
			(i) => i.is_cost_complete && i.margin_percent
		);
		const avgMargin =
			completeItems.length > 0
				? completeItems.reduce(
						(acc, i) => acc + parseFloat(i.margin_percent || "0"),
						0
				  ) / completeItems.length
				: null;

		return {
			totalItems: totalCount, // Use API total, not page count
			pageItems,
			withRecipe,
			complete,
			incomplete,
			noRecipe,
			avgMargin,
			completionRate: pageItems > 0 ? (complete / pageItems) * 100 : 0,
		};
	}, [menuItemsCOGS, totalCount]);

	// Get margin badge color
	// UX Plan: >50% green (good), 20-50% yellow (low margin), <20% red (poor/negative)
	const getMarginBadge = (marginPercent: string | null) => {
		if (!marginPercent) return null;
		const margin = parseFloat(marginPercent);
		if (margin >= 50) {
			return (
				<Badge variant="default" className="bg-green-500/15 text-green-600 border-green-500/30">
					{margin.toFixed(1)}%
				</Badge>
			);
		} else if (margin >= 20) {
			return (
				<Badge variant="default" className="bg-yellow-500/15 text-yellow-600 border-yellow-500/30">
					{margin.toFixed(1)}%
				</Badge>
			);
		} else {
			return (
				<Badge variant="destructive" className="bg-red-500/15 text-red-600 border-red-500/30">
					{margin.toFixed(1)}%
				</Badge>
			);
		}
	};

	// Get status badge - branches based on setup_mode
	const getStatusBadge = (item: MenuItemCOGSSummary) => {
		// For retail items (direct mode), status is simply: has cost or not
		if (item.setup_mode === "direct") {
			if (item.is_cost_complete) {
				return (
					<Badge variant="default" className="bg-green-500/15 text-green-600 border-green-500/30">
						<CheckCircle2 className="w-3 h-3 mr-1" />
						Complete
					</Badge>
				);
			}
			return (
				<Badge variant="default" className="bg-orange-500/15 text-orange-600 border-orange-500/30">
					<AlertTriangle className="w-3 h-3 mr-1" />
					Missing Cost
				</Badge>
			);
		}

		// For recipe-based items
		if (!item.has_recipe) {
			return (
				<Badge variant="outline" className="text-muted-foreground">
					No Recipe
				</Badge>
			);
		}
		if (item.is_cost_complete) {
			return (
				<Badge variant="default" className="bg-green-500/15 text-green-600 border-green-500/30">
					<CheckCircle2 className="w-3 h-3 mr-1" />
					Complete
				</Badge>
			);
		}
		return (
			<Badge variant="default" className="bg-orange-500/15 text-orange-600 border-orange-500/30">
				<AlertTriangle className="w-3 h-3 mr-1" />
				{item.missing_count} Missing
			</Badge>
		);
	};

	const handleRowClick = (item: MenuItemCOGSSummary) => {
		navigate(`/${tenantSlug}/cogs/${item.menu_item_id}`);
	};

	// Open edit modal for an item - works for ALL items (with or without recipe)
	const handleEditCOGS = (item: MenuItemCOGSSummary) => {
		setEditingItemId(item.menu_item_id);
		setEditingSetupMode(item.setup_mode || "recipe");
		setFastSetupData({});
		// Pre-fill direct cost if available
		if (item.setup_mode === "direct" && item.cost) {
			setDirectCostData({ unit_cost: item.cost, unit_id: null });
		} else {
			setDirectCostData({ unit_cost: "", unit_id: null });
		}
	};

	// Handle fast setup submit - builds payload for existing + new ingredients
	const handleFastSetupSubmit = () => {
		const ingredients: FastSetupIngredient[] = [];

		// Add existing ingredients with updated costs
		if (editingItemBreakdown?.ingredients) {
			editingItemBreakdown.ingredients.forEach((ing) => {
				const currentData = fastSetupData[ing.product_id];
				const unitCost = currentData?.unit_cost ?? ing.unit_cost ?? "";
				if (unitCost && parseFloat(unitCost) > 0) {
					ingredients.push({
						ingredient_id: ing.product_id,
						name: ing.product_name,
						quantity: ing.quantity,
						unit: currentData?.unit_code || ing.unit_code,
						unit_cost: unitCost,
					});
				}
			});
		}

		// Add new ingredients
		newIngredients.forEach((ing) => {
			if (ing.name.trim() && ing.quantity && parseFloat(ing.quantity) > 0 && ing.unit) {
				ingredients.push({
					name: ing.name.trim(),
					quantity: ing.quantity,
					unit: ing.unit,
					unit_cost: ing.unit_cost || undefined,
				});
			}
		});

		if (ingredients.length === 0) {
			toast.error("Please enter at least one ingredient with cost");
			return;
		}

		fastSetupMutation.mutate({ ingredients });
	};

	// Add a new empty ingredient row
	const handleAddIngredient = () => {
		setNewIngredients((prev) => [
			...prev,
			{
				tempId: `new-${Date.now()}`,
				name: "",
				quantity: "",
				unit: "g", // Default to grams
				unit_cost: "",
			},
		]);
	};

	// Update a new ingredient field
	const handleNewIngredientChange = (
		tempId: string,
		field: keyof NewIngredient,
		value: string
	) => {
		setNewIngredients((prev) =>
			prev.map((ing) => (ing.tempId === tempId ? { ...ing, [field]: value } : ing))
		);
	};

	// Remove a new ingredient
	const handleRemoveNewIngredient = (tempId: string) => {
		setNewIngredients((prev) => prev.filter((ing) => ing.tempId !== tempId));
	};

	// Close the edit modal
	const handleCloseEditModal = () => {
		setEditingItemId(null);
		setEditingSetupMode("recipe");
		setFastSetupData({});
		setNewIngredients([]);
		setDirectCostData({ unit_cost: "", unit_id: null });
	};

	return (
		<DomainPageLayout
			pageTitle="Cost of Goods Sold"
			pageDescription="Track ingredient costs and profit margins for menu items"
			pageIcon={Calculator}
			pageActions={
				<Button
					variant="outline"
					size="sm"
					onClick={() => refetch()}
					disabled={isLoading}
				>
					<RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
					Refresh
				</Button>
			}
			showSearch={true}
			searchPlaceholder="Search menu items..."
			searchValue={searchQuery}
			onSearchChange={handleSearchChange}
			filterControls={
				<div className="flex gap-4 flex-wrap">
					<Select value={statusFilter} onValueChange={handleStatusFilterChange}>
						<SelectTrigger className="w-[180px]">
							<SelectValue placeholder="Filter by status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Items</SelectItem>
							<SelectItem value="complete">Complete COGS</SelectItem>
							<SelectItem value="incomplete">Incomplete COGS</SelectItem>
							<SelectItem value="no_recipe">No Recipe</SelectItem>
						</SelectContent>
					</Select>
				</div>
			}
		>
			{/* Summary Cards */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
				<Card className="border-border/60">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Total Menu Items</CardTitle>
						<Package className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{summaryStats.totalItems}</div>
						<p className="text-xs text-muted-foreground">
							{summaryStats.withRecipe} with recipes
						</p>
					</CardContent>
				</Card>

				<Card className="border-border/60">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">COGS Completion</CardTitle>
						<CheckCircle2 className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{summaryStats.complete}</div>
						<Progress
							value={summaryStats.completionRate}
							className="mt-2 h-2"
						/>
						<p className="text-xs text-muted-foreground mt-1">
							{summaryStats.completionRate.toFixed(0)}% complete
						</p>
					</CardContent>
				</Card>

				<Card className="border-border/60">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Needs Attention</CardTitle>
						<AlertTriangle className="h-4 w-4 text-orange-500" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold text-orange-500">
							{summaryStats.incomplete}
						</div>
						<p className="text-xs text-muted-foreground">
							Items missing cost data
						</p>
					</CardContent>
				</Card>

				<Card className="border-border/60">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Avg. Margin</CardTitle>
						<TrendingUp className="h-4 w-4 text-green-500" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{summaryStats.avgMargin !== null
								? `${summaryStats.avgMargin.toFixed(1)}%`
								: "—"}
						</div>
						<p className="text-xs text-muted-foreground">
							Across {summaryStats.complete} items
						</p>
					</CardContent>
				</Card>
			</div>

			{/* Empty State - No COGS Setup */}
			{!isLoading && menuItemsCOGS.length === 0 && (
				<Card className="border-dashed border-2 border-muted-foreground/25">
					<CardContent className="flex flex-col items-center justify-center py-16">
						<Calculator className="h-12 w-12 text-muted-foreground/50 mb-4" />
						<h3 className="text-xl font-semibold mb-2">Know your margins.</h3>
						<p className="text-muted-foreground text-center max-w-md mb-6">
							Set up ingredients and costs to see how much each item really makes.
							Add recipes to your products to start tracking COGS.
						</p>
						<Button onClick={() => navigate(`/${tenantSlug}/products`)}>
							<Package className="h-4 w-4 mr-2" />
							Go to Products
						</Button>
					</CardContent>
				</Card>
			)}

			{/* Menu Items Table */}
			{(isLoading || menuItemsCOGS.length > 0) && (
			<StandardTable
				headers={[
					{ label: "Item", className: "w-[280px]" },
					{ label: "Type", className: "w-[80px]" },
					{ label: "Price", className: "text-right" },
					{ label: "Cost", className: "text-right" },
					{ label: "Margin", className: "text-right" },
					{ label: "Status" },
					{ label: "Action", className: "w-[100px]" },
				]}
				data={filteredItems}
				loading={isLoading}
				emptyMessage="No menu items match your filters."
				onRowClick={handleRowClick}
				renderRow={(item: MenuItemCOGSSummary) => (
					<>
						<TableCell className="font-medium">
							<div className="flex flex-col">
								<span>{item.name}</span>
								{item.setup_mode === "recipe" && item.has_recipe && (
									<span className="text-xs text-muted-foreground">
										{item.ingredient_count} ingredients
									</span>
								)}
							</div>
						</TableCell>
						<TableCell>
							<Badge variant="outline" className="text-xs">
								{item.setup_mode === "direct" ? "Retail" : "Menu"}
							</Badge>
						</TableCell>
						<TableCell className="text-right font-medium">
							{formatCurrency(parseFloat(item.price))}
						</TableCell>
						<TableCell className="text-right">
							{item.cost ? (
								formatCurrency(parseFloat(item.cost))
							) : (
								<span className="text-muted-foreground">—</span>
							)}
						</TableCell>
						<TableCell className="text-right">
							{item.margin_percent ? getMarginBadge(item.margin_percent) : <span className="text-muted-foreground">—</span>}
						</TableCell>
						<TableCell>{getStatusBadge(item)}</TableCell>
						<TableCell onClick={(e) => e.stopPropagation()}>
							<Button
								variant={item.is_cost_complete ? "outline" : "default"}
								size="sm"
								onClick={() => handleEditCOGS(item)}
							>
								{item.is_cost_complete ? "Edit" : "Set Up"}
							</Button>
						</TableCell>
					</>
				)}
			/>
			)}

			{/* Pagination Controls */}
			<PaginationControls
				prevUrl={prevUrl}
				nextUrl={nextUrl}
				onNavigate={handleNavigate}
				count={totalCount}
				currentPage={currentPage}
				pageSize={25}
			/>

			{/* Edit COGS Modal - branches based on setup_mode */}
			<Dialog open={!!editingItemId} onOpenChange={(open) => !open && handleCloseEditModal()}>
				<DialogContent className={editingSetupMode === "direct" ? "max-w-md" : "max-w-3xl max-h-[85vh] overflow-y-auto"}>
					<DialogHeader>
						<DialogTitle className="text-xl">
							{editingItemBreakdown?.menu_item_name || "Loading..."}
						</DialogTitle>
						<DialogDescription>
							{editingSetupMode === "direct"
								? "Enter the purchase cost for this retail item."
								: editingItemBreakdown?.has_recipe
								? "Edit ingredient costs. Changes take effect immediately."
								: "Add ingredients and costs to calculate margins for this menu item."}
						</DialogDescription>
					</DialogHeader>

					{/* DIRECT COST MODE - Simple cost entry for retail items */}
					{editingSetupMode === "direct" && (
						<>
							{/* Price and margin summary */}
							<div className="flex items-center gap-6 p-4 rounded-lg bg-muted/50 border">
								<div>
									<p className="text-sm text-muted-foreground">Sell Price</p>
									<p className="text-lg font-bold">
										{editingItemBreakdown?.price ? formatCurrency(parseFloat(editingItemBreakdown.price)) : "—"}
									</p>
								</div>
								{directCostData.unit_cost && parseFloat(directCostData.unit_cost) > 0 && editingItemBreakdown?.price && (
									<>
										<div>
											<p className="text-sm text-muted-foreground">Margin</p>
											<p className="text-lg font-bold">
												{formatCurrency(parseFloat(editingItemBreakdown.price) - parseFloat(directCostData.unit_cost))}
											</p>
										</div>
										<div>
											<p className="text-sm text-muted-foreground">Margin %</p>
											{getMarginBadge(
												(((parseFloat(editingItemBreakdown.price) - parseFloat(directCostData.unit_cost)) / parseFloat(editingItemBreakdown.price)) * 100).toFixed(2)
											)}
										</div>
									</>
								)}
							</div>

							{/* Cost input */}
							<div className="space-y-4 py-4">
								<div className="space-y-2">
									<label className="text-sm font-medium">Purchase Cost (per unit)</label>
									<div className="flex items-center gap-2">
										<span className="text-muted-foreground">$</span>
										<Input
											type="number"
											step="0.01"
											min="0"
											placeholder="0.00"
											className="max-w-[150px]"
											value={directCostData.unit_cost}
											onChange={(e) => setDirectCostData((prev) => ({ ...prev, unit_cost: e.target.value }))}
										/>
										<Select
											value={directCostData.unit_id?.toString() || ""}
											onValueChange={(value) => setDirectCostData((prev) => ({ ...prev, unit_id: parseInt(value) }))}
										>
											<SelectTrigger className="w-[120px]">
												<SelectValue placeholder="Unit" />
											</SelectTrigger>
											<SelectContent>
												{units.filter(u => u.category === "count").map((unit) => (
													<SelectItem key={unit.id} value={unit.id.toString()}>
														{unit.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<p className="text-xs text-muted-foreground">
										Enter the cost you pay to purchase this item from your supplier.
									</p>
								</div>
							</div>

							<DialogFooter>
								<Button variant="outline" onClick={handleCloseEditModal}>
									Cancel
								</Button>
								<Button
									onClick={() => {
										if (!editingItemId || !directCostData.unit_cost || !directCostData.unit_id) {
											toast.error("Please enter a cost and select a unit");
											return;
										}
										directCostMutation.mutate({
											product: editingItemId,
											unit_cost: directCostData.unit_cost,
											unit: directCostData.unit_id,
										});
									}}
									disabled={directCostMutation.isPending || !directCostData.unit_cost || !directCostData.unit_id}
								>
									{directCostMutation.isPending ? (
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
							</DialogFooter>
						</>
					)}

					{/* RECIPE MODE - Ingredient-based costing for menu items */}
					{editingSetupMode === "recipe" && (
						<>
							{isLoadingBreakdown ? (
								<div className="flex items-center justify-center py-12">
									<RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
								</div>
							) : editingItemBreakdown ? (
								<>
									{/* Live-updating summary header */}
									<div className="flex items-center gap-6 p-4 rounded-lg bg-muted/50 border">
										<div>
											<p className="text-sm text-muted-foreground">Price</p>
											<p className="text-lg font-bold">{formatCurrency(parseFloat(editingItemBreakdown.price))}</p>
										</div>
										<div>
											<p className="text-sm text-muted-foreground">Est. Cost</p>
											<p className="text-lg font-bold">
												{editingItemBreakdown.total_cost ? formatCurrency(parseFloat(editingItemBreakdown.total_cost)) : "—"}
											</p>
										</div>
										<div>
											<p className="text-sm text-muted-foreground">Margin</p>
											<div className="flex items-center gap-2">
												<p className="text-lg font-bold">
													{editingItemBreakdown.margin_amount ? formatCurrency(parseFloat(editingItemBreakdown.margin_amount)) : "—"}
												</p>
												{editingItemBreakdown.margin_percent && getMarginBadge(editingItemBreakdown.margin_percent)}
											</div>
										</div>
										<div className="ml-auto">
											{editingItemBreakdown.is_complete ? (
												<Badge className="bg-green-500/15 text-green-600 border-green-500/30">
													<CheckCircle2 className="w-3 h-3 mr-1" />
													Complete
												</Badge>
											) : editingItemBreakdown.has_recipe ? (
												<Badge className="bg-orange-500/15 text-orange-600 border-orange-500/30">
													<AlertTriangle className="w-3 h-3 mr-1" />
													{editingItemBreakdown.missing_products.length} missing
												</Badge>
											) : (
												<Badge variant="outline" className="text-muted-foreground">
													<Layers className="w-3 h-3 mr-1" />
													No recipe
												</Badge>
											)}
										</div>
									</div>

									{/* Empty state for items without recipe */}
									{!editingItemBreakdown.has_recipe && newIngredients.length === 0 && (
										<div className="flex flex-col items-center justify-center py-8 px-4 border-2 border-dashed rounded-lg">
											<Layers className="h-10 w-10 text-muted-foreground/50 mb-3" />
											<h4 className="text-lg font-medium mb-1">No ingredients yet</h4>
											<p className="text-sm text-muted-foreground text-center mb-4 max-w-sm">
												Add ingredients to track the cost of this menu item and see your margins.
											</p>
											<Button onClick={handleAddIngredient} size="sm">
												<Plus className="h-4 w-4 mr-2" />
												Add Ingredient
											</Button>
										</div>
									)}

									{/* Ingredients table - only show if has ingredients or new ingredients */}
									{(editingItemBreakdown.ingredients.length > 0 || newIngredients.length > 0) && (
										<div className="space-y-3 py-4">
											<div className="grid grid-cols-[1fr,80px,100px,100px,100px,40px] gap-2 px-3 text-xs font-medium text-muted-foreground">
												<span>Ingredient</span>
												<span className="text-right">Qty</span>
												<span>Unit</span>
												<span>Unit Cost</span>
												<span className="text-right">Line Cost</span>
												<span></span>
											</div>

											{/* Existing ingredients */}
											{editingItemBreakdown.ingredients.map((ingredient) => {
												const currentData = fastSetupData[ingredient.product_id];
												const displayUnitCost = currentData?.unit_cost ?? ingredient.unit_cost ?? "";
												const lineCost = displayUnitCost && parseFloat(displayUnitCost) > 0
													? (parseFloat(ingredient.quantity) * parseFloat(displayUnitCost)).toFixed(2)
													: null;
												const hasCost = ingredient.has_cost || (currentData?.unit_cost && parseFloat(currentData.unit_cost) > 0);

												return (
													<div
														key={ingredient.product_id}
														className={`grid grid-cols-[1fr,80px,100px,100px,100px,40px] gap-2 items-center p-3 rounded-lg border ${
															!hasCost ? "border-orange-500/30 bg-orange-500/5" : ""
														}`}
													>
														<div className="flex items-center gap-2">
															{hasCost ? (
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
																value={currentData?.unit_cost ?? ingredient.unit_cost ?? ""}
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
														<div></div>
													</div>
												);
											})}

											{/* New ingredients being added */}
											{newIngredients.map((ingredient) => {
												const lineCost = ingredient.unit_cost && ingredient.quantity &&
													parseFloat(ingredient.unit_cost) > 0 && parseFloat(ingredient.quantity) > 0
													? (parseFloat(ingredient.quantity) * parseFloat(ingredient.unit_cost)).toFixed(2)
													: null;

												return (
													<div
														key={ingredient.tempId}
														className="grid grid-cols-[1fr,80px,100px,100px,100px,40px] gap-2 items-center p-3 rounded-lg border border-primary/30 bg-primary/5"
													>
														<div>
															<Input
																type="text"
																placeholder="Ingredient name"
																className="h-8"
																value={ingredient.name}
																onChange={(e) =>
																	handleNewIngredientChange(ingredient.tempId, "name", e.target.value)
																}
															/>
														</div>
														<div>
															<Input
																type="number"
																step="0.01"
																min="0"
																placeholder="0"
																className="h-8 text-right"
																value={ingredient.quantity}
																onChange={(e) =>
																	handleNewIngredientChange(ingredient.tempId, "quantity", e.target.value)
																}
															/>
														</div>
														<div>
															<Select
																value={ingredient.unit}
																onValueChange={(value) =>
																	handleNewIngredientChange(ingredient.tempId, "unit", value)
																}
															>
																<SelectTrigger className="h-8">
																	<SelectValue placeholder="Unit" />
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
														<div className="flex items-center gap-1">
															<span className="text-muted-foreground">$</span>
															<Input
																type="number"
																step="0.0001"
																min="0"
																placeholder="0.00"
																className="h-8 w-20"
																value={ingredient.unit_cost}
																onChange={(e) =>
																	handleNewIngredientChange(ingredient.tempId, "unit_cost", e.target.value)
																}
															/>
														</div>
														<span className="text-right font-medium tabular-nums">
															{lineCost ? formatCurrency(parseFloat(lineCost)) : "—"}
														</span>
														<Button
															variant="ghost"
															size="icon"
															className="h-8 w-8 text-destructive hover:text-destructive"
															onClick={() => handleRemoveNewIngredient(ingredient.tempId)}
														>
															<Trash2 className="h-4 w-4" />
														</Button>
													</div>
												);
											})}

											{/* Add ingredient button */}
											<Button
												variant="outline"
												size="sm"
												className="w-full mt-2"
												onClick={handleAddIngredient}
											>
												<Plus className="h-4 w-4 mr-2" />
												Add Ingredient
											</Button>
										</div>
									)}
								</>
							) : null}

							<DialogFooter>
								<Button variant="outline" onClick={handleCloseEditModal}>
									Cancel
								</Button>
								<Button
									onClick={handleFastSetupSubmit}
									disabled={
										fastSetupMutation.isPending ||
										isLoadingBreakdown ||
										(editingItemBreakdown &&
											editingItemBreakdown.ingredients.length === 0 &&
											newIngredients.length === 0)
									}
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
						</>
					)}
				</DialogContent>
			</Dialog>
		</DomainPageLayout>
	);
};

export default COGSPage;
