import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
	archiveProduct,
	unarchiveProduct,
} from "@/domains/products/services/productService";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
	PlusCircle,
	Archive,
	ArchiveRestore,
	MoreHorizontal,
	Edit,
	Settings,
	Tags,
	FolderOpen,
	Package,
	Search,
	X,
	LayoutGrid,
	List,
	AlertCircle,
	CheckCircle2,
} from "lucide-react";
import { toast } from "@/shared/components/ui/use-toast";
import { cn } from "@/shared/lib/utils";
import { formatCurrency } from "@ajeen/ui";
import { useProductBarcode, useOfflineProducts, useOfflineCategories } from "@/shared/hooks";
import { useScrollToScannedItem } from "@ajeen/ui";
import { useRolePermissions } from "@/shared/hooks/useRolePermissions";

// Import dialog components
import { ProductFormDialog } from "@/domains/products/components/dialogs/ProductFormDialog";
import { CategoryManagementDialog } from "@/domains/products/components/dialogs/CategoryManagementDialog";
import { ProductTypeManagementDialog } from "@/domains/products/components/dialogs/ProductTypeManagementDialog";
import { ProductsTableView } from "@/domains/products/components/ProductsTableView";
import { PageHeader } from "@/shared/components/layout/PageHeader";

const ProductsPage = () => {
	// REMOVED: products, allProducts, loading, error - now come from hook
	const [parentCategories, setParentCategories] = useState([]);
	const [childCategories, setChildCategories] = useState([]);
	const [showArchivedProducts, setShowArchivedProducts] = useState(false);
	const [viewMode, setViewMode] = useState(() => {
		return localStorage.getItem("productsViewMode") || "grid";
	});

	// Pagination state (client-side for cached data)
	const [currentPage, setCurrentPage] = useState(1);
	const pageSize = 25;

	// Role-based permissions
	const { canCreateProducts, canEditProducts, canDeleteProducts } =
		useRolePermissions();
	const [filters, setFilters] = useState({
		search: "",
		category: "",
		subcategory: "",
	});
	const [selectedParentCategory, setSelectedParentCategory] = useState("all");
	const [selectedChildCategory, setSelectedChildCategory] = useState("all");
	const [highlightedProductId, setHighlightedProductId] = useState(null);

	// Dialog states
	const [isProductFormOpen, setIsProductFormOpen] = useState(false);
	const [editingProductId, setEditingProductId] = useState(null);
	const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
	const [isProductTypeDialogOpen, setIsProductTypeDialogOpen] = useState(false);

	// Barcode scanning refs
	const barcodeInputRef = useRef("");
	const lastKeystrokeRef = useRef(0);

	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();

	// Modifier context from URL params
	const [modifierContext, setModifierContext] = useState(null);

	// Scroll to scanned item functionality
	const { scrollToItem } = useScrollToScannedItem();

	// Load categories with offline support
	const {
		data: allCategories,
		loading: categoriesLoading,
		isFromCache: categoriesFromCache,
	} = useOfflineCategories();

	const sortCategories = React.useCallback((categories = []) => {
		return [...categories]
			.map((cat) => ({
				...cat,
				_order: (() => {
					const raw = cat?.display_order ?? cat?.order;
					return typeof raw === "number" ? raw : Number(raw) || 0;
				})(),
			}))
			.sort((a, b) => {
				if (a._order !== b._order) return a._order - b._order;
				return (a?.name || "").localeCompare(b?.name || "");
			});
	}, []);

	// Helper: compute descendant category IDs for the selected parent (used for client-side filtering)
	const descendantCategoryIds = React.useMemo(() => {
		if (!allCategories || selectedParentCategory === "all") return new Set();

		const sorted = sortCategories(allCategories);
		const ids = new Set([selectedParentCategory]);
		const queue = [selectedParentCategory];

		// Traverse children depth-first using parent_id
		while (queue.length > 0) {
			const current = queue.shift();
			const children = sorted.filter((cat) => cat.parent_id && cat.parent_id.toString() === current);
			for (const child of children) {
				if (!ids.has(child.id.toString())) {
					ids.add(child.id.toString());
					queue.push(child.id.toString());
				}
			}
		}

		return ids;
	}, [allCategories, selectedParentCategory]);

	// Offline products hook - cache-first with automatic fallback
	const offlineFilters = {
		search: filters.search,
		// Avoid passing parent category when "all subcategories" is selected because the cache filter is exact-match
		// and would exclude descendants. We filter client-side instead.
		category:
			selectedChildCategory !== "all" && selectedChildCategory !== "parent-only"
				? selectedChildCategory
				: selectedChildCategory === "parent-only" && selectedParentCategory !== "all"
				? selectedParentCategory
				: undefined,
		include_archived: showArchivedProducts ? "only" : false,
		modifier_groups: modifierContext?.id,
	};

	let {
		data: allProducts,
		loading,
		error,
		isFromCache,
		source,
		isStale,
		refetch,
	} = useOfflineProducts(offlineFilters, { useCache: true });

	// Ensure we always work with an array for downstream logic
	let productList = Array.isArray(allProducts) ? allProducts : [];

	// Apply client-side filtering for "parent-only" selection (API includes descendants)
	if (selectedChildCategory === "parent-only" && selectedParentCategory !== "all") {
		productList = productList.filter(
			(product) => product?.category?.id?.toString() === selectedParentCategory
		);
	} else if (selectedParentCategory !== "all" && selectedChildCategory === "all") {
		// Include parent + all descendants when "All Subcategories" is selected
		productList = productList.filter((product) =>
			product?.category?.id && descendantCategoryIds.has(product.category.id.toString())
		);
	}

	// Sort products by category display_order, then by product name
	productList = [...productList].sort((a, b) => {
		// Extract category display_order (fallback to order field, then 0)
		const aOrder = (() => {
			const raw = a?.category?.display_order ?? a?.category?.order;
			return typeof raw === "number" ? raw : Number(raw) || 0;
		})();
		const bOrder = (() => {
			const raw = b?.category?.display_order ?? b?.category?.order;
			return typeof raw === "number" ? raw : Number(raw) || 0;
		})();

		// Sort by category order first
		if (aOrder !== bOrder) return aOrder - bOrder;

		// Then sort by product name
		return (a?.name || "").localeCompare(b?.name || "");
	});

	// Derived values for client-side pagination (must be after hook)
	const totalCount = productList.length;
	const paginatedProducts = productList.slice(
		(currentPage - 1) * pageSize,
		currentPage * pageSize
	) || [];

		// Filter categories into parent and child
	useEffect(() => {
		if (allCategories && allCategories.length > 0) {
			// Filter parent categories (no parent_id or parent_id is null) and respect order
			const parents = sortCategories(allCategories.filter(cat => !cat.parent_id));
			setParentCategories(parents);

			// Debug: log category ordering data to verify backend fields
			console.table(
				sortCategories(allCategories).map((cat) => ({
					id: cat.id,
					name: cat.name,
					order: cat.order,
					display_order: cat.display_order,
					parent: cat.parent_id,
				}))
			);
			console.log(`📦 [ProductsPage] Loaded ${parents.length} parent categories (from cache: ${categoriesFromCache})`);
		}
	}, [allCategories, categoriesFromCache, sortCategories]);

		// Reset child category selection when parent changes
		useEffect(() => {
			setSelectedChildCategory("all");
		}, [selectedParentCategory]);

		// Filter child categories when parent selection changes
		useEffect(() => {
			setChildCategories([]);

		if (selectedParentCategory && selectedParentCategory !== "all" && allCategories) {
			const children = sortCategories(allCategories.filter(
				cat => cat.parent_id && cat.parent_id.toString() === selectedParentCategory
			));
			setChildCategories(children);
			console.log(`📦 [ProductsPage] Found ${children.length} child categories for parent ${selectedParentCategory}`);
		}
	}, [selectedParentCategory, allCategories, sortCategories]);

	// Smart barcode scanning
	const { scanBarcode, isScanning } = useProductBarcode((product) => {
		setFilters({ search: "", category: "", subcategory: "" });
		setSelectedParentCategory("all");
		setSelectedChildCategory("all");
		setShowArchivedProducts(!product.is_active);

		setHighlightedProductId(product.id);
		setTimeout(() => setHighlightedProductId(null), 3000);

		setTimeout(() => {
			refetch({ forceApi: false });
			scrollToItem(product.id, {
				dataAttribute: "data-product-id",
				delay: 200,
			});
		}, 100);
	});



	// Handle URL parameters for modifier filtering
	useEffect(() => {
		const modifierId = searchParams.get("modifier");
		const modifierName = searchParams.get("modifierName");
		const from = searchParams.get("from");

		if (modifierId && modifierName && from === "modifiers") {
			setModifierContext({
				id: modifierId,
				name: decodeURIComponent(modifierName),
			});
		} else {
			setModifierContext(null);
		}
	}, [searchParams]);

	// Reset pagination when filters change
	useEffect(() => {
		setCurrentPage(1);
	}, [filters.search, selectedParentCategory, selectedChildCategory, showArchivedProducts]);

	// Global barcode listener
	useEffect(() => {
		const handleKeyPress = (e) => {
			if (
				e.target.tagName === "INPUT" ||
				e.target.tagName === "TEXTAREA" ||
				isProductFormOpen ||
				isCategoryDialogOpen ||
				isProductTypeDialogOpen
			) {
				return;
			}

			const now = Date.now();
			const timeDiff = now - lastKeystrokeRef.current;

			if (timeDiff < 100) {
				barcodeInputRef.current += e.key;
			} else {
				barcodeInputRef.current = e.key;
			}

			lastKeystrokeRef.current = now;

			if (e.key === "Enter" && barcodeInputRef.current.length > 1) {
				const barcode = barcodeInputRef.current.replace("Enter", "");
				if (barcode.length >= 3) {
					e.preventDefault();
					scanBarcode(barcode);
				}
				barcodeInputRef.current = "";
			}

			setTimeout(() => {
				if (
					Date.now() - lastKeystrokeRef.current > 500 &&
					barcodeInputRef.current.length >= 8
				) {
					const barcode = barcodeInputRef.current;
					if (barcode.length >= 3) {
						scanBarcode(barcode);
					}
					barcodeInputRef.current = "";
				}
			}, 600);
		};

		document.addEventListener("keypress", handleKeyPress);
		return () => document.removeEventListener("keypress", handleKeyPress);
	}, [
		scanBarcode,
		isProductFormOpen,
		isCategoryDialogOpen,
		isProductTypeDialogOpen,
	]);

	const handleSearchChange = (e) => {
		const value = e.target.value;
		setFilters((prev) => ({ ...prev, search: value }));
	};

	const handleArchiveToggle = async (productId, isActive) => {
		try {
			if (isActive) {
				await archiveProduct(productId);
				toast({
					title: "Success",
					description: "Product archived successfully.",
				});
			} else {
				await unarchiveProduct(productId);
				toast({
					title: "Success",
					description: "Product restored successfully.",
				});
			}
			refetch({ forceApi: true });
		} catch (err) {
			toast({
				title: "Error",
				description: "Failed to update product status.",
				variant: "destructive",
			});
			console.error("Archive/restore error:", err);
		}
	};

	const handleCreateProduct = () => {
		setEditingProductId(null);
		setIsProductFormOpen(true);
	};

	const handleEditProduct = (productId) => {
		setEditingProductId(productId);
		setIsProductFormOpen(true);
	};

	const handleProductFormSuccess = () => {
		refetch({ forceApi: true });
		// Note: Categories will refresh automatically from cache/API via useOfflineCategories hook
	};

	const handleManageTypes = () => {
		setIsProductTypeDialogOpen(true);
	};

	const handleManageCategories = () => {
		setIsCategoryDialogOpen(true);
	};

	const handleCategoryDialogClose = (dataChanged = false) => {
		setIsCategoryDialogOpen(false);
		if (dataChanged) {
			// Note: Categories will refresh automatically from cache/API via useOfflineCategories hook
			refetch({ forceApi: true });
		}
	};

	const handleProductTypeDialogClose = (dataChanged = false) => {
		setIsProductTypeDialogOpen(false);
		if (dataChanged) {
			refetch({ forceApi: true });
		}
	};

	const handleClearModifierFilter = () => {
		setSearchParams({});
	};

	const handleBackToModifiers = () => {
		navigate("/products/modifiers");
	};

	const handleViewModeChange = (mode) => {
		setViewMode(mode);
		localStorage.setItem("productsViewMode", mode);
	};

	const clearAllFilters = () => {
		setFilters({ search: "", category: "", subcategory: "" });
		setSelectedParentCategory("all");
		setSelectedChildCategory("all");
		if (modifierContext) {
			setSearchParams({});
		}
	};

	const hasActiveFilters =
		filters.search || selectedParentCategory !== "all" || modifierContext;

	const ProductGridCard = ({ product }) => {
		const isHighlighted = highlightedProductId === product.id;
		return (
			<Card
				data-product-id={product.id}
				className={cn(
					"group cursor-pointer border border-border/60 bg-card/80 shadow-sm transition-all duration-200 ease-standard hover:shadow-lg hover:border-border",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
					isHighlighted && "ring-2 ring-primary/60 bg-primary/5"
				)}
				onClick={() => navigate(`/products/${product.id}`)}
			>
				<CardContent className="p-0">
					{/* Product Image */}
					<div className="aspect-square relative overflow-hidden rounded-t-lg bg-muted/20">
						{product.image ? (
							<img
								src={product.image}
								alt={product.name}
								className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
							/>
						) : (
							<div className="w-full h-full flex items-center justify-center">
								<Package className="h-16 w-16 text-muted-foreground/40" />
							</div>
						)}

						{/* Status Badge */}
						<div className="absolute top-3 left-3">
							<Badge
								variant={product.is_active ? "default" : "destructive"}
								className="rounded-full px-2.5 py-1 text-xs shadow-sm"
							>
								{product.is_active ? "Active" : "Archived"}
							</Badge>
						</div>

						{/* Action Menu */}
						{(canEditProducts() || canDeleteProducts()) && (
							<div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
								<DropdownMenu>
									<DropdownMenuTrigger
										asChild
										onClick={(e) => e.stopPropagation()}
									>
										<Button
											variant="secondary"
											size="icon"
											className="h-8 w-8 shadow-sm"
										>
											<MoreHorizontal className="h-4 w-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent
										align="end"
										className="w-44"
									>
										<DropdownMenuLabel>Actions</DropdownMenuLabel>
										{canEditProducts() && (
											<DropdownMenuItem
												onClick={(e) => {
													e.stopPropagation();
													handleEditProduct(product.id);
												}}
											>
												<Edit className="mr-2 h-4 w-4" />
												Edit Product
											</DropdownMenuItem>
										)}
										{canEditProducts() && canDeleteProducts() && (
											<DropdownMenuSeparator />
										)}
										{canDeleteProducts() && (
											<DropdownMenuItem
												onClick={(e) => {
													e.stopPropagation();
													handleArchiveToggle(product.id, product.is_active);
												}}
												className={
													product.is_active
														? "text-orange-600 focus:text-orange-600"
														: "text-green-600 focus:text-green-600"
												}
											>
												{product.is_active ? (
													<>
														<Archive className="mr-2 h-4 w-4" />
														Archive
													</>
												) : (
													<>
														<ArchiveRestore className="mr-2 h-4 w-4" />
														Restore
													</>
												)}
											</DropdownMenuItem>
										)}
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						)}
					</div>

					{/* Product Info */}
					<div className="p-4 space-y-3">
						{/* Name and Price */}
						<div className="space-y-1">
							<h3 className="font-semibold text-foreground line-clamp-1 text-base">
								{product.name}
							</h3>
							<p className="text-2xl font-bold text-primary">
								{formatCurrency(product.price)}
							</p>
						</div>

						{/* Description */}
						{product.description && (
							<p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
								{product.description}
							</p>
						)}

						{/* Tags */}
						<div className="flex items-center gap-2 flex-wrap min-h-[1.5rem]">
							{product.category && (
								<Badge
									variant="outline"
									className="text-xs rounded-full"
								>
									{product.category.name}
								</Badge>
							)}
							{product.product_type && (
								<Badge
									variant="secondary"
									className="text-xs rounded-full"
								>
									{product.product_type.name}
								</Badge>
							)}
						</div>

						{/* Barcode if available */}
						{product.barcode && (
							<p className="text-xs text-muted-foreground font-mono truncate">
								{product.barcode}
							</p>
						)}
					</div>
				</CardContent>
			</Card>
		);
	};

	const ProductListCard = ({ product }) => {
		const isHighlighted = highlightedProductId === product.id;
		return (
			<Card
				data-product-id={product.id}
				className={cn(
					"cursor-pointer border border-border/60 bg-card/80 shadow-sm transition-all duration-200 ease-standard hover:shadow-md hover:border-border",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
					isHighlighted && "ring-2 ring-primary/60 bg-primary/5"
				)}
				onClick={() => navigate(`/products/${product.id}`)}
			>
				<CardContent className="p-4">
					<div className="flex items-center gap-4">
						{/* Product Image */}
						<div className="flex size-16 items-center justify-center rounded-lg bg-muted/20 shrink-0 overflow-hidden">
							{product.image ? (
								<img
									src={product.image}
									alt={product.name}
									className="w-full h-full object-cover"
								/>
							) : (
								<Package className="h-8 w-8 text-muted-foreground/40" />
							)}
						</div>

						{/* Product Info */}
						<div className="flex-1 min-w-0 space-y-1">
							<div className="flex items-start justify-between gap-4">
								<div className="min-w-0 flex-1">
									<h3 className="font-semibold text-foreground text-base truncate">
										{product.name}
									</h3>
									{product.description && (
										<p className="text-sm text-muted-foreground line-clamp-1">
											{product.description}
										</p>
									)}
								</div>
								<div className="text-right shrink-0">
									<p className="text-xl font-bold text-primary">
										{formatCurrency(product.price)}
									</p>
									{product.barcode && (
										<p className="text-xs text-muted-foreground font-mono">
											{product.barcode}
										</p>
									)}
								</div>
							</div>

							{/* Tags and Status */}
							<div className="flex items-center justify-between gap-4">
								<div className="flex items-center gap-2 flex-wrap">
									{product.category && (
										<Badge
											variant="outline"
											className="text-xs rounded-full"
										>
											{product.category.name}
										</Badge>
									)}
									{product.product_type && (
										<Badge
											variant="secondary"
											className="text-xs rounded-full"
										>
											{product.product_type.name}
										</Badge>
									)}
									<Badge
										variant={product.is_active ? "default" : "destructive"}
										className="text-xs rounded-full"
									>
										{product.is_active ? "Active" : "Archived"}
									</Badge>
								</div>

								{/* Actions Menu */}
								{(canEditProducts() || canDeleteProducts()) && (
									<DropdownMenu>
										<DropdownMenuTrigger
											asChild
											onClick={(e) => e.stopPropagation()}
										>
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8 text-muted-foreground hover:text-foreground"
											>
												<MoreHorizontal className="h-4 w-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent
											align="end"
											className="w-44"
										>
											<DropdownMenuLabel>Actions</DropdownMenuLabel>
											{canEditProducts() && (
												<DropdownMenuItem
													onClick={(e) => {
														e.stopPropagation();
														handleEditProduct(product.id);
													}}
												>
													<Edit className="mr-2 h-4 w-4" />
													Edit Product
												</DropdownMenuItem>
											)}
											{canEditProducts() && canDeleteProducts() && (
												<DropdownMenuSeparator />
											)}
											{canDeleteProducts() && (
												<DropdownMenuItem
													onClick={(e) => {
														e.stopPropagation();
														handleArchiveToggle(product.id, product.is_active);
													}}
													className={
														product.is_active
															? "text-orange-600 focus:text-orange-600"
															: "text-green-600 focus:text-green-600"
													}
												>
													{product.is_active ? (
														<>
															<Archive className="mr-2 h-4 w-4" />
															Archive
														</>
													) : (
														<>
															<ArchiveRestore className="mr-2 h-4 w-4" />
															Restore
														</>
													)}
												</DropdownMenuItem>
											)}
										</DropdownMenuContent>
									</DropdownMenu>
								)}
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		);
	};

	const ProductsView = () => {
		if (viewMode === "list") {
			return (
				<ProductsTableView
					products={paginatedProducts}
					loading={loading}
					error={error}
					hasActiveFilters={hasActiveFilters}
					clearAllFilters={clearAllFilters}
					refetch={refetch}
					showArchivedProducts={showArchivedProducts}
					onCardClick={(product) => navigate(`/products/${product.id}`)}
					onEditProduct={handleEditProduct}
					onArchiveToggle={handleArchiveToggle}
					canEditProducts={canEditProducts}
					canDeleteProducts={canDeleteProducts}
				/>
			);
		}

		// Grid view
		if (loading) {
			return (
				<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
					{Array.from({ length: 12 }).map((_, i) => (
						<Card
							key={i}
							className="border border-border/60 bg-card/80"
						>
							<CardContent className="p-0">
								<Skeleton className="aspect-square rounded-t-lg" />
								<div className="p-4 space-y-3">
									<Skeleton className="h-5 w-3/4" />
									<Skeleton className="h-6 w-1/2" />
									<Skeleton className="h-4 w-full" />
									<Skeleton className="h-4 w-2/3" />
									<div className="flex gap-2">
										<Skeleton className="h-5 w-16" />
										<Skeleton className="h-5 w-20" />
									</div>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			);
		}

		if (error) {
			return (
				<Card className="border border-destructive/20 bg-destructive/5">
					<CardContent className="flex items-center justify-center p-12">
						<div className="text-center space-y-4">
							<AlertCircle className="h-12 w-12 text-destructive mx-auto" />
							<div>
								<h3 className="font-semibold text-foreground mb-2">
									Error Loading Products
								</h3>
								<p className="text-sm text-muted-foreground mb-4">{error}</p>
								<Button
									onClick={() => refetch({ forceApi: true })}
									variant="outline"
								>
									<Package className="mr-2 h-4 w-4" />
									Try Again
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			);
		}

		if (paginatedProducts.length === 0) {
			return (
				<Card className="border border-border/60 bg-card/80">
					<CardContent className="flex items-center justify-center p-12">
						<div className="text-center space-y-4 max-w-md">
							<Package className="h-16 w-16 text-muted-foreground/60 mx-auto" />
							<div>
								<h3 className="text-xl font-semibold text-foreground mb-2">
									{hasActiveFilters
										? "No matching products"
										: "No products found"}
								</h3>
								<p className="text-muted-foreground mb-6">
									{hasActiveFilters
										? "Try adjusting your search terms or filters to find what you're looking for."
										: showArchivedProducts
										? "No archived products found. All your products are currently active."
										: "Get started by adding your first product to the catalog."}
								</p>
								{hasActiveFilters ? (
									<Button
										onClick={clearAllFilters}
										variant="outline"
										size="lg"
									>
										<X className="mr-2 h-4 w-4" />
										Clear All Filters
									</Button>
								) : canCreateProducts() && !showArchivedProducts ? (
									<Button
										onClick={handleCreateProduct}
										size="lg"
									>
										<PlusCircle className="mr-2 h-5 w-5" />
										Add Your First Product
									</Button>
								) : null}
							</div>
						</div>
					</CardContent>
				</Card>
			);
		}

		return (
			<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
				{paginatedProducts.map((product) => (
					<ProductGridCard
						key={product.id}
						product={product}
					/>
				))}
			</div>
		);
	};

	// Define header actions
	const headerActions = (
		<div className="flex items-center gap-3">
			{modifierContext && (
				<Button
					variant="outline"
					onClick={handleBackToModifiers}
					size="sm"
					className="hidden sm:flex"
				>
					<FolderOpen className="mr-2 h-4 w-4" />
					Back to Modifiers
				</Button>
			)}

			<Button
				variant={showArchivedProducts ? "default" : "outline"}
				size="sm"
				onClick={() => setShowArchivedProducts(!showArchivedProducts)}
			>
				{showArchivedProducts ? (
					<>
						<CheckCircle2 className="mr-2 h-4 w-4" />
						Show Active
					</>
				) : (
					<>
						<Archive className="mr-2 h-4 w-4" />
						Show Archived
					</>
				)}
			</Button>

			{(canCreateProducts() || canEditProducts()) && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button>
							<Settings className="mr-2 h-4 w-4" />
							Manage
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						className="w-56"
					>
						<DropdownMenuLabel>Product Management</DropdownMenuLabel>
						{canCreateProducts() && (
							<DropdownMenuItem onClick={handleCreateProduct}>
								<PlusCircle className="mr-2 h-4 w-4" />
								Add New Product
							</DropdownMenuItem>
						)}
						{canCreateProducts() && canEditProducts() && (
							<DropdownMenuSeparator />
						)}
						{canEditProducts() && (
							<>
								<DropdownMenuItem onClick={handleManageCategories}>
									<FolderOpen className="mr-2 h-4 w-4" />
									Manage Categories
								</DropdownMenuItem>
								<DropdownMenuItem onClick={handleManageTypes}>
									<Tags className="mr-2 h-4 w-4" />
									Manage Product Types
								</DropdownMenuItem>
								{!modifierContext && (
									<>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											onClick={() => navigate("/products/modifiers")}
										>
											<Settings className="mr-2 h-4 w-4" />
											Manage Modifiers
										</DropdownMenuItem>
									</>
								)}
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
	);

	return (
		<div className="flex flex-col h-full">
			{/* Page Header */}
			<PageHeader
				icon={Package}
				title={
					modifierContext
						? `Products Using "${modifierContext.name}"`
						: showArchivedProducts
						? "Archived Products"
						: "Product Catalog"
				}
				description={
					<div className="flex items-center gap-2">
						<span>
							{modifierContext
								? `${totalCount} products using this modifier`
								: `${totalCount} total products`}
						</span>
						{isFromCache && process.env.NODE_ENV === 'development' && (
							<Badge variant="secondary" className="text-xs">
								📦 From Cache
							</Badge>
						)}
					</div>
				}
				actions={headerActions}
				className="shrink-0"
			/>

			{/* Search and Filters */}
			<div className="border-b bg-background/95 backdrop-blur-sm p-4 space-y-4">
				{/* Search Bar */}
				<div className="relative max-w-md">
					<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Search products, categories, barcodes..."
						className="pl-10 h-11"
						value={filters.search}
						onChange={handleSearchChange}
					/>
					{filters.search && (
						<Button
							variant="ghost"
							size="icon"
							className="absolute right-1 top-1/2 transform -translate-y-1/2 h-9 w-9"
							onClick={() => setFilters((prev) => ({ ...prev, search: "" }))}
						>
							<X className="h-4 w-4" />
						</Button>
					)}
				</div>

				{/* Filters and View Controls */}
				<div className="flex items-center justify-between flex-wrap gap-4">
					{/* Filter Controls */}
					<div className="flex items-center gap-3 flex-wrap">
						<Select
							value={selectedParentCategory}
							onValueChange={setSelectedParentCategory}
						>
							<SelectTrigger className="w-[160px] h-10">
								<SelectValue placeholder="Category" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Categories</SelectItem>
								{parentCategories.map((category) => (
									<SelectItem
										key={category.id}
										value={category.id.toString()}
									>
										{category.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						{selectedParentCategory !== "all" && childCategories.length > 0 && (
							<Select
								value={selectedChildCategory}
								onValueChange={setSelectedChildCategory}
							>
								<SelectTrigger className="w-[160px] h-10">
									<SelectValue placeholder="Subcategory" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Subcategories</SelectItem>
									<SelectItem value="parent-only">Parent Only</SelectItem>
									{childCategories.map((category) => (
										<SelectItem
											key={category.id}
											value={category.id.toString()}
										>
											{category.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}

						{modifierContext && (
							<Button
								variant="outline"
								onClick={handleClearModifierFilter}
								className="h-10"
							>
								<X className="mr-2 h-4 w-4" />
								Clear Modifier Filter
							</Button>
						)}

						{hasActiveFilters && (
							<Button
								variant="ghost"
								onClick={clearAllFilters}
								className="h-10 text-muted-foreground hover:text-foreground"
							>
								Clear All
							</Button>
						)}
					</div>

					{/* View Mode Toggle */}
					<div className="flex items-center gap-1 border rounded-md p-1">
						<Button
							variant={viewMode === "grid" ? "default" : "ghost"}
							size="sm"
							onClick={() => handleViewModeChange("grid")}
							className="px-2 py-1 h-8"
						>
							<LayoutGrid className="h-3 w-3 mr-1" />
							Grid
						</Button>
						<Button
							variant={viewMode === "list" ? "default" : "ghost"}
							size="sm"
							onClick={() => handleViewModeChange("list")}
							className="px-2 py-1 h-8"
						>
							<List className="h-3 w-3 mr-1" />
							List
						</Button>
					</div>
				</div>
			</div>

			{/* Main Content */}
			<div className="flex-1 min-h-0 p-4">
				<ScrollArea className="h-full">
					<div className="pb-6">
						<ProductsView />

						{/* Client-side Pagination Controls */}
						{totalCount > pageSize && (
							<div className="flex justify-center gap-2 mt-6">
								<Button
									variant="outline"
									onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
									disabled={currentPage === 1}
								>
									Previous
								</Button>
								<span className="flex items-center px-4 text-sm text-muted-foreground">
									Page {currentPage} of {Math.ceil(totalCount / pageSize)}
								</span>
								<Button
									variant="outline"
									onClick={() => setCurrentPage((p) => Math.min(Math.ceil(totalCount / pageSize), p + 1))}
									disabled={currentPage >= Math.ceil(totalCount / pageSize)}
								>
									Next
								</Button>
							</div>
						)}
					</div>
				</ScrollArea>
			</div>

			{/* Floating Action Button for Mobile */}
			{canCreateProducts() && (
				<div className="fixed bottom-6 right-6 z-30 md:hidden">
					<Button
						size="lg"
						onClick={handleCreateProduct}
						className="h-14 w-14 rounded-full shadow-lg"
					>
						<PlusCircle className="h-6 w-6" />
					</Button>
				</div>
			)}

			{/* Dialogs */}
			<ProductFormDialog
				open={isProductFormOpen}
				onOpenChange={setIsProductFormOpen}
				productId={editingProductId}
				onSuccess={handleProductFormSuccess}
			/>

			<CategoryManagementDialog
				open={isCategoryDialogOpen}
				onOpenChange={handleCategoryDialogClose}
			/>

			<ProductTypeManagementDialog
				open={isProductTypeDialogOpen}
				onOpenChange={handleProductTypeDialogClose}
			/>

			{/* Scanning Indicator */}
			{isScanning && (
				<div className="fixed top-4 right-4 bg-primary/90 backdrop-blur text-primary-foreground px-4 py-2 rounded-lg shadow-lg z-50 flex items-center gap-2">
					<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
					Scanning product...
				</div>
			)}
		</div>
	);
};

export default ProductsPage;
