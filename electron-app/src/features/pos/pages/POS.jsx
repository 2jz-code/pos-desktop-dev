import React, { useEffect } from "react";
import { usePosStore } from "@/store/posStore";
import Cart from "../components/Cart";
import ProductGrid from "../components/ProductGrid";
// import useTerminalStore from "@/store/terminalStore"; // Commented out - not currently used
import TenderDialog from "../components/dialogs/TenderDialog";
import { shallow } from "zustand/shallow";
import { useCustomerTipListener } from "@/store/useCustomerTipListener";
import DiscountDialog from "../components/dialogs/DiscountDialog";
import StockOverrideDialog from "@/components/dialogs/StockOverrideDialog";
// This import might also be needed depending on your full file structure
// import { OrderDiscountDialog } from "../components/dialogs/OrderDiscountDialog";

const POS = () => {
	useCustomerTipListener();

	// Select all necessary state from the store
	const {
		currentUser,
		customerDisplayState,
		fetchProducts,
		fetchParentCategories,
		login,
		loadCartFromOrderId,
		orderId,
		// Get the dialog status flags for conditional rendering
		isTenderDialogOpen,
		isDiscountDialogOpen,
		// isOrderDiscountDialogOpen, // Uncomment if you use this dialog
	} = usePosStore(
		(state) => ({
			currentUser: state.currentUser,
			customerDisplayState: {
				status: state.status,
				activeView: state.activeView,
				order: state.order,
				balanceDue: state.balanceDue,
				terminalStatus: state.terminalStatus,
				cart: {
					items: state.items,
					total: state.total,
				},
			},
			fetchProducts: state.fetchProducts,
			fetchParentCategories: state.fetchParentCategories,
			login: state.login,
			loadCartFromOrderId: state.loadCartFromOrderId,
			orderId: state.orderId,
			// Add the dialog flags to the selector
			isTenderDialogOpen: state.isTenderDialogOpen,
			isDiscountDialogOpen: state.isDiscountDialogOpen,
			// isOrderDiscountDialogOpen: state.isOrderDiscountDialogOpen,
		}),
		shallow
	);

	// const initializeTerminal = useTerminalStore(
	// 	(state) => state.initializeTerminal
	// );

	// // This logic remains the same
	// useEffect(() => {
	// 	initializeTerminal();
	// }, [initializeTerminal]);

	useEffect(() => {
		fetchProducts?.();
		fetchParentCategories?.();
		if (!currentUser) {
			login?.();
		}
		if (orderId) {
			loadCartFromOrderId?.(orderId);
		}
	}, [
		fetchProducts,
		fetchParentCategories,
		login,
		currentUser,
		loadCartFromOrderId,
		orderId,
	]);

	useEffect(() => {
		if (window.ipcApi) {
			window.ipcApi.send("update-customer-display", customerDisplayState);
		}
	}, [customerDisplayState]);

	return (
		<div className="flex h-full bg-gray-100 p-4 gap-4">
			<div className="w-3/5 h-full">
				<ProductGrid />
			</div>
			<div className="w-2/5 h-full">
				<Cart />
			</div>

			{/* --- THE FIX --- */}
			{/* By conditionally rendering the dialogs, we ensure they only mount */}
			{/* with fresh state when they are supposed to be open. */}
			{isTenderDialogOpen && <TenderDialog />}
			{isDiscountDialogOpen && <DiscountDialog />}
			<StockOverrideDialog />
			{/* {isOrderDiscountDialogOpen && <OrderDiscountDialog />} */}
		</div>
	);
};

export default POS;
