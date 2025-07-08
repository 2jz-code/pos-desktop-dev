import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
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
import { useProductBarcode } from "@/shared/hooks";

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
		}, 100);
	});

	const fetchProducts = async (includeArchived = false) => {
		try {
			setLoading(true);
			// Pass is_active parameter based on what products we want to show
			const params = { is_active: !includeArchived };
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
			const response = await getCategories({ parent_only: true });
			setParentCategories(response.data || []);
		} catch (err) {
			console.error("Failed to fetch parent categories:", err);
		}
	};

	const fetchChildCategories = async (parentId) => {
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
	}, []);

	// Re-fetch products when switching between active and archived
	useEffect(() => {
		fetchProducts(showArchivedProducts);
	}, [showArchivedProducts]);

	useEffect(() => {
		if (selectedParentCategory && selectedParentCategory !== "all") {
			fetchChildCategories(selectedParentCategory);
		} else {
			setChildCategories([]);
			setSelectedChildCategory("all");
		}
	}, [selectedParentCategory]);

	const applyFilters = (allProductsToFilter) => {
		let filtered = allProductsToFilter;

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
		if (
			selectedChildCategory &&
			selectedChildCategory !== "all" &&
			selectedChildCategory !== "parent-only"
		) {
			// Show products from specific child category
			filtered = filtered.filter((product) => {
				const category = product.category;
				return category && category.id === parseInt(selectedChildCategory);
			});
		} else if (
			selectedChildCategory === "parent-only" &&
			selectedParentCategory &&
			selectedParentCategory !== "all"
		) {
			// Show only products directly assigned to the parent category
			filtered = filtered.filter((product) => {
				const category = product.category;
				return category && category.id === parseInt(selectedParentCategory);
			});
		} else if (selectedParentCategory && selectedParentCategory !== "all") {
			// Show all products under parent category (including child categories) - "All Subcategories"
			filtered = filtered.filter((product) => {
				const category = product.category;
				if (!category) return false;
				if (category.id === parseInt(selectedParentCategory)) return true;

				const parentId = category.parent_id ?? category.parent?.id;
				return parentId === parseInt(selectedParentCategory);
			});
		}

		setProducts(filtered);
	};

	useEffect(() => {
		applyFilters(allProducts);
	}, [selectedParentCategory, selectedChildCategory, allProducts]);

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
		const isHighlighted = highlightedProductId === product.id;
		return (
			<>
				<TableCell
					className={`font-medium ${
						isHighlighted ? "bg-blue-100 font-bold" : ""
					}`}
				>
					{product.name}
					{isHighlighted && (
						<Badge
							variant="default"
							className="ml-2 bg-blue-500"
						>
							Scanned
						</Badge>
					)}
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
		</>
	);

	const headerActions = (
		<>
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

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button>
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
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);

	return (
		<>
			<DomainPageLayout
				title={showArchivedProducts ? "Archived Products" : "Active Products"}
				description="Manage your product catalog"
				headerActions={headerActions}
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
