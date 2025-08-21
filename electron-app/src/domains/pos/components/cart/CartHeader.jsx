"use client";

import CartActionsDropdown from "./CartActionsDropdown";
import CustomerInfoInput from "./CustomerInfoInput";

const CartHeader = () => {
	return (
		<div className="flex-shrink-0 bg-slate-50 dark:bg-slate-800/50">
			<div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
				<div>
					<h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
						Current Order
					</h2>
					<p className="text-sm text-slate-600 dark:text-slate-400">
						Review items before checkout
					</p>
				</div>
				<CartActionsDropdown />
			</div>
			<CustomerInfoInput />
		</div>
	);
};

export default CartHeader;
