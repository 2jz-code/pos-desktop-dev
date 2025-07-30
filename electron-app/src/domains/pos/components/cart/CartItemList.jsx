"use client";

import { usePosStore } from "@/domains/pos/store/posStore";
import CartItem from "./CartItem";
import GroupedCartItem from "./GroupedCartItem";
import { ShoppingCart } from "lucide-react";

const CartItemList = () => {
	const items = usePosStore((state) => state.items);

	// Helper function to group items by product
	const groupItemsByProduct = (items) => {
		const grouped = {};
		
		items.forEach(item => {
			const productId = item.product.id;
			if (!grouped[productId]) {
				grouped[productId] = {
					baseProduct: item.product,
					items: []
				};
			}
			grouped[productId].items.push(item);
		});
		
		return Object.values(grouped);
	};

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

	const groupedItems = groupItemsByProduct(items);

	return (
		<div className="flex-grow overflow-y-auto">
			<div className="p-3">
				<ul className="space-y-1">
					{groupedItems.map((group) => (
						<GroupedCartItem
							key={group.baseProduct.id}
							baseProduct={group.baseProduct}
							items={group.items}
						/>
					))}
				</ul>
			</div>
		</div>
	);
};

export default CartItemList;
