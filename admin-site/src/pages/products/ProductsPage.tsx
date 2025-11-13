import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
	archiveProduct,
	unarchiveProduct,
} from "@/services/api/productService";
import { getCategories } from "@/services/api/categoryService";
import { getProductTypes } from "@/services/api/productTypeService";
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
	Package,
} from "lucide-react";
import { DomainPageLayout } from "@/components/shared/DomainPageLayout";
import { StandardTable } from "@/components/shared/StandardTable";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency, useScrollToScannedItem, useProductsData } from "@ajeen/ui";
import { useProductBarcodeWithScroll } from "@/hooks/useBarcode";
import { useAuth } from "@/contexts/AuthContext";
import productService from "@/services/api/productService";
import { PaginationControls } from "@/components/ui/pagination";

// Import dialog components
import { ProductFormDialog } from "@/components/ProductFormDialog";
import { CategoryManagementDialog } from "@/components/CategoryManagementDialog";
import { ProductTypeManagementDialog } from "@/components/ProductTypeManagementDialog";
import { BulkActionsToolbar } from "@/components/products/BulkActionsToolbar";
import { Checkbox } from "@/components/ui/checkbox";

export const ProductsPage = () => {
	const { tenant } = useAuth();
	const tenantSlug = tenant?.slug || '';

	// Category and product type selection state (for UI)
	const [parentCategories, setParentCategories] = useState([]);
	const [childCategories, setChildCategories] = useState([]);
	const [selectedParentCategory, setSelectedParentCategory] = useState("all");
	const [selectedChildCategory, setSelectedChildCategory] = useState("all");
	const [selectedProductType, setSelectedProductType] = useState("all");
	const [showArchivedProducts, setShowArchivedProducts] = useState(false);

	// Modifier context from URL params
	const [modifierContext, setModifierContext] = useState<{
		id: string | null;
		name: string | null;
	} | null>(null);

	// Build additional filters for the hook
	const additionalFilters = {
		// Send category ID to backend (it handles descendants automatically)
		category: selectedChildCategory !== "all" && selectedChildCategory !== "parent-only"
			? selectedChildCategory
			: selectedChildCategory === "parent-only" && selectedParentCategory !== "all"
			? selectedParentCategory
			: selectedParentCategory !== "all" && selectedParentCategory !== "uncategorized"
			? selectedParentCategory
			: "",
		product_type: selectedProductType !== "all" ? selectedProductType : "",
		include_archived: showArchivedProducts ? "only" : undefined,
		modifier_groups: modifierContext?.id || "",
	};

	// Use the products data hook for pagination and filtering
	const {
		products,
		loading,
		error,
		nextUrl,
		prevUrl,
		count,
		currentPage,
		searchInput,
		handleSearchChange,
		handleNavigate,
		refetch,
	} = useProductsData({
		getProductsService: productService.getProductsWithPagination,
		additionalFilters,
	});

	// Dialog states
	const [isProductFormOpen, setIsProductFormOpen] = useState(false);
	const [editingProductId, setEditingProductId] = useState(null);

	// Bulk selection state
	const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
	const [productTypes, setProductTypes] = useState([]);

	// Barcode scanning refs and state
	const barcodeInputRef = useRef("");
	const lastKeystrokeRef = useRef(0);
	const [highlightedProductId, setHighlightedProductId] = useState(null);
	const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
	const [isProductTypeDialogOpen, setIsProductTypeDialogOpen] = useState(false);

	const navigate = useNavigate();
	const { toast } = useToast();
	const [searchParams, setSearchParams] = useSearchParams();

	// Scroll to scanned item functionality
	const { scrollToItem } = useScrollToScannedItem();

	// Smart barcode scanning
	const { scanBarcode, isScanning } = useProductBarcodeWithScroll((product) => {
		// Clear filters and set archived status based on scanned product
		setSelectedParentCategory("all");
		setSelectedChildCategory("all");
		setShowArchivedProducts(!product.is_active);

		setHighlightedProductId(product.id);
		setTimeout(() => setHighlightedProductId(null), 3000);

		// Scroll to the product after a short delay
		setTimeout(() => {
			scrollToItem(product.id, {
				dataAttribute: "data-product-id",
				delay: 200,
			});
		}, 300);
	}, (productId) => {
		scrollToItem(productId, {
			dataAttribute: "data-product-id",
			delay: 200,
		});
	});

	const fetchParentCategories = async () => {
		try {
			const response = await getCategories({ parent: "null" });
			const data = response.data?.results || response.data || [];
			setParentCategories(Array.isArray(data) ? data : []);
		} catch (err) {
			console.error("Failed to fetch parent categories:", err);
		}
	};

	const fetchChildCategories = async (parentId: string) => {
		try {
			const response = await getCategories({ parent: parentId });
			const data = response.data?.results || response.data || [];
			setChildCategories(Array.isArray(data) ? data : []);
		} catch (err) {
			console.error("Failed to fetch child categories:", err);
			setChildCategories([]);
		}
	};

	const fetchProductTypes = async () => {
		try {
			const response = await getProductTypes();
			const data = response.data;
			setProductTypes(data?.results || data || []);
		} catch (err) {
			console.error("Failed to fetch product types:", err);
		}
	};

	useEffect(() => {
		fetchParentCategories();
		fetchProductTypes();
	}, []);

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
		// Always clear child categories first to avoid stale data
		setChildCategories([]);
		setSelectedChildCategory("all");
		
		if (selectedParentCategory && selectedParentCategory !== "all" && selectedParentCategory !== "uncategorized") {
			fetchChildCategories(selectedParentCategory);
		}
	}, [selectedParentCategory]);

	// Global barcode listener
	useEffect(() => {
		const handleKeyPress = (e: KeyboardEvent) => {
			if (
				(e.target as HTMLElement).tagName === "INPUT" ||
				(e.target as HTMLElement).tagName === "TEXTAREA" ||
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

	const handleClearModifierFilter = () => {
		// Clear URL params to show all products
		setSearchParams({});
	};

	const handleBackToModifiers = () => {
		// Clear URL params and navigate back to modifier management
		navigate(`/${tenantSlug}/products/modifiers`);
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
			refetch();
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
		refetch();
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
			refetch();
		}
	};

	const handleProductTypeDialogClose = (dataChanged = false) => {
		setIsProductTypeDialogOpen(false);
		// Only refresh if data was actually modified
		if (dataChanged) {
			refetch();
		}
	};

	// Bulk selection handlers
	const handleSelectProduct = (productId: number, checked: boolean) => {
		if (checked) {
			setSelectedProductIds((prev) => [...prev, productId]);
		} else {
			setSelectedProductIds((prev) => prev.filter((id) => id !== productId));
		}
	};

	const handleSelectAll = (checked: boolean) => {
		if (checked) {
			setSelectedProductIds(products.map((p) => p.id));
		} else {
			setSelectedProductIds([]);
		}
	};

	const handleClearSelection = () => {
		setSelectedProductIds([]);
	};

	const headers = [
		{
			label: (
				<Checkbox
					checked={selectedProductIds.length === products.length && products.length > 0}
					onCheckedChange={handleSelectAll}
				/>
			),
			className: "w-12 pl-6",
		},
		{ label: "Product", className: "w-[300px]" },
		{ label: "Category", className: "w-[180px]" },
		{ label: "Type", className: "w-[140px]" },
		{ label: "Price", className: "text-right w-[120px]" },
		{ label: "Status", className: "w-[100px]" },
		{ label: "", className: "text-right pr-6 w-[80px]" },
	];

	const renderProductRow = (product) => {
		const isSelected = selectedProductIds.includes(product.id);
		const statusDotColor = product.is_active ? "bg-emerald-500" : "bg-gray-500";

		return (
			<>
				{/* Checkbox */}
				<TableCell onClick={(e) => e.stopPropagation()} className="pl-6">
					<Checkbox
						checked={isSelected}
						onCheckedChange={(checked) => handleSelectProduct(product.id, checked as boolean)}
					/>
				</TableCell>

				{/* Product with Image & Name */}
				<TableCell className="py-3">
					<div className="flex items-center gap-3">
						{/* Product Thumbnail */}
						<div className="w-12 h-12 rounded-lg bg-muted flex-shrink-0 overflow-hidden">
							{product.image ? (
								<img
									src={product.image}
									alt={product.name}
									className="w-full h-full object-cover"
								/>
							) : (
								<div className="w-full h-full flex items-center justify-center">
									<Package className="h-5 w-5 text-muted-foreground" />
								</div>
							)}
						</div>
						{/* Product Info */}
						<div className="flex flex-col gap-0.5 min-w-0">
							<span className="text-base font-bold text-foreground truncate">
								{product.name}
							</span>
							{product.barcode && (
								<span className="text-xs text-muted-foreground font-mono">
									{product.barcode}
								</span>
							)}
						</div>
					</div>
				</TableCell>

				{/* Category */}
				<TableCell className="py-3">
					<Badge variant={product.category ? "outline" : "secondary"} className="text-xs">
						{product.category_display_name || product.category?.name || "Uncategorized"}
					</Badge>
				</TableCell>

				{/* Product Type */}
				<TableCell className="py-3">
					<Badge variant={product.product_type ? "default" : "secondary"} className="text-xs font-medium">
						{product.product_type?.name || "No Type"}
					</Badge>
				</TableCell>

				{/* Price - PROMINENT */}
				<TableCell className="text-right py-3">
					<span className="text-base font-bold text-foreground">
						{formatCurrency(product.price)}
					</span>
				</TableCell>

				{/* Status with Dot */}
				<TableCell className="py-3">
					<div className="flex items-center gap-2">
						<div className={`h-2 w-2 rounded-full ${statusDotColor}`} />
						<span className="text-xs font-medium text-muted-foreground">
							{product.is_active ? "Active" : "Archived"}
						</span>
					</div>
				</TableCell>

				{/* Actions */}
				<TableCell
					onClick={(e) => e.stopPropagation()}
					className="text-right pr-6"
				>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="h-8 w-8"
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
		<div className="flex items-center gap-2 flex-wrap">
			<Select
				value={selectedParentCategory}
				onValueChange={setSelectedParentCategory}
			>
				<SelectTrigger className="w-[180px]">
					<SelectValue placeholder="Filter by Category" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Categories</SelectItem>
					<SelectItem value="uncategorized">Uncategorized</SelectItem>
					{parentCategories && Array.isArray(parentCategories) && parentCategories.map((category) => (
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
				selectedParentCategory !== "uncategorized" &&
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
			<Select
				value={selectedProductType}
				onValueChange={setSelectedProductType}
			>
				<SelectTrigger className="w-[180px]">
					<SelectValue placeholder="Filter by Product Type" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All Product Types</SelectItem>
					{productTypes && Array.isArray(productTypes) && productTypes.map((type) => (
						<SelectItem
							key={type.id}
							value={type.id.toString()}
						>
							{type.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{modifierContext && (
				<Button
					variant="outline"
					size="sm"
					onClick={handleClearModifierFilter}
				>
					<Tags className="mr-2 h-4 w-4" />
					Show All Products
				</Button>
			)}
		</div>
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
					<DropdownMenuItem onClick={() => navigate(`/${tenantSlug}/products/modifiers`)}>
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
				searchValue={searchInput}
				onSearchChange={handleSearchChange}
				filterControls={filterControls}
				error={error}
			>
				{selectedProductIds.length > 0 && (
					<BulkActionsToolbar
						selectedCount={selectedProductIds.length}
						selectedProductIds={selectedProductIds}
						onClear={handleClearSelection}
						onSuccess={() => {
							refetch();
							setSelectedProductIds([]);
						}}
						categories={parentCategories}
						productTypes={productTypes}
						loading={loading}
					/>
				)}

				<StandardTable
					headers={headers}
					data={products}
					loading={loading}
					emptyMessage={
						showArchivedProducts
							? "No archived products found."
							: "No active products found for the selected filters."
					}
					onRowClick={(product) => navigate(`/${tenantSlug}/products/${product.id}`)}
					renderRow={renderProductRow}
					getRowProps={(product) => ({
						"data-product-id": product.id,
					})}
					highlightedItemId={highlightedProductId}
					itemIdKey="id"
					colSpan={7}
					className="border-0"
				/>

				<PaginationControls
					prevUrl={prevUrl}
					nextUrl={nextUrl}
					onNavigate={handleNavigate}
					count={count}
					currentPage={currentPage}
					pageSize={25}
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
