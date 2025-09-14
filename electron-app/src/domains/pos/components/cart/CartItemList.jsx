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
			// Handle custom items (no product reference)
			const groupKey = item.product ? item.product.id : `custom_${item.id}`;

			if (!grouped[groupKey]) {
				grouped[groupKey] = {
					baseProduct: item.product,
					items: [],
					isCustom: !item.product
				};
			}
			grouped[groupKey].items.push(item);
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
					{groupedItems.map((group) => {
						// Render custom items individually
						if (group.isCustom) {
							return group.items.map(item => (
								<CartItem key={item.id} item={item} />
							));
						}
						// Render regular product items as grouped
						return (
							<GroupedCartItem
								key={group.baseProduct.id}
								baseProduct={group.baseProduct}
								items={group.items}
							/>
						);
					})}
				</ul>
			</div>
		</div>
	);
};

export default CartItemList;
