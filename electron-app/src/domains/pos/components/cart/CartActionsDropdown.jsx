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
import { MoreVertical, Trash2, PauseCircle, DollarSign, AlertTriangle, Printer } from "lucide-react";
import { useConfirmation } from "@/shared/components/ui/confirmation-dialog";
import { printReceipt } from "@/shared/lib/hardware/printerService";
import { getReceiptFormatData } from "@/domains/settings/services/settingsService";
import { toast } from "@/shared/components/ui/use-toast";
import { shallow } from "zustand/shallow";

const CartActionsDropdown = () => {
	const { clearCart, holdOrder, items, subtotal, total, taxAmount, totalDiscountsAmount, surchargesAmount, customerFirstName, diningPreference } = usePosStore(
		(state) => ({
			clearCart: state.clearCart,
			holdOrder: state.holdOrder,
			items: state.items,
			subtotal: state.subtotal,
			total: state.total,
			taxAmount: state.taxAmount,
			totalDiscountsAmount: state.totalDiscountsAmount,
			surchargesAmount: state.surchargesAmount,
			customerFirstName: state.customerFirstName,
			diningPreference: state.diningPreference,
		}),
		shallow
	);

	const { isOwner, isManager } = useRolePermissions();
	const printers = useSettingsStore((state) => state.printers);
	const receiptPrinterId = useSettingsStore((state) => state.receiptPrinterId);
	const confirmation = useConfirmation();

	const handleClearCart = () => {
		confirmation.show({
			title: "Clear Cart",
			description: `Are you sure you want to clear all ${items.length} item${items.length !== 1 ? 's' : ''} from the cart?`,
			confirmText: "Clear Cart",
			cancelText: "Cancel",
			variant: "destructive",
			icon: AlertTriangle,
			onConfirm: () => {
				clearCart();
			},
		});
	};

	const handleHoldOrder = () => {
		confirmation.show({
			title: "Hold Order",
			description: "Are you sure you want to put this order on hold? You can resume it later from the held orders list.",
			confirmText: "Hold Order",
			cancelText: "Cancel",
			variant: "warning",
			icon: PauseCircle,
			onConfirm: () => {
				holdOrder();
			},
		});
	};

	const handlePrintTransactionReceipt = async () => {
		try {
			// Find the receipt printer
			const receiptPrinter = printers.find(p => p.id === receiptPrinterId);
			
			if (!receiptPrinter) {
				toast({
					title: "Printer Error",
					description: "No receipt printer is configured.",
					variant: "destructive",
				});
				return;
			}

			// Convert cart items to order-like format for receipt printing
			const currentTime = new Date().toISOString();
			const orderData = {
				id: `CART-${Date.now()}`, // Temporary ID for cart
				order_number: `CART-${Date.now()}`,
				created_at: currentTime,
				status: "PENDING",
				order_type: "POS",
				dining_preference: diningPreference, // Include the dining preference (DINE_IN/TAKE_OUT)
				guest_first_name: customerFirstName || "", // Include the guest name
				items: items, // Cart items already have the correct structure with price_at_sale
				subtotal: subtotal || 0,
				tax_total: taxAmount || 0,
				total_with_tip: total || 0,
				total_discounts_amount: totalDiscountsAmount || 0,
				surcharges_total: surchargesAmount || 0,
				payment_details: null, // No payment for transaction receipt
			};

			// Fetch store settings for receipt formatting
			let storeSettings = null;
			try {
				storeSettings = await getReceiptFormatData();
			} catch (error) {
				console.warn("Failed to fetch store settings, using fallback values:", error);
			}

			await printReceipt(receiptPrinter, orderData, storeSettings, true); // Pass true for isTransaction
			toast({
				title: "Success",
				description: "Transaction receipt sent to printer.",
			});
		} catch (error) {
			toast({
				title: "Printing Error",
				description: error.message || "Could not print the transaction receipt.",
				variant: "destructive",
			});
			console.error("Error printing transaction receipt:", error);
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

	return (<>
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
				<DropdownMenuItem
					onClick={handlePrintTransactionReceipt}
					disabled={isCartEmpty}
					className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
				>
					<Printer className="mr-2 h-4 w-4" />
					<span>Print Transaction Receipt</span>
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
		{confirmation.dialog}
	</>);
};

export default CartActionsDropdown;
