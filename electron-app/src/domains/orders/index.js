// Orders Domain Exports
// This file serves as the main entry point for the orders domain

// Pages
export { default as OrdersPage } from "./pages/OrdersPage.jsx";
export { default as OrderDetailsPage } from "./pages/OrderDetailsPage.jsx";

// Services
export * as orderService from "./services/orderService.js";

// Store
export { createOrderSlice } from "./store/orderSlice.js";
