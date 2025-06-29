"use client";

import { usePosStore } from "@/domains/pos/store/posStore";
import { Button } from "@/shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { MoreVertical, Trash2, PauseCircle } from "lucide-react";
import { shallow } from "zustand/shallow";

const CartActionsDropdown = () => {
	const { clearCart, holdOrder, items } = usePosStore(
		(state) => ({
			clearCart: state.clearCart,
			holdOrder: state.holdOrder,
			items: state.items,
		}),
		shallow
	);

	const handleClearCart = () => {
		if (window.confirm("Are you sure you want to clear the cart?")) {
			clearCart();
		}
	};

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
					className="h-8 w-8 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
				>
					<MoreVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
			>
				<DropdownMenuItem
					onClick={handleClearCart}
					disabled={isCartEmpty}
					className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
				>
					<Trash2 className="mr-2 h-4 w-4" />
					<span>Clear Cart</span>
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={handleHoldOrder}
					disabled={isCartEmpty}
					className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
				>
					<PauseCircle className="mr-2 h-4 w-4" />
					<span>Hold Order</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

export default CartActionsDropdown;
