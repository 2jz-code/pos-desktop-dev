"use client";

import CartActionsDropdown from "./CartActionsDropdown";
import CustomerInfoInput from "./CustomerInfoInput";
import DiningPreferenceButtons from "./DiningPreferenceButtons";

const CartHeader = () => {
	return (
		<div className="flex-shrink-0 bg-muted/20">
			<div className="p-4 border-b border-border/60 flex justify-between items-center">
				<div>
					<h2 className="text-lg font-semibold text-foreground">
						Current Order
					</h2>
					<p className="text-sm text-muted-foreground">
						Review items before checkout
					</p>
				</div>
				<CartActionsDropdown />
			</div>
			<DiningPreferenceButtons />
			<CustomerInfoInput />
		</div>
	);
};

export default CartHeader;
