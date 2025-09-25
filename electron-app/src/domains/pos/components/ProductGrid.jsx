"use client";

import { useMemo, useRef, forwardRef, useState } from "react";
import { usePosStore } from "@/domains/pos/store/posStore";
import ProductFilter from "./ProductFilter";
import { ProductCard } from "./ProductSubcategoryGroup";
import { Package, Search, X, Plus } from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { CustomItemDialog } from "./CustomItemDialog";

const ProductGrid = forwardRef((props, ref) => {
	const { filteredProducts, isLoadingProducts, searchTerm, applyFilter, addCustomItem } = usePosStore((state) => ({
		filteredProducts: state.filteredProducts,
		isLoadingProducts: state.isLoadingProducts,
		searchTerm: state.searchTerm,
		applyFilter: state.applyFilter,
		addCustomItem: state.addCustomItem,
	}));

	const searchInputRef = useRef(null);
	const [showCustomItemDialog, setShowCustomItemDialog] = useState(false);

	// Expose the search input ref to parent components
	if (ref) {
		ref.current = {
			searchInputRef: searchInputRef,
			setSearchValue: (value) => {
				if (searchInputRef.current) {
					searchInputRef.current.value = value;
					applyFilter({ searchTerm: value });
				}
			}
		};
	}

	const handleSearchChange = (e) => {
		const value = e.target.value;
		applyFilter({ searchTerm: value });
	};

	const clearSearch = () => {
		applyFilter({ searchTerm: "" });
		if (searchInputRef.current) {
			searchInputRef.current.focus();
		}
	};

	const handleAddCustomItem = (customItemData) => {
		addCustomItem(customItemData);
		setShowCustomItemDialog(false);
	};

	const groupedProducts = useMemo(() => {
		if (!Array.isArray(filteredProducts)) {
			return {};
		}

		const groups = {};

		for (const product of filteredProducts) {
			const directCategory = product.category;

			if (!directCategory) continue;

			const categoryOrder = directCategory.order || 0;
			const parentOrder = directCategory.parent?.order || 0;

			// Check if this is a parent category (no parent) or child category (has parent)
			if (!directCategory.parent) {
				// This is a parent category - product is directly under parent
				const parentName = directCategory.name;

				if (!groups[parentName]) {
					groups[parentName] = {
						__direct_products__: [],
						order: categoryOrder,
						subcategories: {},
					};
				}

				groups[parentName].__direct_products__.push(product);
			} else {
				// This is a child category - product is under a subcategory
				const subcategoryName = directCategory.name;
				const parentName = directCategory.parent?.name || "Other";

				if (!groups[parentName]) {
					groups[parentName] = {
						__direct_products__: [],
						order: parentOrder,
						subcategories: {},
					};
				}

				if (!groups[parentName].subcategories[subcategoryName]) {
					groups[parentName].subcategories[subcategoryName] = {
						products: [],
						order: categoryOrder,
					};
				}

				groups[parentName].subcategories[subcategoryName].products.push(product);
			}
		}

		for (const parentName in groups) {
			if (
				groups[parentName].__direct_products__ &&
				groups[parentName].__direct_products__.length === 0
			) {
				delete groups[parentName].__direct_products__;
			}
		}

		return groups;
	}, [filteredProducts]);

	// Show loading state only when actually loading
	if (isLoadingProducts) {
		return (
			<div className="bg-card border border-border/60 rounded-xl h-full flex flex-col">
				<div className="p-6 border-b border-border/60">
					<h2 className="text-xl font-semibold text-foreground">
						Products
					</h2>
				</div>
				<div className="flex-1 flex items-center justify-center">
					<div className="text-center py-12">
						<div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-blue-600 mx-auto mb-4" />
						<p className="text-muted-foreground text-lg">
							Loading products...
						</p>
					</div>
				</div>
			</div>
		);
	}


	return (
		<div className="bg-card border border-border/60 rounded-xl h-full flex flex-col shadow-sm">
			<div className="p-6 border-b border-border/60 flex-shrink-0">
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-xl font-semibold text-foreground">
						Products
					</h2>
					<div className="flex items-center gap-2">
						<Button
							onClick={() => setShowCustomItemDialog(true)}
							variant="outline"
							size="sm"
							className="border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20"
						>
							<Plus className="h-4 w-4 mr-2" />
							Custom Item
						</Button>
						<div className="relative">
							<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<Input
								ref={searchInputRef}
								type="text"
								placeholder="Search products..."
								value={searchTerm}
								onChange={handleSearchChange}
								className="pl-9 pr-9 w-64 border-border/60 bg-card hover:border-border transition-colors"
							/>
							{searchTerm && (
								<Button
									variant="ghost"
									size="sm"
									onClick={clearSearch}
									className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-muted/40"
								>
									<X className="h-3 w-3" />
								</Button>
							)}
						</div>
					</div>
				</div>
				<ProductFilter />
			</div>

			<div className="flex-grow overflow-y-auto p-6">
				{Object.entries(groupedProducts)
				.sort(([, a], [, b]) => a.order - b.order)
				.map(([parentName, parentGroup]) => (
					<div
						key={parentName}
						className="mb-10 last:mb-0"
					>
						<div className="flex items-center gap-3 mb-6">
							<h2 className="text-xl font-bold text-foreground capitalize">
								{parentName}
							</h2>
							<div className="flex-1 h-px bg-border/60"></div>
						</div>

						{/* Direct products under parent category */}
						{parentGroup["__direct_products__"] &&
							parentGroup["__direct_products__"].length > 0 && (
								<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-8">
									{parentGroup["__direct_products__"].map((product) => (
										<ProductCard
											key={product.id}
											product={product}
										/>
									))}
								</div>
							)}

						{/* Products under subcategories */}
						{Object.entries(parentGroup.subcategories)
							.sort(([, a], [, b]) => a.order - b.order)
							.map(([subcategoryName, subcategoryGroup]) => (
								<div
									key={subcategoryName}
									className="mb-8"
								>
									<div className="flex items-center gap-3 mb-4">
										<h3 className="text-lg font-semibold text-foreground/80 capitalize">
												{subcategoryName}
										</h3>
										<div className="flex-1 h-px bg-border/60"></div>
										<span className="text-sm text-muted-foreground bg-muted/40 px-2 py-1 rounded-full">
												{subcategoryGroup.products.length} items
										</span>
									</div>
									<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
										{subcategoryGroup.products.map((product) => (
											<ProductCard
												key={product.id}
												product={product}
											/>
										))}
									</div>
								</div>
							))}
					</div>
				))}

				{(!Array.isArray(filteredProducts) || filteredProducts.length === 0) &&
					Object.keys(groupedProducts).length === 0 && (
						<div className="text-center py-12">
							<Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
							<p className="text-muted-foreground text-lg">
								{searchTerm ? `No products found for "${searchTerm}"` : "No products match the current filter."}
							</p>
						</div>
					)}
			</div>

			{/* Custom Item Dialog */}
			<CustomItemDialog
				open={showCustomItemDialog}
				onClose={() => setShowCustomItemDialog(false)}
				onAdd={handleAddCustomItem}
			/>
		</div>
	);
});

ProductGrid.displayName = "ProductGrid";

export default ProductGrid;
