"use client";

import { usePosStore } from "@/domains/pos/store/posStore";
import CartItem from "./CartItem";
import { ShoppingCart } from "lucide-react";

const CartItemList = () => {
	const items = usePosStore((state) => state.items);

	if (items.length === 0) {
		return (
			<div className="flex-grow flex items-center justify-center p-8">
				<div className="text-center">
					<ShoppingCart className="h-12 w-12 text-slate-400 mx-auto mb-4" />
					<p className="text-slate-500 dark:text-slate-400 text-lg">
						Cart is empty
					</p>
					<p className="text-slate-400 dark:text-slate-500 text-sm mt-1">
						Add products to get started
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex-grow overflow-y-auto">
			<div className="p-4">
				<ul className="space-y-2">
					{items.map((item) => (
						<CartItem
							key={item.id}
							item={item}
						/>
					))}
				</ul>
			</div>
		</div>
	);
};

export default CartItemList;
