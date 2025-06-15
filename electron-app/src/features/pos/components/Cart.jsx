import React from "react";
import CartHeader from "./cart/CartHeader";
import CartItemList from "./cart/CartItemList";
import CartSummary from "./cart/CartSummary";

const Cart = () => {
	return (
		// Added overflow-hidden to contain all children within the rounded border
		<div className="bg-white h-full flex flex-col shadow-lg rounded-lg overflow-hidden">
			<CartHeader />
			<CartItemList />
			<CartSummary />
		</div>
	);
};

export default Cart;
