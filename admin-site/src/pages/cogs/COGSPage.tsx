import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation as useStoreLocation } from "@/contexts/LocationContext";
import { formatCurrency, useDebounce } from "@ajeen/ui";
import { DomainPageLayout } from "@/components/shared/DomainPageLayout";
import { StandardTable } from "@/components/shared/StandardTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { TableCell } from "@/components/ui/table";
import {
	Calculator,
	DollarSign,
	TrendingUp,
	AlertTriangle,
	CheckCircle2,
	XCircle,
	ChevronRight,
	Package,
	RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import cogsService, { type MenuItemCOGSSummary } from "@/services/api/cogsService";
// @ts-expect-error - No types for JS file
import categoryService from "@/services/api/categoryService";

interface Category {
	id: number;
	name: string;
	parent: { id: number } | null;
	children: Category[];
}

export const COGSPage = () => {
	const navigate = useNavigate();
	const { tenant } = useAuth();
	const tenantSlug = tenant?.slug || "";
	const { selectedLocationId } = useStoreLocation();

	// Filter states
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedCategory, setSelectedCategory] = useState<string>("all");
	const [statusFilter, setStatusFilter] = useState<string>("all"); // all, complete, incomplete, no_recipe
	const debouncedSearchQuery = useDebounce(searchQuery, 300);

	// Fetch categories for filter
	const { data: categories = [] } = useQuery<Category[]>({
		queryKey: ["categories"],
		queryFn: async () => {
			const response = await categoryService.getCategories();
			return response.data;
		},
	});

	// Fetch menu items COGS data
	const {
		data: cogsResponse,
		isLoading,
		refetch,
	} = useQuery({
		queryKey: ["menu-items-cogs", selectedLocationId],
		queryFn: () => cogsService.getMenuItemsCOGS(),
		enabled: !!selectedLocationId,
	});

	// Extract results from paginated response
	const menuItemsCOGS = cogsResponse?.results ?? [];

	// Filter and search menu items
	const filteredItems = useMemo(() => {
		return menuItemsCOGS.filter((item) => {
			// Search filter
			if (
				debouncedSearchQuery &&
				!item.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
			) {
				return false;
			}

			// Status filter
			if (statusFilter === "complete" && !item.is_cost_complete) return false;
			if (statusFilter === "incomplete" && item.is_cost_complete) return false;
			if (statusFilter === "no_recipe" && item.has_recipe) return false;

			return true;
		});
	}, [menuItemsCOGS, debouncedSearchQuery, statusFilter]);

	// Calculate summary stats
	const summaryStats = useMemo(() => {
		const totalItems = menuItemsCOGS.length;
		const withRecipe = menuItemsCOGS.filter((i) => i.has_recipe).length;
		const complete = menuItemsCOGS.filter((i) => i.is_cost_complete).length;
		const incomplete = menuItemsCOGS.filter(
			(i) => i.has_recipe && !i.is_cost_complete
		).length;
		const noRecipe = menuItemsCOGS.filter((i) => !i.has_recipe).length;

		// Calculate average margin for complete items
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
			totalItems,
			withRecipe,
			complete,
			incomplete,
			noRecipe,
			avgMargin,
			completionRate: totalItems > 0 ? (complete / totalItems) * 100 : 0,
		};
	}, [menuItemsCOGS]);

	// Get margin badge color
	const getMarginBadge = (marginPercent: string | null) => {
		if (!marginPercent) return null;
		const margin = parseFloat(marginPercent);
		if (margin >= 70) {
			return (
				<Badge variant="default" className="bg-green-500/15 text-green-600 border-green-500/30">
					{margin.toFixed(1)}%
				</Badge>
			);
		} else if (margin >= 50) {
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

	// Get status badge
	const getStatusBadge = (item: MenuItemCOGSSummary) => {
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
			onSearchChange={(e) => setSearchQuery(e.target.value)}
			filterControls={
				<div className="flex gap-4 flex-wrap">
					<Select value={statusFilter} onValueChange={setStatusFilter}>
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

			{/* Menu Items Table */}
			<StandardTable
				headers={[
					{ label: "Menu Item", className: "w-[300px]" },
					{ label: "Price", className: "text-right" },
					{ label: "Cost", className: "text-right" },
					{ label: "Margin", className: "text-right" },
					{ label: "Status" },
					{ label: "", className: "w-[50px]" },
				]}
				data={filteredItems}
				loading={isLoading}
				emptyMessage="No menu items found. Add recipes to your products to track COGS."
				onRowClick={handleRowClick}
				renderRow={(item: MenuItemCOGSSummary) => (
					<>
						<TableCell className="font-medium">
							<div className="flex flex-col">
								<span>{item.name}</span>
								{item.has_recipe && (
									<span className="text-xs text-muted-foreground">
										{item.ingredient_count} ingredients
									</span>
								)}
							</div>
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
							{getMarginBadge(item.margin_percent)}
						</TableCell>
						<TableCell>{getStatusBadge(item)}</TableCell>
						<TableCell>
							<ChevronRight className="h-4 w-4 text-muted-foreground" />
						</TableCell>
					</>
				)}
			/>
		</DomainPageLayout>
	);
};

export default COGSPage;
