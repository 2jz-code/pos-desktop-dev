// POS Domain Exports
// This file serves as the main entry point for the POS domain

// Components - Cart
export { default as Cart } from "./components/Cart.jsx";

// Components - Product Grid
export { default as ProductGrid } from "./components/ProductGrid.jsx";

// Pages
export { default as POSPage } from "./pages/POS.jsx";
export { default as CustomerDisplay } from "./pages/CustomerDisplay.jsx";

// Services

// Store
export { usePosStore } from "./store/posStore.js";
export { createCartSlice, defaultCartState } from "./store/cartSlice.js";
export { default as terminalStore } from "./store/terminalStore.js";
export { useCustomerTipListener } from "./store/useCustomerTipListener.js";
export { useSyncToCustomerDisplay } from "./store/useSyncToCustomerDisplay.js";
export { tenderStateMachine } from "./store/tenderStateMachine.js";
