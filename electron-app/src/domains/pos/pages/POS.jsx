import React, { useEffect, useRef, useCallback } from "react";
import { usePosStore, useCustomerTipListener } from "@/domains/pos";
import Cart from "@/domains/pos/components/Cart";
import ProductGrid from "@/domains/pos/components/ProductGrid";
// import useTerminalStore from "@/domains/pos"; // Commented out - not currently used
import TenderDialog from "@/domains/pos/components/dialogs/TenderDialog";
import { shallow } from "zustand/shallow";
import DiscountDialog from "@/domains/pos/components/dialogs/DiscountDialog";
import StockOverrideDialog from "@/domains/pos/components/dialogs/StockOverrideDialog";
import ManagerApprovalDialog from "@/domains/pos/components/dialogs/ManagerApprovalDialog";
import { usePOSBarcode } from "@/shared/hooks";
// This import might also be needed depending on your full file structure
// import { OrderDiscountDialog } from "../components/dialogs/OrderDiscountDialog";

const POS = () => {
	useCustomerTipListener();
	const barcodeInputRef = useRef("");
	const lastKeystrokeRef = useRef(0);
	const productGridRef = useRef(null);
	const hasInitializedRef = useRef(false);

	// Select all necessary state from the store
	const {
		currentUser,
		customerDisplayState,
		fetchProducts,
		fetchParentCategories,
		login,
		loadCartFromOrderId,
		orderId,
		addItem,
		resetFilters,
		initializeCartSocket,
		cartItems,
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
			addItem: state.addItem,
			resetFilters: state.resetFilters,
			initializeCartSocket: state.initializeCartSocket,
			cartItems: state.items,
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

	// Smart barcode scanning - automatically adds items to cart
	const { scanBarcode, isScanning } = usePOSBarcode(addItem);

	// Create stable function references
	const initializePOS = useCallback(async () => {
		// Only run full initialization once on mount
		if (hasInitializedRef.current) {
			return;
		}
		hasInitializedRef.current = true;

		// Handle user authentication first
		if (!currentUser && login) {
			login();
		}

		// Fetch data FIRST, then reset filters
		if (fetchProducts) {
			try {
				await fetchProducts();
			} catch (error) {
				console.error("❌ [POS] Error fetching products:", error);
			}
		}

		if (fetchParentCategories) {
			await fetchParentCategories();
		}

		// Reset filters AFTER products are loaded
		if (resetFilters) {
			resetFilters();
		}

		// Load cart if there's an existing order ON MOUNT ONLY
		if (orderId && loadCartFromOrderId && cartItems.length === 0) {
			// No items in cart, need to load from server
			console.log(`⏱️ [TIMING] POS mount: loading cart for order ${orderId.substring(0, 8)}`);
			await loadCartFromOrderId(orderId);
		} else if (orderId && cartItems.length > 0) {
			// Cart already has items (either from resume or persisted state)
			// Just reconnect the WebSocket without reloading from server
			console.log(`⏱️ [TIMING] POS mount: cart already loaded, reconnecting socket`);
			if (initializeCartSocket) {
				try {
					await initializeCartSocket();
					console.log(`⏱️ [TIMING] Socket reconnected for persisted cart`);
				} catch (error) {
					console.error("❌ Failed to reconnect socket:", error);
				}
			}
		}
	}, [resetFilters, fetchProducts, fetchParentCategories, login, currentUser, loadCartFromOrderId, initializeCartSocket, cartItems]);
	// Note: orderId intentionally NOT in deps - we only load cart once on mount

	useEffect(() => {
		initializePOS();
	}, [initializePOS]);

	useEffect(() => {
		if (window.ipcApi) {
			window.ipcApi.send("update-customer-display", customerDisplayState);
		}
	}, [customerDisplayState]);

	// Global barcode listener - detects rapid typing (barcode scanner behavior)
	useEffect(() => {
		const handleKeyPress = (e) => {
			const now = Date.now();
			const timeDiff = now - lastKeystrokeRef.current;

			// If time between keystrokes is very short (typical of barcode scanners)
			// or if it's a continuation of rapid typing, accumulate the input
			if (timeDiff < 100) {
				barcodeInputRef.current += e.key;
			} else {
				// Reset if there's a longer pause (manual typing)
				barcodeInputRef.current = e.key;
			}

			lastKeystrokeRef.current = now;

			// Check if Enter was pressed (end of barcode scan)
			if (e.key === "Enter" && barcodeInputRef.current.length > 1) {
				const barcode = barcodeInputRef.current.replace("Enter", "");
				if (barcode.length >= 3) {
					// Minimum barcode length
					e.preventDefault();
					
					// Check if search input is focused - if so, use for search instead of adding to cart
					const searchInput = productGridRef.current?.searchInputRef?.current;
					if (searchInput && document.activeElement === searchInput) {
						// Put barcode in search field
						productGridRef.current.setSearchValue(barcode);
					} else {
						// Add to cart as usual
						scanBarcode(barcode);
					}
				}
				barcodeInputRef.current = "";
			}

			// Auto-clear after a short delay to handle scanners that don't send Enter
			setTimeout(() => {
				if (
					Date.now() - lastKeystrokeRef.current > 500 &&
					barcodeInputRef.current.length >= 8
				) {
					const barcode = barcodeInputRef.current;
					if (barcode.length >= 3) {
						// Check if search input is focused - if so, use for search instead of adding to cart
						const searchInput = productGridRef.current?.searchInputRef?.current;
						if (searchInput && document.activeElement === searchInput) {
							// Put barcode in search field
							productGridRef.current.setSearchValue(barcode);
						} else {
							// Add to cart as usual
							scanBarcode(barcode);
						}
					}
					barcodeInputRef.current = "";
				}
			}, 600);
		};

		// Only listen when POS is active and not in dialogs
		if (!isTenderDialogOpen && !isDiscountDialogOpen) {
			document.addEventListener("keypress", handleKeyPress);
			return () => document.removeEventListener("keypress", handleKeyPress);
		}
	}, [scanBarcode, isTenderDialogOpen, isDiscountDialogOpen]);

	return (
		<div className="flex h-full bg-muted/20 p-4 gap-4">
			<div className="w-3/5 h-full">
				<ProductGrid ref={productGridRef} />
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
			<ManagerApprovalDialog />
			{/* {isOrderDiscountDialogOpen && <OrderDiscountDialog />} */}

			{/* Visual indicator when scanning */}
			{isScanning && (
				<div className="fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center gap-2">
					<div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
					Scanning barcode...
				</div>
			)}
		</div>
	);
};

export default POS;
