import React, { useEffect, useRef, useCallback } from "react";
import { usePosStore, useCustomerTipListener } from "@/domains/pos";
import Cart from "@/domains/pos/components/Cart";
import ProductGrid from "@/domains/pos/components/ProductGrid";
// import useTerminalStore from "@/domains/pos"; // Commented out - not currently used
import TenderDialog from "@/domains/pos/components/dialogs/TenderDialog";
import { shallow } from "zustand/shallow";
import DiscountDialog from "@/domains/pos/components/dialogs/DiscountDialog";
import StockOverrideDialog from "@/domains/pos/components/dialogs/StockOverrideDialog";
import { usePOSBarcode } from "@/shared/hooks";
// This import might also be needed depending on your full file structure
// import { OrderDiscountDialog } from "../components/dialogs/OrderDiscountDialog";

const POS = () => {
	useCustomerTipListener();
	const barcodeInputRef = useRef("");
	const lastKeystrokeRef = useRef(0);
	const productGridRef = useRef(null);

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
		console.log("🚀 [POS] Initializing POS page...");
		console.log("🚀 [POS] Available functions:", {
			resetFilters: !!resetFilters,
			fetchProducts: !!fetchProducts,
			fetchParentCategories: !!fetchParentCategories,
			login: !!login,
			loadCartFromOrderId: !!loadCartFromOrderId,
		});
		console.log("🚀 [POS] Current state:", { currentUser: !!currentUser, orderId });
		
		// Handle user authentication first
		if (!currentUser && login) {
			console.log("👤 [POS] Logging in user...");
			login();
		}
		
		// Fetch data FIRST, then reset filters
		if (fetchProducts) {
			console.log("📦 [POS] Fetching products...");
			try {
				await fetchProducts();
				console.log("✅ [POS] Products fetch completed");
			} catch (error) {
				console.error("❌ [POS] Error fetching products:", error);
			}
		} else {
			console.error("❌ [POS] fetchProducts function not available!");
		}
		
		if (fetchParentCategories) {
			console.log("📂 [POS] Fetching parent categories...");
			await fetchParentCategories();
		} else {
			console.error("❌ [POS] fetchParentCategories function not available!");
		}
		
		// Reset filters AFTER products are loaded
		if (resetFilters) {
			console.log("🔄 [POS] Resetting filters after products loaded...");
			resetFilters();
		}
		
		// Load cart if there's an existing order
		if (orderId && loadCartFromOrderId) {
			console.log("🛒 [POS] Loading cart from order ID:", orderId);
			loadCartFromOrderId(orderId);
		}
		
		console.log("✅ [POS] POS page initialization complete");
	}, [resetFilters, fetchProducts, fetchParentCategories, login, currentUser, loadCartFromOrderId, orderId]);

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
