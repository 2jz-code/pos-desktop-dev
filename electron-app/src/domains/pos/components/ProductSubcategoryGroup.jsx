"use client";

import { usePosStore } from "@/domains/pos/store/posStore";
import { Loader2 } from "lucide-react";

export const ProductCard = ({ product }) => {
	const { addItem, addingItemId } = usePosStore((state) => ({
		addItem: state.addItem,
		addingItemId: state.addingItemId,
	}));

	const isAdding = addingItemId === product.id;

	return (
		<div
			onClick={() => !isAdding && addItem(product)}
			className={`
        relative group border border-slate-200 dark:border-slate-700 rounded-xl p-4 
        flex flex-col items-center text-center bg-white dark:bg-slate-900
        transition-all duration-200 hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-600
        ${
					isAdding
						? "cursor-not-allowed opacity-75"
						: "cursor-pointer hover:-translate-y-0.5"
				}
      `}
		>
			{/* Loading Overlay */}
			{isAdding && (
				<div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center rounded-xl z-10">
					<div className="flex flex-col items-center gap-2">
						<Loader2 className="h-6 w-6 animate-spin text-slate-600 dark:text-slate-400" />
						<span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
							Adding...
						</span>
					</div>
				</div>
			)}

			<div className="w-20 h-20 mb-3 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
				<img
					src={
						product.image_url ||
						product.image ||
						`https://avatar.vercel.sh/${product.name}.png`
					}
					alt={product.name}
					className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
				/>
			</div>

			<h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100 mb-2 line-clamp-2 min-h-[2.5rem] flex items-center">
				{product.name}
			</h3>

			<div className="mt-auto">
				<p className="text-lg font-bold text-slate-900 dark:text-slate-100">
					${Number.parseFloat(product.price).toFixed(2)}
				</p>
			</div>
		</div>
	);
};

const ProductSubcategoryGroup = ({ subcategoryName, products }) => {
	if (!products || products.length === 0) {
		return null;
	}

	return (
		<div className="mb-8">
			<div className="flex items-center gap-3 mb-4">
				<h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 capitalize">
					{subcategoryName}
				</h3>
				<div className="flex-1 h-px bg-slate-200 dark:bg-slate-700"></div>
				<span className="text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">
					{products.length} items
				</span>
			</div>
			<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
				{products.map((product) => (
					<ProductCard
						key={product.id}
						product={product}
					/>
				))}
			</div>
		</div>
	);
};

export default ProductSubcategoryGroup;
