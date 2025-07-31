import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
	getProducts,
	archiveProduct,
	unarchiveProduct,
} from "@/services/api/productService";
import { getCategories } from "@/services/api/categoryService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	PlusCircle,
	Archive,
	ArchiveRestore,
	MoreHorizontal,
	Edit,
	Settings,
	Tags,
	FolderOpen,
} from "lucide-react";
import { DomainPageLayout } from "@/components/shared/DomainPageLayout";
import { StandardTable } from "@/components/shared/StandardTable";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";

// Import dialog components
import { ProductFormDialog } from "@/components/ProductFormDialog";
import { CategoryManagementDialog } from "@/components/CategoryManagementDialog";
import { ProductTypeManagementDialog } from "@/components/ProductTypeManagementDialog";

export const ProductsPage = () => {
	const [products, setProducts] = useState([]);
	const [allProducts, setAllProducts] = useState([]); // Keep unfiltered copy
	const [parentCategories, setParentCategories] = useState([]);
	const [childCategories, setChildCategories] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [showArchivedProducts, setShowArchivedProducts] = useState(false);
	const [filters, setFilters] = useState({
		search: "",
		category: "",
		subcategory: "",
	});
	const [selectedParentCategory, setSelectedParentCategory] = useState("all");
	const [selectedChildCategory, setSelectedChildCategory] = useState("all");

	// Dialog states
	const [isProductFormOpen, setIsProductFormOpen] = useState(false);
	const [editingProductId, setEditingProductId] = useState(null);
	const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
	const [isProductTypeDialogOpen, setIsProductTypeDialogOpen] = useState(false);

	const navigate = useNavigate();
	const { toast } = useToast();
	const [searchParams, setSearchParams] = useSearchParams();
	
	// Modifier context from URL params
	const [modifierContext, setModifierContext] = useState<{
		id: string | null;
		name: string | null;
	} | null>(null);

	const fetchProducts = async (includeArchived = false) => {
		try {
			setLoading(true);
			// Pass is_active parameter based on what products we want to show
			const params = { is_active: !includeArchived };
			
			// If we have a modifier context, we need to include all modifiers to see conditional ones
			if (modifierContext) {
				params.include_all_modifiers = true;
			}
			
			const response = await getProducts(params);
			const fetchedProducts = response.data || [];
			setAllProducts(fetchedProducts); // Store complete list
			applyFilters(fetchedProducts);
			setError(null);
		} catch (err) {
			setError("Failed to fetch products.");
			console.error(err);
		} finally {
			setLoading(false);
		}
	};

	const fetchParentCategories = async () => {
		try {
			const response = await getCategories({ parent: "null" });
			setParentCategories(response.data || []);
		} catch (err) {
			console.error("Failed to fetch parent categories:", err);
		}
	};

	const fetchChildCategories = async (parentId: string) => {
		try {
			const response = await getCategories({ parent: parentId });
			setChildCategories(response.data || []);
		} catch (err) {
			console.error("Failed to fetch child categories:", err);
		}
	};

	useEffect(() => {
		fetchProducts(showArchivedProducts);
		fetchParentCategories();
	}, [modifierContext, showArchivedProducts]);

	// Handle URL parameters for modifier filtering
	useEffect(() => {
		const modifierId = searchParams.get('modifier');
		const modifierName = searchParams.get('modifierName');
		const from = searchParams.get('from');
		
		if (modifierId && modifierName && from === 'modifiers') {
			setModifierContext({
				id: modifierId,
				name: decodeURIComponent(modifierName),
			});
		} else {
			setModifierContext(null);
		}
	}, [searchParams]);


	useEffect(() => {
		if (selectedParentCategory && selectedParentCategory !== "all") {
			fetchChildCategories(selectedParentCategory);
		} else {
			setChildCategories([]);
			setSelectedChildCategory("all");
		}
	}, [selectedParentCategory]);

	const applyFilters = (allProductsToFilter: any) => {
		let filtered = allProductsToFilter;

		if (filters.search) {
			const searchLower = filters.search.toLowerCase();
			filtered = filtered.filter(
				(product: any) =>
					product.name.toLowerCase().includes(searchLower) ||
					(product.description &&
						product.description.toLowerCase().includes(searchLower)) ||
					(product.barcode &&
						product.barcode.toLowerCase().includes(searchLower))
			);
		}

		// Category filtering logic
		if (
			selectedChildCategory &&
			selectedChildCategory !== "all" &&
			selectedChildCategory !== "parent-only"
		) {
			// Show products from specific child category
			filtered = filtered.filter((product: any) => {
				const category = product.category;
				return category && category.id === parseInt(selectedChildCategory);
			});
		} else if (
			selectedChildCategory === "parent-only" &&
			selectedParentCategory &&
			selectedParentCategory !== "all"
		) {
			// Show only products directly assigned to the parent category
			filtered = filtered.filter((product: any) => {
				const category = product.category;
				return category && category.id === parseInt(selectedParentCategory);
			});
		} else if (selectedParentCategory && selectedParentCategory !== "all") {
			// Show all products under parent category (including child categories) - "All Subcategories"
			filtered = filtered.filter((product: any) => {
				const category = product.category;
				if (!category) return false;
				if (category.id === parseInt(selectedParentCategory)) return true;

				const parentId = category.parent_id ?? category.parent?.id;
				return parentId === parseInt(selectedParentCategory);
			});
		}

		// Modifier filtering logic - filter by products that use this modifier set
		if (modifierContext && modifierContext.id) {
			filtered = filtered.filter((product: any) => {
				return product.modifier_groups && product.modifier_groups.some((group: any) => 
					group.id == modifierContext.id
				);
			});
		}

		setProducts(filtered);
	};

	useEffect(() => {
		applyFilters(allProducts);
	}, [selectedParentCategory, selectedChildCategory, allProducts, modifierContext]);

	useEffect(() => {
		const timeoutId = setTimeout(() => {
			applyFilters(allProducts);
		}, 300);
		return () => clearTimeout(timeoutId);
	}, [filters.search, allProducts]);

	const handleSearchChange = (e: any) => {
		const value = e.target.value;
		setFilters((prev) => ({ ...prev, search: value }));
	};

	const handleClearModifierFilter = () => {
		// Clear URL params to show all products
		setSearchParams({});
	};

	const handleBackToModifiers = () => {
		// Clear URL params and navigate back to modifier management
		navigate("/products/modifiers");
	};

	const handleArchiveToggle = async (productId: any, isActive: any) => {
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
			fetchProducts(showArchivedProducts);
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
		fetchProducts(showArchivedProducts);
		fetchParentCategories(); // Refresh categories in case they were updated
	};

	const handleManageTypes = () => {
		setIsProductTypeDialogOpen(true);
	};

	const handleManageCategories = () => {
		setIsCategoryDialogOpen(true);
	};

	const handleCategoryDialogClose = () => {
		setIsCategoryDialogOpen(false);
		// Refresh categories and products after category management
		fetchParentCategories();
		fetchProducts(showArchivedProducts);
	};

	const handleProductTypeDialogClose = () => {
		setIsProductTypeDialogOpen(false);
		// Refresh products after product type management
		fetchProducts(showArchivedProducts);
	};

	const headers = [
		{ label: "Name" },
		{ label: "Category" },
		{ label: "Price", className: "text-right" },
		{ label: "Actions", className: "text-right" },
	];

	const renderProductRow = (product) => {
		return (
			<>
				<TableCell className="font-medium">{product.name}</TableCell>
				<TableCell>
					{product.category ? (
						<Badge variant="outline">{product.category.name}</Badge>
					) : (
						<span className="text-muted-foreground">No Category</span>
					)}
				</TableCell>
				<TableCell className="text-right font-medium">
					{formatCurrency(product.price)}
				</TableCell>
				<TableCell
					onClick={(e) => e.stopPropagation()}
					className="text-right"
				>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
							>
								<MoreHorizontal className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel>Actions</DropdownMenuLabel>
							<DropdownMenuItem onClick={() => handleEditProduct(product.id)}>
								<Edit className="mr-2 h-4 w-4" />
								Edit
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() =>
									handleArchiveToggle(product.id, product.is_active)
								}
								className={
									product.is_active ? "text-orange-600" : "text-green-600"
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
						</DropdownMenuContent>
					</DropdownMenu>
				</TableCell>
			</>
		);
	};

	const filterControls = (
		<>
			<Select
				value={selectedParentCategory}
				onValueChange={setSelectedParentCategory}
			>
				<SelectTrigger className="w-[180px]">
					<SelectValue placeholder="Filter by Category" />
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
			{selectedParentCategory &&
				selectedParentCategory !== "all" &&
				childCategories.length > 0 && (
					<Select
						value={selectedChildCategory}
						onValueChange={setSelectedChildCategory}
					>
						<SelectTrigger className="w-[180px]">
							<SelectValue placeholder="Filter by Subcategory" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Subcategories</SelectItem>
							<SelectItem value="parent-only">Parent Category Only</SelectItem>
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
					size="sm"
					onClick={handleClearModifierFilter}
					className="mr-2"
				>
					<Tags className="mr-2 h-4 w-4" />
					Show All Products
				</Button>
			)}
		</>
	);

	const headerActions = (
		<>
			{modifierContext && (
				<Button
					variant="outline"
					size="sm"
					onClick={handleBackToModifiers}
					className="mr-4"
				>
					<FolderOpen className="mr-2 h-4 w-4" />
					Back to Modifier Management
				</Button>
			)}

			<Button
				variant={showArchivedProducts ? "default" : "outline"}
				size="sm"
				onClick={() => setShowArchivedProducts(!showArchivedProducts)}
				className="mr-4"
			>
				{showArchivedProducts ? (
					<ArchiveRestore className="mr-2 h-4 w-4" />
				) : (
					<Archive className="mr-2 h-4 w-4" />
				)}
				{showArchivedProducts ? "Show Active" : "Show Archived"}
			</Button>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button size="sm">
						<Settings className="mr-2 h-4 w-4" />
						Actions
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuLabel>Product Management</DropdownMenuLabel>
					<DropdownMenuItem onClick={handleCreateProduct}>
						<PlusCircle className="mr-2 h-4 w-4" />
						Add Product
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={handleManageTypes}>
						<Tags className="mr-2 h-4 w-4" />
						Manage Types
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleManageCategories}>
						<FolderOpen className="mr-2 h-4 w-4" />
						Manage Categories
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => navigate("/products/modifiers")}>
						<Settings className="mr-2 h-4 w-4" />
						Manage Modifiers
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);

	return (
		<>
			<DomainPageLayout
				pageTitle={
					modifierContext
						? `Products Using "${modifierContext.name}"`
						: showArchivedProducts
						? "Archived Products"
						: "Active Products"
				}
				pageDescription={
					modifierContext
						? `Showing ${products.length} products that use the "${modifierContext.name}" modifier set`
						: "Manage your product catalog"
				}
				pageIcon={Tags}
				pageActions={headerActions}
				title="Filters & Search"
				searchPlaceholder="Search products by name or description..."
				searchValue={filters.search}
				onSearchChange={handleSearchChange}
				filterControls={filterControls}
				error={error}
			>
				<StandardTable
					headers={headers}
					data={products}
					loading={loading}
					emptyMessage={
						showArchivedProducts
							? "No archived products found."
							: "No active products found for the selected filters."
					}
					onRowClick={(product) => navigate(`/products/${product.id}`)}
					renderRow={renderProductRow}
				/>
			</DomainPageLayout>

			{/* Product Form Dialog */}
			<ProductFormDialog
				open={isProductFormOpen}
				onOpenChange={setIsProductFormOpen}
				productId={editingProductId}
				onSuccess={handleProductFormSuccess}
			/>

			{/* Category Management Dialog */}
			<CategoryManagementDialog
				open={isCategoryDialogOpen}
				onOpenChange={handleCategoryDialogClose}
			/>

			{/* Product Type Management Dialog */}
			<ProductTypeManagementDialog
				open={isProductTypeDialogOpen}
				onOpenChange={handleProductTypeDialogClose}
			/>
		</>
	);
};
