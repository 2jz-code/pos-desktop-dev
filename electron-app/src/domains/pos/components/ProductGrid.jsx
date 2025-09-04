"use client";

import { useMemo, useRef, forwardRef } from "react";
import { usePosStore } from "@/domains/pos/store/posStore";
import ProductFilter from "./ProductFilter";
import { ProductCard } from "./ProductSubcategoryGroup";
import { Package, Search, X } from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";

const ProductGrid = forwardRef((props, ref) => {
	const { filteredProducts, isLoadingProducts, searchTerm, applyFilter } = usePosStore((state) => ({
		filteredProducts: state.filteredProducts,
		isLoadingProducts: state.isLoadingProducts,
		searchTerm: state.searchTerm,
		applyFilter: state.applyFilter,
	}));

	const searchInputRef = useRef(null);

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
			<div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl h-full flex flex-col">
				<div className="p-6 border-b border-slate-200 dark:border-slate-700">
					<h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
						Products
					</h2>
				</div>
				<div className="flex-1 flex items-center justify-center">
					<div className="text-center py-12">
						<div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-blue-600 mx-auto mb-4" />
						<p className="text-slate-500 dark:text-slate-400 text-lg">
							Loading products...
						</p>
					</div>
				</div>
			</div>
		);
	}


	return (
		<div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl h-full flex flex-col shadow-sm">
			<div className="p-6 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
						Products
					</h2>
					<div className="relative">
						<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
						<Input
							ref={searchInputRef}
							type="text"
							placeholder="Search products..."
							value={searchTerm}
							onChange={handleSearchChange}
							className="pl-9 pr-9 w-64 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
						/>
						{searchTerm && (
							<Button
								variant="ghost"
								size="sm"
								onClick={clearSearch}
								className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-slate-100 dark:hover:bg-slate-800"
							>
								<X className="h-3 w-3" />
							</Button>
						)}
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
							<h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 capitalize">
								{parentName}
							</h2>
							<div className="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
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
										<h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 capitalize">
												{subcategoryName}
										</h3>
										<div className="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
										<span className="text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">
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
							<Package className="h-12 w-12 text-slate-400 mx-auto mb-4" />
							<p className="text-slate-500 dark:text-slate-400 text-lg">
								{searchTerm ? `No products found for "${searchTerm}"` : "No products match the current filter."}
							</p>
						</div>
					)}
			</div>
		</div>
	);
});

ProductGrid.displayName = "ProductGrid";

export default ProductGrid;
