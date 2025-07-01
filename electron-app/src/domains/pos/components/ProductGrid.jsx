"use client";

import { useMemo } from "react";
import { usePosStore } from "@/domains/pos/store/posStore";
import ProductFilter from "./ProductFilter";
import { ProductCard } from "./ProductSubcategoryGroup";
import { Package } from "lucide-react";

const ProductGrid = () => {
	const filteredProducts = usePosStore((state) => state.filteredProducts);

	const groupedProducts = useMemo(() => {
		if (!Array.isArray(filteredProducts)) {
			return {};
		}

		const groups = {};

		for (const product of filteredProducts) {
			const directCategory = product.category;

			if (!directCategory) continue;

			if (directCategory.parent_id === null) {
				const parentName = directCategory.name;

				if (!groups[parentName]) {
					groups[parentName] = {
						__direct_products__: [],
					};
				}

				groups[parentName].__direct_products__.push(product);
			} else {
				const subcategoryName = directCategory.name;
				const parentName = directCategory.parent?.name || "Other";

				if (!groups[parentName]) {
					groups[parentName] = {
						__direct_products__: [],
					};
				}

				if (!groups[parentName][subcategoryName]) {
					groups[parentName][subcategoryName] = [];
				}

				groups[parentName][subcategoryName].push(product);
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

	if (
		!Array.isArray(filteredProducts) ||
		(filteredProducts.length === 0 && Object.keys(groupedProducts).length === 0)
	) {
		return (
			<div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl h-full flex flex-col">
				<div className="p-6 border-b border-slate-200 dark:border-slate-700">
					<h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
						Products
					</h2>
				</div>
				<div className="flex-1 flex items-center justify-center">
					<div className="text-center py-12">
						<Package className="h-12 w-12 text-slate-400 mx-auto mb-4" />
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
				<h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">
					Products
				</h2>
				<ProductFilter />
			</div>

			<div className="flex-grow overflow-y-auto p-6">
				{Object.entries(groupedProducts).map(([parentName, subcategories]) => (
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
						{subcategories["__direct_products__"] &&
							subcategories["__direct_products__"].length > 0 && (
								<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-8">
									{subcategories["__direct_products__"].map((product) => (
										<ProductCard
											key={product.id}
											product={product}
										/>
									))}
								</div>
							)}

						{/* Products under subcategories */}
						{Object.entries(subcategories).map(
							([subcategoryName, products]) => {
								if (subcategoryName === "__direct_products__") return null;
								return (
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
												{products.length} items
											</span>
										</div>
										<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
											{products.map((product) => (
												<ProductCard
													key={product.id}
													product={product}
												/>
											))}
										</div>
									</div>
								);
							}
						)}
					</div>
				))}

				{filteredProducts.length === 0 &&
					Object.keys(groupedProducts).length === 0 && (
						<div className="text-center py-12">
							<Package className="h-12 w-12 text-slate-400 mx-auto mb-4" />
							<p className="text-slate-500 dark:text-slate-400 text-lg">
								No products match the current filter.
							</p>
						</div>
					)}
			</div>
		</div>
	);
};

export default ProductGrid;
