// Inventory Domain Exports
// This file serves as the main entry point for the inventory domain

// Pages
export { default as InventoryPage } from "./pages/InventoryPage.jsx";
export { default as StockHistoryPage } from "./pages/StockHistoryPage.jsx";

// Services
export * as inventoryService from "./services/inventoryService.js";

// Store
export { createInventorySlice } from "./store/inventorySlice.js";
