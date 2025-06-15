import React from "react";
import { usePosStore } from "@/store/posStore";
import { Loader2 } from "lucide-react"; // MODIFICATION: Import loader icon

export const ProductCard = ({ product }) => {
	// Access addItem action and the new addingItemId state
	const { addItem, addingItemId } = usePosStore((state) => ({
		addItem: state.addItem,
		addingItemId: state.addingItemId,
	}));

	const isAdding = addingItemId === product.id;

	return (
		<div
			onClick={() => !isAdding && addItem(product)} // MODIFICATION: Prevent clicks while adding
			className={`border rounded-lg p-4 flex flex-col items-center text-center shadow hover:shadow-lg transition-shadow relative ${
				isAdding
					? "cursor-not-allowed bg-gray-100"
					: "cursor-pointer hover:bg-gray-50"
			}`} // MODIFICATION: Add classes for loading state
		>
			{/* MODIFICATION: Loading Overlay */}
			{isAdding && (
				<div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center rounded-lg z-10">
					<Loader2 className="h-8 w-8 animate-spin text-blue-500" />
				</div>
			)}

			<img
				src={product.image || `https://avatar.vercel.sh/${product.name}.png`}
				alt={product.name}
				className="w-24 h-24 object-cover mb-2 rounded-md"
			/>
			<h3 className="font-semibold text-sm h-10">{product.name}</h3>
			<p className="text-lg font-bold my-2">
				${parseFloat(product.price).toFixed(2)}
			</p>
		</div>
	);
};

const ProductSubcategoryGroup = ({ subcategoryName, products }) => {
	if (!products || products.length === 0) {
		return null;
	}

	return (
		<div className="mb-8">
			<h3 className="text-xl font-bold mb-4 capitalize border-b pb-2">
				{subcategoryName}
			</h3>
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
