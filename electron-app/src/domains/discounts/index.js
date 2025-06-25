// Discounts Domain Exports
// This file serves as the main entry point for the discounts domain

// Components
export * from "./components";

// Pages
export { default as DiscountsPage } from "./pages/DiscountsPage.jsx";

// Services
export * as discountService from "./services/discountService.js";

// Store
export { createDiscountSlice } from "./store/discountSlice.js";
