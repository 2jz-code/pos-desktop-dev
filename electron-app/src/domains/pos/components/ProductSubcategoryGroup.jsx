"use client";

import { useState } from "react";
import { usePosStore } from "@/domains/pos/store/posStore";
import ProductModifierSelector from "./ProductModifierSelector";
import { Loader2 } from "lucide-react";

export const ProductCard = ({ product }) => {
	const [showModifierSelector, setShowModifierSelector] = useState(false);
	
	const { addItem, addItemWithModifiers, addingItemId } = usePosStore((state) => ({
		addItem: state.addItem,
		addItemWithModifiers: state.addItemWithModifiers,
		addingItemId: state.addingItemId,
	}));

	const isAdding = addingItemId === product.id;
	const hasModifiers = product.has_modifiers || (product.modifier_groups && product.modifier_groups.length > 0);

	const handleProductClick = () => {
		if (isAdding) return;
		
		if (hasModifiers) {
			setShowModifierSelector(true);
		} else {
			addItem(product);
		}
	};

	const handleAddToCart = (itemData) => {
		if (addItemWithModifiers) {
			addItemWithModifiers(itemData);
		} else {
			// Fallback to regular addItem if addItemWithModifiers doesn't exist yet
			addItem(product);
		}
	};

	return (
		<>
		<div
			onClick={handleProductClick}
			className={`
        relative group border border-border/60 rounded-xl p-4
        flex flex-col items-center text-center bg-card
        transition-all duration-200 hover:shadow-lg hover:border-border
        ${
					isAdding
						? "cursor-not-allowed opacity-75"
						: "cursor-pointer hover:-translate-y-0.5"
				}
      `}
		>
			{/* Loading Overlay */}
			{isAdding && (
				<div className="absolute inset-0 bg-card/80 backdrop-blur-sm flex items-center justify-center rounded-xl z-10">
					<div className="flex flex-col items-center gap-2">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
						<span className="text-xs text-muted-foreground font-medium">
							Adding...
						</span>
					</div>
				</div>
			)}

			<div className="w-20 h-20 mb-3 rounded-lg overflow-hidden bg-muted/40 flex items-center justify-center">
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

			<h3 className="font-semibold text-sm text-foreground mb-2 line-clamp-2 min-h-[2.5rem] flex items-center">
				{product.name}
			</h3>

			<div className="mt-auto">
				<p className="text-lg font-bold text-foreground">
					${Number.parseFloat(product.price).toFixed(2)}
				</p>
				{hasModifiers && (
					<p className="text-xs text-muted-foreground mt-1">
						Customizable
					</p>
				)}
			</div>
		</div>
		
		<ProductModifierSelector
			product={product}
			open={showModifierSelector}
			onOpenChange={setShowModifierSelector}
			onAddToCart={handleAddToCart}
		/>
		</>
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
