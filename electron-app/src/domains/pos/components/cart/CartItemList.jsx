// desktop-combined/electron-app/src/features/pos/components/cart/CartItemList.jsx

import React from "react";
import { usePosStore } from "@/domains/pos/store/posStore"; // Corrected usePosStore to usePosStore for consistency
import CartItem from "./CartItem";

const CartItemList = () => {
	const items = usePosStore((state) => state.items);

	if (items.length === 0) {
		return (
			<div className="flex-grow p-4 overflow-y-auto">
				<p className="text-gray-500 text-center mt-8">Cart is empty.</p>
			</div>
		);
	}

	return (
		<div className="flex-grow p-4 overflow-y-auto">
			<ul className="divide-y divide-gray-200">
				{items.map((item) => (
					<CartItem
						key={item.id}
						item={item}
					/>
				))}
			</ul>
		</div>
	);
};

export default CartItemList;
