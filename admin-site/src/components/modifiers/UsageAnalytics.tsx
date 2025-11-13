import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	BarChart3,
	TrendingUp,
	Users,
	ShoppingBag,
	Eye,
	AlertTriangle,
	CheckCircle,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import * as modifierService from "@/services/api/modifierService";

interface ModifierOption {
	id: string | number;
	name: string;
	price_delta: number;
}

interface ModifierSet {
	id: string | number;
	name: string;
	internal_name: string;
	selection_type: "SINGLE" | "MULTIPLE";
	min_selections: number;
	options?: ModifierOption[];
	product_count?: number;
}

interface AnalyticsItem extends ModifierSet {
	usage: any;
	products: any[];
	product_count: number;
	usage_level: string;
	is_used: boolean;
}

interface UsageLevel {
	level: string;
	color: string;
	icon: typeof AlertTriangle;
}

interface UsageAnalyticsProps {
	modifierSets: ModifierSet[];
}

const UsageAnalytics: React.FC<UsageAnalyticsProps> = ({ modifierSets }) => {
	const [analytics, setAnalytics] = useState<AnalyticsItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [searchTerm, setSearchTerm] = useState("");
	const { toast } = useToast();
	const navigate = useNavigate();
	const { tenant } = useAuth();
	const tenantSlug = tenant?.slug || "";

	useEffect(() => {
		if (modifierSets.length > 0) {
			fetchAnalytics();
		}
	}, [modifierSets]);

	const fetchAnalytics = async () => {
		try {
			setLoading(true);
			const analyticsPromises = modifierSets.map(async (modifierSet) => {
				try {
					// Get usage data for each modifier set
					const usageResponse = await modifierService.getModifierSetUsage(
						modifierSet.id
					);
					const productsResponse =
						await modifierService.getProductsUsingModifierSet(modifierSet.id);

					return {
						...modifierSet,
						usage: usageResponse.data || {},
						products: productsResponse.data || [],
						product_count:
							usageResponse.data?.product_count ||
							productsResponse.data?.length ||
							modifierSet.product_count ||
							0,
						usage_level: usageResponse.data?.usage_level || "unused",
						is_used: usageResponse.data?.is_used || false,
					};
				} catch (error) {
					// If analytics endpoints don't exist or fail, use fallback data
					console.warn(
						`Analytics not available for modifier set ${modifierSet.id}:`,
						error
					);
					return {
						...modifierSet,
						usage: {},
						products: [],
						product_count: modifierSet.product_count || 0,
						usage_level:
							(modifierSet.product_count || 0) === 0 ? "unused" : "medium",
						is_used: (modifierSet.product_count || 0) > 0,
					};
				}
			});

			const results = await Promise.all(analyticsPromises);
			setAnalytics(results);
		} catch (error) {
			console.error("Error fetching analytics:", error);
			// Fallback to basic data from modifierSets
			setAnalytics(
				modifierSets.map((set) => ({
					...set,
					usage: {},
					products: [],
					product_count: set.product_count || 0,
					usage_level: (set.product_count || 0) === 0 ? "unused" : "medium",
					is_used: (set.product_count || 0) > 0,
				}))
			);
		} finally {
			setLoading(false);
		}
	};

	const filteredAnalytics = analytics.filter(
		(item) =>
			!searchTerm || item.name.toLowerCase().includes(searchTerm.toLowerCase())
	);

	const getUsageLevel = (productCount: number): UsageLevel => {
		if (productCount === 0)
			return {
				level: "unused",
				color: "text-destructive",
				icon: AlertTriangle,
			};
		if (productCount <= 3)
			return { level: "low", color: "text-warning", icon: TrendingUp };
		if (productCount <= 10)
			return { level: "medium", color: "text-primary", icon: BarChart3 };
		return { level: "high", color: "text-emerald-600", icon: CheckCircle };
	};

	const getUsageBadge = (productCount: number) => {
		const { level, color } = getUsageLevel(productCount);
		return (
			<Badge
				variant="outline"
				className={`${color} border-current`}
			>
				{level === "unused"
					? "Unused"
					: level === "low"
					? "Low Usage"
					: level === "medium"
					? "Medium Usage"
					: "High Usage"}
			</Badge>
		);
	};

	const totalModifierSets = analytics.length;
	const unusedSets = analytics.filter(
		(item) => item.product_count === 0
	).length;
	const averageProductsPerSet =
		totalModifierSets > 0
			? (
					analytics.reduce((sum, item) => sum + item.product_count, 0) /
					totalModifierSets
			  ).toFixed(1)
			: "0";

	return (
		<div className="space-y-6">
			{/* Summary Cards */}
			<div className="grid gap-4 md:grid-cols-4">
				<Card className="border-border bg-card">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Total Modifier Sets
						</CardTitle>
						<div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
							<BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-foreground">
							{totalModifierSets}
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							Across all products
						</p>
					</CardContent>
				</Card>

				<Card className="border-border bg-card">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Unused Sets
						</CardTitle>
						<div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
							<AlertTriangle className="h-4 w-4 text-destructive" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-destructive">
							{unusedSets}
						</div>
						{totalModifierSets > 0 && (
							<p className="text-xs text-muted-foreground mt-1">
								{((unusedSets / totalModifierSets) * 100).toFixed(1)}% of total
							</p>
						)}
					</CardContent>
				</Card>

				<Card className="border-border bg-card">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Avg Products/Set
						</CardTitle>
						<div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
							<ShoppingBag className="h-4 w-4 text-purple-600 dark:text-purple-400" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-foreground">
							{averageProductsPerSet}
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							Products per set
						</p>
					</CardContent>
				</Card>

				<Card className="border-border bg-card">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Active Sets
						</CardTitle>
						<div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
							<CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
							{totalModifierSets - unusedSets}
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							Currently in use
						</p>
					</CardContent>
				</Card>
			</div>

			{/* Unused Modifier Sets Alert */}
			{unusedSets > 0 && (
				<Card className="border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20">
					<CardHeader className="pb-3">
						<div className="flex items-start gap-3">
							<div className="p-2 bg-orange-100 dark:bg-orange-900/40 rounded-lg flex-shrink-0">
								<AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
							</div>
							<div className="flex-1">
								<CardTitle className="text-base font-semibold text-orange-900 dark:text-orange-100">
									Unused Modifier Sets
								</CardTitle>
								<CardDescription className="text-orange-700 dark:text-orange-300 text-sm mt-1">
									{unusedSets} modifier set{unusedSets !== 1 ? "s" : ""} not
									being used by any products
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent className="pt-0">
						<div className="flex flex-wrap gap-1.5">
							{analytics
								.filter((item) => item.product_count === 0)
								.slice(0, 3)
								.map((item) => (
									<Badge
										key={item.id}
										variant="outline"
										className="text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700 text-xs font-normal"
									>
										{item.name}
									</Badge>
								))}
							{unusedSets > 3 && (
								<Badge
									variant="outline"
									className="text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700 text-xs"
								>
									+{unusedSets - 3} more
								</Badge>
							)}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Search and Analytics Table */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="flex items-center gap-2">
								<BarChart3 className="h-5 w-5" />
								Modifier Set Usage Analytics
							</CardTitle>
							<CardDescription>
								Detailed usage statistics for each modifier set
							</CardDescription>
						</div>
						<div className="w-64">
							<Input
								placeholder="Search modifier sets..."
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
							/>
						</div>
					</div>
				</CardHeader>
				<CardContent className="p-0">
					{loading ? (
						<div className="text-center py-8">
							<div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
							<p className="text-sm text-gray-500">Loading analytics...</p>
						</div>
					) : (
						<div className="max-h-[600px] overflow-auto">
							<Table>
								<TableHeader className="sticky top-0 bg-white z-10 border-b">
									<TableRow>
										<TableHead>Modifier Set</TableHead>
										<TableHead>Type</TableHead>
										<TableHead>Options</TableHead>
										<TableHead>Products Using</TableHead>
										<TableHead>Usage Level</TableHead>
										<TableHead>Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{filteredAnalytics.length === 0 ? (
										<TableRow>
											<TableCell
												colSpan={6}
												className="text-center py-12 text-muted-foreground"
											>
												{searchTerm
													? "No modifier sets match your search"
													: "No modifier sets available"}
											</TableCell>
										</TableRow>
									) : (
										filteredAnalytics.map((item) => {
											const { color, icon: Icon } = getUsageLevel(
												item.product_count
											);
											const statusDotColor =
												item.product_count > 0
													? "bg-emerald-500"
													: "bg-gray-400";

											return (
												<TableRow
													key={item.id}
													className="hover:bg-muted/50"
												>
													<TableCell className="py-3">
														<div className="flex items-center gap-2">
															<div
																className={`h-2 w-2 rounded-full ${statusDotColor} flex-shrink-0`}
															/>
															<div className="min-w-0">
																<div className="font-semibold text-foreground">
																	{item.name}
																</div>
																<div className="text-xs text-muted-foreground font-mono truncate">
																	{item.internal_name}
																</div>
															</div>
														</div>
													</TableCell>
													<TableCell className="py-3">
														<Badge
															variant="outline"
															className="font-normal"
														>
															<span className="mr-1.5">
																{item.selection_type === "SINGLE" ? "○" : "☑"}
															</span>
															{item.selection_type === "SINGLE"
																? "Single"
																: "Multiple"}
															{item.min_selections > 0 && " • Required"}
														</Badge>
													</TableCell>
													<TableCell className="py-3">
														<div className="flex items-center gap-2">
															<span className="font-semibold text-foreground">
																{item.options?.length || 0}
															</span>
															{item.options && item.options.length > 0 && (
																<div className="flex gap-1 ml-1">
																	{item.options
																		.slice(0, 2)
																		.map((option, idx) => (
																			<Badge
																				key={idx}
																				variant="secondary"
																				className="text-xs font-normal"
																			>
																				{option.name}
																			</Badge>
																		))}
																	{item.options.length > 2 && (
																		<Badge
																			variant="outline"
																			className="text-xs"
																		>
																			+{item.options.length - 2}
																		</Badge>
																	)}
																</div>
															)}
														</div>
													</TableCell>
													<TableCell className="py-3">
														<div className="flex items-center gap-2">
															<Icon
																className={`h-4 w-4 ${color} flex-shrink-0`}
															/>
															<span className="font-semibold text-foreground text-lg">
																{item.product_count}
															</span>
															<span className="text-xs text-muted-foreground">
																product{item.product_count !== 1 ? "s" : ""}
															</span>
														</div>
													</TableCell>
													<TableCell className="py-3">
														{getUsageBadge(item.product_count)}
													</TableCell>
													<TableCell className="py-3">
														<Button
															variant="outline"
															size="sm"
															onClick={() => {
																if (item.products && item.products.length > 0) {
																	// Navigate to products page with modifier filter
																	navigate(
																		`/${tenantSlug}/products?modifier=${
																			item.id
																		}&modifierName=${encodeURIComponent(
																			item.name
																		)}&from=modifiers`
																	);
																} else {
																	toast({
																		title: "No Products Found",
																		description: `No products are currently using "${item.name}".`,
																		variant: "destructive",
																	});
																}
															}}
														>
															<Eye className="h-3.5 w-3.5 mr-1.5" />
															View
														</Button>
													</TableCell>
												</TableRow>
											);
										})
									)}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
};

export default UsageAnalytics;
