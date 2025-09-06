import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
	getProducts,
	archiveProduct,
	unarchiveProduct,
} from "@/domains/products/services/productService";
import { getCategories } from "@/domains/products/services/categoryService";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { TableCell } from "@/shared/components/ui/table";
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
} from "lucide-react";
import { DomainPageLayout, StandardTable } from "@/shared/components/layout";
import { toast } from "@/shared/components/ui/use-toast";
import { formatCurrency } from "@/shared/lib/utils";
import { useProductBarcode, useScrollToScannedItem } from "@/shared/hooks";
import { useRolePermissions } from "@/shared/hooks/useRolePermissions";

// Import dialog components
import { ProductFormDialog } from "@/domains/products/components/dialogs/ProductFormDialog";
import { CategoryManagementDialog } from "@/domains/products/components/dialogs/CategoryManagementDialog";
import { ProductTypeManagementDialog } from "@/domains/products/components/dialogs/ProductTypeManagementDialog";

const ProductsPage = () => {
	const [products, setProducts] = useState([]);
	const [allProducts, setAllProducts] = useState([]); // Keep unfiltered copy for barcode search
	const [parentCategories, setParentCategories] = useState([]);
	const [childCategories, setChildCategories] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [showArchivedProducts, setShowArchivedProducts] = useState(false);

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

	// Smart barcode scanning - automatically searches for scanned product
	const { scanBarcode, isScanning } = useProductBarcode((product) => {
		// Clear filters and search for this specific product
		setFilters({ search: "", category: "", subcategory: "" });
		setSelectedParentCategory("all");
		setSelectedChildCategory("all");
		setShowArchivedProducts(!product.is_active); // Show archived if product is archived

		// Highlight the found product
		setHighlightedProductId(product.id);

		// Clear highlight after 3 seconds
		setTimeout(() => setHighlightedProductId(null), 3000);

		// Apply filters to show the product
		setTimeout(() => {
			applyFilters(allProducts);
			// Scroll to the highlighted product after filters are applied
			scrollToItem(product.id, {
				dataAttribute: "data-product-id",
				delay: 200,
			});
		}, 100);
	});

	const fetchProducts = async (showArchivedOnly = false) => {
		try {
			setLoading(true);
			// Use new query parameter format for archiving
			const params = {};
			
			if (showArchivedOnly) {
				// When showing archived, use include_archived=only to get only archived products
				params.include_archived = 'only';
			}
			// Default behavior: only active products (handled by backend SoftDeleteManager)
			
			// If we have a modifier context, we need to include all modifiers to see conditional ones
			if (modifierContext) {
				params.include_all_modifiers = true;
			}
			
			const response = await getProducts(params);
			const fetchedProducts = response.data?.results || response.data || [];
			
			// No need for client-side filtering since backend handles it properly now
			setAllProducts(fetchedProducts);
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
			const data = response.data?.results || response.data || [];
			setParentCategories(Array.isArray(data) ? data : []);
		} catch (err) {
			console.error("Failed to fetch parent categories:", err);
		}
	};

	const fetchChildCategories = async (parentId) => {
		try {
			const response = await getCategories({ parent: parentId });
			const data = response.data?.results || response.data || [];
			setChildCategories(Array.isArray(data) ? data : []);
		} catch (err) {
			console.error("Failed to fetch child categories:", err);
			setChildCategories([]);
		}
	};

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

	useEffect(() => {
		fetchProducts(showArchivedProducts);
		fetchParentCategories();
	}, [modifierContext, showArchivedProducts]);

	// This useEffect is now redundant since the above useEffect already handles showArchivedProducts
	// Removing to avoid duplicate fetches

	useEffect(() => {
		// Always clear child categories first to avoid stale data
		setChildCategories([]);
		setSelectedChildCategory("all");
		
		if (selectedParentCategory && selectedParentCategory !== "all") {
			fetchChildCategories(selectedParentCategory);
		}
	}, [selectedParentCategory]);

	const applyFilters = (allProductsToFilter) => {
		let filtered = allProductsToFilter;

		// Modifier filtering - filter by products that use this modifier set
		if (modifierContext && modifierContext.id) {
			filtered = filtered.filter(
				(product) =>
					product.modifier_groups &&
					product.modifier_groups.some(
						(group) => group.id == modifierContext.id
					)
			);
		}

		if (filters.search) {
			const searchLower = filters.search.toLowerCase();
			filtered = filtered.filter(
				(product) =>
					product.name.toLowerCase().includes(searchLower) ||
					(product.description &&
						product.description.toLowerCase().includes(searchLower)) ||
					(product.barcode &&
						product.barcode.toLowerCase().includes(searchLower))
			);
		}

		// Category filtering logic
		if (selectedParentCategory && selectedParentCategory !== "all") {
			if (selectedChildCategory === "parent-only") {
				// Show only products directly assigned to the parent category
				filtered = filtered.filter((product) => {
					const category = product.category;
					return category && category.id === parseInt(selectedParentCategory);
				});
			} else if (selectedChildCategory && selectedChildCategory !== "all") {
				// Show products from specific child category
				filtered = filtered.filter((product) => {
					const category = product.category;
					return category && category.id === parseInt(selectedChildCategory);
				});
			} else {
				// Show all products under parent category (including child categories) - "All Subcategories"
				// This handles the case when selectedChildCategory is "all" or undefined
				filtered = filtered.filter((product) => {
					const category = product.category;
					if (!category) return false;
					
					const selectedParentId = parseInt(selectedParentCategory);
					
					// Include products directly assigned to the parent category
					if (category.id === selectedParentId) {
						return true;
					}
					
					// Include products assigned to child categories of the selected parent
					// Since the product's category doesn't include parent info, we check if this category ID
					// is in our childCategories list (which are children of the selected parent)
					// Only use childCategories if we have them and they're for the current selected parent
					if (childCategories.length > 0) {
						const isChildCategory = childCategories.some(child => child.id === category.id);
						if (isChildCategory) {
							return true;
						}
					}
					
					return false;
				});
			}
		}

		setProducts(filtered);
	};

	useEffect(() => {
		applyFilters(allProducts);
	}, [
		selectedParentCategory,
		selectedChildCategory,
		allProducts,
		modifierContext,
		childCategories,
	]);

	useEffect(() => {
		const timeoutId = setTimeout(() => {
			applyFilters(allProducts);
		}, 300);
		return () => clearTimeout(timeoutId);
	}, [filters.search, allProducts]);

	// Global barcode listener for products page
	useEffect(() => {
		const handleKeyPress = (e) => {
			// Don't capture if user is typing in inputs or dialogs are open
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

	const handleCategoryDialogClose = (dataChanged = false) => {
		setIsCategoryDialogOpen(false);
		// Only refresh if data was actually modified
		if (dataChanged) {
			fetchParentCategories();
			fetchProducts(showArchivedProducts);
		}
	};

	const handleProductTypeDialogClose = (dataChanged = false) => {
		setIsProductTypeDialogOpen(false);
		// Only refresh if data was actually modified
		if (dataChanged) {
			fetchProducts(showArchivedProducts);
		}
	};

	const headers = [
		{ label: "Name" },
		{ label: "Category" },
		{ label: "Price", className: "text-right" },
		{ label: "Actions", className: "text-right" },
	];

	const renderProductRow = (product) => {
		const isHighlighted = highlightedProductId === product.id;
		return (
			<>
				<TableCell
					className={`font-medium ${
						isHighlighted ? "bg-blue-100 font-bold" : ""
					}`}
				>
					{product.name}
				</TableCell>
				<TableCell className={isHighlighted ? "bg-blue-100" : ""}>
					{product.category ? (
						<Badge variant="outline">{product.category.name}</Badge>
					) : (
						<span className="text-muted-foreground">No Category</span>
					)}
				</TableCell>
				<TableCell
					className={`text-right font-medium ${
						isHighlighted ? "bg-blue-100" : ""
					}`}
				>
					{formatCurrency(product.price)}
				</TableCell>
				<TableCell
					onClick={(e) => e.stopPropagation()}
					className={`text-right ${isHighlighted ? "bg-blue-100" : ""}`}
				>
					{(canEditProducts() || canDeleteProducts()) && (
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
								{canEditProducts() && (
									<DropdownMenuItem
										onClick={() => handleEditProduct(product.id)}
									>
										<Edit className="mr-2 h-4 w-4" />
										Edit
									</DropdownMenuItem>
								)}
								{canEditProducts() && canDeleteProducts() && (
									<DropdownMenuSeparator />
								)}
								{canDeleteProducts() && (
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
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</TableCell>
			</>
		);
	};
	const handleClearModifierFilter = () => {
		// Clear URL params to show all products
		setSearchParams({});
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
					{(Array.isArray(parentCategories) ? parentCategories : []).map((category) => (
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

	const handleBackToModifiers = () => {
		// Clear URL params and navigate back to modifier management
		navigate("/products/modifiers");
	};

	const headerActions = (
		<>
			{modifierContext && (
				<Button
					variant="outline"
					size="sm"
					onClick={handleBackToModifiers}
					className="mr-2"
				>
					<FolderOpen className="mr-2 h-4 w-4" />
					Back to Modifier Management
				</Button>
			)}

			<Button
				variant={showArchivedProducts ? "default" : "outline"}
				size="sm"
				onClick={() => setShowArchivedProducts(!showArchivedProducts)}
			>
				{showArchivedProducts ? (
					<ArchiveRestore className="mr-2 h-4 w-4" />
				) : (
					<Archive className="mr-2 h-4 w-4" />
				)}
				{showArchivedProducts ? "Show Active" : "Show Archived"}
			</Button>

			{(canCreateProducts() || canEditProducts()) && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button>
							<Settings className="mr-2 h-4 w-4" />
							Actions
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel>Product Management</DropdownMenuLabel>
						{canCreateProducts() && (
							<DropdownMenuItem onClick={handleCreateProduct}>
								<PlusCircle className="mr-2 h-4 w-4" />
								Add Product
							</DropdownMenuItem>
						)}
						{canCreateProducts() && canEditProducts() && (
							<DropdownMenuSeparator />
						)}
						{canEditProducts() && (
							<DropdownMenuItem onClick={handleManageTypes}>
								<Tags className="mr-2 h-4 w-4" />
								Manage Types
							</DropdownMenuItem>
						)}
						{canEditProducts() && (
							<DropdownMenuItem onClick={handleManageCategories}>
								<FolderOpen className="mr-2 h-4 w-4" />
								Manage Categories
							</DropdownMenuItem>
						)}
						{canEditProducts() && !modifierContext && (
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
					</DropdownMenuContent>
				</DropdownMenu>
			)}
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
					getRowProps={(product) => ({
						"data-product-id": product.id,
					})}
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

			{/* Visual indicator when scanning */}
			{isScanning && (
				<div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center gap-2">
					<div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
					Searching product...
				</div>
			)}
		</>
	);
};

export default ProductsPage;
