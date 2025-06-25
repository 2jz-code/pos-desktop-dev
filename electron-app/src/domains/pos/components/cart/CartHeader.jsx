import React from "react";
import CartActionsDropdown from "./CartActionsDropdown";

const CartHeader = () => {
	return (
		// Added flex-shrink-0 to prevent this component from shrinking
		<div className="p-4 border-b flex justify-between items-center flex-shrink-0">
			<div>
				<h2 className="text-xl font-bold">Current Order</h2>
				{/* We can add orderId here later if needed */}
			</div>
			<CartActionsDropdown />
		</div>
	);
};

export default CartHeader;
