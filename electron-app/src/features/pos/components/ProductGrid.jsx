// desktop-combined/electron-app/src/features/pos/components/ProductGrid.jsx

import React from "react";
import { usePosStore } from "@/store/posStore"; // Corrected usePosStore to usePosStore for consistency
import ProductFilter from "./ProductFilter";
import { ProductCard } from "./ProductSubcategoryGroup";

const ProductGrid = () => {
	const filteredProducts = usePosStore((state) => state.filteredProducts);

	// Debug logging
	console.log(
		"🎨 ProductGrid - filteredProducts:",
		filteredProducts?.length || 0
	);
	console.log("🎨 ProductGrid - First product sample:", filteredProducts?.[0]);

	const groupedProducts = React.useMemo(() => {
		if (!Array.isArray(filteredProducts)) {
			return {};
		}

		const groups = {};

		for (const product of filteredProducts) {
			// FIXED: Use the actual category structure from the backend
			// product.category is the direct category, which could be parent or child
			const directCategory = product.category;

			if (!directCategory) continue;

			// If this category has no parent (parent_id is null), it's a parent category
			if (directCategory.parent_id === null) {
				// This is a parent category product
				const parentName = directCategory.name;

				if (!groups[parentName]) {
					groups[parentName] = {
						__direct_products__: [],
					};
				}

				groups[parentName].__direct_products__.push(product);
			} else {
				// This is a subcategory product - we need the parent category name
				// The parent info should be available in directCategory.parent if properly populated
				// Otherwise we need to find the parent category name
				const subcategoryName = directCategory.name;

				// For now, let's try to get parent name from the category structure
				// This assumes the backend includes parent info in the category object
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

		// Clean up empty direct products arrays
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
			<div className="text-center py-10 text-gray-500">
				Loading products or no products found...
			</div>
		);
	}

	return (
		<div className="bg-white p-4 rounded-lg shadow-lg h-full flex flex-col">
			<div className="flex-shrink-0">
				<h2 className="text-2xl font-bold mb-4">Products</h2>
				<ProductFilter />
			</div>
			<div className="flex-grow overflow-y-auto pr-2">
				{Object.entries(groupedProducts).map(([parentName, subcategories]) => (
					<div
						key={parentName}
						className="mb-8"
					>
						<h2 className="text-2xl font-bold mb-4 border-b pb-2 capitalize">
							{parentName}
						</h2>

						{/* Render products directly under the parent category */}
						{subcategories["__direct_products__"] &&
							subcategories["__direct_products__"].length > 0 && (
								<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-6">
									{subcategories["__direct_products__"].map((product) => (
										<ProductCard
											key={product.id}
											product={product}
										/>
									))}
								</div>
							)}

						{/* Render products under their respective subcategories */}
						{Object.entries(subcategories).map(
							([subcategoryName, products]) => {
								if (subcategoryName === "__direct_products__") return null;
								return (
									<div key={subcategoryName}>
										<h3 className="text-xl font-semibold mb-4 capitalize">
											{subcategoryName}
										</h3>
										<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-6">
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
					Object.keys(groupedProducts).length === 0 && ( // Added condition for no items found
						<div className="text-center py-10">
							<p className="text-gray-500">
								No products match the current filter.
							</p>
						</div>
					)}
			</div>
		</div>
	);
};

export default ProductGrid;
