// desktop-combined/electron-app/src/features/pos/components/cart/CartActionsDropdown.jsx

import React from "react";
import { usePosStore } from "@/store/posStore"; // Corrected usePosStore to usePosStore
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Trash2, PauseCircle } from "lucide-react";
import { shallow } from "zustand/shallow"; // Re-add shallow if used for optimization in selector

const CartActionsDropdown = () => {
	const { clearCart, holdOrder, items } = usePosStore(
		(state) => ({
			clearCart: state.clearCart,
			holdOrder: state.holdOrder,
			items: state.items,
		}),
		shallow // Keep shallow if you want shallow comparison for these selections
	);

	const handleClearCart = () => {
		if (window.confirm("Are you sure you want to clear the cart?")) {
			clearCart();
		}
	};

	// Keep handleHoldOrder if needed, or remove if direct onClick is preferred
	const handleHoldOrder = () => {
		if (window.confirm("Are you sure you want to put this order on hold?")) {
			holdOrder();
		}
	};

	const isCartEmpty = items.length === 0;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
				>
					<MoreVertical className="h-5 w-5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem
					onClick={handleClearCart}
					disabled={isCartEmpty}
				>
					<Trash2 className="mr-2 h-4 w-4" />
					<span>Clear Cart</span>
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={handleHoldOrder} // Use the handler
					disabled={isCartEmpty} // Hold also makes sense to disable if cart is empty
				>
					<PauseCircle className="mr-2 h-4 w-4" />
					<span>Hold Order</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

export default CartActionsDropdown;
