"use client";

import CartHeader from "./cart/CartHeader";
import CartItemList from "./cart/CartItemList";
import CartSummary from "./cart/CartSummary";

const Cart = () => {
	return (
		<div className="bg-card h-full flex flex-col border border-border/60 rounded-xl overflow-hidden shadow-sm">
			<CartHeader />
			<CartItemList />
			<CartSummary />
		</div>
	);
};

export default Cart;
