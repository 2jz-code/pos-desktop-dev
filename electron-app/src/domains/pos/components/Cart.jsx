"use client";

import CartHeader from "./cart/CartHeader";
import CartItemList from "./cart/CartItemList";
import CartSummary from "./cart/CartSummary";

const Cart = () => {
	return (
		<div className="bg-white dark:bg-slate-900 h-full flex flex-col border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
			<CartHeader />
			<CartItemList />
			<CartSummary />
		</div>
	);
};

export default Cart;
