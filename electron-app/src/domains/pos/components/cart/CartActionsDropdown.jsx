"use client";

import { usePosStore } from "@/domains/pos/store/posStore";
import { useRolePermissions } from "@/shared/hooks/useRolePermissions";
import { useSettingsStore } from "@/domains/settings/store/settingsStore";
import { openCashDrawer } from "@/shared/lib/hardware";
import { Button } from "@/shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { MoreVertical, Trash2, PauseCircle, DollarSign } from "lucide-react";
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

	const { isOwner, isManager } = useRolePermissions();
	const printers = useSettingsStore((state) => state.printers);
	const receiptPrinterId = useSettingsStore((state) => state.receiptPrinterId);

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

	const handleOpenCashDrawer = async () => {
		try {
			// Find the receipt printer to use for opening cash drawer
			const receiptPrinter = printers.find(p => p.id === receiptPrinterId);
			
			if (!receiptPrinter) {
				alert("No receipt printer configured. Please configure a printer in settings.");
				return;
			}

			const result = await openCashDrawer(receiptPrinter);
			
			if (!result.success) {
				console.error("Failed to open cash drawer:", result.error);
				alert(`Failed to open cash drawer: ${result.error || "Unknown error"}`);
			}
		} catch (error) {
			console.error("Error opening cash drawer:", error);
			alert("Failed to open cash drawer. Please check your printer connection.");
		}
	};

	const isCartEmpty = items.length === 0;
	const canOpenCashDrawer = isOwner || isManager;

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
				{canOpenCashDrawer && (
					<DropdownMenuItem
						onClick={handleOpenCashDrawer}
						className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
					>
						<DollarSign className="mr-2 h-4 w-4" />
						<span>Open Cash Drawer</span>
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

export default CartActionsDropdown;
